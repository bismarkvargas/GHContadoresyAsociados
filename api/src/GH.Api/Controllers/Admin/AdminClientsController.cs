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
using Microsoft.EntityFrameworkCore;
using TaskStatus = GH.Domain.TaskStatus;

namespace GH.Api.Controllers.Admin;

/// <summary>CRM: clientes, contactos, interacciones y línea de tiempo unificada.</summary>
[ApiController]
[Route("api/v1/admin/clients")]
[Authorize]
public class AdminClientsController : ControllerBase
{
    private readonly GhDbContext _db;
    private readonly ICurrentUser _current;
    private readonly ICodeGenerator _codes;
    private readonly IAuditLogger _audit;
    private readonly INotificationService _notifications;
    private readonly IRealtimeNotifier _realtime;
    private readonly PasswordHasher<User> _hasher = new();

    public AdminClientsController(GhDbContext db, ICurrentUser current, ICodeGenerator codes, IAuditLogger audit,
        INotificationService notifications, IRealtimeNotifier realtime)
    {
        _db = db;
        _current = current;
        _codes = codes;
        _audit = audit;
        _notifications = notifications;
        _realtime = realtime;
    }

    // ------------------------------------------------------------------ listado
    [HttpGet]
    [HasPermission("clients.view")]
    public async Task<ActionResult<PagedResult<ClientDto>>> List(
        [FromQuery] string? search, [FromQuery] ClientStatus? status, [FromQuery] ClientType? clientType,
        [FromQuery] Guid? assignedTo, [FromQuery] string? tag, [FromQuery] ClientSource? source,
        [FromQuery] string? sort, [FromQuery] string? order,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        var query = _db.Clients.AsNoTracking().Include(c => c.AssignedToUser)
            .Where(c => !c.IsDeleted);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(c => c.LegalName.Contains(term)
                                     || (c.TradeName != null && c.TradeName.Contains(term))
                                     || (c.IdNumber != null && c.IdNumber.Contains(term))
                                     || (c.Email != null && c.Email.Contains(term))
                                     || (c.Phone != null && c.Phone.Contains(term))
                                     || c.Code.Contains(term));
        }
        if (status.HasValue) query = query.Where(c => c.Status == status);
        if (clientType.HasValue) query = query.Where(c => c.ClientType == clientType);
        if (assignedTo.HasValue) query = query.Where(c => c.AssignedToUserId == assignedTo);
        if (source.HasValue) query = query.Where(c => c.Source == source);
        if (!string.IsNullOrWhiteSpace(tag)) query = query.Where(c => c.TagsCsv != null && c.TagsCsv.Contains(tag));

        query = (sort?.ToLowerInvariant(), order?.ToLowerInvariant()) switch
        {
            ("name", "desc") => query.OrderByDescending(c => c.LegalName),
            ("name", _) => query.OrderBy(c => c.LegalName),
            ("status", _) => query.OrderBy(c => c.Status),
            ("created", _) => query.OrderBy(c => c.CreatedAt),
            _ => query.OrderByDescending(c => c.UpdatedAt),
        };

        var paged = await query.ToPagedResultAsync(page, pageSize, ct);
        var ids = paged.Items.Select(c => c.Id).ToList();

        var caseCounts = await _db.CaseFiles.AsNoTracking()
            .Where(c => ids.Contains(c.ClientId) && !c.IsDeleted)
            .GroupBy(c => c.ClientId)
            .Select(g => new { ClientId = g.Key, Total = g.Count(), Open = g.Count(x => x.Status != CaseStatus.Closed && x.Status != CaseStatus.Cancelled && x.Status != CaseStatus.Completed) })
            .ToDictionaryAsync(x => x.ClientId, x => x, ct);

        var docCounts = await _db.Documents.AsNoTracking()
            .Where(d => d.ClientId != null && ids.Contains(d.ClientId.Value) && !d.IsDeleted)
            .GroupBy(d => d.ClientId!.Value)
            .Select(g => new { ClientId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.ClientId, x => x.Count, ct);

        var orderCounts = await _db.Orders.AsNoTracking()
            .Where(o => o.ClientId != null && ids.Contains(o.ClientId.Value))
            .GroupBy(o => o.ClientId!.Value)
            .Select(g => new { ClientId = g.Key, Count = g.Count(), Spent = g.Sum(x => x.Total) })
            .ToDictionaryAsync(x => x.ClientId, x => x, ct);

        var overdue = await _db.CaseTasks.AsNoTracking()
            .Where(t => t.DueAt != null && t.DueAt < DateTime.UtcNow
                        && (t.Status == TaskStatus.Todo || t.Status == TaskStatus.InProgress || t.Status == TaskStatus.Blocked))
            .Join(_db.CaseFiles.AsNoTracking().Where(c => ids.Contains(c.ClientId)), t => t.CaseFileId, c => c.Id, (t, c) => c.ClientId)
            .GroupBy(x => x)
            .Select(g => new { ClientId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.ClientId, x => x.Count, ct);

        var items = paged.Items.Select(c =>
        {
            var cases = caseCounts.GetValueOrDefault(c.Id);
            var orders = orderCounts.GetValueOrDefault(c.Id);
            var counts = new ClientCountsDto(
                cases?.Total ?? 0,
                cases?.Open ?? 0,
                overdue.GetValueOrDefault(c.Id),
                docCounts.GetValueOrDefault(c.Id),
                orders?.Count ?? 0,
                orders?.Spent ?? 0m);
            return ClientDto.From(c, counts);
        }).ToList();

        return Ok(new PagedResult<ClientDto>(items, paged.Total, paged.Page, paged.PageSize));
    }

    /// <summary>Listado ligero para selectores (id + nombre).</summary>
    [HttpGet("lookup")]
    [HasPermission("clients.view")]
    public async Task<ActionResult<object>> Lookup([FromQuery] string? search, CancellationToken ct)
    {
        var query = _db.Clients.AsNoTracking().Where(c => !c.IsDeleted);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(c => c.LegalName.Contains(term) || c.Code.Contains(term)
                                     || (c.IdNumber != null && c.IdNumber.Contains(term)));
        }

        var items = await query.OrderBy(c => c.LegalName).Take(50)
            .Select(c => new { c.Id, c.Code, c.LegalName, c.TradeName, c.Status, c.ClientType })
            .ToListAsync(ct);
        return Ok(items);
    }

    [HttpGet("{id:guid}")]
    [HasPermission("clients.view")]
    public async Task<ActionResult<object>> Detail(Guid id, CancellationToken ct)
    {
        var client = await _db.Clients.AsNoTracking().Include(c => c.AssignedToUser)
            .FirstOrDefaultAsync(c => c.Id == id && !c.IsDeleted, ct)
            ?? throw new KeyNotFoundException("Cliente no encontrado.");

        var cases = await _db.CaseFiles.AsNoTracking().Include(c => c.ResponsibleUser)
            .Where(c => c.ClientId == id && !c.IsDeleted).OrderByDescending(c => c.UpdatedAt).ToListAsync(ct);

        var documents = await _db.Documents.AsNoTracking().Include(d => d.CaseFile)
            .Where(d => d.ClientId == id && !d.IsDeleted).OrderByDescending(d => d.UploadedAt).Take(100).ToListAsync(ct);

        var orders = await _db.Orders.AsNoTracking().Include(o => o.Items)
            .Where(o => o.ClientId == id).OrderByDescending(o => o.CreatedAt).Take(50).ToListAsync(ct);

        var interactions = await _db.ClientInteractions.AsNoTracking().Include(i => i.CreatedByUser)
            .Where(i => i.ClientId == id).OrderByDescending(i => i.OccurredAt).Take(100).ToListAsync(ct);

        var contacts = await _db.ClientContacts.AsNoTracking().Where(c => c.ClientId == id).ToListAsync(ct);
        var messages = await _db.Messages.AsNoTracking().Include(m => m.CaseFile).Include(m => m.AttachmentDocument)
            .Where(m => m.ClientId == id).OrderByDescending(m => m.CreatedAt).Take(50).ToListAsync(ct);

        var appUser = client.UserId.HasValue
            ? await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == client.UserId, ct)
            : null;

        var taskCounts = await _db.CaseTasks.AsNoTracking().Where(t => cases.Select(c => c.Id).Contains(t.CaseFileId)).ToListAsync(ct);

        var counts = new ClientCountsDto(
            cases.Count,
            cases.Count(c => c.Status is CaseStatus.Open or CaseStatus.InProgress or CaseStatus.WaitingClient or CaseStatus.OnHold),
            taskCounts.Count(t => t.DueAt.HasValue && t.DueAt < DateTime.UtcNow && t.Status is TaskStatus.Todo or TaskStatus.InProgress or TaskStatus.Blocked),
            documents.Count,
            orders.Count,
            orders.Sum(o => o.Total));

        return Ok(new
        {
            client = ClientDto.From(client, counts, appUser?.Email),
            appAccount = appUser is null ? null : new
            {
                appUser.Id, appUser.Email, appUser.FullName, appUser.Status, appUser.LastLoginAt, appUser.CreatedAt,
            },
            contacts = contacts.Select(ClientContactDto.From).ToList(),
            interactions = interactions.Select(ClientInteractionDto.From).ToList(),
            cases = cases.Select(c => CaseFileDto.From(c, documents.Count(d => d.CaseFileId == c.Id))).ToList(),
            tasks = taskCounts.OrderBy(t => t.DueAt).Select(CaseTaskDto.From).ToList(),
            documents = documents.Select(d => DocumentDto.From(d)).ToList(),
            orders = orders.Select(o => OrderDto.From(o)).ToList(),
            messages = messages.Select(MessageDto.From).ToList(),
        });
    }

    [HttpPost]
    [HasPermission("clients.create")]
    public async Task<ActionResult<ClientDto>> Create([FromBody] ClientCreateRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.LegalName))
            throw new ArgumentException("El nombre o razón social es obligatorio.");

        if (!string.IsNullOrWhiteSpace(request.Email))
        {
            var emailNorm = request.Email.Trim().ToLowerInvariant();
            if (await _db.Users.AnyAsync(u => u.Email == emailNorm && !u.IsDeleted, ct))
                throw new InvalidOperationException("Ya existe un usuario con ese correo electrónico.");
        }

        var client = new Client
        {
            Code = await _codes.NextClientCodeAsync(ct),
            ClientType = request.ClientType,
            LegalName = request.LegalName.Trim(),
            TradeName = request.TradeName?.Trim(),
            IdNumber = request.IdNumber?.Trim(),
            Email = request.Email?.Trim().ToLowerInvariant(),
            Phone = request.Phone?.Trim(),
            Whatsapp = request.Whatsapp?.Trim(),
            Address = request.Address?.Trim(),
            Province = request.Province?.Trim(),
            Canton = request.Canton?.Trim(),
            District = request.District?.Trim(),
            Country = string.IsNullOrWhiteSpace(request.Country) ? "Costa Rica" : request.Country.Trim(),
            Status = request.Status,
            Source = request.Source,
            AssignedToUserId = request.AssignedToUserId,
            TagsCsv = request.Tags is null ? null : string.Join(',', request.Tags.Where(t => !string.IsNullOrWhiteSpace(t))),
            Notes = request.Notes?.Trim(),
        };
        _db.Clients.Add(client);
        await _db.SaveChangesAsync(ct);

        if (request.CreateAppAccount && !string.IsNullOrWhiteSpace(client.Email))
        {
            var password = string.IsNullOrWhiteSpace(request.AccountPassword) ? "Gh.Cliente2026" : request.AccountPassword;
            var user = new User
            {
                Email = client.Email!,
                FullName = client.LegalName,
                Phone = client.Phone,
                IdNumber = client.IdNumber,
                Status = UserStatus.Active,
                IsStaff = false,
                ClientId = client.Id,
            };
            user.PasswordHash = _hasher.HashPassword(user, password);
            _db.Users.Add(user);
            await _db.SaveChangesAsync(ct);

            client.UserId = user.Id;
            var clientRole = await _db.Roles.FirstOrDefaultAsync(r => r.Name == "Cliente", ct);
            if (clientRole is not null)
                _db.UserRoles.Add(new UserRole { UserId = user.Id, RoleId = clientRole.Id });

            await _db.SaveChangesAsync(ct);
        }

        await _audit.LogAsync("create", "Client", client.Id.ToString(), after: new { client.Code, client.LegalName }, ct: ct);
        await _realtime.ToStaffAsync("client.created", new { clientId = client.Id, code = client.Code, legalName = client.LegalName }, ct);

        return Ok(ClientDto.From(client));
    }

    [HttpPut("{id:guid}")]
    [HasPermission("clients.edit")]
    public async Task<ActionResult<ClientDto>> Update(Guid id, [FromBody] ClientUpdateRequest request, CancellationToken ct)
    {
        var client = await _db.Clients.FirstOrDefaultAsync(c => c.Id == id && !c.IsDeleted, ct)
            ?? throw new KeyNotFoundException("Cliente no encontrado.");

        var before = new { client.LegalName, client.Status, client.AssignedToUserId };

        client.ClientType = request.ClientType;
        client.LegalName = request.LegalName.Trim();
        client.TradeName = request.TradeName?.Trim();
        client.IdNumber = request.IdNumber?.Trim();
        client.Email = request.Email?.Trim().ToLowerInvariant();
        client.Phone = request.Phone?.Trim();
        client.Whatsapp = request.Whatsapp?.Trim();
        client.Address = request.Address?.Trim();
        client.Province = request.Province?.Trim();
        client.Canton = request.Canton?.Trim();
        client.District = request.District?.Trim();
        client.Country = string.IsNullOrWhiteSpace(request.Country) ? client.Country : request.Country.Trim();
        client.Status = request.Status;
        client.Source = request.Source;
        client.AssignedToUserId = request.AssignedToUserId;
        client.TagsCsv = request.Tags is null ? null : string.Join(',', request.Tags.Where(t => !string.IsNullOrWhiteSpace(t)));
        client.Notes = request.Notes?.Trim();
        client.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("update", "Client", client.Id.ToString(), before, new { client.LegalName, client.Status, client.AssignedToUserId }, ct: ct);
        await _realtime.ToStaffAsync("client.updated", new { clientId = client.Id, legalName = client.LegalName, status = client.Status.ToString() }, ct);

        // Si el cliente tiene cuenta en el app, se sincronizan los datos visibles.
        if (client.UserId.HasValue)
        {
            var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == client.UserId, ct);
            if (user is not null)
            {
                user.FullName = client.LegalName;
                user.Phone = client.Phone ?? user.Phone;
                user.IdNumber = client.IdNumber ?? user.IdNumber;
                user.UpdatedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync(ct);
                await _realtime.ToUserAsync(user.Id, "profile.updated", new { clientId = client.Id, legalName = client.LegalName }, ct);
            }
        }

        return Ok(ClientDto.From(client));
    }

    [HttpDelete("{id:guid}")]
    [HasPermission("clients.delete")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var client = await _db.Clients.FirstOrDefaultAsync(c => c.Id == id && !c.IsDeleted, ct)
            ?? throw new KeyNotFoundException("Cliente no encontrado.");

        client.IsDeleted = true;
        client.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("delete", "Client", client.Id.ToString(), before: new { client.Code, client.LegalName }, ct: ct);

        return NoContent();
    }

    // ------------------------------------------------------------------ contactos
    [HttpPost("{id:guid}/contacts")]
    [HasPermission("clients.edit")]
    public async Task<ActionResult<ClientContactDto>> AddContact(Guid id, [FromBody] ClientContactRequest request, CancellationToken ct)
    {
        if (!await _db.Clients.AnyAsync(c => c.Id == id && !c.IsDeleted, ct))
            throw new KeyNotFoundException("Cliente no encontrado.");

        if (request.IsPrimary)
        {
            var primaries = await _db.ClientContacts.Where(c => c.ClientId == id && c.IsPrimary).ToListAsync(ct);
            foreach (var p in primaries) p.IsPrimary = false;
        }

        var contact = new ClientContact
        {
            ClientId = id,
            FullName = request.FullName.Trim(),
            Position = request.Position?.Trim(),
            Email = request.Email?.Trim().ToLowerInvariant(),
            Phone = request.Phone?.Trim(),
            IsPrimary = request.IsPrimary,
        };
        _db.ClientContacts.Add(contact);
        await _db.SaveChangesAsync(ct);

        return Ok(ClientContactDto.From(contact));
    }

    [HttpDelete("{id:guid}/contacts/{contactId:guid}")]
    [HasPermission("clients.edit")]
    public async Task<IActionResult> DeleteContact(Guid id, Guid contactId, CancellationToken ct)
    {
        await _db.ClientContacts.Where(c => c.Id == contactId && c.ClientId == id).ExecuteDeleteAsync(ct);
        return NoContent();
    }

    // ------------------------------------------------------------------ interacciones
    [HttpPost("{id:guid}/interactions")]
    [HasPermission("clients.edit")]
    public async Task<ActionResult<ClientInteractionDto>> AddInteraction(Guid id, [FromBody] ClientInteractionRequest request, CancellationToken ct)
    {
        var client = await _db.Clients.FirstOrDefaultAsync(c => c.Id == id && !c.IsDeleted, ct)
            ?? throw new KeyNotFoundException("Cliente no encontrado.");

        var interaction = new ClientInteraction
        {
            ClientId = id,
            Type = request.Type,
            Subject = request.Subject.Trim(),
            Notes = request.Notes?.Trim(),
            OccurredAt = request.OccurredAt ?? DateTime.UtcNow,
            ReminderAt = request.ReminderAt,
            IsCompleted = request.IsCompleted,
            CreatedByUserId = _current.UserId,
        };
        _db.ClientInteractions.Add(interaction);

        client.LastContactAt = interaction.OccurredAt;
        client.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("create", "ClientInteraction", interaction.Id.ToString(), after: new { interaction.Subject, interaction.Type }, ct: ct);

        await _realtime.ToStaffAsync("client.interaction", new
        {
            clientId = id,
            interactionId = interaction.Id,
            subject = interaction.Subject,
            type = interaction.Type.ToString(),
            at = interaction.OccurredAt,
        }, ct);

        var refreshed = await _db.ClientInteractions.AsNoTracking().Include(i => i.CreatedByUser).FirstAsync(i => i.Id == interaction.Id, ct);
        return Ok(ClientInteractionDto.From(refreshed));
    }

    [HttpPost("{id:guid}/interactions/{interactionId:guid}/toggle")]
    [HasPermission("clients.edit")]
    public async Task<IActionResult> ToggleInteraction(Guid id, Guid interactionId, CancellationToken ct)
    {
        var interaction = await _db.ClientInteractions.FirstOrDefaultAsync(i => i.Id == interactionId && i.ClientId == id, ct)
            ?? throw new KeyNotFoundException("Interacción no encontrada.");

        interaction.IsCompleted = !interaction.IsCompleted;
        await _db.SaveChangesAsync(ct);
        return Ok(new { interaction.Id, interaction.IsCompleted });
    }

    // ------------------------------------------------------------------ línea de tiempo
    /// <summary>Historial unificado del cliente: CRM, expedientes, documentos, pedidos y mensajes.</summary>
    [HttpGet("{id:guid}/timeline")]
    [HasPermission("clients.view")]
    public async Task<ActionResult<IReadOnlyList<TimelineItemDto>>> Timeline(Guid id, [FromQuery] int take = 100, CancellationToken ct = default)
    {
        if (!await _db.Clients.AnyAsync(c => c.Id == id && !c.IsDeleted, ct))
            throw new KeyNotFoundException("Cliente no encontrado.");

        var items = new List<TimelineItemDto>();

        var interactions = await _db.ClientInteractions.AsNoTracking().Include(i => i.CreatedByUser)
            .Where(i => i.ClientId == id).OrderByDescending(i => i.OccurredAt).Take(take).ToListAsync(ct);
        items.AddRange(interactions.Select(i => new TimelineItemDto(
            i.Id.ToString(), "interaction", i.Subject, i.Notes, i.OccurredAt,
            i.CreatedByUser?.FullName, null, null, i.Type.ToString())));

        var caseIds = await _db.CaseFiles.AsNoTracking().Where(c => c.ClientId == id).Select(c => c.Id).ToListAsync(ct);
        var events = await _db.CaseEvents.AsNoTracking().Include(e => e.CaseFile).Include(e => e.ActorUser)
            .Where(e => caseIds.Contains(e.CaseFileId)).OrderByDescending(e => e.CreatedAt).Take(take).ToListAsync(ct);
        items.AddRange(events.Select(e => new TimelineItemDto(
            e.Id.ToString(), "case-event", e.Title, e.Description, e.CreatedAt,
            e.ActorUser?.FullName ?? e.ActorName, e.CaseFileId, e.CaseFile?.Code, e.Type.ToString())));

        var orders = await _db.Orders.AsNoTracking().Where(o => o.ClientId == id)
            .OrderByDescending(o => o.CreatedAt).Take(take).ToListAsync(ct);
        items.AddRange(orders.Select(o => new TimelineItemDto(
            o.Id.ToString(), "order", $"Pedido {o.Number} · {o.Total:N2} {o.Currency}",
            $"Estado: {AccessResolver.Label(o.Status)}", o.CreatedAt, null, null, null, o.Status.ToString())));

        var documents = await _db.Documents.AsNoTracking().Include(d => d.CaseFile)
            .Where(d => d.ClientId == id && !d.IsDeleted).OrderByDescending(d => d.UploadedAt).Take(take).ToListAsync(ct);
        items.AddRange(documents.Select(d => new TimelineItemDto(
            d.Id.ToString(), "document", $"Documento: {d.OriginalName}", d.Description, d.UploadedAt,
            d.UploadedByName, d.CaseFileId, d.CaseFile?.Code, d.Category.ToString())));

        var messages = await _db.Messages.AsNoTracking().Where(m => m.ClientId == id)
            .OrderByDescending(m => m.CreatedAt).Take(take).ToListAsync(ct);
        items.AddRange(messages.Select(m => new TimelineItemDto(
            m.Id.ToString(), "message", m.IsFromClient ? $"Mensaje de {m.SenderName}" : "Mensaje enviado",
            m.Body, m.CreatedAt, m.SenderName, m.CaseFileId, null, m.IsFromClient ? "inbound" : "outbound")));

        return Ok(items.OrderByDescending(i => i.At).Take(take).ToList());
    }

    /// <summary>Envía un mensaje al cliente desde el panel de administración.</summary>
    [HttpPost("{id:guid}/messages")]
    [HasPermission("messages.send")]
    public async Task<ActionResult<MessageDto>> SendMessage(Guid id, [FromBody] SendMessageRequest request, CancellationToken ct)
    {
        var client = await _db.Clients.FirstOrDefaultAsync(c => c.Id == id && !c.IsDeleted, ct)
            ?? throw new KeyNotFoundException("Cliente no encontrado.");
        if (string.IsNullOrWhiteSpace(request.Body)) throw new ArgumentException("El mensaje no puede estar vacío.");

        var message = new Message
        {
            ClientId = client.Id,
            CaseFileId = request.CaseFileId,
            SenderUserId = _current.UserId!.Value,
            SenderName = _current.FullName ?? "GH Contadores",
            Body = request.Body.Trim(),
            IsFromClient = false,
            AttachmentDocumentId = request.AttachmentDocumentId,
            ReadByStaffAt = DateTime.UtcNow,
        };
        _db.Messages.Add(message);
        await _db.SaveChangesAsync(ct);

        if (client.UserId.HasValue)
        {
            await _notifications.NotifyUserAsync(client.UserId.Value, NotificationType.MessageReceived,
                "Nuevo mensaje de GH Contadores",
                message.Body.Length > 140 ? message.Body[..140] + "…" : message.Body,
                deepLink: request.CaseFileId.HasValue ? $"/cases/{request.CaseFileId}" : "/messages",
                data: new { messageId = message.Id, clientId = client.Id }, ct: ct);
        }

        return Ok(MessageDto.From(message));
    }
}
