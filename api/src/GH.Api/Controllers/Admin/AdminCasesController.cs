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
using TaskStatus = GH.Domain.TaskStatus;

namespace GH.Api.Controllers.Admin;

/// <summary>Expedientes y casos: gestión completa, tareas, actuaciones y documentos.
/// Cada cambio relevante genera actuación, evento en tiempo real y notificación push al cliente.</summary>
[ApiController]
[Route("api/v1/admin/cases")]
[Authorize]
public class AdminCasesController : ControllerBase
{
    private readonly GhDbContext _db;
    private readonly ICurrentUser _current;
    private readonly ICodeGenerator _codes;
    private readonly IAuditLogger _audit;
    private readonly INotificationService _notifications;
    private readonly IRealtimeNotifier _realtime;
    private readonly DocumentService _documents;

    public AdminCasesController(GhDbContext db, ICurrentUser current, ICodeGenerator codes, IAuditLogger audit,
        INotificationService notifications, IRealtimeNotifier realtime, DocumentService documents)
    {
        _db = db;
        _current = current;
        _codes = codes;
        _audit = audit;
        _notifications = notifications;
        _realtime = realtime;
        _documents = documents;
    }

    // ------------------------------------------------------------------ listado y detalle
    [HttpGet]
    [HasPermission("cases.view")]
    public async Task<ActionResult<PagedResult<CaseFileDto>>> List(
        [FromQuery] string? search, [FromQuery] CaseStatus? status, [FromQuery] CaseMatter? matter,
        [FromQuery] CaseEntity? entity, [FromQuery] Guid? clientId, [FromQuery] Guid? responsible,
        [FromQuery] Priority? priority, [FromQuery] bool? overdue,
        [FromQuery] string? sort, [FromQuery] string? order,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        var query = _db.CaseFiles.AsNoTracking().Include(c => c.Client).Include(c => c.ResponsibleUser)
            .Where(c => !c.IsDeleted);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(c => c.Title.Contains(term) || c.Code.Contains(term)
                                     || (c.ReferenceNumber != null && c.ReferenceNumber.Contains(term))
                                     || c.Client.LegalName.Contains(term));
        }
        if (status.HasValue) query = query.Where(c => c.Status == status);
        if (matter.HasValue) query = query.Where(c => c.Matter == matter);
        if (entity.HasValue) query = query.Where(c => c.Entity == entity);
        if (clientId.HasValue) query = query.Where(c => c.ClientId == clientId);
        if (responsible.HasValue) query = query.Where(c => c.ResponsibleUserId == responsible);
        if (priority.HasValue) query = query.Where(c => c.Priority == priority);
        if (overdue == true) query = query.Where(c => c.DueAt != null && c.DueAt < DateTime.UtcNow
            && c.Status != CaseStatus.Completed && c.Status != CaseStatus.Closed && c.Status != CaseStatus.Cancelled);

        query = (sort?.ToLowerInvariant(), order?.ToLowerInvariant()) switch
        {
            ("due", "desc") => query.OrderByDescending(c => c.DueAt),
            ("due", _) => query.OrderBy(c => c.DueAt ?? DateTime.MaxValue),
            ("priority", _) => query.OrderByDescending(c => c.Priority),
            ("code", _) => query.OrderBy(c => c.Code),
            ("progress", _) => query.OrderBy(c => c.ProgressPercent),
            _ => query.OrderByDescending(c => c.UpdatedAt),
        };

        var paged = await query.ToPagedResultAsync(page, pageSize, ct);
        var ids = paged.Items.Select(c => c.Id).ToList();

        var tasks = await _db.CaseTasks.AsNoTracking().Where(t => ids.Contains(t.CaseFileId)).ToListAsync(ct);
        var docCounts = await _db.Documents.AsNoTracking()
            .Where(d => d.CaseFileId != null && ids.Contains(d.CaseFileId.Value) && !d.IsDeleted)
            .GroupBy(d => d.CaseFileId!.Value)
            .Select(g => new { CaseFileId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.CaseFileId, x => x.Count, ct);

        var items = paged.Items.Select(c =>
        {
            var myTasks = tasks.Where(t => t.CaseFileId == c.Id).ToList();
            var counts = new CaseTaskCountsDto(
                myTasks.Count,
                myTasks.Count(t => t.Status == TaskStatus.Done),
                myTasks.Count(t => t.Status is TaskStatus.Todo or TaskStatus.InProgress),
                myTasks.Count(t => t.DueAt.HasValue && t.DueAt < DateTime.UtcNow
                                   && (t.Status is TaskStatus.Todo or TaskStatus.InProgress or TaskStatus.Blocked)));
            return CaseFileDto.From(c, docCounts.GetValueOrDefault(c.Id), counts);
        }).ToList();

        return Ok(new PagedResult<CaseFileDto>(items, paged.Total, paged.Page, paged.PageSize));
    }

    /// <summary>Tablero kanban: expedientes agrupados por estado.</summary>
    [HttpGet("board")]
    [HasPermission("cases.view")]
    public async Task<ActionResult<object>> Board([FromQuery] Guid? responsible, [FromQuery] CaseMatter? matter, CancellationToken ct)
    {
        var query = _db.CaseFiles.AsNoTracking().Include(c => c.Client).Include(c => c.ResponsibleUser)
            .Where(c => !c.IsDeleted && c.Status != CaseStatus.Closed && c.Status != CaseStatus.Cancelled);

        if (responsible.HasValue) query = query.Where(c => c.ResponsibleUserId == responsible);
        if (matter.HasValue) query = query.Where(c => c.Matter == matter);

        var cases = await query.OrderBy(c => c.Priority).ThenBy(c => c.DueAt).ToListAsync(ct);

        return Ok(Enum.GetValues<CaseStatus>().Select(s => new
        {
            status = s.ToString(),
            label = AccessResolver.Label(s),
            count = cases.Count(c => c.Status == s),
            items = cases.Where(c => c.Status == s).Select(c => CaseFileDto.From(c)).ToList(),
        }).ToList());
    }

    [HttpGet("{id:guid}")]
    [HasPermission("cases.view")]
    public async Task<ActionResult<object>> Detail(Guid id, CancellationToken ct)
    {
        var entity = await _db.CaseFiles.AsNoTracking().Include(c => c.Client).Include(c => c.ResponsibleUser)
            .FirstOrDefaultAsync(c => c.Id == id && !c.IsDeleted, ct)
            ?? throw new KeyNotFoundException("Expediente no encontrado.");

        var tasks = await _db.CaseTasks.AsNoTracking().Include(t => t.AssignedToUser).Include(t => t.CreatedByUser)
            .Where(t => t.CaseFileId == id).OrderBy(t => t.SortOrder).ThenBy(t => t.DueAt).ToListAsync(ct);

        var events = await _db.CaseEvents.AsNoTracking().Include(e => e.ActorUser)
            .Where(e => e.CaseFileId == id).OrderByDescending(e => e.CreatedAt).Take(200).ToListAsync(ct);

        var documents = await _db.Documents.AsNoTracking().Where(d => d.CaseFileId == id && !d.IsDeleted)
            .OrderByDescending(d => d.UploadedAt).ToListAsync(ct);
        var docDtos = new List<DocumentDto>();
        foreach (var d in documents) docDtos.Add(await _documents.ToDtoAsync(d, ct));

        var messages = await _db.Messages.AsNoTracking().Include(m => m.AttachmentDocument)
            .Where(m => m.CaseFileId == id).OrderBy(m => m.CreatedAt).Take(200).ToListAsync(ct);

        var counts = new CaseTaskCountsDto(
            tasks.Count,
            tasks.Count(t => t.Status == TaskStatus.Done),
            tasks.Count(t => t.Status is TaskStatus.Todo or TaskStatus.InProgress),
            tasks.Count(t => t.DueAt.HasValue && t.DueAt < DateTime.UtcNow
                             && (t.Status is TaskStatus.Todo or TaskStatus.InProgress or TaskStatus.Blocked)));

        return Ok(new
        {
            caseFile = CaseFileDto.From(entity, documents.Count, counts),
            client = new { entity.Client.Id, entity.Client.Code, entity.Client.LegalName, entity.Client.Email, entity.Client.Phone, entity.Client.UserId },
            tasks = tasks.Select(CaseTaskDto.From).ToList(),
            timeline = events.Select(CaseEventDto.From).ToList(),
            documents = docDtos,
            messages = messages.Select(MessageDto.From).ToList(),
        });
    }

    // ------------------------------------------------------------------ CRUD
    [HttpPost]
    [HasPermission("cases.create")]
    public async Task<ActionResult<CaseFileDto>> Create([FromBody] CaseCreateRequest request, CancellationToken ct)
    {
        var client = await _db.Clients.FirstOrDefaultAsync(c => c.Id == request.ClientId && !c.IsDeleted, ct)
            ?? throw new KeyNotFoundException("Cliente no encontrado.");

        var caseFile = new CaseFile
        {
            Code = await _codes.NextCaseCodeAsync(ct),
            ClientId = client.Id,
            Title = request.Title.Trim(),
            Description = request.Description?.Trim(),
            Matter = request.Matter,
            Entity = request.Entity,
            ReferenceNumber = request.ReferenceNumber?.Trim(),
            Status = request.Status,
            Priority = request.Priority,
            ProgressPercent = Math.Clamp(request.ProgressPercent, 0, 100),
            ResponsibleUserId = request.ResponsibleUserId ?? client.AssignedToUserId,
            DueAt = request.DueAt,
            AgreedAmount = request.AgreedAmount,
            Currency = string.IsNullOrWhiteSpace(request.Currency) ? "USD" : request.Currency,
            ClientVisible = request.ClientVisible,
            Source = CaseFileSource.Manual,
        };
        _db.CaseFiles.Add(caseFile);
        await _db.SaveChangesAsync(ct);

        _db.CaseEvents.Add(new CaseEvent
        {
            CaseFileId = caseFile.Id,
            Type = CaseEventType.Created,
            Title = "Expediente creado",
            Description = $"Se abrió el expediente «{caseFile.Title}».",
            ActorUserId = _current.UserId,
            ActorName = _current.FullName,
            ClientVisible = true,
        });

        if (request.Tasks is not null)
        {
            var order = 0;
            foreach (var t in request.Tasks)
            {
                order++;
                _db.CaseTasks.Add(new CaseTask
                {
                    CaseFileId = caseFile.Id,
                    Title = t.Title.Trim(),
                    Description = t.Description?.Trim(),
                    Status = t.Status,
                    Priority = t.Priority,
                    DueAt = t.DueAt,
                    AssignedToUserId = t.AssignedToUserId ?? caseFile.ResponsibleUserId,
                    CreatedByUserId = _current.UserId,
                    SortOrder = t.SortOrder == 0 ? order : t.SortOrder,
                    ClientVisible = t.ClientVisible,
                    ClientCanComplete = t.ClientCanComplete,
                });
            }
        }

        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("create", "CaseFile", caseFile.Id.ToString(), after: new { caseFile.Code, caseFile.Title }, ct: ct);

        await _realtime.ToStaffAsync("case.created", new
        {
            caseFileId = caseFile.Id, code = caseFile.Code, clientId = client.Id,
            clientName = client.LegalName, title = caseFile.Title, at = DateTime.UtcNow,
        }, ct);

        if (client.UserId.HasValue && caseFile.ClientVisible)
        {
            await _notifications.NotifyUserAsync(client.UserId.Value, NotificationType.CaseCreated,
                "Nuevo expediente creado",
                $"Abrimos el expediente {caseFile.Code} para «{caseFile.Title}».",
                deepLink: $"/cases/{caseFile.Id}",
                data: new { caseFileId = caseFile.Id, code = caseFile.Code }, ct: ct);
        }

        var created = await _db.CaseFiles.AsNoTracking().Include(c => c.Client).Include(c => c.ResponsibleUser)
            .FirstAsync(c => c.Id == caseFile.Id, ct);
        return Ok(CaseFileDto.From(created));
    }

    [HttpPut("{id:guid}")]
    [HasPermission("cases.edit")]
    public async Task<ActionResult<CaseFileDto>> Update(Guid id, [FromBody] CaseUpdateRequest request, CancellationToken ct)
    {
        var caseFile = await _db.CaseFiles.Include(c => c.Client).FirstOrDefaultAsync(c => c.Id == id && !c.IsDeleted, ct)
            ?? throw new KeyNotFoundException("Expediente no encontrado.");

        var before = new { caseFile.Title, caseFile.Matter, caseFile.ProgressPercent, caseFile.ResponsibleUserId };
        var assignmentChanged = caseFile.ResponsibleUserId != request.ResponsibleUserId;
        var dueChanged = caseFile.DueAt != request.DueAt;

        caseFile.Title = request.Title.Trim();
        caseFile.Description = request.Description?.Trim();
        caseFile.Matter = request.Matter;
        caseFile.Entity = request.Entity;
        caseFile.ReferenceNumber = request.ReferenceNumber?.Trim();
        caseFile.Priority = request.Priority;
        caseFile.ProgressPercent = Math.Clamp(request.ProgressPercent, 0, 100);
        caseFile.ResponsibleUserId = request.ResponsibleUserId;
        caseFile.DueAt = request.DueAt;
        caseFile.AgreedAmount = request.AgreedAmount;
        caseFile.Currency = string.IsNullOrWhiteSpace(request.Currency) ? caseFile.Currency : request.Currency;
        caseFile.ClientVisible = request.ClientVisible;
        caseFile.UpdatedAt = DateTime.UtcNow;

        if (assignmentChanged)
        {
            _db.CaseEvents.Add(new CaseEvent
            {
                CaseFileId = caseFile.Id,
                Type = CaseEventType.AssignmentChanged,
                Title = "Responsable actualizado",
                ActorUserId = _current.UserId, ActorName = _current.FullName, ClientVisible = true,
            });
        }
        if (dueChanged)
        {
            _db.CaseEvents.Add(new CaseEvent
            {
                CaseFileId = caseFile.Id,
                Type = CaseEventType.DueDateChanged,
                Title = $"Fecha de vencimiento: {request.DueAt:dd/MM/yyyy}",
                ActorUserId = _current.UserId, ActorName = _current.FullName, ClientVisible = true,
            });
        }

        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("update", "CaseFile", caseFile.Id.ToString(), before,
            new { caseFile.Title, caseFile.Matter, caseFile.ProgressPercent }, ct: ct);

        await PushCaseUpdateAsync(caseFile, "Expediente actualizado", $"Se actualizó la información del expediente {caseFile.Code}.", ct);

        var refreshed = await _db.CaseFiles.AsNoTracking().Include(c => c.Client).Include(c => c.ResponsibleUser)
            .FirstAsync(c => c.Id == id, ct);
        return Ok(CaseFileDto.From(refreshed));
    }

    /// <summary>Cambia el estado del expediente y notifica al cliente por push y en tiempo real.</summary>
    [HttpPatch("{id:guid}/status")]
    [HasPermission("cases.edit")]
    public async Task<ActionResult<CaseFileDto>> ChangeStatus(Guid id, [FromBody] CaseStatusChangeRequest request, CancellationToken ct)
    {
        var caseFile = await _db.CaseFiles.Include(c => c.Client).FirstOrDefaultAsync(c => c.Id == id && !c.IsDeleted, ct)
            ?? throw new KeyNotFoundException("Expediente no encontrado.");

        var previous = caseFile.Status;
        if (previous == request.Status && request.ProgressPercent is null && string.IsNullOrWhiteSpace(request.Note))
            return Ok(CaseFileDto.From(caseFile));

        caseFile.Status = request.Status;
        if (request.ProgressPercent.HasValue) caseFile.ProgressPercent = Math.Clamp(request.ProgressPercent.Value, 0, 100);
        if (request.Status is CaseStatus.Completed or CaseStatus.Closed or CaseStatus.Cancelled)
        {
            caseFile.ClosedAt = DateTime.UtcNow;
            caseFile.ProgressPercent = 100;
        }
        else
        {
            caseFile.ClosedAt = null;
        }
        caseFile.UpdatedAt = DateTime.UtcNow;

        _db.CaseEvents.Add(new CaseEvent
        {
            CaseFileId = caseFile.Id,
            Type = CaseEventType.StatusChanged,
            Title = $"Estado: {AccessResolver.Label(previous)} → {AccessResolver.Label(request.Status)}",
            Description = request.Note,
            ActorUserId = _current.UserId,
            ActorName = _current.FullName,
            ClientVisible = true,
        });

        if (request.Status == CaseStatus.WaitingClient)
        {
            // El cliente tiene una acción pendiente: se le crea una tarea visible si no existe.
            var exists = await _db.CaseTasks.AnyAsync(t => t.CaseFileId == caseFile.Id && t.ClientVisible && t.ClientCanComplete && t.Status == TaskStatus.Todo, ct);
            if (!exists && caseFile.Client.UserId.HasValue)
            {
                _db.CaseTasks.Add(new CaseTask
                {
                    CaseFileId = caseFile.Id,
                    Title = "Acción requerida del cliente",
                    Description = request.Note ?? "Revise el expediente y aporte la información solicitada.",
                    Status = TaskStatus.Todo,
                    Priority = Priority.High,
                    DueAt = DateTime.UtcNow.AddDays(5),
                    AssignedToUserId = caseFile.Client.UserId,
                    CreatedByUserId = _current.UserId,
                    SortOrder = 1,
                    ClientVisible = true,
                    ClientCanComplete = true,
                });
            }
        }

        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("change-status", "CaseFile", caseFile.Id.ToString(), new { Status = previous.ToString() },
            new { Status = request.Status.ToString(), caseFile.ProgressPercent }, ct: ct);

        if (request.NotifyClient && caseFile.Client.UserId.HasValue && caseFile.ClientVisible)
        {
            await _notifications.NotifyUserAsync(caseFile.Client.UserId.Value, NotificationType.CaseStatusChanged,
                $"Expediente {caseFile.Code}: {AccessResolver.Label(request.Status)}",
                string.IsNullOrWhiteSpace(request.Note)
                    ? $"Su expediente «{caseFile.Title}» pasó a estado {AccessResolver.Label(request.Status)}."
                    : request.Note!,
                deepLink: $"/cases/{caseFile.Id}",
                data: new { caseFileId = caseFile.Id, code = caseFile.Code, status = caseFile.Status.ToString() }, ct: ct);
        }

        await PushCaseUpdateAsync(caseFile, "Estado del expediente actualizado", AccessResolver.Label(request.Status), ct);

        var refreshed = await _db.CaseFiles.AsNoTracking().Include(c => c.Client).Include(c => c.ResponsibleUser)
            .FirstAsync(c => c.Id == id, ct);
        return Ok(CaseFileDto.From(refreshed));
    }

    [HttpDelete("{id:guid}")]
    [HasPermission("cases.delete")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var caseFile = await _db.CaseFiles.FirstOrDefaultAsync(c => c.Id == id && !c.IsDeleted, ct)
            ?? throw new KeyNotFoundException("Expediente no encontrado.");

        caseFile.IsDeleted = true;
        caseFile.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("delete", "CaseFile", caseFile.Id.ToString(), before: new { caseFile.Code, caseFile.Title }, ct: ct);

        return NoContent();
    }

    // ------------------------------------------------------------------ tareas
    [HttpPost("{id:guid}/tasks")]
    [HasPermission("cases.edit")]
    public async Task<ActionResult<CaseTaskDto>> AddTask(Guid id, [FromBody] CaseTaskRequest request, CancellationToken ct)
    {
        var caseFile = await _db.CaseFiles.Include(c => c.Client).FirstOrDefaultAsync(c => c.Id == id && !c.IsDeleted, ct)
            ?? throw new KeyNotFoundException("Expediente no encontrado.");

        var maxOrder = await _db.CaseTasks.Where(t => t.CaseFileId == id).Select(t => (int?)t.SortOrder).MaxAsync(ct) ?? 0;

        var task = new CaseTask
        {
            CaseFileId = id,
            Title = request.Title.Trim(),
            Description = request.Description?.Trim(),
            Status = request.Status,
            Priority = request.Priority,
            DueAt = request.DueAt,
            AssignedToUserId = request.AssignedToUserId,
            CreatedByUserId = _current.UserId,
            SortOrder = request.SortOrder == 0 ? maxOrder + 1 : request.SortOrder,
            ClientVisible = request.ClientVisible,
            ClientCanComplete = request.ClientCanComplete,
        };
        _db.CaseTasks.Add(task);

        _db.CaseEvents.Add(new CaseEvent
        {
            CaseFileId = id,
            Type = CaseEventType.TaskAdded,
            Title = $"Nueva tarea: {task.Title}",
            Description = task.Description,
            ActorUserId = _current.UserId, ActorName = _current.FullName, ClientVisible = request.ClientVisible,
        });

        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("create", "CaseTask", task.Id.ToString(), after: new { task.Title, task.DueAt }, ct: ct);

        if (caseFile.Client.UserId.HasValue && task.ClientVisible)
        {
            await _notifications.NotifyUserAsync(caseFile.Client.UserId.Value, NotificationType.TaskAssigned,
                "Nueva tarea en su expediente",
                $"{task.Title}{(task.DueAt.HasValue ? $" · vence el {task.DueAt:dd/MM/yyyy}" : string.Empty)}",
                deepLink: $"/cases/{id}",
                data: new { caseFileId = id, taskId = task.Id }, ct: ct);
        }

        var created = await _db.CaseTasks.AsNoTracking().Include(t => t.AssignedToUser).Include(t => t.CreatedByUser)
            .FirstAsync(t => t.Id == task.Id, ct);
        return Ok(CaseTaskDto.From(created));
    }

    [HttpPatch("{id:guid}/tasks/{taskId:guid}")]
    [HasPermission("cases.edit")]
    public async Task<ActionResult<CaseTaskDto>> UpdateTask(Guid id, Guid taskId, [FromBody] CaseTaskUpdateRequest request, CancellationToken ct)
    {
        var task = await _db.CaseTasks.Include(t => t.CaseFile).ThenInclude(c => c.Client)
            .FirstOrDefaultAsync(t => t.Id == taskId && t.CaseFileId == id, ct)
            ?? throw new KeyNotFoundException("Tarea no encontrada.");

        var previousStatus = task.Status;

        task.Title = request.Title.Trim();
        task.Description = request.Description?.Trim();
        task.Status = request.Status;
        task.Priority = request.Priority;
        task.DueAt = request.DueAt;
        task.AssignedToUserId = request.AssignedToUserId;
        task.SortOrder = request.SortOrder;
        task.ClientVisible = request.ClientVisible;
        task.ClientCanComplete = request.ClientCanComplete;
        task.UpdatedAt = DateTime.UtcNow;

        if (request.Status == TaskStatus.Done && previousStatus != TaskStatus.Done)
        {
            task.CompletedAt = DateTime.UtcNow;
            _db.CaseEvents.Add(new CaseEvent
            {
                CaseFileId = id,
                Type = CaseEventType.TaskCompleted,
                Title = $"Tarea completada: {task.Title}",
                ActorUserId = _current.UserId, ActorName = _current.FullName, ClientVisible = request.ClientVisible,
            });
        }
        else if (request.Status != TaskStatus.Done)
        {
            task.CompletedAt = null;
        }

        await SyncProgressAsync(id, ct);
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("update", "CaseTask", task.Id.ToString(), new { Status = previousStatus.ToString() },
            new { Status = task.Status.ToString() }, ct: ct);

        if (task.CaseFile.Client.UserId.HasValue && request.ClientVisible && request.Status == TaskStatus.Done)
        {
            await _notifications.NotifyUserAsync(task.CaseFile.Client.UserId.Value, NotificationType.TaskCompleted,
                "Tarea completada",
                $"Completamos «{task.Title}» en su expediente {task.CaseFile.Code}.",
                deepLink: $"/cases/{id}",
                data: new { caseFileId = id, taskId = task.Id }, ct: ct);
        }

        await PushCaseUpdateAsync(task.CaseFile, "Tareas actualizadas", task.Title, ct);

        var refreshed = await _db.CaseTasks.AsNoTracking().Include(t => t.AssignedToUser).Include(t => t.CreatedByUser)
            .FirstAsync(t => t.Id == taskId, ct);
        return Ok(CaseTaskDto.From(refreshed));
    }

    [HttpDelete("{id:guid}/tasks/{taskId:guid}")]
    [HasPermission("cases.edit")]
    public async Task<IActionResult> DeleteTask(Guid id, Guid taskId, CancellationToken ct)
    {
        await _db.CaseTasks.Where(t => t.Id == taskId && t.CaseFileId == id).ExecuteDeleteAsync(ct);
        await SyncProgressAsync(id, ct);
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpGet("{id:guid}/events")]
    [HasPermission("cases.view")]
    public async Task<ActionResult<IReadOnlyList<CaseEventDto>>> Events(Guid id, CancellationToken ct)
    {
        var events = await _db.CaseEvents.AsNoTracking().Include(e => e.ActorUser)
            .Where(e => e.CaseFileId == id).OrderByDescending(e => e.CreatedAt).Take(300).ToListAsync(ct);
        return Ok(events.Select(CaseEventDto.From).ToList());
    }

    /// <summary>Añade una actuación manual al expediente.</summary>
    [HttpPost("{id:guid}/events")]
    [HasPermission("cases.edit")]
    public async Task<ActionResult<CaseEventDto>> AddEvent(Guid id, [FromBody] SendMessageRequest request, CancellationToken ct)
    {
        var caseFile = await _db.CaseFiles.Include(c => c.Client).FirstOrDefaultAsync(c => c.Id == id && !c.IsDeleted, ct)
            ?? throw new KeyNotFoundException("Expediente no encontrado.");

        var evt = new CaseEvent
        {
            CaseFileId = id,
            Type = CaseEventType.Note,
            Title = "Actuación registrada",
            Description = request.Body?.Trim(),
            ActorUserId = _current.UserId,
            ActorName = _current.FullName,
            ClientVisible = true,
        };
        _db.CaseEvents.Add(evt);
        await _db.SaveChangesAsync(ct);

        await PushCaseUpdateAsync(caseFile, "Nueva actuación", evt.Description ?? string.Empty, ct);

        return Ok(CaseEventDto.From(evt));
    }

    // ------------------------------------------------------------------ documentos del expediente
    [HttpPost("{id:guid}/documents")]
    [HasPermission("documents.upload")]
    [RequestSizeLimit(52_428_800)]
    public async Task<ActionResult<DocumentDto>> UploadDocument(
        Guid id, [FromForm] IFormFile file, [FromForm] string? category,
        [FromForm] string? description, [FromForm] bool clientVisible = true, CancellationToken ct = default)
    {
        var caseFile = await _db.CaseFiles.FirstOrDefaultAsync(c => c.Id == id && !c.IsDeleted, ct)
            ?? throw new KeyNotFoundException("Expediente no encontrado.");

        var parsedCategory = DocumentCategory.Expediente;
        if (!string.IsNullOrWhiteSpace(category) && Enum.TryParse<DocumentCategory>(category, true, out var c)) parsedCategory = c;

        var dto = await _documents.UploadAsync(file,
            new DocumentUploadRequest(caseFile.ClientId, id, null, parsedCategory, clientVisible, description), caseFile.ClientId, ct);

        return Ok(dto);
    }

    // ------------------------------------------------------------------ utilidades
    /// <summary>Recalcula el progreso del expediente a partir de sus tareas.</summary>
    private async Task SyncProgressAsync(Guid caseFileId, CancellationToken ct)
    {
        var caseFile = await _db.CaseFiles.FirstOrDefaultAsync(c => c.Id == caseFileId, ct);
        if (caseFile is null) return;

        var tasks = await _db.CaseTasks.Where(t => t.CaseFileId == caseFileId && t.Status != TaskStatus.Cancelled).ToListAsync(ct);
        if (tasks.Count == 0) return;

        var done = tasks.Count(t => t.Status == TaskStatus.Done);
        caseFile.ProgressPercent = (int)Math.Round(done * 100.0 / tasks.Count);
        caseFile.UpdatedAt = DateTime.UtcNow;
    }

    private async Task PushCaseUpdateAsync(CaseFile caseFile, string title, string description, CancellationToken ct)
    {
        var clientUserId = caseFile.Client?.UserId
                           ?? await _db.Clients.Where(c => c.Id == caseFile.ClientId).Select(c => c.UserId).FirstOrDefaultAsync(ct);

        await _realtime.ToCaseAsync(caseFile.Id, "case.updated", new
        {
            caseFileId = caseFile.Id,
            code = caseFile.Code,
            title = caseFile.Title,
            status = caseFile.Status.ToString(),
            statusLabel = AccessResolver.Label(caseFile.Status),
            progressPercent = caseFile.ProgressPercent,
            updatedAt = caseFile.UpdatedAt,
        }, ct);

        await _realtime.ToStaffAsync("case.updated", new
        {
            caseFileId = caseFile.Id, code = caseFile.Code, clientId = caseFile.ClientId,
            status = caseFile.Status.ToString(), progressPercent = caseFile.ProgressPercent, at = DateTime.UtcNow,
        }, ct);

        if (clientUserId is Guid uid)
        {
            await _realtime.ToUserAsync(uid, "case.updated", new
            {
                caseFileId = caseFile.Id, code = caseFile.Code, title,
                status = caseFile.Status.ToString(), progressPercent = caseFile.ProgressPercent,
            }, ct);
        }
    }
}
