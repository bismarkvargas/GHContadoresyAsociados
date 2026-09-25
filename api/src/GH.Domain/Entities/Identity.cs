namespace GH.Domain.Entities;

/// <summary>Usuario del sistema: personal de la firma (IsStaff) o cliente del app.</summary>
public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? IdNumber { get; set; }
    public string? AvatarUrl { get; set; }

    public UserStatus Status { get; set; } = UserStatus.Pending;
    /// <summary>True para abogados, contadores y administrativos de la firma.</summary>
    public bool IsStaff { get; set; }

    /// <summary>Cliente del CRM vinculado (solo para usuarios cliente).</summary>
    public Guid? ClientId { get; set; }
    public Client? Client { get; set; }

    public string Locale { get; set; } = "es-CR";
    public string TimeZone { get; set; } = "America/Costa_Rica";

    public int FailedLoginCount { get; set; }
    public DateTime? LockoutUntil { get; set; }
    public DateTime? LastLoginAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public bool IsDeleted { get; set; }

    public ICollection<UserRole> UserRoles { get; set; } = new List<UserRole>();
    public ICollection<RefreshToken> RefreshTokens { get; set; } = new List<RefreshToken>();
    public ICollection<DeviceToken> DeviceTokens { get; set; } = new List<DeviceToken>();
}

public class Role
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    /// <summary>Los roles de sistema no se pueden borrar desde el admin.</summary>
    public bool IsSystem { get; set; }
    public bool IsStaffRole { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<UserRole> UserRoles { get; set; } = new List<UserRole>();
    public ICollection<RolePermission> RolePermissions { get; set; } = new List<RolePermission>();
}

/// <summary>Permiso granular con formato modulo.accion (p. ej. clients.create).</summary>
public class Permission
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Code { get; set; } = string.Empty;
    public string Module { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int SortOrder { get; set; }

    public ICollection<RolePermission> RolePermissions { get; set; } = new List<RolePermission>();
}

public class UserRole
{
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public Guid RoleId { get; set; }
    public Role Role { get; set; } = null!;
    public DateTime AssignedAt { get; set; } = DateTime.UtcNow;
}

public class RolePermission
{
    public Guid RoleId { get; set; }
    public Role Role { get; set; } = null!;
    public Guid PermissionId { get; set; }
    public Permission Permission { get; set; } = null!;
}

public class RefreshToken
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public string TokenHash { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public string? ReplacedByTokenHash { get; set; }
    public string? CreatedByIp { get; set; }
    public string? UserAgent { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>Token de Firebase Cloud Messaging por dispositivo.</summary>
public class DeviceToken
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public string Token { get; set; } = string.Empty;
    public DevicePlatform Platform { get; set; }
    public string? DeviceModel { get; set; }
    public string? AppVersion { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime LastSeenAt { get; set; } = DateTime.UtcNow;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class NotificationPreference
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public NotificationType Type { get; set; }
    public bool Push { get; set; } = true;
    public bool InApp { get; set; } = true;
    public bool Email { get; set; }
}

/// <summary>Solicitud de creación de cuenta enviada desde el app (o web).
/// Debe aprobarse en el admin para que el cliente quede activo.</summary>
public class AccountRequest
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Phone { get; set; } = string.Empty;
    public string? IdNumber { get; set; }
    public ClientType ClientType { get; set; } = ClientType.Individual;
    public string? Company { get; set; }
    public string? Message { get; set; }
    public AccountRequestSource Source { get; set; } = AccountRequestSource.App;
    public AccountRequestStatus Status { get; set; } = AccountRequestStatus.Pending;
    /// <summary>Código de seguimiento que el solicitante consulta desde el app.</summary>
    public string TrackingCode { get; set; } = string.Empty;
    public Guid? ReviewedByUserId { get; set; }
    public User? ReviewedByUser { get; set; }
    public DateTime? ReviewedAt { get; set; }
    public string? RejectionReason { get; set; }
    public Guid? CreatedUserId { get; set; }
    public User? CreatedUser { get; set; }
    public Guid? CreatedClientId { get; set; }
    public Client? CreatedClient { get; set; }
    public string? IpAddress { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
