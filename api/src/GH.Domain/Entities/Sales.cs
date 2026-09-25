namespace GH.Domain.Entities;

public class Cart
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public CartStatus Status { get; set; } = CartStatus.Active;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<CartItem> Items { get; set; } = new List<CartItem>();
}

public class CartItem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CartId { get; set; }
    public Cart Cart { get; set; } = null!;
    public Guid ProductId { get; set; }
    public Product Product { get; set; } = null!;
    public int Quantity { get; set; } = 1;
    public decimal UnitPrice { get; set; }
    public string? Notes { get; set; }
    public DateTime AddedAt { get; set; } = DateTime.UtcNow;
}

public class Order
{
    public Guid Id { get; set; } = Guid.NewGuid();
    /// <summary>Número legible correlativo: GH-ORD-2026-00001.</summary>
    public string Number { get; set; } = string.Empty;
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public Guid? ClientId { get; set; }
    public Client? Client { get; set; }

    public OrderStatus Status { get; set; } = OrderStatus.PendingPayment;
    public decimal Subtotal { get; set; }
    public decimal Discount { get; set; }
    public decimal Tax { get; set; }
    public decimal Total { get; set; }
    public string Currency { get; set; } = "USD";

    public string? CustomerName { get; set; }
    public string? CustomerEmail { get; set; }
    public string? CustomerPhone { get; set; }
    public string? Notes { get; set; }

    public bool RequiresInvoice { get; set; }
    /// <summary>Datos de facturación (razón social, cédula, correo, actividad).</summary>
    public string? InvoiceDataJson { get; set; }

    public string? IdempotencyKey { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? PaidAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<OrderItem> Items { get; set; } = new List<OrderItem>();
    public ICollection<Payment> Payments { get; set; } = new List<Payment>();
}

public class OrderItem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid OrderId { get; set; }
    public Order Order { get; set; } = null!;
    public Guid ProductId { get; set; }
    public Product Product { get; set; } = null!;
    /// <summary>Copia del nombre y precio al momento de la compra.</summary>
    public string NameSnapshot { get; set; } = string.Empty;
    public decimal UnitPrice { get; set; }
    public int Quantity { get; set; }
    public decimal Total { get; set; }
    public string? Notes { get; set; }

    /// <summary>Expediente generado a partir de este ítem (si el servicio lo requiere).</summary>
    public Guid? CaseFileId { get; set; }
    public CaseFile? CaseFile { get; set; }
}

/// <summary>Transacción de la pasarela de pago simulada.</summary>
public class Payment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid OrderId { get; set; }
    public Order Order { get; set; } = null!;

    public string Provider { get; set; } = "GH-Simulated";
    public PaymentMethod Method { get; set; } = PaymentMethod.Card;
    public PaymentStatus Status { get; set; } = PaymentStatus.Initiated;

    public decimal Amount { get; set; }
    public string Currency { get; set; } = "USD";
    /// <summary>Referencia única de la transacción simulada.</summary>
    public string Reference { get; set; } = string.Empty;
    public string? AuthorizationCode { get; set; }
    public string? CardBrand { get; set; }
    public string? CardLast4 { get; set; }
    public string? CardHolder { get; set; }
    public int? Installments { get; set; }
    public string? FailureReason { get; set; }

    public string? RawRequestJson { get; set; }
    public string? RawResponseJson { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ProcessedAt { get; set; }
}
