namespace GH.Domain.Abstractions;

/// <summary>Usuario autenticado de la petición en curso.</summary>
public interface ICurrentUser
{
    Guid? UserId { get; }
    string? Email { get; }
    string? FullName { get; }
    bool IsAuthenticated { get; }
    bool IsStaff { get; }
    Guid? ClientId { get; }
    IReadOnlyCollection<string> Permissions { get; }
    bool HasPermission(string code);
    string? IpAddress { get; }
    string? UserAgent { get; }
}

/// <summary>Emisión de eventos en tiempo real hacia el admin y el app.</summary>
public interface IRealtimeNotifier
{
    Task ToUserAsync(Guid userId, string eventName, object payload, CancellationToken ct = default);
    Task ToStaffAsync(string eventName, object payload, CancellationToken ct = default);
    Task ToCaseAsync(Guid caseFileId, string eventName, object payload, CancellationToken ct = default);
    Task ToClientsAsync(string eventName, object payload, CancellationToken ct = default);
}

/// <summary>Envío de push por Firebase Cloud Messaging.</summary>
public interface IPushSender
{
    /// <summary>True cuando hay credenciales de Firebase configuradas.</summary>
    bool IsConfigured { get; }
    Task<PushResult> SendAsync(IReadOnlyCollection<string> deviceTokens, string title, string body, IReadOnlyDictionary<string, string> data, CancellationToken ct = default);
}

public record PushResult(bool Success, int SuccessCount, int FailureCount, IReadOnlyCollection<string> InvalidTokens, string? Error);

/// <summary>Almacenamiento de documentos en disco.</summary>
public interface IStorageService
{
    Task<StoredFile> SaveAsync(Stream content, string originalName, string contentType, CancellationToken ct = default);
    Task<Stream> OpenReadAsync(string storagePath, CancellationToken ct = default);
    Task DeleteAsync(string storagePath, CancellationToken ct = default);
    string CreateDownloadToken(string storagePath, string fileName, string contentType, TimeSpan ttl);
    bool TryValidateDownloadToken(string token, out SignedDownload? download);
}

public record StoredFile(string StoragePath, string FileName, long SizeBytes, string Sha256);
public record SignedDownload(string StoragePath, string FileName, string ContentType, DateTime ExpiresAt);

/// <summary>Generación de códigos correlativos legibles.</summary>
public interface ICodeGenerator
{
    Task<string> NextClientCodeAsync(CancellationToken ct = default);
    Task<string> NextCaseCodeAsync(CancellationToken ct = default);
    Task<string> NextOrderNumberAsync(CancellationToken ct = default);
    Task<string> NextTrackingCodeAsync(CancellationToken ct = default);
}

/// <summary>Bitácora de auditoría.</summary>
public interface IAuditLogger
{
    Task LogAsync(string action, string entityName, string? entityId, object? before = null, object? after = null, CancellationToken ct = default);
}

public interface IDateTimeProvider
{
    DateTime UtcNow { get; }
}

/// <summary>Notificaciones internas de la aplicación (in-app + push + realtime).</summary>
public interface INotificationService
{
    Task NotifyUserAsync(Guid userId, NotificationType type, string title, string body, string? deepLink = null, object? data = null, bool sendPush = true, CancellationToken ct = default);
    Task NotifyStaffAsync(NotificationType type, string title, string body, string? deepLink = null, object? data = null, CancellationToken ct = default);
}
