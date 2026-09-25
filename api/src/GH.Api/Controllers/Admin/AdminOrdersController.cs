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

/// <summary>Pedidos, pagos y generación de expedientes a partir de una venta.</summary>
[ApiController]
[Route("api/v1/admin")]
[Authorize]
public class AdminOrdersController : ControllerBase
{
    private readonly GhDbContext _db;
    private readonly ICurrentUser _current;
    private readonly OrderWorkflowService _workflow;
    private readonly IAuditLogger _audit;
    private readonly INotificationService _notifications;
    private readonly IRealtimeNotifier _realtime;

    public AdminOrdersController(GhDbContext db, ICurrentUser current, OrderWorkflowService workflow,
        IAuditLogger audit, INotificationService notifications, IRealtimeNotifier realtime)
    {
        _db = db;
        _current = current;
        _workflow = workflow;
        _audit = audit;
        _notifications = notifications;
        _realtime = realtime;
    }

    [HttpGet("orders")]
    [HasPermission("orders.view")]
    public async Task<ActionResult<PagedResult<OrderDto>>> Orders(
        [FromQuery] string? search, [FromQuery] OrderStatus? status, [FromQuery] Guid? clientId,
        [FromQuery] DateTime? from, [FromQuery] DateTime? to,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        var query = _db.Orders.AsNoTracking().Include(o => o.Items).Include(o => o.Client).Include(o => o.Payments)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(o => o.Number.Contains(term)
                                     || (o.CustomerName != null && o.CustomerName.Contains(term))
                                     || (o.CustomerEmail != null && o.CustomerEmail.Contains(term)));
        }
        if (status.HasValue) query = query.Where(o => o.Status == status);
        if (clientId.HasValue) query = query.Where(o => o.ClientId == clientId);
        if (from.HasValue) query = query.Where(o => o.CreatedAt >= from);
        if (to.HasValue) query = query.Where(o => o.CreatedAt < to.Value.AddDays(1));

        var paged = await query.OrderByDescending(o => o.CreatedAt).ToPagedResultAsync(page, pageSize, ct);
        return Ok(new PagedResult<OrderDto>(paged.Items.Select(o => OrderDto.From(o)).ToList(), paged.Total, paged.Page, paged.PageSize));
    }

    [HttpGet("orders/{id:guid}")]
    [HasPermission("orders.view")]
    public async Task<ActionResult<object>> Order(Guid id, CancellationToken ct)
    {
        var order = await _db.Orders.AsNoTracking().Include(o => o.Items).ThenInclude(i => i.CaseFile)
            .Include(o => o.Client).Include(o => o.Payments).Include(o => o.User)
            .FirstOrDefaultAsync(o => o.Id == id, ct)
            ?? throw new KeyNotFoundException("Pedido no encontrado.");

        return Ok(new
        {
            order = OrderDto.From(order),
            client = order.Client is null ? null : new { order.Client.Id, order.Client.Code, order.Client.LegalName, order.Client.Email, order.Client.Phone },
            customer = new { order.User.Id, order.User.Email, order.User.FullName, order.User.Phone },
            caseFiles = order.Items.Where(i => i.CaseFile is not null)
                .Select(i => new { i.CaseFileId, i.CaseFile!.Code, i.CaseFile.Title, Status = i.CaseFile.Status.ToString() }),
        });
    }

    /// <summary>Cambia el estado del pedido y avisa al cliente.</summary>
    [HttpPatch("orders/{id:guid}/status")]
    [HasPermission("orders.edit")]
    public async Task<ActionResult<OrderDto>> ChangeStatus(Guid id, [FromBody] OrderStatusChangeRequest request, CancellationToken ct)
    {
        var order = await _db.Orders.Include(o => o.Items).Include(o => o.Payments).Include(o => o.Client)
            .FirstOrDefaultAsync(o => o.Id == id, ct)
            ?? throw new KeyNotFoundException("Pedido no encontrado.");

        var previous = order.Status;
        order.Status = request.Status;
        order.UpdatedAt = DateTime.UtcNow;
        if (request.Status == OrderStatus.Paid && order.PaidAt is null) order.PaidAt = DateTime.UtcNow;
        if (request.Status == OrderStatus.Completed) order.CompletedAt = DateTime.UtcNow;

        if (request.Status is OrderStatus.Paid or OrderStatus.InProcess)
        {
            var payment = order.Payments.OrderByDescending(p => p.CreatedAt).FirstOrDefault();
            if (payment is null)
            {
                payment = new Payment
                {
                    OrderId = order.Id,
                    Provider = "Manual",
                    Method = PaymentMethod.Transfer,
                    Status = PaymentStatus.Approved,
                    Amount = order.Total,
                    Currency = order.Currency,
                    Reference = $"MAN-{DateTime.UtcNow:yyyyMMddHHmmss}",
                    CardHolder = _current.FullName,
                    ProcessedAt = DateTime.UtcNow,
                    RawResponseJson = "{\"status\":\"APPROVED\",\"source\":\"admin\"}",
                };
                _db.Payments.Add(payment);
                await _db.SaveChangesAsync(ct);
            }
            await _workflow.CreateCasesForOrderAsync(order, null, ct);
        }

        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("change-status", "Order", order.Id.ToString(), new { Status = previous.ToString() }, new { Status = order.Status.ToString() }, ct: ct);

        if (order.Client?.UserId is Guid clientUserId)
        {
            await _notifications.NotifyUserAsync(clientUserId, NotificationType.OrderStatusChanged,
                $"Pedido {order.Number}: {AccessResolver.Label(order.Status)}",
                request.Note ?? $"Su pedido pasó a estado {AccessResolver.Label(order.Status)}.",
                deepLink: $"/orders/{order.Id}",
                data: new { orderId = order.Id, status = order.Status.ToString() }, ct: ct);
        }

        await _realtime.ToStaffAsync("order.updated", new
        {
            orderId = order.Id, number = order.Number, status = order.Status.ToString(), at = DateTime.UtcNow,
        }, ct);

        var refreshed = await _db.Orders.AsNoTracking().Include(o => o.Items).Include(o => o.Client).Include(o => o.Payments)
            .FirstAsync(o => o.Id == id, ct);
        return Ok(OrderDto.From(refreshed));
    }

    /// <summary>Genera los expedientes del pedido y los asigna a un responsable.</summary>
    [HttpPost("orders/{id:guid}/create-case")]
    [HasPermission("orders.createcase")]
    public async Task<ActionResult<object>> CreateCase(Guid id, [FromQuery] Guid? responsibleUserId, CancellationToken ct)
    {
        var order = await _db.Orders.Include(o => o.Items).Include(o => o.Client).Include(o => o.Payments)
            .FirstOrDefaultAsync(o => o.Id == id, ct)
            ?? throw new KeyNotFoundException("Pedido no encontrado.");

        if (order.Status == OrderStatus.PendingPayment)
            throw new InvalidOperationException("El pedido todavía no está pagado. Confirme el pago para generar el expediente.");

        var created = await _workflow.CreateCasesForOrderAsync(order, responsibleUserId, ct);
        await _db.SaveChangesAsync(ct);

        return Ok(new
        {
            created = created.Count,
            caseFiles = created.Select(c => new { c.Id, c.Code, c.Title, Status = c.Status.ToString() }),
            message = created.Count == 0 ? "El pedido no tiene servicios que requieran expediente." : "Expedientes generados correctamente.",
        });
    }

    [HttpPost("orders/{id:guid}/refund")]
    [HasPermission("orders.refund")]
    public async Task<ActionResult<OrderDto>> Refund(Guid id, [FromBody] RefundRequest request, CancellationToken ct)
    {
        var order = await _db.Orders.Include(o => o.Items).Include(o => o.Payments).Include(o => o.Client)
            .FirstOrDefaultAsync(o => o.Id == id, ct)
            ?? throw new KeyNotFoundException("Pedido no encontrado.");

        if (order.Status is OrderStatus.Cancelled or OrderStatus.Refunded)
            throw new InvalidOperationException("El pedido ya está cancelado o reembolsado.");

        order.Status = OrderStatus.Refunded;
        order.UpdatedAt = DateTime.UtcNow;

        foreach (var payment in order.Payments.Where(p => p.Status == PaymentStatus.Approved))
        {
            payment.Status = PaymentStatus.Refunded;
            payment.FailureReason = request.Reason;
        }

        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("refund", "Order", order.Id.ToString(), after: new { order.Number, request.Reason }, ct: ct);

        if (order.Client?.UserId is Guid clientUserId)
        {
            await _notifications.NotifyUserAsync(clientUserId, NotificationType.OrderStatusChanged,
                $"Reembolso del pedido {order.Number}",
                $"Se procesó el reembolso de {order.Total:N2} {order.Currency}. {(string.IsNullOrWhiteSpace(request.Reason) ? string.Empty : $"Motivo: {request.Reason}")}",
                deepLink: $"/orders/{order.Id}",
                data: new { orderId = order.Id, refunded = true }, ct: ct);
        }

        var refreshed = await _db.Orders.AsNoTracking().Include(o => o.Items).Include(o => o.Payments)
            .FirstAsync(o => o.Id == id, ct);
        return Ok(OrderDto.From(refreshed));
    }

    /// <summary>Listado de transacciones de la pasarela simulada con su traza completa.</summary>
    [HttpGet("payments")]
    [HasPermission("payments.view")]
    public async Task<ActionResult<PagedResult<object>>> Payments(
        [FromQuery] PaymentStatus? status, [FromQuery] PaymentMethod? method, [FromQuery] string? search,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        var query = _db.Payments.AsNoTracking().Include(p => p.Order).ThenInclude(o => o.Client).AsQueryable();

        if (status.HasValue) query = query.Where(p => p.Status == status);
        if (method.HasValue) query = query.Where(p => p.Method == method);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(p => p.Reference.Contains(term) || p.Order.Number.Contains(term)
                                     || (p.CardLast4 != null && p.CardLast4.Contains(term)));
        }

        var paged = await query.OrderByDescending(p => p.CreatedAt).ToPagedResultAsync(page, pageSize, ct);

        var items = paged.Items.Select(p => (object)new
        {
            id = p.Id,
            orderId = p.OrderId,
            orderNumber = p.Order?.Number,
            clientName = p.Order?.Client?.LegalName,
            provider = p.Provider,
            method = p.Method.ToString(),
            status = p.Status.ToString(),
            statusLabel = AccessResolver.Label(p.Status),
            amount = p.Amount,
            currency = p.Currency,
            reference = p.Reference,
            authorizationCode = p.AuthorizationCode,
            cardBrand = p.CardBrand,
            cardLast4 = p.CardLast4,
            cardHolder = p.CardHolder,
            failureReason = p.FailureReason,
            rawRequestJson = p.RawRequestJson,
            rawResponseJson = p.RawResponseJson,
            createdAt = p.CreatedAt,
            processedAt = p.ProcessedAt,
        }).ToList();

        return Ok(new PagedResult<object>(items, paged.Total, paged.Page, paged.PageSize));
    }
}
