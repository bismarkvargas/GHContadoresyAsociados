using GH.Domain;
using GH.Domain.Entities;

namespace GH.Api.Contracts;

// ------------------------------------------------------------------ autenticación
public record LoginRequest(string Email, string Password);
public record RefreshRequest(string RefreshToken);
public record LogoutRequest(string? RefreshToken);
public record ChangePasswordRequest(string CurrentPassword, string NewPassword);
public record ForgotPasswordRequest(string Email);
public record ResetPasswordRequest(string Email, string Token, string NewPassword);

public record AuthResponse(
    string AccessToken,
    string RefreshToken,
    DateTime ExpiresAt,
    UserDto User,
    IReadOnlyList<string> Roles,
    IReadOnlyList<string> Permissions);

public record UserDto(
    Guid Id,
    string Email,
    string FullName,
    string? Phone,
    string? IdNumber,
    string? AvatarUrl,
    UserStatus Status,
    bool IsStaff,
    Guid? ClientId,
    string? ClientName,
    string? ClientCode,
    IReadOnlyList<string> Roles,
    DateTime? LastLoginAt,
    DateTime CreatedAt)
{
    public static UserDto From(User u, IEnumerable<string> roles, string? clientName = null, string? clientCode = null) =>
        new(u.Id, u.Email, u.FullName, u.Phone, u.IdNumber, u.AvatarUrl, u.Status, u.IsStaff,
            u.ClientId, clientName, clientCode, roles.ToList(), u.LastLoginAt, u.CreatedAt);
}

public record UpdateProfileRequest(string FullName, string? Phone, string? IdNumber, string? AvatarUrl);

// ------------------------------------------------------------------ catálogo público
public record SiteDto(
    BrandDto Brand,
    CompanyDto Company,
    CurrencyDto Currency,
    PaymentConfigDto Payment,
    string CatalogSourceUrl);

public record BrandDto(string Name, string ShortName, string PrimaryColor, string InkColor, string AccentColor, string SuccessColor, string? LogoUrl);
public record CompanyDto(string LegalName, string Address, string Phone1, string Phone2, string Email, string SupportEmail, string Website, string Country, string TimeZone);
public record CurrencyDto(string Base, string Secondary, decimal UsdToCrc);
public record PaymentConfigDto(string Provider, string TestCardApproved, string TestCardDeclined, string TestCardPending, bool Simulated);

public record ProductCategoryDto(
    Guid Id,
    string Slug,
    string Name,
    string? Description,
    string? IconName,
    string? ImageUrl,
    int SortOrder,
    bool IsActive,
    int ProductCount)
{
    public static ProductCategoryDto From(ProductCategory c, int count) =>
        new(c.Id, c.Slug, c.Name, c.Description, c.IconName, c.ImageUrl, c.SortOrder, c.IsActive, count);
}

public record ProductDto(
    Guid Id,
    string Sku,
    string Slug,
    string Name,
    string? ShortDescription,
    string? Description,
    decimal Price,
    string Currency,
    decimal TaxRate,
    Guid CategoryId,
    string CategoryName,
    string CategorySlug,
    string? ImageUrl,
    IReadOnlyList<string> Gallery,
    bool IsActive,
    bool IsFeatured,
    bool RequiresCase,
    DeliveryMode DeliveryMode,
    int? EstimatedDays,
    string? SourceUrl,
    DateTime CreatedAt,
    DateTime UpdatedAt)
{
    public static ProductDto From(Product p, string? categoryName = null, string? categorySlug = null) =>
        new(p.Id, p.Sku, p.Slug, p.Name, p.ShortDescription, p.Description, p.Price, p.Currency, p.TaxRate,
            p.CategoryId, categoryName ?? p.Category?.Name ?? string.Empty, categorySlug ?? p.Category?.Slug ?? string.Empty,
            p.ImageUrl, ParseGallery(p.GalleryJson), p.IsActive, p.IsFeatured, p.RequiresCase, p.DeliveryMode,
            p.EstimatedDays, p.SourceUrl, p.CreatedAt, p.UpdatedAt);

    public static IReadOnlyList<string> ParseGallery(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return Array.Empty<string>();
        try { return System.Text.Json.JsonSerializer.Deserialize<List<string>>(json) ?? new List<string>(); }
        catch { return Array.Empty<string>(); }
    }
}

public record ProductUpsertRequest(
    string Name,
    string? Slug,
    string? Sku,
    Guid CategoryId,
    decimal Price,
    string? Currency,
    decimal TaxRate,
    string? ShortDescription,
    string? Description,
    string? ImageUrl,
    IReadOnlyList<string>? Gallery,
    bool IsActive,
    bool IsFeatured,
    bool RequiresCase,
    DeliveryMode DeliveryMode,
    int? EstimatedDays,
    int SortOrder,
    string? SeoTitle,
    string? SeoDescription);

public record CategoryUpsertRequest(
    string Name,
    string? Slug,
    string? Description,
    string? IconName,
    string? ImageUrl,
    int SortOrder,
    bool IsActive);

// ------------------------------------------------------------------ solicitudes de cuenta
public record AccountRequestCreateRequest(
    string FullName,
    string Email,
    string Phone,
    string? IdNumber,
    ClientType ClientType,
    string? Company,
    string? Message);

public record AccountRequestStatusDto(
    string TrackingCode,
    string Email,
    AccountRequestStatus Status,
    string StatusLabel,
    string? RejectionReason,
    DateTime CreatedAt,
    DateTime? ReviewedAt,
    bool CanLogin);

public record AccountRequestDto(
    Guid Id,
    string FullName,
    string Email,
    string Phone,
    string? IdNumber,
    ClientType ClientType,
    string? Company,
    string? Message,
    AccountRequestSource Source,
    AccountRequestStatus Status,
    string TrackingCode,
    string? RejectionReason,
    Guid? ReviewedByUserId,
    string? ReviewedByName,
    DateTime? ReviewedAt,
    Guid? CreatedUserId,
    Guid? CreatedClientId,
    string? CreatedClientCode,
    DateTime CreatedAt)
{
    public static AccountRequestDto From(AccountRequest r, string? reviewer = null, string? clientCode = null) =>
        new(r.Id, r.FullName, r.Email, r.Phone, r.IdNumber, r.ClientType, r.Company, r.Message, r.Source,
            r.Status, r.TrackingCode, r.RejectionReason, r.ReviewedByUserId, reviewer, r.ReviewedAt,
            r.CreatedUserId, r.CreatedClientId, clientCode, r.CreatedAt);
}

public record ApproveAccountRequestRequest(Guid? RoleId, ClientType? ClientType, string? Tags, Guid? AssignedToUserId, string? WelcomeMessage);
public record RejectAccountRequestRequest(string Reason);

// ------------------------------------------------------------------ cotizaciones
public record QuoteCreateRequest(string FullName, string Email, string Phone, string? Company, Guid? ServiceId, string? Message);

public record QuoteDto(
    Guid Id,
    string FullName,
    string Email,
    string Phone,
    string? Company,
    Guid? ServiceId,
    string? ServiceName,
    string? Message,
    QuoteStatus Status,
    Guid? HandledByUserId,
    string? HandledByName,
    Guid? ClientId,
    string? ClientName,
    string? InternalNotes,
    DateTime CreatedAt)
{
    public static QuoteDto From(QuoteRequest q, string? serviceName = null, string? handler = null, string? clientName = null) =>
        new(q.Id, q.FullName, q.Email, q.Phone, q.Company, q.ServiceId, serviceName, q.Message, q.Status,
            q.HandledByUserId, handler, q.ClientId, clientName, q.InternalNotes, q.CreatedAt);
}

public record QuoteUpdateRequest(QuoteStatus Status, string? InternalNotes);

// ------------------------------------------------------------------ usuarios, roles y permisos
public record UserCreateRequest(
    string Email,
    string FullName,
    string? Phone,
    string? IdNumber,
    string Password,
    bool IsStaff,
    UserStatus Status,
    IReadOnlyList<Guid>? RoleIds,
    Guid? ClientId);

public record UserUpdateRequest(string FullName, string? Phone, string? IdNumber, string? AvatarUrl, bool? IsStaff);
public record ChangeUserStatusRequest(UserStatus Status, string? Reason);
public record SetUserRolesRequest(IReadOnlyList<Guid> RoleIds);
public record AdminResetPasswordRequest(string NewPassword);

public record PermissionDto(Guid Id, string Code, string Module, string Action, string? Description, int SortOrder);

public record RoleDto(
    Guid Id,
    string Name,
    string? Description,
    bool IsSystem,
    bool IsStaffRole,
    int UserCount,
    IReadOnlyList<string> Permissions);

public record RoleUpsertRequest(string Name, string? Description, IReadOnlyList<string> PermissionCodes, bool IsStaffRole);

// ------------------------------------------------------------------ notificaciones
public record NotificationDto(
    Guid Id,
    string Title,
    string Body,
    NotificationType Type,
    NotificationStatus Status,
    string? DeepLink,
    string? DataJson,
    bool IsRead,
    DateTime CreatedAt,
    DateTime? ReadAt)
{
    public static NotificationDto From(Notification n) =>
        new(n.Id, n.Title, n.Body, n.Type, n.Status, n.DeepLink, n.DataJson, n.ReadAt.HasValue,
            n.CreatedAt, n.ReadAt);
}

public record NotificationPreferenceDto(NotificationType Type, string Label, bool Push, bool InApp, bool Email);
public record UpdateNotificationPreferencesRequest(IReadOnlyList<NotificationPreferenceDto> Preferences);
public record RegisterDeviceRequest(string Token, DevicePlatform Platform, string? DeviceModel, string? AppVersion);
public record SendNotificationRequest(Guid UserId, string Title, string Body, NotificationType Type, string? DeepLink);

// ------------------------------------------------------------------ ajustes y auditoría
public record SettingDto(string Key, string Value, string Group, string? Description, DateTime UpdatedAt);
public record UpdateSettingsRequest(IReadOnlyList<KeyValuePair<string, string>> Values);

public record AuditLogDto(
    Guid Id,
    Guid? UserId,
    string? UserName,
    string Action,
    string EntityName,
    string? EntityId,
    string? BeforeJson,
    string? AfterJson,
    string? IpAddress,
    DateTime CreatedAt);
