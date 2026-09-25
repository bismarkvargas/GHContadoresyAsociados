namespace GH.Domain.Entities;

/// <summary>Categoría del catálogo de servicios.</summary>
public class ProductCategory
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Slug { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? IconName { get; set; }
    public string? ImageUrl { get; set; }
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<Product> Products { get; set; } = new List<Product>();
}

/// <summary>Servicio vendible (migrado del catálogo real del sitio del cliente).</summary>
public class Product
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Sku { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? ShortDescription { get; set; }
    public string? Description { get; set; }

    public decimal Price { get; set; }
    public string Currency { get; set; } = "USD";
    public decimal TaxRate { get; set; }

    public Guid CategoryId { get; set; }
    public ProductCategory Category { get; set; } = null!;

    public string? ImageUrl { get; set; }
    /// <summary>Arreglo JSON de URLs adicionales.</summary>
    public string? GalleryJson { get; set; }

    public bool IsActive { get; set; } = true;
    public bool IsFeatured { get; set; }
    /// <summary>Si al venderlo debe generarse un expediente.</summary>
    public bool RequiresCase { get; set; } = true;
    public DeliveryMode DeliveryMode { get; set; } = DeliveryMode.Mixto;
    public int? EstimatedDays { get; set; }
    public int SortOrder { get; set; }

    /// <summary>URL original en el sitio del cliente (para trazabilidad de la migración).</summary>
    public string? SourceUrl { get; set; }
    public string? SeoTitle { get; set; }
    public string? SeoDescription { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public bool IsDeleted { get; set; }

    public ICollection<ProductPrice> PriceHistory { get; set; } = new List<ProductPrice>();
}

/// <summary>Histórico simple de precios del servicio.</summary>
public class ProductPrice
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ProductId { get; set; }
    public Product Product { get; set; } = null!;
    public decimal Price { get; set; }
    public string Currency { get; set; } = "USD";
    public DateTime ValidFrom { get; set; } = DateTime.UtcNow;
    public Guid? CreatedByUserId { get; set; }
}
