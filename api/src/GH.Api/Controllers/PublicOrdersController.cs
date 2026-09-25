using GH.Api.Contracts;
using GH.Api.Services;
using GH.Domain;
using GH.Domain.Abstractions;
using GH.Domain.Entities;
using GH.Infrastructure.Data;
using GH.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace GH.Api.Controllers;

/// <summary>
/// Compra SIN cuenta (invitado).
///
/// Un visitante puede comprar servicios sin registrarse: se crea (o se reutiliza) su ficha en
/// el CRM y un usuario invitado —pendiente y sin contraseña— que sirve de titular del pedido.
/// Cuando esa persona crea su cuenta con el mismo correo, el usuario invitado se activa con la
/// contraseña que elija y **conserva su pedido y su expediente**, sin duplicar nada.
/// </summary>
[ApiController]
[Route("api/v1/public/orders")]
[AllowAnonymous]
public class PublicOrdersController : ControllerBase
{
    private readonly GhDbContext _db;
    private readonly PaymentGatewaySimulator _gateway;
    private readonly OrderWorkflowService _workflow;
    private readonly IAuditLogger _audit;
    private readonly INotificationService _notifications;
    private readonly IRealtimeNotifier _realtime;
    private readonly PasswordHasher<User> _hasher = new();

    public PublicOrdersController(GhDbContext db, PaymentGatewaySimulator gateway, OrderWorkflowService workflow,
        IAuditLogger audit, INotificationService notifications, IRealtimeNotifier realtime)
    {
        _db = db;
        _gateway = gateway;
        _workflow = workflow;
        _audit = audit;
        _notifications = notifications;
        _realtime = realtime;
    }

    public record GuestCustomer(string? FullName, string? Email, string? Phone, string? IdNumber,
        ClientType? ClientType, string? Company);

    public record GuestOrderRequest(
        IReadOnlyList<CheckoutItemRequest>? Items,
        GuestCustomer? Customer,
        bool RequiresInvoice,
        InvoiceDataDto? InvoiceData,
        string? Notes);

    public record GuestPayRequest(PaymentMethod Method, CardDto? Card, int? Installments, string? SinpePhone);

    /// <summary>Crea el pedido de un invitado con sus datos de contacto. Queda pendiente de pago.</summary>
    [HttpPost]
    [EnableRateLimiting("public-write")]
    public async Task<ActionResult<object>> Create([FromBody] GuestOrderRequest request, CancellationToken ct)
    {
        if (request.Items is null || request.Items.Count == 0)
            return BadRequest(new ProblemDetails { Title = "Carrito vacío", Detail = "Agregue al menos un servicio para continuar.", Status = 400 });

        var email = (request.Customer?.Email ?? string.Empty).Trim().ToLowerInvariant();
        var nombre = (request.Customer?.FullName ?? string.Empty).Trim();
        var telefono = (request.Customer?.Phone ?? string.Empty).Trim();

        if (nombre.Length == 0 || email.Length == 0 || telefono.Length == 0)
            return BadRequest(new ProblemDetails
            {
                Title = "Datos incompletos",
                Detail = "Para completar la compra necesitamos su nombre, su correo y su teléfono.",
                Status = 400,
            });
        if (!email.Contains('@') || !email.Contains('.'))
            return BadRequest(new ProblemDetails { Title = "Correo no válido", Status = 400 });

        var ids = request.Items.Select(i => i.ProductId).Distinct().ToList();
        var productos = await _db.Products.Include(p => p.Category)
            .Where(p => ids.Contains(p.Id) && p.IsActive && !p.IsDeleted)
            .ToListAsync(ct);

        if (productos.Count == 0)
            return BadRequest(new ProblemDetails { Title = "Servicios no disponibles", Status = 400 });

        var lineas = request.Items
            .Select(i => (Producto: productos.FirstOrDefault(p => p.Id == i.ProductId), Cantidad: Math.Max(1, i.Quantity)))
            .Where(l => l.Producto is not null)
            .ToList();
        if (lineas.Count == 0)
            return BadRequest(new ProblemDetails { Title = "Servicios no disponibles", Status = 400 });

        var moneda = lineas[0].Producto!.Currency;
        var subtotal = lineas.Sum(l => l.Producto!.Price * l.Cantidad);
        var impuesto = lineas.Sum(l => l.Producto!.Price * l.Cantidad * (l.Producto!.TaxRate / 100m));

        // ---- Cliente del CRM: se reutiliza si ya existe por correo, si no se crea como prospecto.
        var cliente = await _db.Clients.FirstOrDefaultAsync(c => c.Email == email && !c.IsDeleted, ct);
        if (cliente is null)
        {
            cliente = new Client
            {
                Code = await SiguienteCodigoClienteAsync(ct),
                ClientType = request.Customer?.ClientType ?? ClientType.Individual,
                LegalName = string.IsNullOrWhiteSpace(request.Customer?.Company) ? nombre : request.Customer!.Company!,
                TradeName = request.Customer?.Company,
                IdNumber = request.Customer?.IdNumber?.Trim(),
                Email = email,
                Phone = telefono,
                Whatsapp = telefono,
                Country = "Costa Rica",
                Status = ClientStatus.Lead,
                Source = ClientSource.App,
                Notes = "Alta automática al comprar sin cuenta desde el app.",
                LastContactAt = DateTime.UtcNow,
            };
            _db.Clients.Add(cliente);
            await _db.SaveChangesAsync(ct);
        }

        // ---- Usuario invitado: titular del pedido hasta que cree su cuenta.
        var usuario = await _db.Users.FirstOrDefaultAsync(u => u.Email == email && !u.IsDeleted, ct);
        if (usuario is null)
        {
            usuario = new User
            {
                Email = email,
                FullName = nombre,
                Phone = telefono,
                IdNumber = request.Customer?.IdNumber?.Trim(),
                Status = UserStatus.Pending,
                IsStaff = false,
                ClientId = cliente.Id,
                PasswordHash = string.Empty, // invitado: no puede iniciar sesión hasta crear su cuenta
            };
            _db.Users.Add(usuario);
            await _db.SaveChangesAsync(ct);
        }

        if (cliente.UserId is null) cliente.UserId = usuario.Id;

        var pedido = new Order
        {
            Number = await SiguienteNumeroPedidoAsync(ct),
            UserId = usuario.Id,
            ClientId = cliente.Id,
            Status = OrderStatus.PendingPayment,
            Subtotal = subtotal,
            Tax = impuesto,
            Total = subtotal + impuesto,
            Currency = moneda,
            CustomerName = string.IsNullOrWhiteSpace(request.Customer?.Company) ? nombre : request.Customer!.Company,
            CustomerEmail = email,
            CustomerPhone = telefono,
            Notes = request.Notes,
            RequiresInvoice = request.RequiresInvoice,
            InvoiceDataJson = request.InvoiceData is null ? null : System.Text.Json.JsonSerializer.Serialize(request.InvoiceData),
        };
        _db.Orders.Add(pedido);
        await _db.SaveChangesAsync(ct);

        foreach (var (producto, cantidad) in lineas)
        {
            _db.OrderItems.Add(new OrderItem
            {
                OrderId = pedido.Id,
                ProductId = producto!.Id,
                NameSnapshot = producto.Name,
                UnitPrice = producto.Price,
                Quantity = cantidad,
                Total = producto.Price * cantidad,
            });
        }
        await _db.SaveChangesAsync(ct);

        await _audit.LogAsync("create-guest-order", "Order", pedido.Id.ToString(),
            after: new { pedido.Number, pedido.Total, email }, ct: ct);

        await _realtime.ToStaffAsync("order.updated", new
        {
            orderId = pedido.Id, number = pedido.Number, status = pedido.Status.ToString(),
            total = pedido.Total, currency = pedido.Currency, guest = true, email, at = DateTime.UtcNow,
        }, ct);

        await _notifications.NotifyStaffAsync(NotificationType.System,
            "Compra de un invitado",
            $"{nombre} ({email}) inició una compra sin cuenta por {pedido.Total:N2} {pedido.Currency}.",
            deepLink: $"/admin/orders/{pedido.Id}",
            data: new { orderId = pedido.Id, guest = true });

        return Ok(new
        {
            orderId = pedido.Id,
            number = pedido.Number,
            total = pedido.Total,
            subtotal = pedido.Subtotal,
            tax = pedido.Tax,
            currency = pedido.Currency,
            clientCode = cliente.Code,
            trackingCode = pedido.Number,
            paymentRequired = true,
            items = lineas.Select(l => new { name = l.Producto!.Name, quantity = l.Cantidad, unitPrice = l.Producto.Price, total = l.Producto.Price * l.Cantidad }),
        });
    }

    /// <summary>Procesa el pago del pedido de un invitado y genera el expediente si se aprueba.</summary>
    [HttpPost("{id:guid}/pay")]
    [EnableRateLimiting("public-write")]
    public async Task<ActionResult<object>> Pay(Guid id, [FromBody] GuestPayRequest request, CancellationToken ct)
    {
        var pedido = await _db.Orders.Include(o => o.Items).ThenInclude(i => i.Product).Include(o => o.Payments)
            .FirstOrDefaultAsync(o => o.Id == id, ct);
        if (pedido is null) return NotFound(new ProblemDetails { Title = "Pedido no encontrado", Status = 404 });

        if (pedido.Status is OrderStatus.Paid or OrderStatus.InProcess or OrderStatus.Completed)
        {
            var existente = pedido.Payments.OrderByDescending(p => p.CreatedAt).FirstOrDefault();
            return Ok(new
            {
                succeeded = true,
                message = "Este pedido ya está pagado.",
                order = new { pedido.Number, status = pedido.Status.ToString(), pedido.Total, pedido.Currency },
                payment = existente is null ? null : new { status = existente.Status.ToString(), existente.Reference, existente.CardLast4 },
                createdCaseCodes = Array.Empty<string>(),
            });
        }

        if (pedido.Status is OrderStatus.Cancelled or OrderStatus.Refunded)
            return BadRequest(new ProblemDetails { Title = "Este pedido no admite pagos", Status = 400 });

        if (request.Method == PaymentMethod.Card && string.IsNullOrWhiteSpace(request.Card?.Number))
            return BadRequest(new ProblemDetails { Title = "Datos de tarjeta incompletos", Status = 400 });

        var resultado = _gateway.Process(new PaymentRequest(
            request.Method, pedido.Total, pedido.Currency,
            request.Card?.Number, request.Card?.Holder, request.Card?.Expiry, request.Card?.Cvv,
            request.Installments, request.SinpePhone));

        var pago = new Payment
        {
            OrderId = pedido.Id,
            Provider = PaymentGatewaySimulator.Provider,
            Method = request.Method,
            Status = resultado.Status,
            Amount = pedido.Total,
            Currency = pedido.Currency,
            Reference = resultado.Reference,
            AuthorizationCode = resultado.AuthorizationCode,
            CardBrand = resultado.CardBrand,
            CardLast4 = resultado.CardLast4,
            CardHolder = request.Card?.Holder,
            Installments = request.Installments,
            FailureReason = resultado.FailureReason,
            RawRequestJson = resultado.RawRequestJson,
            RawResponseJson = resultado.RawResponseJson,
            CreatedAt = DateTime.UtcNow,
            ProcessedAt = DateTime.UtcNow,
        };
        _db.Payments.Add(pago);
        await _db.SaveChangesAsync(ct);

        var expedientes = new List<CaseFile>();

        if (resultado.Status == PaymentStatus.Approved)
        {
            expedientes = await _workflow.ConfirmPaymentAsync(pedido, pago, ct);
        }
        else if (resultado.Status == PaymentStatus.Pending)
        {
            await _notifications.NotifyStaffAsync(NotificationType.System,
                "Pago pendiente de confirmación (compra de invitado)",
                $"El pedido {pedido.Number} por {pedido.Total:N2} {pedido.Currency} quedó pendiente ({request.Method}).",
                deepLink: $"/admin/orders/{pedido.Id}",
                data: new { orderId = pedido.Id, reference = pago.Reference });
        }

        return Ok(new
        {
            succeeded = resultado.Status == PaymentStatus.Approved,
            message = resultado.Status == PaymentStatus.Approved
                ? "¡Pago aprobado! Ya iniciamos la gestión de su servicio."
                : resultado.FailureReason ?? "El pago no pudo completarse.",
            order = new { pedido.Number, status = pedido.Status.ToString(), pedido.Total, pedido.Currency },
            payment = new { status = resultado.Status.ToString(), pago.Reference, pago.CardLast4, pago.AuthorizationCode },
            createdCaseCodes = expedientes.Select(c => c.Code).ToArray(),
        });
    }

    /// <summary>Consulta el estado de un pedido de invitado (sin cuenta).</summary>
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<object>> Get(Guid id, [FromQuery] string? email, CancellationToken ct)
    {
        var pedido = await _db.Orders.AsNoTracking().Include(o => o.Items).Include(o => o.Payments)
            .FirstOrDefaultAsync(o => o.Id == id, ct);
        if (pedido is null) return NotFound(new ProblemDetails { Title = "Pedido no encontrado", Status = 404 });

        if (!string.IsNullOrWhiteSpace(email) &&
            !string.Equals(pedido.CustomerEmail, email.Trim().ToLowerInvariant(), StringComparison.OrdinalIgnoreCase))
            return NotFound(new ProblemDetails { Title = "Pedido no encontrado", Status = 404 });

        return Ok(new
        {
            pedido.Number,
            status = pedido.Status.ToString(),
            statusLabel = AccessResolver.Label(pedido.Status),
            pedido.Total,
            pedido.Currency,
            pedido.CreatedAt,
            pedido.PaidAt,
            items = pedido.Items.Select(i => new { i.NameSnapshot, i.Quantity, i.Total }),
            payment = pedido.Payments.OrderByDescending(p => p.CreatedAt).Select(p => new { status = p.Status.ToString(), p.Reference }).FirstOrDefault(),
        });
    }

    // ---- Correlativos (mismo mecanismo atómico que el resto de la API)
    private async Task<string> SiguienteCodigoClienteAsync(CancellationToken ct)
    {
        await _db.Database.ExecuteSqlRawAsync(
            "INSERT INTO `EntityCounters` (`CounterKey`, `Value`) VALUES ('client', 1) ON DUPLICATE KEY UPDATE `Value` = `Value` + 1;", ct);
        var n = await LeerContadorAsync("client", ct);
        return $"GH-CLI-{n:D5}";
    }

    private async Task<string> SiguienteNumeroPedidoAsync(CancellationToken ct)
    {
        var clave = $"order-{DateTime.UtcNow.Year}";
        await _db.Database.ExecuteSqlRawAsync(
            "INSERT INTO `EntityCounters` (`CounterKey`, `Value`) VALUES ({0}, 1) ON DUPLICATE KEY UPDATE `Value` = `Value` + 1;",
            new object[] { clave }, ct);
        var n = await LeerContadorAsync(clave, ct);
        return $"GH-ORD-{DateTime.UtcNow.Year}-{n:D5}";
    }

    private async Task<long> LeerContadorAsync(string clave, CancellationToken ct)
    {
        var conn = _db.Database.GetDbConnection();
        var abrir = conn.State != System.Data.ConnectionState.Open;
        if (abrir) await conn.OpenAsync(ct);
        try
        {
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT `Value` FROM `EntityCounters` WHERE `CounterKey` = @k";
            var p = cmd.CreateParameter();
            p.ParameterName = "@k";
            p.Value = clave;
            cmd.Parameters.Add(p);
            return Convert.ToInt64(await cmd.ExecuteScalarAsync(ct) ?? 1L);
        }
        finally
        {
            if (abrir) await conn.CloseAsync();
        }
    }
}
