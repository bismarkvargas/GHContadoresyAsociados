using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using GH.Api.Auth;
using GH.Api.Contracts;
using GH.Api.Services;
using GH.Domain;
using GH.Domain.Abstractions;
using GH.Domain.Entities;
using GH.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace GH.Api.Controllers;

[ApiController]
[Route("api/v1/auth")]
public class AuthController : ControllerBase
{
    private readonly GhDbContext _db;
    private readonly ITokenService _tokens;
    private readonly JwtOptions _jwt;
    private readonly ICurrentUser _current;
    private readonly IAuditLogger _audit;
    private readonly PasswordHasher<User> _hasher = new();
    private readonly ILogger<AuthController> _logger;

    public AuthController(GhDbContext db, ITokenService tokens, IOptions<JwtOptions> jwt, ICurrentUser current,
        IAuditLogger audit, ILogger<AuthController> logger)
    {
        _db = db;
        _tokens = tokens;
        _jwt = jwt.Value;
        _current = current;
        _audit = audit;
        _logger = logger;
    }

    /// <summary>Inicia sesión y devuelve el token de acceso con roles y permisos efectivos.</summary>
    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<ActionResult<AuthResponse>> Login([FromBody] LoginRequest request, CancellationToken ct)
    {
        var email = (request.Email ?? string.Empty).Trim().ToLowerInvariant();
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == email && !u.IsDeleted, ct);

        if (user is null)
            return Unauthorized(new ProblemDetails { Title = "Credenciales incorrectas", Detail = "El correo o la contraseña no son válidos.", Status = 401 });

        if (user.LockoutUntil.HasValue && user.LockoutUntil > DateTime.UtcNow)
            return Unauthorized(new ProblemDetails
            {
                Title = "Cuenta bloqueada temporalmente",
                Detail = $"Demasiados intentos fallidos. Vuelva a intentarlo después de {user.LockoutUntil:HH:mm} UTC.",
                Status = 401,
            });

        var verification = _hasher.VerifyHashedPassword(user, user.PasswordHash, request.Password ?? string.Empty);
        if (verification == PasswordVerificationResult.Failed)
        {
            user.FailedLoginCount++;
            if (user.FailedLoginCount >= 5)
            {
                user.LockoutUntil = DateTime.UtcNow.AddMinutes(15);
                user.FailedLoginCount = 0;
            }
            await _db.SaveChangesAsync(ct);
            return Unauthorized(new ProblemDetails { Title = "Credenciales incorrectas", Detail = "El correo o la contraseña no son válidos.", Status = 401 });
        }

        if (user.Status == UserStatus.Pending)
            return StatusCode(StatusCodes.Status403Forbidden, new ProblemDetails
            {
                Title = "Cuenta pendiente de aprobación",
                Detail = "Su solicitud de cuenta está siendo revisada por GH Contadores. Le avisaremos por notificación cuando sea aprobada.",
                Status = 403,
            });

        if (user.Status is UserStatus.Suspended or UserStatus.Rejected)
            return StatusCode(StatusCodes.Status403Forbidden, new ProblemDetails
            {
                Title = "Cuenta no habilitada",
                Detail = "Su cuenta no está habilitada. Contacte a GH Contadores para más información.",
                Status = 403,
            });

        if (verification == PasswordVerificationResult.SuccessRehashNeeded)
            user.PasswordHash = _hasher.HashPassword(user, request.Password!);

        user.FailedLoginCount = 0;
        user.LockoutUntil = null;
        user.LastLoginAt = DateTime.UtcNow;
        user.UpdatedAt = DateTime.UtcNow;

        var (roles, permissions) = await AccessResolver.ResolveAsync(_db, user.Id, ct);
        var tokens = _tokens.CreateTokens(user, roles, permissions);

        _db.RefreshTokens.Add(new RefreshToken
        {
            UserId = user.Id,
            TokenHash = _tokens.HashRefreshToken(tokens.RefreshToken),
            ExpiresAt = DateTime.UtcNow.AddDays(_jwt.RefreshTokenDays),
            CreatedByIp = _current.IpAddress,
            UserAgent = _current.UserAgent,
        });
        await _db.SaveChangesAsync(ct);

        var client = user.ClientId.HasValue
            ? await _db.Clients.AsNoTracking().FirstOrDefaultAsync(c => c.Id == user.ClientId, ct)
            : null;

        return Ok(new AuthResponse(tokens.AccessToken, tokens.RefreshToken, tokens.ExpiresAt,
            UserDto.From(user, roles, client?.LegalName, client?.Code), roles, permissions));
    }

    /// <summary>Rota el token de refresco y emite un nuevo par de tokens.</summary>
    [HttpPost("refresh")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<ActionResult<AuthResponse>> Refresh([FromBody] RefreshRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.RefreshToken))
            return BadRequest(new ProblemDetails { Title = "Token requerido", Status = 400 });

        var hash = _tokens.HashRefreshToken(request.RefreshToken);
        var stored = await _db.RefreshTokens.Include(r => r.User).FirstOrDefaultAsync(r => r.TokenHash == hash, ct);

        if (stored is null || stored.RevokedAt.HasValue || stored.ExpiresAt < DateTime.UtcNow)
            return Unauthorized(new ProblemDetails { Title = "Sesión expirada", Detail = "Vuelva a iniciar sesión.", Status = 401 });

        var user = stored.User;
        if (user.Status != UserStatus.Active || user.IsDeleted)
            return Unauthorized(new ProblemDetails { Title = "Cuenta no habilitada", Status = 401 });

        var (roles, permissions) = await AccessResolver.ResolveAsync(_db, user.Id, ct);
        var tokens = _tokens.CreateTokens(user, roles, permissions);

        stored.RevokedAt = DateTime.UtcNow;
        stored.ReplacedByTokenHash = _tokens.HashRefreshToken(tokens.RefreshToken);
        _db.RefreshTokens.Add(new RefreshToken
        {
            UserId = user.Id,
            TokenHash = stored.ReplacedByTokenHash,
            ExpiresAt = DateTime.UtcNow.AddDays(_jwt.RefreshTokenDays),
            CreatedByIp = _current.IpAddress,
            UserAgent = _current.UserAgent,
        });
        await _db.SaveChangesAsync(ct);

        var client = user.ClientId.HasValue
            ? await _db.Clients.AsNoTracking().FirstOrDefaultAsync(c => c.Id == user.ClientId, ct)
            : null;

        return Ok(new AuthResponse(tokens.AccessToken, tokens.RefreshToken, tokens.ExpiresAt,
            UserDto.From(user, roles, client?.LegalName, client?.Code), roles, permissions));
    }

    /// <summary>Cierra la sesión revocando el token de refresco indicado.</summary>
    [HttpPost("logout")]
    [Authorize]
    public async Task<IActionResult> Logout([FromBody] LogoutRequest request, CancellationToken ct)
    {
        if (!string.IsNullOrWhiteSpace(request.RefreshToken))
        {
            var hash = _tokens.HashRefreshToken(request.RefreshToken);
            var stored = await _db.RefreshTokens.FirstOrDefaultAsync(r => r.TokenHash == hash, ct);
            if (stored is not null && !stored.RevokedAt.HasValue)
            {
                stored.RevokedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync(ct);
            }
        }

        if (_current.UserId is Guid uid)
        {
            await _db.RefreshTokens
                .Where(r => r.UserId == uid && !r.RevokedAt.HasValue)
                .ExecuteUpdateAsync(s => s.SetProperty(r => r.RevokedAt, DateTime.UtcNow), ct);
        }

        return NoContent();
    }

    /// <summary>Perfil del usuario autenticado con roles y permisos efectivos.</summary>
    [HttpGet("me")]
    [Authorize]
    public async Task<ActionResult<object>> Me(CancellationToken ct)
    {
        if (_current.UserId is not Guid userId) return Unauthorized();

        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null) return Unauthorized();

        var (roles, permissions) = await AccessResolver.ResolveAsync(_db, userId, ct);
        var client = user.ClientId.HasValue
            ? await _db.Clients.AsNoTracking().FirstOrDefaultAsync(c => c.Id == user.ClientId, ct)
            : null;

        return Ok(new
        {
            user = UserDto.From(user, roles, client?.LegalName, client?.Code),
            roles,
            permissions,
        });
    }

    [HttpPost("change-password")]
    [Authorize]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request, CancellationToken ct)
    {
        if (_current.UserId is not Guid userId) return Unauthorized();
        if (string.IsNullOrWhiteSpace(request.NewPassword) || request.NewPassword.Length < 8)
            return BadRequest(new ProblemDetails { Title = "Contraseña débil", Detail = "La nueva contraseña debe tener al menos 8 caracteres.", Status = 400 });

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null) return Unauthorized();

        if (_hasher.VerifyHashedPassword(user, user.PasswordHash, request.CurrentPassword ?? string.Empty) == PasswordVerificationResult.Failed)
            return BadRequest(new ProblemDetails { Title = "Contraseña actual incorrecta", Status = 400 });

        user.PasswordHash = _hasher.HashPassword(user, request.NewPassword);
        user.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("change-password", "User", user.Id.ToString(), ct: ct);

        return Ok(new OperationResponse(true, "Contraseña actualizada correctamente."));
    }

    /// <summary>Solicita el restablecimiento. Siempre responde 202 para no revelar si el correo existe.</summary>
    [HttpPost("forgot-password")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest request, CancellationToken ct)
    {
        var email = (request.Email ?? string.Empty).Trim().ToLowerInvariant();
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == email, ct);

        if (user is not null)
        {
            var token = CreateResetToken(user.Id);
            _logger.LogInformation("Token de restablecimiento para {Email}: {Token}", email, token);
            await _audit.LogAsync("forgot-password", "User", user.Id.ToString(), ct: ct);
        }

        return Accepted(new OperationResponse(true, "Si el correo está registrado, recibirá las instrucciones para restablecer su contraseña."));
    }

    [HttpPost("reset-password")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.NewPassword) || request.NewPassword.Length < 8)
            return BadRequest(new ProblemDetails { Title = "Contraseña débil", Detail = "La contraseña debe tener al menos 8 caracteres.", Status = 400 });

        var email = (request.Email ?? string.Empty).Trim().ToLowerInvariant();
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == email, ct);
        if (user is null) return BadRequest(new ProblemDetails { Title = "Token no válido", Status = 400 });

        if (!ValidateResetToken(user.Id, request.Token))
            return BadRequest(new ProblemDetails { Title = "Token no válido o expirado", Status = 400 });

        user.PasswordHash = _hasher.HashPassword(user, request.NewPassword);
        user.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        await _db.RefreshTokens.Where(r => r.UserId == user.Id && !r.RevokedAt.HasValue)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.RevokedAt, DateTime.UtcNow), ct);

        return Ok(new OperationResponse(true, "Contraseña restablecida. Ya puede iniciar sesión."));
    }

    // ----- Tokens de restablecimiento (JWT firmado con propósito "pwd-reset", 30 min)

    private string CreateResetToken(Guid userId)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(Key()));
        var token = new JwtSecurityToken(
            issuer: _jwt.Issuer,
            audience: "gh-password-reset",
            claims: new[] { new Claim("sub", userId.ToString()), new Claim("purpose", "pwd-reset") },
            notBefore: DateTime.UtcNow,
            expires: DateTime.UtcNow.AddMinutes(30),
            signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private bool ValidateResetToken(Guid userId, string? token)
    {
        if (string.IsNullOrWhiteSpace(token)) return false;
        try
        {
            new JwtSecurityTokenHandler().ValidateToken(token, new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuer = _jwt.Issuer,
                ValidateAudience = true,
                ValidAudience = "gh-password-reset",
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(Key())),
                ValidateLifetime = true,
                ClockSkew = TimeSpan.FromSeconds(30),
            }, out var validated);

            var sub = (validated as JwtSecurityToken)?.Claims.FirstOrDefault(c => c.Type == "sub")?.Value;
            var purpose = (validated as JwtSecurityToken)?.Claims.FirstOrDefault(c => c.Type == "purpose")?.Value;
            return sub == userId.ToString() && purpose == "pwd-reset";
        }
        catch
        {
            return false;
        }
    }

    private string Key()
    {
        var key = _jwt.Key;
        return key.Length < 32 ? key.PadRight(32, '0') : key;
    }
}
