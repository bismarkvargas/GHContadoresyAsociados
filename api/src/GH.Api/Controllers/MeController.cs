using GH.Api.Contracts;
using GH.Api.Services;
using GH.Domain;
using GH.Domain.Abstractions;
using GH.Domain.Entities;
using GH.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaskStatus = GH.Domain.TaskStatus;

namespace GH.Api.Controllers;

/// <summary>Área del cliente en el app móvil: sus expedientes, documentos, mensajes y avisos.
/// Todo lo que el administrador gestiona se refleja aquí en tiempo real.</summary>
[ApiController]
[Route("api/v1/me")]
[Authorize]
public class MeController : ControllerBase
{
    private readonly GhDbContext _db;
    private readonly ICurrentUser _current;
    private readonly DocumentService _documents;
    private readonly INotificationService _notifications;
    private readonly IRealtimeNotifier _realtime;
    private readonly IAuditLogger _audit;

    public MeController(GhDbContext db, ICurrentUser current, DocumentService documents,
        INotificationService notifications, IRealtimeNotifier realtime, IAuditLogger audit)
    {
        _db = db;
        _current = current;
        _documents = documents;
        _notifications = notifications;
        _realtime = realtime;
        _audit = audit;
    }

    private async Task<Client> RequireClientAsync(CancellationToken ct)
    {
        if (_current.UserId is not Guid userId) throw new UnauthorizedAccessException("Sesión no válida.");

        var client = await _db.Clients.FirstOrDefaultAsync(c => c.UserId == userId && !c.IsDeleted, ct);
        if (client is null)
            throw new KeyNotFoundException("Su usuario no está vinculado a un expediente de cliente. Contacte a GH Contadores.");

        return client;
    }

    // ------------------------------------------------------------------ panel de inicio
    /// <summary>Resumen del cliente para la pantalla de inicio del app.</summary>
    [HttpGet("dashboard")]
    public async Task<ActionResult<object>> Dashboard(CancellationToken ct)
    {
        var client = await RequireClientAsync(ct);

        var cases = await _db.CaseFiles.AsNoTracking()
            .Where(c => c.ClientId == client.Id && !c.IsDeleted && c.ClientVisible)
            .ToListAsync(ct);

        var caseIds = cases.Select(c => c.Id).ToList();

        var tasks = await _db.CaseTasks.AsNoTracking()
            .Where(t => caseIds.Contains(t.CaseFileId) && t.ClientVisible && t.Status != TaskStatus.Cancelled)
            .ToListAsync(ct);

        var documentsCount = await _db.Documents.AsNoTracking()
            .CountAsync(d => d.ClientId == client.Id && !d.IsDeleted && d.ClientVisible, ct);

        var unreadNotifications = await _db.Notifications.AsNoTracking()
            .CountAsync(n => n.UserId == _current.UserId && n.ReadAt == null, ct);

        var orders = await _db.Orders.AsNoTracking()
            .Where(o => o.ClientId == client.Id)
            .OrderByDescending(o => o.CreatedAt)
            .Take(5)
            .ToListAsync(ct);

        var recentEvents = await _db.CaseEvents.AsNoTracking()
            .Where(e => caseIds.Contains(e.CaseFileId) && e.ClientVisible)
            .OrderByDescending(e => e.CreatedAt)
            .Take(8)
            .Select(e => new { e.Id, e.CaseFileId, e.Type, e.Title, e.Description, e.CreatedAt, CaseCode = e.CaseFile.Code })
            .ToListAsync(ct);

        var unreadMessages = await _db.Messages.AsNoTracking()
            .CountAsync(m => m.ClientId == client.Id && !m.IsFromClient && m.ReadByClientAt == null, ct);

        return Ok(new
        {
            client = new { client.Id, client.Code, client.LegalName, client.TradeName, client.Status, client.ClientType },
            summary = new
            {
                openCases = cases.Count(c => c.Status is CaseStatus.Open or CaseStatus.InProgress or CaseStatus.WaitingClient or CaseStatus.OnHold),
                totalCases = cases.Count,
                pendingTasks = tasks.Count(t => t.Status is TaskStatus.Todo or TaskStatus.InProgress),
                tasksForClient = tasks.Count(t => t.Status == TaskStatus.Todo && t.ClientVisible && t.ClientCanComplete),
                documents = documentsCount,
                unreadNotifications,
                unreadMessages,
                activeOrders = orders.Count(o => o.Status is OrderStatus.PendingPayment or OrderStatus.Paid or OrderStatus.InProcess),
            },
            cases = cases.OrderByDescending(c => c.UpdatedAt).Take(4).Select(c => CaseFileDto.From(c)).ToList(),
            pendingTasks = tasks.Where(t => t.Status is TaskStatus.Todo or TaskStatus.InProgress)
                .OrderBy(t => t.DueAt ?? DateTime.MaxValue).Take(6).Select(CaseTaskDto.From).ToList(),
            recentEvents = recentEvents.Select(e => new
            {
                id = e.Id,
                caseFileId = e.CaseFileId,
                caseCode = e.CaseCode,
                type = e.Type.ToString(),
                title = e.Title,
                description = e.Description,
                at = e.CreatedAt,
            }).ToList(),
            orders = orders.Select(o => OrderDto.From(o, withItems: false)).ToList(),
        });
    }

    // ------------------------------------------------------------------ perfil
    [HttpGet("profile")]
    public async Task<ActionResult<object>> Profile(CancellationToken ct)
    {
        if (_current.UserId is not Guid userId) return Unauthorized();

        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId, ct)
                   ?? throw new KeyNotFoundException("Usuario no encontrado.");
        var client = await _db.Clients.AsNoTracking().FirstOrDefaultAsync(c => c.UserId == userId, ct);

        return Ok(new
        {
            user = new
            {
                user.Id, user.Email, user.FullName, user.Phone, user.IdNumber, user.AvatarUrl,
                user.Locale, user.TimeZone, user.CreatedAt, user.LastLoginAt,
            },
            client = client is null ? null : new
            {
                client.Id, client.Code, client.ClientType, client.LegalName, client.TradeName, client.IdNumber,
                client.Email, client.Phone, client.Whatsapp, client.Address, client.Province, client.Canton,
                client.District, client.Country, client.Status,
                tags = ClientDto.SplitTags(client.TagsCsv),
            },
        });
    }

    /// <summary>Actualiza los datos del usuario y, si procede, los del cliente asociado.</summary>
    [HttpPut("profile")]
    public async Task<ActionResult<object>> UpdateProfile([FromBody] UpdateProfileRequest request, CancellationToken ct)
    {
        if (_current.UserId is not Guid userId) return Unauthorized();

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId, ct)
                   ?? throw new KeyNotFoundException("Usuario no encontrado.");

        if (!string.IsNullOrWhiteSpace(request.FullName)) user.FullName = request.FullName.Trim();
        user.Phone = request.Phone?.Trim() ?? user.Phone;
        user.IdNumber = request.IdNumber?.Trim() ?? user.IdNumber;
        user.AvatarUrl = request.AvatarUrl?.Trim() ?? user.AvatarUrl;
        user.UpdatedAt = DateTime.UtcNow;

        var client = await _db.Clients.FirstOrDefaultAsync(c => c.UserId == userId, ct);
        if (client is not null)
        {
            client.LegalName = string.IsNullOrWhiteSpace(request.FullName) ? client.LegalName : request.FullName.Trim();
            client.Phone = user.Phone ?? client.Phone;
            client.Whatsapp ??= user.Phone;
            client.IdNumber = user.IdNumber ?? client.IdNumber;
            client.UpdatedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("update", "User", user.Id.ToString(), ct: ct);
        await _realtime.ToStaffAsync("client.updated", new { clientId = client?.Id, userId, at = DateTime.UtcNow }, ct);

        return Ok(new OperationResponse(true, "Datos actualizados correctamente."));
    }

    // ------------------------------------------------------------------ expedientes
    [HttpGet("cases")]
    public async Task<ActionResult<IReadOnlyList<CaseFileDto>>> Cases([FromQuery] string? status, CancellationToken ct)
    {
        var client = await RequireClientAsync(ct);

        var query = _db.CaseFiles.AsNoTracking().Include(c => c.ResponsibleUser)
            .Where(c => c.ClientId == client.Id && !c.IsDeleted && c.ClientVisible);

        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<CaseStatus>(status, true, out var parsed))
            query = query.Where(c => c.Status == parsed);

        var cases = await query.OrderByDescending(c => c.UpdatedAt).ToListAsync(ct);
        var ids = cases.Select(c => c.Id).ToList();

        var tasks = await _db.CaseTasks.AsNoTracking().Where(t => ids.Contains(t.CaseFileId)).ToListAsync(ct);
        var docCounts = await _db.Documents.AsNoTracking()
            .Where(d => d.CaseFileId != null && !d.IsDeleted && d.ClientVisible && ids.Contains(d.CaseFileId.Value))
            .GroupBy(d => d.CaseFileId!.Value)
            .Select(g => new { CaseFileId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.CaseFileId, x => x.Count, ct);

        return Ok(cases.Select(c =>
        {
            var myTasks = tasks.Where(t => t.CaseFileId == c.Id).ToList();
            var counts = new CaseTaskCountsDto(
                myTasks.Count,
                myTasks.Count(t => t.Status == TaskStatus.Done),
                myTasks.Count(t => t.Status is TaskStatus.Todo or TaskStatus.InProgress),
                myTasks.Count(t => t.DueAt.HasValue && t.DueAt < DateTime.UtcNow
                                   && (t.Status is TaskStatus.Todo or TaskStatus.InProgress or TaskStatus.Blocked)));
            return CaseFileDto.From(c, docCounts.GetValueOrDefault(c.Id), counts);
        }).ToList());
    }

    [HttpGet("cases/{id:guid}")]
    public async Task<ActionResult<object>> Case(Guid id, CancellationToken ct)
    {
        var client = await RequireClientAsync(ct);

        var entity = await _db.CaseFiles.AsNoTracking().Include(c => c.ResponsibleUser)
            .FirstOrDefaultAsync(c => c.Id == id && c.ClientId == client.Id && !c.IsDeleted && c.ClientVisible, ct)
            ?? throw new KeyNotFoundException("Expediente no encontrado.");

        var tasks = await _db.CaseTasks.AsNoTracking()
            .Where(t => t.CaseFileId == id && t.ClientVisible)
            .OrderBy(t => t.SortOrder).ThenBy(t => t.DueAt)
            .ToListAsync(ct);

        var documents = await _db.Documents.AsNoTracking()
            .Where(d => d.CaseFileId == id && !d.IsDeleted && d.ClientVisible)
            .OrderByDescending(d => d.UploadedAt)
            .ToListAsync(ct);

        var docDtos = new List<DocumentDto>();
        foreach (var d in documents) docDtos.Add(await _documents.ToDtoAsync(d, ct));

        var events = await _db.CaseEvents.AsNoTracking()
            .Where(e => e.CaseFileId == id && e.ClientVisible)
            .OrderByDescending(e => e.CreatedAt)
            .Take(50)
            .ToListAsync(ct);

        return Ok(new
        {
            caseFile = CaseFileDto.From(entity, documents.Count),
            tasks = tasks.Select(CaseTaskDto.From).ToList(),
            documents = docDtos,
            timeline = events.Select(CaseEventDto.From).ToList(),
            responsible = entity.ResponsibleUser is null ? null : new
            {
                entity.ResponsibleUser.Id, entity.ResponsibleUser.FullName, entity.ResponsibleUser.Email, entity.ResponsibleUser.Phone,
            },
        });
    }

    [HttpGet("cases/{id:guid}/timeline")]
    public async Task<ActionResult<IReadOnlyList<CaseEventDto>>> Timeline(Guid id, CancellationToken ct)
    {
        var client = await RequireClientAsync(ct);
        if (!await _db.CaseFiles.AnyAsync(c => c.Id == id && c.ClientId == client.Id && c.ClientVisible, ct))
            throw new KeyNotFoundException("Expediente no encontrado.");

        var events = await _db.CaseEvents.AsNoTracking()
            .Where(e => e.CaseFileId == id && e.ClientVisible)
            .OrderByDescending(e => e.CreatedAt)
            .Take(200)
            .ToListAsync(ct);

        return Ok(events.Select(CaseEventDto.From).ToList());
    }

    // ------------------------------------------------------------------ tareas del cliente
    [HttpGet("tasks")]
    public async Task<ActionResult<IReadOnlyList<CaseTaskDto>>> Tasks([FromQuery] bool? pending, CancellationToken ct)
    {
        var client = await RequireClientAsync(ct);
        var caseIds = await _db.CaseFiles.AsNoTracking()
            .Where(c => c.ClientId == client.Id && c.ClientVisible && !c.IsDeleted)
            .Select(c => c.Id).ToListAsync(ct);

        var query = _db.CaseTasks.AsNoTracking()
            .Include(t => t.AssignedToUser)
            .Where(t => caseIds.Contains(t.CaseFileId) && t.ClientVisible);

        if (pending == true) query = query.Where(t => t.Status == TaskStatus.Todo || t.Status == TaskStatus.InProgress);

        var tasks = await query.OrderBy(t => t.Status).ThenBy(t => t.DueAt).ToListAsync(ct);
        return Ok(tasks.Select(CaseTaskDto.From).ToList());
    }

    /// <summary>El cliente marca como completada una tarea que le corresponde.</summary>
    [HttpPost("tasks/{id:guid}/complete")]
    public async Task<ActionResult<CaseTaskDto>> CompleteTask(Guid id, CancellationToken ct)
    {
        var client = await RequireClientAsync(ct);

        var task = await _db.CaseTasks.Include(t => t.CaseFile).Include(t => t.AssignedToUser)
            .FirstOrDefaultAsync(t => t.Id == id, ct)
            ?? throw new KeyNotFoundException("Tarea no encontrada.");

        if (task.CaseFile.ClientId != client.Id) throw new UnauthorizedAccessException("Esta tarea no le pertenece.");
        if (!task.ClientCanComplete) throw new InvalidOperationException("Esta tarea la completa el equipo de GH Contadores.");

        task.Status = TaskStatus.Done;
        task.CompletedAt = DateTime.UtcNow;
        task.UpdatedAt = DateTime.UtcNow;

        _db.CaseEvents.Add(new CaseEvent
        {
            CaseFileId = task.CaseFileId,
            Type = CaseEventType.TaskCompleted,
            Title = $"Tarea completada por el cliente: {task.Title}",
            ActorUserId = _current.UserId,
            ActorName = _current.FullName ?? "Cliente",
            ClientVisible = true,
        });

        await _db.SaveChangesAsync(ct);

        await _realtime.ToStaffAsync("task.completed", new
        {
            taskId = task.Id,
            caseFileId = task.CaseFileId,
            title = task.Title,
            byClient = true,
            clientName = client.LegalName,
            at = DateTime.UtcNow,
        }, ct);

        await _notifications.NotifyStaffAsync(NotificationType.TaskCompleted,
            "Tarea completada por el cliente",
            $"{client.LegalName} completó la tarea «{task.Title}».",
            deepLink: $"/admin/cases/{task.CaseFileId}",
            data: new { taskId = task.Id, caseFileId = task.CaseFileId });

        return Ok(CaseTaskDto.From(task));
    }

    // ------------------------------------------------------------------ documentos
    [HttpGet("documents")]
    public async Task<ActionResult<IReadOnlyList<DocumentDto>>> Documents([FromQuery] Guid? caseFileId, CancellationToken ct)
    {
        var client = await RequireClientAsync(ct);

        var query = _db.Documents.AsNoTracking().Include(d => d.CaseFile)
            .Where(d => d.ClientId == client.Id && !d.IsDeleted && d.ClientVisible && d.IsCurrent);

        if (caseFileId.HasValue) query = query.Where(d => d.CaseFileId == caseFileId);

        var documents = await query.OrderByDescending(d => d.UploadedAt).ToListAsync(ct);

        var result = new List<DocumentDto>();
        foreach (var d in documents) result.Add(await _documents.ToDtoAsync(d, ct));
        return Ok(result);
    }

    /// <summary>Sube un documento del cliente (PDF, imagen u Office, máx. 25 MB).</summary>
    [HttpPost("documents")]
    [RequestSizeLimit(52_428_800)]
    [Consumes("multipart/form-data")]
    public async Task<ActionResult<DocumentDto>> UploadDocument(
        IFormFile file,
        [FromForm] string? category,
        [FromForm] Guid? caseFileId,
        [FromForm] string? description,
        CancellationToken ct)
    {
        var client = await RequireClientAsync(ct);

        var parsedCategory = DocumentCategory.Otro;
        if (!string.IsNullOrWhiteSpace(category) && Enum.TryParse<DocumentCategory>(category, true, out var c)) parsedCategory = c;

        var dto = await _documents.UploadAsync(file, new DocumentUploadRequest(
            client.Id, caseFileId, null, parsedCategory, true, description), client.Id, ct);

        return Ok(dto);
    }

    [HttpGet("documents/{id:guid}/link")]
    public async Task<ActionResult<DownloadLinkDto>> DocumentLink(Guid id, CancellationToken ct)
    {
        var client = await RequireClientAsync(ct);

        var document = await _db.Documents.AsNoTracking()
            .FirstOrDefaultAsync(d => d.Id == id && d.ClientId == client.Id && !d.IsDeleted && d.ClientVisible, ct)
            ?? throw new KeyNotFoundException("Documento no encontrado.");

        return Ok(_documents.CreateLink(document));
    }

    // ------------------------------------------------------------------ mensajería
    [HttpGet("messages")]
    public async Task<ActionResult<IReadOnlyList<MessageDto>>> Messages([FromQuery] Guid? caseFileId, CancellationToken ct)
    {
        var client = await RequireClientAsync(ct);

        var query = _db.Messages.AsNoTracking().Include(m => m.CaseFile).Include(m => m.AttachmentDocument)
            .Where(m => m.ClientId == client.Id);
        if (caseFileId.HasValue) query = query.Where(m => m.CaseFileId == caseFileId);

        var messages = await query.OrderBy(m => m.CreatedAt).Take(300).ToListAsync(ct);

        // El cliente abre la conversación: se marca como leído lo enviado por la firma.
        var unread = messages.Where(m => !m.IsFromClient && m.ReadByClientAt is null).ToList();
        if (unread.Count > 0)
        {
            await _db.Messages.Where(m => unread.Select(u => u.Id).Contains(m.Id))
                .ExecuteUpdateAsync(s => s.SetProperty(m => m.ReadByClientAt, DateTime.UtcNow), ct);
            foreach (var m in unread) m.ReadByClientAt = DateTime.UtcNow;
        }

        return Ok(messages.Select(MessageDto.From).ToList());
    }

    [HttpPost("messages")]
    public async Task<ActionResult<MessageDto>> SendMessage([FromBody] SendMessageRequest request, CancellationToken ct)
    {
        var client = await RequireClientAsync(ct);
        if (string.IsNullOrWhiteSpace(request.Body)) throw new ArgumentException("El mensaje no puede estar vacío.");

        if (request.CaseFileId.HasValue &&
            !await _db.CaseFiles.AnyAsync(c => c.Id == request.CaseFileId && c.ClientId == client.Id, ct))
            throw new ArgumentException("El expediente indicado no le pertenece.");

        var message = new Message
        {
            ClientId = client.Id,
            CaseFileId = request.CaseFileId,
            SenderUserId = _current.UserId!.Value,
            SenderName = _current.FullName ?? "Cliente",
            Body = request.Body.Trim(),
            IsFromClient = true,
            AttachmentDocumentId = request.AttachmentDocumentId,
        };
        _db.Messages.Add(message);

        if (request.CaseFileId.HasValue)
        {
            _db.CaseEvents.Add(new CaseEvent
            {
                CaseFileId = request.CaseFileId.Value,
                Type = CaseEventType.MessageAdded,
                Title = "Mensaje del cliente",
                Description = message.Body.Length > 160 ? message.Body[..160] + "…" : message.Body,
                ActorUserId = _current.UserId,
                ActorName = message.SenderName,
                ClientVisible = true,
            });
        }

        await _db.SaveChangesAsync(ct);

        await _realtime.ToStaffAsync("message.created", new
        {
            messageId = message.Id,
            clientId = client.Id,
            clientName = client.LegalName,
            caseFileId = message.CaseFileId,
            body = message.Body,
            fromClient = true,
            at = message.CreatedAt,
        }, ct);

        await _notifications.NotifyStaffAsync(NotificationType.MessageReceived,
            "Mensaje de un cliente",
            $"{client.LegalName}: {(message.Body.Length > 120 ? message.Body[..120] + "…" : message.Body)}",
            deepLink: request.CaseFileId.HasValue ? $"/admin/cases/{request.CaseFileId}" : $"/admin/clients/{client.Id}",
            data: new { messageId = message.Id, clientId = client.Id });

        return Ok(MessageDto.From(message));
    }

    // ------------------------------------------------------------------ notificaciones
    [HttpGet("notifications")]
    public async Task<ActionResult<PagedResult<NotificationDto>>> Notifications(
        [FromQuery] bool? unreadOnly, [FromQuery] int page = 1, [FromQuery] int pageSize = 30, CancellationToken ct = default)
    {
        if (_current.UserId is not Guid userId) return Unauthorized();

        var query = _db.Notifications.AsNoTracking().Where(n => n.UserId == userId);
        if (unreadOnly == true) query = query.Where(n => n.ReadAt == null);

        var paged = await query.OrderByDescending(n => n.CreatedAt).ToPagedResultAsync(page, pageSize, ct);
        return Ok(new PagedResult<NotificationDto>(paged.Items.Select(NotificationDto.From).ToList(), paged.Total, paged.Page, paged.PageSize));
    }

    [HttpGet("notifications/unread-count")]
    public async Task<ActionResult<object>> UnreadCount(CancellationToken ct)
    {
        if (_current.UserId is not Guid userId) return Unauthorized();
        var count = await _db.Notifications.AsNoTracking().CountAsync(n => n.UserId == userId && n.ReadAt == null, ct);
        return Ok(new { count });
    }

    [HttpPost("notifications/{id:guid}/read")]
    public async Task<IActionResult> MarkRead(Guid id, CancellationToken ct)
    {
        if (_current.UserId is not Guid userId) return Unauthorized();
        await _db.Notifications.Where(n => n.Id == id && n.UserId == userId)
            .ExecuteUpdateAsync(s => s.SetProperty(n => n.ReadAt, DateTime.UtcNow).SetProperty(n => n.Status, NotificationStatus.Read), ct);
        return NoContent();
    }

    [HttpPost("notifications/read-all")]
    public async Task<IActionResult> MarkAllRead(CancellationToken ct)
    {
        if (_current.UserId is not Guid userId) return Unauthorized();
        await _db.Notifications.Where(n => n.UserId == userId && n.ReadAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(n => n.ReadAt, DateTime.UtcNow).SetProperty(n => n.Status, NotificationStatus.Read), ct);
        return NoContent();
    }

    /// <summary>Preferencias de notificación por tipo (push / in-app / correo).</summary>
    [HttpGet("notification-preferences")]
    public async Task<ActionResult<IReadOnlyList<NotificationPreferenceDto>>> Preferences(CancellationToken ct)
    {
        if (_current.UserId is not Guid userId) return Unauthorized();

        var stored = await _db.NotificationPreferences.AsNoTracking().Where(p => p.UserId == userId).ToListAsync(ct);
        var all = Enum.GetValues<NotificationType>().Where(t => t != NotificationType.System).ToList();

        return Ok(all.Select(t =>
        {
            var p = stored.FirstOrDefault(x => x.Type == t);
            return new NotificationPreferenceDto(t, AccessResolver.Label(t), p?.Push ?? true, p?.InApp ?? true, p?.Email ?? false);
        }).ToList());
    }

    [HttpPut("notification-preferences")]
    public async Task<ActionResult<IReadOnlyList<NotificationPreferenceDto>>> UpdatePreferences(
        [FromBody] UpdateNotificationPreferencesRequest request, CancellationToken ct)
    {
        if (_current.UserId is not Guid userId) return Unauthorized();

        var existing = await _db.NotificationPreferences.Where(p => p.UserId == userId).ToListAsync(ct);

        foreach (var pref in request.Preferences ?? Array.Empty<NotificationPreferenceDto>())
        {
            var entity = existing.FirstOrDefault(p => p.Type == pref.Type);
            if (entity is null)
            {
                entity = new NotificationPreference { UserId = userId, Type = pref.Type };
                _db.NotificationPreferences.Add(entity);
            }
            entity.Push = pref.Push;
            entity.InApp = pref.InApp;
            entity.Email = pref.Email;
        }

        await _db.SaveChangesAsync(ct);
        return await Preferences(ct);
    }

    // ------------------------------------------------------------------ dispositivos (push)
    /// <summary>Registra el token de Firebase Cloud Messaging del dispositivo.</summary>
    [HttpPost("devices")]
    public async Task<ActionResult<object>> RegisterDevice([FromBody] RegisterDeviceRequest request, CancellationToken ct)
    {
        if (_current.UserId is not Guid userId) return Unauthorized();
        if (string.IsNullOrWhiteSpace(request.Token)) throw new ArgumentException("Token de dispositivo requerido.");

        var token = request.Token.Trim();
        var existing = await _db.DeviceTokens.FirstOrDefaultAsync(t => t.Token == token, ct);

        if (existing is null)
        {
            _db.DeviceTokens.Add(new DeviceToken
            {
                UserId = userId,
                Token = token,
                Platform = request.Platform,
                DeviceModel = request.DeviceModel,
                AppVersion = request.AppVersion,
                IsActive = true,
                LastSeenAt = DateTime.UtcNow,
            });
        }
        else
        {
            // El mismo dispositivo puede cambiar de usuario: se reasigna al actual.
            existing.UserId = userId;
            existing.Platform = request.Platform;
            existing.DeviceModel = request.DeviceModel ?? existing.DeviceModel;
            existing.AppVersion = request.AppVersion ?? existing.AppVersion;
            existing.IsActive = true;
            existing.LastSeenAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync(ct);
        return Ok(new OperationResponse(true, "Dispositivo registrado para notificaciones push."));
    }

    [HttpDelete("devices/{token}")]
    public async Task<IActionResult> UnregisterDevice(string token, CancellationToken ct)
    {
        if (_current.UserId is not Guid userId) return Unauthorized();
        await _db.DeviceTokens.Where(t => t.Token == token && t.UserId == userId)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.IsActive, false), ct);
        return NoContent();
    }
}
