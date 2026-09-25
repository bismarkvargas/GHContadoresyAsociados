using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using GH.Domain;
using GH.Domain.Entities;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace GH.Api.Auth;

public class JwtOptions
{
    public string Issuer { get; set; } = "GHContadores";
    public string Audience { get; set; } = "GHContadoresClient";
    public string Key { get; set; } = "gh-contadores-development-signing-key-change-me-in-production";
    public int AccessTokenMinutes { get; set; } = 60;
    public int RefreshTokenDays { get; set; } = 30;
}

public record AuthTokens(string AccessToken, string RefreshToken, DateTime ExpiresAt);

public interface ITokenService
{
    AuthTokens CreateTokens(User user, IEnumerable<string> roles, IEnumerable<string> permissions);
    string HashRefreshToken(string token);
    string NewRefreshToken();
}

public class TokenService : ITokenService
{
    private readonly JwtOptions _options;

    public TokenService(IOptions<JwtOptions> options) => _options = options.Value;

    public string NewRefreshToken() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(64))
        .Replace('+', '-').Replace('/', '_').TrimEnd('=');

    public string HashRefreshToken(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();

    public AuthTokens CreateTokens(User user, IEnumerable<string> roles, IEnumerable<string> permissions)
    {
        var expires = DateTime.UtcNow.AddMinutes(_options.AccessTokenMinutes);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Email, user.Email),
            new(ClaimTypes.Name, user.FullName),
            new("isStaff", user.IsStaff ? "true" : "false"),
            new("status", user.Status.ToString()),
        };
        if (user.ClientId.HasValue) claims.Add(new Claim("clientId", user.ClientId.Value.ToString()));

        claims.AddRange(roles.Select(r => new Claim(ClaimTypes.Role, r)));
        claims.AddRange(permissions.Select(p => new Claim("perm", p)));

        var key = _options.Key.Length < 32 ? _options.Key.PadRight(32, '0') : _options.Key;
        var credentials = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)), SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _options.Issuer,
            audience: _options.Audience,
            claims: claims,
            notBefore: DateTime.UtcNow,
            expires: expires,
            signingCredentials: credentials);

        return new AuthTokens(new JwtSecurityTokenHandler().WriteToken(token), NewRefreshToken(), expires);
    }
}
