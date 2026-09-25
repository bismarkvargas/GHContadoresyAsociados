using GH.Api.Contracts;
using GH.Api.Services;
using GH.Domain;
using GH.Domain.Abstractions;
using GH.Domain.Entities;
using GH.Infrastructure.Data;
using GH.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GH.Api.Controllers;

/// <summary>Tienda del app: carrito, checkout y pasarela de pago simulada.</summary>
[ApiController]
[Route("api/v1/me")]
[Authorize]
public class MeShopController : ControllerBase
{
    private readonly GhDbContext _db;
    private readonly ICurrentUser _current;
    private readonly ICodeGenerator _codes;
    private readonly PaymentGatewaySimulator _gateway;
    private readonly OrderWorkflowService _workflow;
    private readonly INotificationService _notifications;
    private readonly IAuditLogger _audit;

    public MeShopController(GhDbContext db, ICurrentUser current, ICodeGenerator codes,
        PaymentGatewaySimulator gateway, OrderWorkflowService workflow, INotificationService notifications, IAuditLogger audit)
    {
        _db = db;
        _current = current;
        _codes = codes;
        _gateway = gateway;
        _workflow = workflow;
        _notifications = notifications;
        _audit = audit;
    }

    private Guid UserId => _current.UserId ?? throw new UnauthorizedAccessException("Sesión no válida.");

    private async Task<Cart> GetOrCreateCartAsync(CancellationToken ct)
    {
        var cart = await _db.Carts.Include(c => c.Items).ThenInclude(i => i.Product)
            .FirstOrDefaultAsync(c => c.UserId == UserId && c.Status == CartStatus.Active, ct);

        if (cart is not null) return cart;

        cart = new Cart { UserId = UserId, Status = CartStatus.Active };
        _db.Carts.Add(cart);
        await _db.SaveChangesAsync(ct);
        return cart;
    }

    private static CartDto ToDto(Cart cart)
    {
        var items = cart.Items.Where(i => i.Product is not null).Select(CartItemDto.From).ToList();
        var subtotal = items.Sum(i => i.Total);
        var tax = items.Sum(i => i.Total * ((cart.Items.FirstOrDefault(x => x.ProductId == i.ProductId)?.Product?.TaxRate ?? 0) / 100m));
        return new CartDto(cart.Id, items, items.Count, subtotal, tax, subtotal + tax,
            cart.Items.FirstOrDefault()?.Product?.Currency ?? "USD");
    }

    // ------------------------------------------------------------------ carrito
    [HttpGet("cart")]
    public async Task<ActionResult<CartDto>> Cart(CancellationToken ct) => Ok(ToDto(await GetOrCreateCartAsync(ct)));

    [HttpPost("cart/items")]
    public async Task<ActionResult<CartDto>> AddItem([FromBody] AddCartItemRequest request, CancellationToken ct)
    {
        if (request.Quantity < 1) request = request with { Quantity = 1 };

        var cart = await GetOrCreateCartAsync(ct);
        var product = await _db.Products.FirstOrDefaultAsync(p => p.Id == request.ProductId && p.IsActive && !p.IsDeleted, ct)
                      ?? throw new KeyNotFoundException("El servicio indicado no está disponible.");

        var existing = cart.Items.FirstOrDefault(i => i.ProductId == product.Id);
        if (existing is not null)
        {
            existing.Quantity += request.Quantity;
            existing.Notes = request.Notes ?? existing.Notes;
        }
        else
        {
            cart.Items.Add(new CartItem
            {
                CartId = cart.Id,
                ProductId = product.Id,
                Quantity = request.Quantity,
                UnitPrice = product.Price,
                Notes = request.Notes,
            });
        }

        cart.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        var refreshed = await GetOrCreateCartAsync(ct);
        return Ok(ToDto(refreshed));
    }

    [HttpPatch("cart/items/{id:guid}")]
    public async Task<ActionResult<CartDto>> UpdateItem(Guid id, [FromBody] UpdateCartItemRequest request, CancellationToken ct)
    {
        var cart = await GetOrCreateCartAsync(ct);
        var item = cart.Items.FirstOrDefault(i => i.Id == id) ?? throw new KeyNotFoundException("Ítem no encontrado en el carrito.");

        if (request.Quantity <= 0) _db.CartItems.Remove(item);
        else item.Quantity = request.Quantity;

        cart.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        var refreshed = await GetOrCreateCartAsync(ct);
        return Ok(ToDto(refreshed));
    }

    [HttpDelete("cart/items/{id:guid}")]
    public async Task<ActionResult<CartDto>> RemoveItem(Guid id, CancellationToken ct)
    {
        var cart = await GetOrCreateCartAsync(ct);
        var item = cart.Items.FirstOrDefault(i => i.Id == id);
        if (item is not null)
        {
            _db.CartItems.Remove(item);
            await _db.SaveChangesAsync(ct);
        }

        var refreshed = await GetOrCreateCartAsync(ct);
        return Ok(ToDto(refreshed));
    }

    [HttpDelete("cart")]
    public async Task<IActionResult> ClearCart(CancellationToken ct)
    {
        var cart = await GetOrCreateCartAsync(ct);
        _db.CartItems.RemoveRange(cart.Items);
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }

    // ------------------------------------------------------------------ pedidos
    /// <summary>Crea el pedido (queda pendiente de pago) a partir del carrito o de ítems explícitos.</summary>
    [HttpPost("orders")]
    public async Task<ActionResult<OrderDto>> CreateOrder([FromBody] CreateOrderRequest request, CancellationToken ct)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == UserId, ct)
                   ?? throw new UnauthorizedAccessException("Usuario no encontrado.");
        var client = await _db.Clients.FirstOrDefaultAsync(c => c.UserId == UserId && !c.IsDeleted, ct);

        var lines = new List<(Product Product, int Quantity, string? Notes)>();

        if (request.UseCart || request.Items is null || request.Items.Count == 0)
        {
            var cart = await GetOrCreateCartAsync(ct);
            if (cart.Items.Count == 0) throw new InvalidOperationException("El carrito está vacío.");
            foreach (var item in cart.Items)
            {
                if (item.Product is null) continue;
                lines.Add((item.Product, item.Quantity, item.Notes));
            }
        }
        else
        {
            var productIds = request.Items.Select(i => i.ProductId).Distinct().ToList();
            var products = await _db.Products.Where(p => productIds.Contains(p.Id) && p.IsActive && !p.IsDeleted).ToListAsync(ct);
            foreach (var line in request.Items)
            {
                var product = products.FirstOrDefault(p => p.Id == line.ProductId)
                              ?? throw new KeyNotFoundException($"El servicio {line.ProductId} no está disponible.");
                lines.Add((product, Math.Max(1, line.Quantity), line.Notes));
            }
        }

        var idempotencyKey = Request.Headers["Idempotency-Key"].ToString();
        if (!string.IsNullOrWhiteSpace(idempotencyKey))
        {
            var existing = await _db.Orders.Include(o => o.Items).Include(o => o.Payments)
                .FirstOrDefaultAsync(o => o.IdempotencyKey == idempotencyKey && o.UserId == UserId, ct);
            if (existing is not null) return Ok(OrderDto.From(existing));
        }

        var currency = lines.FirstOrDefault().Product?.Currency ?? "USD";
        var subtotal = lines.Sum(l => l.Product.Price * l.Quantity);
        var tax = lines.Sum(l => l.Product.Price * l.Quantity * (l.Product.TaxRate / 100m));

        var order = new Order
        {
            Number = await _codes.NextOrderNumberAsync(ct),
            UserId = user.Id,
            ClientId = client?.Id,
            Status = OrderStatus.PendingPayment,
            Subtotal = subtotal,
            Tax = tax,
            Total = subtotal + tax,
            Currency = currency,
            CustomerName = request.CustomerName ?? client?.LegalName ?? user.FullName,
            CustomerEmail = request.CustomerEmail ?? client?.Email ?? user.Email,
            CustomerPhone = request.CustomerPhone ?? client?.Phone ?? user.Phone,
            Notes = request.Notes,
            RequiresInvoice = request.RequiresInvoice,
            InvoiceDataJson = request.InvoiceData is null ? null : System.Text.Json.JsonSerializer.Serialize(request.InvoiceData),
            IdempotencyKey = string.IsNullOrWhiteSpace(idempotencyKey) ? null : idempotencyKey,
        };
        _db.Orders.Add(order);
        await _db.SaveChangesAsync(ct);

        foreach (var (product, quantity, notes) in lines)
        {
            _db.OrderItems.Add(new OrderItem
            {
                OrderId = order.Id,
                ProductId = product.Id,
                NameSnapshot = product.Name,
                UnitPrice = product.Price,
                Quantity = quantity,
                Total = product.Price * quantity,
                Notes = notes,
            });
        }

        // El carrito queda consumido por el pedido.
        var activeCart = await _db.Carts.Include(c => c.Items).FirstOrDefaultAsync(c => c.UserId == UserId && c.Status == CartStatus.Active, ct);
        if (activeCart is not null)
        {
            activeCart.Status = CartStatus.Converted;
            _db.CartItems.RemoveRange(activeCart.Items);
        }

        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("create", "Order", order.Id.ToString(), after: new { order.Number, order.Total }, ct: ct);

        await _notifications.NotifyStaffAsync(NotificationType.System,
            "Nuevo pedido creado",
            $"{order.CustomerName} generó el pedido {order.Number} por {order.Total:N2} {order.Currency} (pendiente de pago).",
            deepLink: $"/admin/orders/{order.Id}",
            data: new { orderId = order.Id });

        var created = await _db.Orders.Include(o => o.Items).Include(o => o.Payments).FirstAsync(o => o.Id == order.Id, ct);
        return Ok(OrderDto.From(created));
    }

    [HttpGet("orders")]
    public async Task<ActionResult<PagedResult<OrderDto>>> Orders([FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        var query = _db.Orders.AsNoTracking().Include(o => o.Items).ThenInclude(i => i.CaseFile).Include(o => o.Payments)
            .Where(o => o.UserId == UserId)
            .OrderByDescending(o => o.CreatedAt);

        var paged = await query.ToPagedResultAsync(page, pageSize, ct);
        return Ok(new PagedResult<OrderDto>(paged.Items.Select(o => OrderDto.From(o)).ToList(), paged.Total, paged.Page, paged.PageSize));
    }

    [HttpGet("orders/{id:guid}")]
    public async Task<ActionResult<OrderDto>> Order(Guid id, CancellationToken ct)
    {
        var order = await _db.Orders.AsNoTracking().Include(o => o.Items).ThenInclude(i => i.CaseFile).Include(o => o.Payments)
            .FirstOrDefaultAsync(o => o.Id == id && o.UserId == UserId, ct)
            ?? throw new KeyNotFoundException("Pedido no encontrado.");
        return Ok(OrderDto.From(order));
    }

    /// <summary>Cancela un pedido que aún no se ha pagado.</summary>
    [HttpPost("orders/{id:guid}/cancel")]
    public async Task<ActionResult<OrderDto>> Cancel(Guid id, CancellationToken ct)
    {
        var order = await _db.Orders.Include(o => o.Items).Include(o => o.Payments)
            .FirstOrDefaultAsync(o => o.Id == id && o.UserId == UserId, ct)
            ?? throw new KeyNotFoundException("Pedido no encontrado.");

        if (order.Status != OrderStatus.PendingPayment)
            throw new InvalidOperationException("Solo se pueden cancelar pedidos pendientes de pago.");

        order.Status = OrderStatus.Cancelled;
        order.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        return Ok(OrderDto.From(order));
    }

    /// <summary>
    /// Procesa el pago con la pasarela SIMULADA. Con una tarjeta aprobada el pedido pasa a
    /// pagado y se generan automáticamente los expedientes con sus tareas iniciales.
    /// </summary>
    [HttpPost("orders/{id:guid}/pay")]
    public async Task<ActionResult<CheckoutResultDto>> Pay(Guid id, [FromBody] PayOrderRequest request, CancellationToken ct)
    {
        var order = await _db.Orders.Include(o => o.Items).ThenInclude(i => i.Product)
            .Include(o => o.Payments)
            .FirstOrDefaultAsync(o => o.Id == id && o.UserId == UserId, ct)
            ?? throw new KeyNotFoundException("Pedido no encontrado.");

        if (order.Status is OrderStatus.Paid or OrderStatus.InProcess or OrderStatus.Completed)
        {
            var existingPayment = order.Payments.OrderByDescending(p => p.CreatedAt).First();
            return Ok(new CheckoutResultDto(OrderDto.From(order), PaymentDto.From(existingPayment, order.Number),
                true, "Este pedido ya está pagado.", Array.Empty<string>()));
        }

        if (order.Status is OrderStatus.Cancelled or OrderStatus.Refunded)
            throw new InvalidOperationException("Este pedido no admite nuevos pagos.");

        if (request.Method == PaymentMethod.Card && string.IsNullOrWhiteSpace(request.Card?.Number))
            throw new ArgumentException("Ingrese los datos de la tarjeta.");

        if (request.Method == PaymentMethod.Sinpe && string.IsNullOrWhiteSpace(request.SinpePhone))
            throw new ArgumentException("Ingrese el número de teléfono asociado a SINPE Móvil.");

        var outcome = _gateway.Process(new PaymentRequest(
            request.Method, order.Total, order.Currency,
            request.Card?.Number, request.Card?.Holder, request.Card?.Expiry, request.Card?.Cvv,
            request.Installments, request.Reference ?? request.SinpePhone));

        var payment = new Payment
        {
            OrderId = order.Id,
            Provider = PaymentGatewaySimulator.Provider,
            Method = request.Method,
            Status = outcome.Status,
            Amount = order.Total,
            Currency = order.Currency,
            Reference = outcome.Reference,
            AuthorizationCode = outcome.AuthorizationCode,
            CardBrand = outcome.CardBrand,
            CardLast4 = outcome.CardLast4,
            CardHolder = request.Card?.Holder,
            Installments = request.Installments,
            FailureReason = outcome.FailureReason,
            RawRequestJson = outcome.RawRequestJson,
            RawResponseJson = outcome.RawResponseJson,
            CreatedAt = DateTime.UtcNow,
            ProcessedAt = DateTime.UtcNow,
        };
        _db.Payments.Add(payment);
        await _db.SaveChangesAsync(ct);

        var createdCases = new List<CaseFile>();

        switch (outcome.Status)
        {
            case PaymentStatus.Approved:
                createdCases = await _workflow.ConfirmPaymentAsync(order, payment, ct);
                break;

            case PaymentStatus.Declined:
                order.Status = OrderStatus.PendingPayment;
                order.UpdatedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync(ct);
                await _notifications.NotifyUserAsync(order.UserId, NotificationType.PaymentFailed,
                    "Pago rechazado",
                    $"No pudimos procesar el pago del pedido {order.Number}. {outcome.FailureReason}",
                    deepLink: $"/orders/{order.Id}",
                    data: new { orderId = order.Id, reference = payment.Reference }, ct: ct);
                break;

            case PaymentStatus.Pending:
                order.Status = OrderStatus.PendingPayment;
                order.UpdatedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync(ct);
                await _notifications.NotifyStaffAsync(NotificationType.System,
                    "Pago pendiente de confirmación",
                    $"El pago del pedido {order.Number} por {order.Total:N2} {order.Currency} quedó pendiente ({request.Method}).",
                    deepLink: $"/admin/orders/{order.Id}",
                    data: new { orderId = order.Id, reference = payment.Reference });
                break;
        }

        var refreshed = await _db.Orders.AsNoTracking().Include(o => o.Items).ThenInclude(i => i.CaseFile).Include(o => o.Payments)
            .FirstAsync(o => o.Id == order.Id, ct);

        var succeeded = outcome.Status == PaymentStatus.Approved;
        var message = succeeded
            ? "¡Pago aprobado! Su expediente ya está en manos de nuestro equipo."
            : outcome.FailureReason ?? "El pago no pudo completarse.";

        return Ok(new CheckoutResultDto(OrderDto.From(refreshed), PaymentDto.From(payment, order.Number),
            succeeded, message, createdCases.Select(c => c.Code).ToList()));
    }

    /// <summary>Consulta el resultado de un pago por su referencia (usado por el app tras el checkout).</summary>
    [HttpGet("payments")]
    public async Task<ActionResult<IReadOnlyList<PaymentDto>>> Payments(CancellationToken ct)
    {
        var payments = await _db.Payments.AsNoTracking().Include(p => p.Order)
            .Where(p => p.Order.UserId == UserId)
            .OrderByDescending(p => p.CreatedAt)
            .Take(100)
            .ToListAsync(ct);

        return Ok(payments.Select(p => PaymentDto.From(p, p.Order?.Number)).ToList());
    }
}
