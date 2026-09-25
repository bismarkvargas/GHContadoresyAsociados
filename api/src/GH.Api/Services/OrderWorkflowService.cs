using GH.Domain;
using GH.Domain.Abstractions;
using GH.Domain.Entities;
using GH.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using TaskStatus = GH.Domain.TaskStatus;

namespace GH.Api.Services;

/// <summary>
/// Flujo comercial: al confirmarse el pago de un pedido se crea el expediente de cada
/// servicio, se asignan tareas iniciales al profesional responsable y se avisa al cliente
/// y al equipo. Es la pieza que une la tienda del app con el trabajo del bufete.
/// </summary>
public class OrderWorkflowService
{
    private readonly GhDbContext _db;
    private readonly ICodeGenerator _codes;
    private readonly INotificationService _notifications;
    private readonly IRealtimeNotifier _realtime;
    private readonly IAuditLogger _audit;
    private readonly ILogger<OrderWorkflowService> _logger;

    public OrderWorkflowService(GhDbContext db, ICodeGenerator codes, INotificationService notifications,
        IRealtimeNotifier realtime, IAuditLogger audit, ILogger<OrderWorkflowService> logger)
    {
        _db = db;
        _codes = codes;
        _notifications = notifications;
        _realtime = realtime;
        _audit = audit;
        _logger = logger;
    }

    /// <summary>Marca el pedido como pagado y genera los expedientes pendientes.</summary>
    public async Task<List<CaseFile>> ConfirmPaymentAsync(Order order, Payment payment, CancellationToken ct = default)
    {
        order.Status = OrderStatus.Paid;
        order.PaidAt ??= DateTime.UtcNow;
        order.UpdatedAt = DateTime.UtcNow;

        var created = await CreateCasesForOrderAsync(order, null, ct);

        await _db.SaveChangesAsync(ct);

        if (order.UserId != Guid.Empty)
        {
            await _notifications.NotifyUserAsync(order.UserId, NotificationType.OrderPaid,
                "Pago confirmado",
                $"Recibimos el pago de su pedido {order.Number} por {order.Total:N2} {order.Currency}. Ya iniciamos la gestión.",
                deepLink: $"/orders/{order.Id}",
                data: new { orderId = order.Id, paymentId = payment.Id, amount = order.Total, currency = order.Currency }, ct: ct);
        }

        await _realtime.ToStaffAsync("order.updated", new
        {
            orderId = order.Id,
            number = order.Number,
            status = order.Status.ToString(),
            total = order.Total,
            currency = order.Currency,
            clientId = order.ClientId,
            at = DateTime.UtcNow,
        }, ct);

        await _notifications.NotifyStaffAsync(NotificationType.OrderPaid,
            "Nuevo pedido pagado",
            $"Pedido {order.Number} por {order.Total:N2} {order.Currency}. Configurar el expediente.",
            deepLink: $"/admin/orders/{order.Id}",
            data: new { orderId = order.Id });

        await _audit.LogAsync("payment-approved", "Order", order.Id.ToString(),
            after: new { order.Number, order.Total, payment.Reference }, ct: ct);

        return created;
    }

    /// <summary>Crea un expediente por cada ítem que requiera gestión (idempotente).</summary>
    public async Task<List<CaseFile>> CreateCasesForOrderAsync(Order order, Guid? responsibleUserId, CancellationToken ct = default)
    {
        var created = new List<CaseFile>();
        if (order.ClientId is null) return created;

        var client = await _db.Clients.FirstOrDefaultAsync(c => c.Id == order.ClientId, ct);
        if (client is null) return created;

        var responsible = responsibleUserId ?? client.AssignedToUserId;

        var items = await _db.OrderItems
            .Include(i => i.Product).ThenInclude(p => p.Category)
            .Where(i => i.OrderId == order.Id)
            .ToListAsync(ct);

        foreach (var item in items)
        {
            if (item.CaseFileId.HasValue) continue;
            if (item.Product is null || !item.Product.RequiresCase) continue;

            var caseFile = new CaseFile
            {
                Code = await _codes.NextCaseCodeAsync(ct),
                ClientId = client.Id,
                Title = item.NameSnapshot,
                Description = item.Product.Description
                              ?? $"Servicio adquirido en el pedido {order.Number}. Se dará seguimiento al trámite completo.",
                Matter = MatterFromSlug(item.Product.Category?.Slug),
                Entity = EntityFromName(item.Product.Name),
                Status = CaseStatus.Open,
                Priority = Priority.Normal,
                ProgressPercent = 0,
                ResponsibleUserId = responsible,
                OpenedAt = DateTime.UtcNow,
                DueAt = item.Product.EstimatedDays is int days ? DateTime.UtcNow.AddDays(days + 5) : DateTime.UtcNow.AddDays(15),
                AgreedAmount = item.UnitPrice * item.Quantity,
                Currency = order.Currency,
                ClientVisible = true,
                Source = CaseFileSource.Order,
                OrderItemId = item.Id,
            };
            _db.CaseFiles.Add(caseFile);
            await _db.SaveChangesAsync(ct);

            item.CaseFileId = caseFile.Id;

            _db.CaseEvents.Add(new CaseEvent
            {
                CaseFileId = caseFile.Id,
                Type = CaseEventType.Created,
                Title = $"Expediente creado desde el pedido {order.Number}",
                Description = $"Servicio adquirido: {item.NameSnapshot}.",
                ActorName = "Sistema",
                ClientVisible = true,
            });

            var tasks = new List<CaseTask>
            {
                new()
                {
                    CaseFileId = caseFile.Id,
                    Title = "Recepción y validación de documentos",
                    Description = "Verificar que el cliente haya aportado todos los documentos necesarios.",
                    Status = TaskStatus.Todo,
                    Priority = Priority.High,
                    DueAt = DateTime.UtcNow.AddDays(3),
                    AssignedToUserId = responsible,
                    SortOrder = 1,
                    ClientVisible = true,
                },
                new()
                {
                    CaseFileId = caseFile.Id,
                    Title = "Ejecución del trámite",
                    Description = "Realizar el trámite ante el ente correspondiente y registrar la actuación.",
                    Status = TaskStatus.Todo,
                    Priority = Priority.Normal,
                    DueAt = DateTime.UtcNow.AddDays(item.Product.EstimatedDays ?? 10),
                    AssignedToUserId = responsible,
                    SortOrder = 2,
                    ClientVisible = true,
                },
                new()
                {
                    CaseFileId = caseFile.Id,
                    Title = "Entrega de constancia al cliente",
                    Description = "Subir el documento final y notificar al cliente.",
                    Status = TaskStatus.Todo,
                    Priority = Priority.Normal,
                    DueAt = DateTime.UtcNow.AddDays((item.Product.EstimatedDays ?? 10) + 3),
                    AssignedToUserId = responsible,
                    SortOrder = 3,
                    ClientVisible = true,
                },
            };
            _db.CaseTasks.AddRange(tasks);
            await _db.SaveChangesAsync(ct);

            created.Add(caseFile);

            _logger.LogInformation("Expediente {Code} creado para el pedido {Order}.", caseFile.Code, order.Number);

            await _realtime.ToStaffAsync("case.created", new
            {
                caseFileId = caseFile.Id,
                code = caseFile.Code,
                clientId = client.Id,
                clientName = client.LegalName,
                title = caseFile.Title,
                orderNumber = order.Number,
                at = DateTime.UtcNow,
            }, ct);

            if (client.UserId.HasValue)
            {
                await _notifications.NotifyUserAsync(client.UserId.Value, NotificationType.CaseCreated,
                    "Nuevo expediente creado",
                    $"Abrimos el expediente {caseFile.Code} para «{caseFile.Title}». Puede seguir su avance desde el app.",
                    deepLink: $"/cases/{caseFile.Id}",
                    data: new { caseFileId = caseFile.Id, code = caseFile.Code }, ct: ct);
            }
        }

        return created;
    }

    public static CaseMatter MatterFromSlug(string? slug) => slug switch
    {
        "servicios-contables" => CaseMatter.Contable,
        "servicios-tributarios" => CaseMatter.Tributario,
        "servicios-legales" => CaseMatter.Legal,
        "servicios-municipales" => CaseMatter.Municipal,
        _ => CaseMatter.Otro,
    };

    public static CaseEntity EntityFromName(string name)
    {
        var n = name.ToLowerInvariant();
        if (n.Contains("sugef")) return CaseEntity.SUGEF;
        if (n.Contains("acam")) return CaseEntity.ACAM;
        if (n.Contains("atv") || n.Contains("d-1") || n.Contains("tributaria") || n.Contains("declaraci")) return CaseEntity.ATV;
        if (n.Contains("ccss")) return CaseEntity.CCSS;
        if (n.Contains("ins") || n.Contains("póliza") || n.Contains("poliza")) return CaseEntity.INS;
        if (n.Contains("meic")) return CaseEntity.MEIC;
        if (n.Contains("mag")) return CaseEntity.MAG;
        if (n.Contains("ict")) return CaseEntity.ICT;
        if (n.Contains("municipal") || n.Contains("patente") || n.Contains("licores")) return CaseEntity.Municipalidad;
        if (n.Contains("rtbf") || n.Contains("socios")) return CaseEntity.RTBF;
        if (n.Contains("salud") || n.Contains("sanitario")) return CaseEntity.MinisterioSalud;
        return CaseEntity.Ninguno;
    }
}
