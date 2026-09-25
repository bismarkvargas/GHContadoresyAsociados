using GH.Domain;
using GH.Domain.Abstractions;
using GH.Domain.Entities;
using GH.Infrastructure.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace GH.Api.Services;

/// <summary>
/// Alta de clientes a partir de una solicitud de cuenta.
///
/// La misma lógica sirve para los dos modos de registro que configura el administrador:
///   · <c>approval</c>    — el cliente queda pendiente y un administrador aprueba o rechaza.
///   · <c>automatic</c>   — la cuenta se crea activa al instante, sin intervención humana.
/// </summary>
public class AccountActivationService
{
    public const string ModeAutomatic = "automatic";
    public const string ModeApproval = "approval";

    private readonly GhDbContext _db;
    private readonly ICodeGenerator _codes;
    private readonly IAuditLogger _audit;
    private readonly INotificationService _notifications;
    private readonly IRealtimeNotifier _realtime;
    private readonly ICurrentUser _current;
    private readonly PasswordHasher<User> _hasher = new();
    private readonly ILogger<AccountActivationService> _logger;

    public AccountActivationService(GhDbContext db, ICodeGenerator codes, IAuditLogger audit,
        INotificationService notifications, IRealtimeNotifier realtime, ICurrentUser current,
        ILogger<AccountActivationService> logger)
    {
        _db = db;
        _codes = codes;
        _audit = audit;
        _notifications = notifications;
        _realtime = realtime;
        _current = current;
        _logger = logger;
    }

    /// <summary>Modo de registro activo, configurado desde el panel (Ajustes → Registro).</summary>
    public async Task<string> GetModeAsync(CancellationToken ct = default)
    {
        var value = await _db.Settings.AsNoTracking()
            .Where(s => s.Key == "registration.mode")
            .Select(s => s.Value)
            .FirstOrDefaultAsync(ct);

        return string.Equals(value, ModeAutomatic, StringComparison.OrdinalIgnoreCase) ? ModeAutomatic : ModeApproval;
    }

    public static bool EsAutomatico(string mode) =>
        string.Equals(mode, ModeAutomatic, StringComparison.OrdinalIgnoreCase);

    public record ResultadoActivacion(
        User User,
        Client Client,
        bool UsuarioNuevo,
        string? PasswordTemporal);

    /// <summary>
    /// Activa una solicitud: crea el usuario (activo), su ficha en el CRM y le asigna el rol
    /// de cliente. Es idempotente: si el usuario ya existe, lo reactiva en lugar de duplicarlo.
    /// </summary>
    public async Task<ResultadoActivacion> ActivarAsync(
        AccountRequest solicitud,
        Guid? roleId = null,
        ClientType? clientType = null,
        string? tags = null,
        Guid? assignedToUserId = null,
        string? password = null,
        bool notificarBienvenida = true,
        CancellationToken ct = default)
    {
        var email = solicitud.Email.Trim().ToLowerInvariant();
        var passwordFinal = string.IsNullOrWhiteSpace(password) ? "Gh.Cliente2026" : password;

        var existente = await _db.Users.FirstOrDefaultAsync(u => u.Email == email, ct);
        var usuarioNuevo = existente is null;

        User user;
        if (existente is not null)
        {
            user = existente;
            user.Status = UserStatus.Active;
            user.IsDeleted = false;
            user.UpdatedAt = DateTime.UtcNow;
        }
        else
        {
            user = new User
            {
                Email = email,
                FullName = solicitud.FullName,
                Phone = solicitud.Phone,
                IdNumber = solicitud.IdNumber,
                Status = UserStatus.Active,
                IsStaff = false,
            };
            // Prioridad de la contraseña:
            //   1. la que se pasa explícitamente en esta llamada (alta desde el panel),
            //   2. la que el solicitante eligió en el app al pedir la cuenta,
            //   3. una temporal por defecto (solo para solicitudes antiguas sin contraseña).
            if (!string.IsNullOrWhiteSpace(password))
                user.PasswordHash = _hasher.HashPassword(user, password);
            else if (!string.IsNullOrWhiteSpace(solicitud.PasswordHash))
                user.PasswordHash = solicitud.PasswordHash;
            else
                user.PasswordHash = _hasher.HashPassword(user, passwordFinal);

            _db.Users.Add(user);
            await _db.SaveChangesAsync(ct);
        }

        var client = await _db.Clients.FirstOrDefaultAsync(c => c.UserId == user.Id && !c.IsDeleted, ct);
        if (client is null)
        {
            client = new Client
            {
                Code = await _codes.NextClientCodeAsync(ct),
                ClientType = clientType ?? solicitud.ClientType,
                LegalName = string.IsNullOrWhiteSpace(solicitud.Company) ? solicitud.FullName : solicitud.Company!,
                TradeName = solicitud.Company,
                IdNumber = solicitud.IdNumber,
                Email = email,
                Phone = solicitud.Phone,
                Whatsapp = solicitud.Phone,
                Country = "Costa Rica",
                Status = ClientStatus.Active,
                Source = solicitud.Source == AccountRequestSource.Web ? ClientSource.Web : ClientSource.App,
                Notes = solicitud.Message,
                TagsCsv = tags,
                AssignedToUserId = assignedToUserId ?? _current.UserId,
                UserId = user.Id,
                LastContactAt = DateTime.UtcNow,
            };
            _db.Clients.Add(client);
            await _db.SaveChangesAsync(ct);
        }

        user.ClientId = client.Id;

        var rol = roleId.HasValue
            ? await _db.Roles.FirstOrDefaultAsync(r => r.Id == roleId.Value, ct)
            : await _db.Roles.FirstOrDefaultAsync(r => r.Name == "Cliente", ct);

        if (rol is not null && !await _db.UserRoles.AnyAsync(ur => ur.UserId == user.Id && ur.RoleId == rol.Id, ct))
            _db.UserRoles.Add(new UserRole { UserId = user.Id, RoleId = rol.Id });

        solicitud.Status = AccountRequestStatus.Approved;
        solicitud.ReviewedAt ??= DateTime.UtcNow;
        solicitud.ReviewedByUserId ??= _current.UserId;
        solicitud.CreatedUserId = user.Id;
        solicitud.CreatedClientId = client.Id;
        solicitud.RejectionReason = null;

        await _db.SaveChangesAsync(ct);

        _logger.LogInformation("Solicitud activada: {Email} → cliente {Code}.", email, client.Code);

        if (notificarBienvenida)
        {
            await _notifications.NotifyUserAsync(user.Id, NotificationType.AccountApproved,
                "¡Su cuenta está lista!",
                "Ya puede iniciar sesión y consultar sus expedientes, documentos y pedidos desde el app.",
                deepLink: "/home",
                data: new { clientId = client.Id, clientCode = client.Code }, ct: ct);
        }

        return new ResultadoActivacion(user, client, usuarioNuevo, usuarioNuevo ? passwordFinal : null);
    }
}
