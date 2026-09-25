using GH.Api.Auth;
using GH.Api.Contracts;
using GH.Api.Services;
using GH.Domain;
using GH.Domain.Abstractions;
using GH.Domain.Entities;
using GH.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GH.Api.Controllers.Admin;

/// <summary>Ajustes del sistema, auditoría, documentos y envío manual de notificaciones.</summary>
[ApiController]
[Route("api/v1/admin")]
[Authorize]
public class AdminSystemController : ControllerBase
{
    private readonly GhDbContext _db;
    private readonly IAuditLogger _audit;
    private readonly INotificationService _notifications;
    private readonly IStorageService _storage;
    private readonly DocumentService _documents;

    public AdminSystemController(GhDbContext db, IAuditLogger audit, INotificationService notifications,
        IStorageService storage, DocumentService documents)
    {
        _db = db;
        _audit = audit;
        _notifications = notifications;
        _storage = storage;
        _documents = documents;
    }

    // ------------------------------------------------------------------ ajustes
    [HttpGet("settings")]
    [HasPermission("settings.view")]
    public async Task<ActionResult<IReadOnlyList<SettingDto>>> Settings([FromQuery] string? group, CancellationToken ct)
    {
        var query = _db.Settings.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(group)) query = query.Where(s => s.Group == group);

        var settings = await query.OrderBy(s => s.Group).ThenBy(s => s.Key).ToListAsync(ct);
        return Ok(settings.Select(s => new SettingDto(s.Key, s.Value ?? string.Empty, s.Group, s.Description, s.UpdatedAt)).ToList());
    }

    [HttpPut("settings")]
    [HasPermission("settings.edit")]
    public async Task<ActionResult<IReadOnlyList<SettingDto>>> UpdateSettings([FromBody] UpdateSettingsRequest request, CancellationToken ct)
    {
        var keys = request.Values.Select(v => v.Key).ToList();
        var settings = await _db.Settings.Where(s => keys.Contains(s.Key)).ToListAsync(ct);

        foreach (var pair in request.Values)
        {
            var setting = settings.FirstOrDefault(s => s.Key == pair.Key);
            if (setting is null)
            {
                _db.Settings.Add(new Setting { Key = pair.Key, Value = pair.Value, Group = "General", UpdatedAt = DateTime.UtcNow });
                continue;
            }
            setting.Value = pair.Value;
            setting.UpdatedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("update", "Settings", null, after: new { Keys = keys }, ct: ct);

        return await Settings(null, ct);
    }

    // ------------------------------------------------------------------ auditoría
    [HttpGet("audit")]
    [HasPermission("audit.view")]
    public async Task<ActionResult<PagedResult<AuditLogDto>>> Audit(
        [FromQuery] string? entity, [FromQuery] Guid? userId, [FromQuery] string? action,
        [FromQuery] DateTime? from, [FromQuery] DateTime? to,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 30, CancellationToken ct = default)
    {
        var query = _db.AuditLogs.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(entity)) query = query.Where(a => a.EntityName == entity);
        if (userId.HasValue) query = query.Where(a => a.UserId == userId);
        if (!string.IsNullOrWhiteSpace(action)) query = query.Where(a => a.Action == action);
        if (from.HasValue) query = query.Where(a => a.CreatedAt >= from);
        if (to.HasValue) query = query.Where(a => a.CreatedAt < to.Value.AddDays(1));

        var paged = await query.OrderByDescending(a => a.CreatedAt).ToPagedResultAsync(page, pageSize, ct);
        var items = paged.Items.Select(a => new AuditLogDto(a.Id, a.UserId, a.UserName, a.Action, a.EntityName,
            a.EntityId, a.BeforeJson, a.AfterJson, a.IpAddress, a.CreatedAt)).ToList();

        return Ok(new PagedResult<AuditLogDto>(items, paged.Total, paged.Page, paged.PageSize));
    }

    // ------------------------------------------------------------------ documentos
    [HttpGet("documents")]
    [HasPermission("documents.view")]
    public async Task<ActionResult<PagedResult<DocumentDto>>> Documents(
        [FromQuery] Guid? clientId, [FromQuery] Guid? caseFileId, [FromQuery] DocumentCategory? category,
        [FromQuery] string? search, [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        var query = _db.Documents.AsNoTracking().Include(d => d.CaseFile).Include(d => d.UploadedByUser)
            .Where(d => !d.IsDeleted);

        if (clientId.HasValue) query = query.Where(d => d.ClientId == clientId);
        if (caseFileId.HasValue) query = query.Where(d => d.CaseFileId == caseFileId);
        if (category.HasValue) query = query.Where(d => d.Category == category);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(d => d.OriginalName.Contains(term) || (d.Description != null && d.Description.Contains(term)));
        }

        var paged = await query.OrderByDescending(d => d.UploadedAt).ToPagedResultAsync(page, pageSize, ct);

        var items = new List<DocumentDto>();
        foreach (var d in paged.Items) items.Add(await _documents.ToDtoAsync(d, ct));

        return Ok(new PagedResult<DocumentDto>(items, paged.Total, paged.Page, paged.PageSize));
    }

    /// <summary>Subida de documentos desde el panel (cliente y opcionalmente expediente).</summary>
    [HttpPost("documents")]
    [HasPermission("documents.upload")]
    [RequestSizeLimit(52_428_800)]
    [Consumes("multipart/form-data")]
    public async Task<ActionResult<DocumentDto>> UploadDocument(
        IFormFile file, [FromForm] Guid? clientId, [FromForm] Guid? caseFileId,
        [FromForm] Guid? orderId, [FromForm] string? category, [FromForm] string? description,
        [FromForm] bool clientVisible = true, CancellationToken ct = default)
    {
        var parsed = DocumentCategory.Otro;
        if (!string.IsNullOrWhiteSpace(category) && Enum.TryParse<DocumentCategory>(category, true, out var c)) parsed = c;

        var dto = await _documents.UploadAsync(file,
            new DocumentUploadRequest(clientId, caseFileId, orderId, parsed, clientVisible, description), null, ct);

        return Ok(dto);
    }

    [HttpDelete("documents/{id:guid}")]
    [HasPermission("documents.delete")]
    public async Task<IActionResult> DeleteDocument(Guid id, CancellationToken ct)
    {
        var document = await _db.Documents.FirstOrDefaultAsync(d => d.Id == id && !d.IsDeleted, ct)
            ?? throw new KeyNotFoundException("Documento no encontrado.");

        document.IsDeleted = true;
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("delete", "Document", id.ToString(), before: new { document.OriginalName }, ct: ct);

        return NoContent();
    }

    [HttpGet("documents/{id:guid}/link")]
    [HasPermission("documents.view")]
    public async Task<ActionResult<DownloadLinkDto>> DocumentLink(Guid id, CancellationToken ct)
    {
        var document = await _db.Documents.AsNoTracking().FirstOrDefaultAsync(d => d.Id == id && !d.IsDeleted, ct)
            ?? throw new KeyNotFoundException("Documento no encontrado.");
        return Ok(_documents.CreateLink(document));
    }

    // ------------------------------------------------------------------ notificaciones
    /// <summary>Bandeja de notificaciones del panel: lo que el sistema ha enviado a clientes y al personal.</summary>
    [HttpGet("notifications")]
    [HasPermission("notifications.view")]
    public async Task<ActionResult<PagedResult<object>>> Notifications(
        [FromQuery] Guid? userId, [FromQuery] NotificationType? type, [FromQuery] bool? unreadOnly,
        [FromQuery] string? search, [FromQuery] DateTime? from, [FromQuery] DateTime? to,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        var query = _db.Notifications.AsNoTracking().Include(n => n.User).AsQueryable();

        if (userId.HasValue) query = query.Where(n => n.UserId == userId);
        if (type.HasValue) query = query.Where(n => n.Type == type);
        if (unreadOnly == true) query = query.Where(n => n.ReadAt == null);
        if (from.HasValue) query = query.Where(n => n.CreatedAt >= from);
        if (to.HasValue) query = query.Where(n => n.CreatedAt < to.Value.AddDays(1));
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(n => n.Title.Contains(term) || n.Body.Contains(term)
                                     || n.User.Email.Contains(term) || n.User.FullName.Contains(term));
        }

        var paged = await query.OrderByDescending(n => n.CreatedAt).ToPagedResultAsync(page, pageSize, ct);

        var items = paged.Items.Select(n => (object)new
        {
            id = n.Id,
            userId = n.UserId,
            userEmail = n.User.Email,
            userName = n.User.FullName,
            title = n.Title,
            body = n.Body,
            type = n.Type.ToString(),
            channel = n.Channel.ToString(),
            status = n.Status.ToString(),
            deepLink = n.DeepLink,
            dataJson = n.DataJson,
            isRead = n.ReadAt.HasValue,
            fcmMessageId = n.FcmMessageId,
            error = n.Error,
            createdAt = n.CreatedAt,
            sentAt = n.SentAt,
            readAt = n.ReadAt,
        }).ToList();

        return Ok(new PagedResult<object>(items, paged.Total, paged.Page, paged.PageSize));
    }

    /// <summary>Resumen de la bandeja: totales por tipo y cuántas quedaron sin leer.</summary>
    [HttpGet("notifications/summary")]
    [HasPermission("notifications.view")]
    public async Task<ActionResult<object>> NotificationsSummary(CancellationToken ct)
    {
        var since = DateTime.UtcNow.AddDays(-30);
        var recent = await _db.Notifications.AsNoTracking().Where(n => n.CreatedAt >= since).ToListAsync(ct);

        return Ok(new
        {
            total = recent.Count,
            unread = recent.Count(n => n.ReadAt is null),
            byType = recent.GroupBy(n => n.Type)
                .Select(g => new { type = g.Key.ToString(), label = AccessResolver.Label(g.Key), count = g.Count() })
                .OrderByDescending(x => x.count).ToList(),
            last30Days = recent.Count,
        });
    }

    /// <summary>Marca una notificación como leída (el panel la descuenta de «sin leer»).</summary>
    [HttpPost("notifications/{id:guid}/read")]
    [HasPermission("notifications.view")]
    public async Task<IActionResult> MarkNotificationRead(Guid id, CancellationToken ct)
    {
        var updated = await _db.Notifications.Where(n => n.Id == id && n.ReadAt == null)
            .ExecuteUpdateAsync(s => s
                .SetProperty(n => n.ReadAt, DateTime.UtcNow)
                .SetProperty(n => n.Status, NotificationStatus.Read), ct);

        if (updated == 0 && !await _db.Notifications.AnyAsync(n => n.Id == id, ct))
            throw new KeyNotFoundException("Notificación no encontrada.");

        return NoContent();
    }

    /// <summary>Marca como leídas todas las notificaciones pendientes (opcionalmente de un usuario).</summary>
    [HttpPost("notifications/read-all")]
    [HasPermission("notifications.view")]
    public async Task<ActionResult<object>> MarkAllNotificationsRead([FromQuery] Guid? userId, CancellationToken ct)
    {
        var query = _db.Notifications.Where(n => n.ReadAt == null);
        if (userId.HasValue) query = query.Where(n => n.UserId == userId);

        var updated = await query.ExecuteUpdateAsync(s => s
            .SetProperty(n => n.ReadAt, DateTime.UtcNow)
            .SetProperty(n => n.Status, NotificationStatus.Read), ct);

        return Ok(new { updated, message = $"{updated} notificaciones marcadas como leídas." });
    }

    /// <summary>Envía un aviso manual a un usuario (queda en su bandeja del app y se envía por push).</summary>
    [HttpPost("notifications/send")]
    [HasPermission("notifications.send")]
    public async Task<ActionResult<object>> SendNotification([FromBody] SendNotificationRequest request, CancellationToken ct)
    {
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == request.UserId && !u.IsDeleted, ct)
            ?? throw new KeyNotFoundException("Usuario no encontrado.");

        await _notifications.NotifyUserAsync(user.Id, request.Type, request.Title, request.Body, request.DeepLink, null, true, ct);
        await _audit.LogAsync("send", "Notification", user.Id.ToString(), after: new { request.Title, request.Type }, ct: ct);

        return Ok(new { message = "Notificación enviada.", userId = user.Id });
    }

    /// <summary>Reenvía una notificación existente (útil cuando el dispositivo estaba apagado).</summary>
    [HttpPost("notifications/{id:guid}/resend")]
    [HasPermission("notifications.send")]
    public async Task<ActionResult<object>> ResendNotification(Guid id, CancellationToken ct)
    {
        var notification = await _db.Notifications.AsNoTracking().FirstOrDefaultAsync(n => n.Id == id, ct)
            ?? throw new KeyNotFoundException("Notificación no encontrada.");

        await _notifications.NotifyUserAsync(notification.UserId, notification.Type, notification.Title,
            notification.Body, notification.DeepLink, null, true, ct);

        return Ok(new { message = "Notificación reenviada." });
    }
}
