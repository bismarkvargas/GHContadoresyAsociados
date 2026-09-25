using GH.Api.Auth;
using GH.Api.Contracts;
using GH.Domain;
using GH.Domain.Abstractions;
using GH.Domain.Entities;
using GH.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GH.Api.Controllers.Admin;

/// <summary>Administración del catálogo de servicios migrado desde el sitio del cliente.</summary>
[ApiController]
[Route("api/v1/admin/catalog")]
[Authorize]
public class AdminCatalogController : ControllerBase
{
    private readonly GhDbContext _db;
    private readonly IAuditLogger _audit;

    public AdminCatalogController(GhDbContext db, IAuditLogger audit)
    {
        _db = db;
        _audit = audit;
    }

    // ------------------------------------------------------------------ categorías
    [HttpGet("categories")]
    [HasPermission("catalog.view")]
    public async Task<ActionResult<IReadOnlyList<ProductCategoryDto>>> Categories(CancellationToken ct)
    {
        var counts = await _db.Products.AsNoTracking().Where(p => !p.IsDeleted)
            .GroupBy(p => p.CategoryId).Select(g => new { Id = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Id, x => x.Count, ct);

        var categories = await _db.ProductCategories.AsNoTracking().OrderBy(c => c.SortOrder).ToListAsync(ct);
        return Ok(categories.Select(c => ProductCategoryDto.From(c, counts.GetValueOrDefault(c.Id))).ToList());
    }

    [HttpPost("categories")]
    [HasPermission("catalog.create")]
    public async Task<ActionResult<ProductCategoryDto>> CreateCategory([FromBody] CategoryUpsertRequest request, CancellationToken ct)
    {
        var slug = string.IsNullOrWhiteSpace(request.Slug) ? Slugify(request.Name) : Slugify(request.Slug);
        if (await _db.ProductCategories.AnyAsync(c => c.Slug == slug, ct))
            throw new InvalidOperationException("Ya existe una categoría con esa URL.");

        var category = new ProductCategory
        {
            Slug = slug,
            Name = request.Name.Trim(),
            Description = request.Description?.Trim(),
            IconName = request.IconName,
            ImageUrl = request.ImageUrl,
            SortOrder = request.SortOrder,
            IsActive = request.IsActive,
        };
        _db.ProductCategories.Add(category);
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("create", "ProductCategory", category.Id.ToString(), after: new { category.Name, category.Slug }, ct: ct);

        return Ok(ProductCategoryDto.From(category, 0));
    }

    [HttpPut("categories/{id:guid}")]
    [HasPermission("catalog.edit")]
    public async Task<ActionResult<ProductCategoryDto>> UpdateCategory(Guid id, [FromBody] CategoryUpsertRequest request, CancellationToken ct)
    {
        var category = await _db.ProductCategories.FirstOrDefaultAsync(c => c.Id == id, ct)
            ?? throw new KeyNotFoundException("Categoría no encontrada.");

        var before = new { category.Name, category.Slug, category.IsActive };
        var slug = string.IsNullOrWhiteSpace(request.Slug) ? category.Slug : Slugify(request.Slug);
        if (slug != category.Slug && await _db.ProductCategories.AnyAsync(c => c.Slug == slug && c.Id != id, ct))
            throw new InvalidOperationException("Ya existe otra categoría con esa URL.");

        category.Name = request.Name.Trim();
        category.Slug = slug;
        category.Description = request.Description?.Trim();
        category.IconName = request.IconName;
        category.ImageUrl = request.ImageUrl;
        category.SortOrder = request.SortOrder;
        category.IsActive = request.IsActive;

        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("update", "ProductCategory", category.Id.ToString(), before, new { category.Name, category.Slug }, ct: ct);

        var count = await _db.Products.CountAsync(p => p.CategoryId == id && !p.IsDeleted, ct);
        return Ok(ProductCategoryDto.From(category, count));
    }

    [HttpDelete("categories/{id:guid}")]
    [HasPermission("catalog.delete")]
    public async Task<IActionResult> DeleteCategory(Guid id, CancellationToken ct)
    {
        if (await _db.Products.AnyAsync(p => p.CategoryId == id && !p.IsDeleted, ct))
            throw new InvalidOperationException("No se puede eliminar una categoría que todavía tiene servicios.");

        await _db.ProductCategories.Where(c => c.Id == id).ExecuteDeleteAsync(ct);
        await _audit.LogAsync("delete", "ProductCategory", id.ToString(), ct: ct);
        return NoContent();
    }

    // ------------------------------------------------------------------ servicios
    [HttpGet("products")]
    [HasPermission("catalog.view")]
    public async Task<ActionResult<PagedResult<ProductDto>>> Products(
        [FromQuery] string? search, [FromQuery] Guid? categoryId, [FromQuery] bool? isActive,
        [FromQuery] bool? featured, [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        var query = _db.Products.AsNoTracking().Include(p => p.Category).Where(p => !p.IsDeleted);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(p => p.Name.Contains(term) || p.Sku.Contains(term) || p.Slug.Contains(term));
        }
        if (categoryId.HasValue) query = query.Where(p => p.CategoryId == categoryId);
        if (isActive.HasValue) query = query.Where(p => p.IsActive == isActive);
        if (featured.HasValue) query = query.Where(p => p.IsFeatured == featured);

        var paged = await query.OrderBy(p => p.CategoryId).ThenBy(p => p.SortOrder).ThenBy(p => p.Name)
            .ToPagedResultAsync(page, pageSize, ct);

        return Ok(new PagedResult<ProductDto>(paged.Items.Select(p => ProductDto.From(p)).ToList(), paged.Total, paged.Page, paged.PageSize));
    }

    [HttpGet("products/{id:guid}")]
    [HasPermission("catalog.view")]
    public async Task<ActionResult<ProductDto>> Product(Guid id, CancellationToken ct)
    {
        var product = await _db.Products.AsNoTracking().Include(p => p.Category).FirstOrDefaultAsync(p => p.Id == id && !p.IsDeleted, ct)
            ?? throw new KeyNotFoundException("Servicio no encontrado.");
        return Ok(ProductDto.From(product));
    }

    [HttpPost("products")]
    [HasPermission("catalog.create")]
    public async Task<ActionResult<ProductDto>> CreateProduct([FromBody] ProductUpsertRequest request, CancellationToken ct)
    {
        if (!await _db.ProductCategories.AnyAsync(c => c.Id == request.CategoryId, ct))
            throw new ArgumentException("La categoría indicada no existe.");

        var slug = Slugify(string.IsNullOrWhiteSpace(request.Slug) ? request.Name : request.Slug);
        if (await _db.Products.AnyAsync(p => p.Slug == slug, ct))
            throw new InvalidOperationException("Ya existe un servicio con esa URL.");

        var sku = string.IsNullOrWhiteSpace(request.Sku) ? $"GH-{slug[..Math.Min(18, slug.Length)].ToUpperInvariant().Replace("-", "")}" : request.Sku.Trim();

        var product = new Product
        {
            Sku = sku,
            Slug = slug,
            Name = request.Name.Trim(),
            ShortDescription = request.ShortDescription?.Trim(),
            Description = request.Description?.Trim(),
            Price = request.Price,
            Currency = string.IsNullOrWhiteSpace(request.Currency) ? "USD" : request.Currency,
            TaxRate = request.TaxRate,
            CategoryId = request.CategoryId,
            ImageUrl = request.ImageUrl,
            GalleryJson = request.Gallery is null ? null : System.Text.Json.JsonSerializer.Serialize(request.Gallery),
            IsActive = request.IsActive,
            IsFeatured = request.IsFeatured,
            RequiresCase = request.RequiresCase,
            DeliveryMode = request.DeliveryMode,
            EstimatedDays = request.EstimatedDays,
            SortOrder = request.SortOrder,
            SeoTitle = request.SeoTitle,
            SeoDescription = request.SeoDescription,
        };
        _db.Products.Add(product);
        await _db.SaveChangesAsync(ct);

        _db.ProductPrices.Add(new ProductPrice { ProductId = product.Id, Price = product.Price, Currency = product.Currency });
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("create", "Product", product.Id.ToString(), after: new { product.Sku, product.Name, product.Price }, ct: ct);

        return Ok(ProductDto.From(product));
    }

    [HttpPut("products/{id:guid}")]
    [HasPermission("catalog.edit")]
    public async Task<ActionResult<ProductDto>> UpdateProduct(Guid id, [FromBody] ProductUpsertRequest request, CancellationToken ct)
    {
        var product = await _db.Products.Include(p => p.Category).FirstOrDefaultAsync(p => p.Id == id && !p.IsDeleted, ct)
            ?? throw new KeyNotFoundException("Servicio no encontrado.");

        var before = new { product.Name, product.Price, product.IsActive };
        var priceChanged = product.Price != request.Price;

        product.Name = request.Name.Trim();
        product.ShortDescription = request.ShortDescription?.Trim();
        product.Description = request.Description?.Trim();
        product.Price = request.Price;
        product.Currency = string.IsNullOrWhiteSpace(request.Currency) ? product.Currency : request.Currency;
        product.TaxRate = request.TaxRate;
        product.CategoryId = request.CategoryId;
        product.ImageUrl = request.ImageUrl;
        product.GalleryJson = request.Gallery is null ? product.GalleryJson : System.Text.Json.JsonSerializer.Serialize(request.Gallery);
        product.IsActive = request.IsActive;
        product.IsFeatured = request.IsFeatured;
        product.RequiresCase = request.RequiresCase;
        product.DeliveryMode = request.DeliveryMode;
        product.EstimatedDays = request.EstimatedDays;
        product.SortOrder = request.SortOrder;
        product.SeoTitle = request.SeoTitle;
        product.SeoDescription = request.SeoDescription;
        product.UpdatedAt = DateTime.UtcNow;
        if (!string.IsNullOrWhiteSpace(request.Sku)) product.Sku = request.Sku.Trim();
        if (!string.IsNullOrWhiteSpace(request.Slug)) product.Slug = Slugify(request.Slug);

        if (priceChanged)
            _db.ProductPrices.Add(new ProductPrice { ProductId = product.Id, Price = product.Price, Currency = product.Currency });

        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("update", "Product", product.Id.ToString(), before, new { product.Name, product.Price, product.IsActive }, ct: ct);

        var refreshed = await _db.Products.AsNoTracking().Include(p => p.Category).FirstAsync(p => p.Id == id, ct);
        return Ok(ProductDto.From(refreshed));
    }

    /// <summary>Activa o desactiva un servicio sin abrir el formulario completo.</summary>
    [HttpPatch("products/{id:guid}/toggle")]
    [HasPermission("catalog.edit")]
    public async Task<ActionResult<object>> ToggleProduct(Guid id, [FromQuery] bool? featured, CancellationToken ct)
    {
        var product = await _db.Products.FirstOrDefaultAsync(p => p.Id == id && !p.IsDeleted, ct)
            ?? throw new KeyNotFoundException("Servicio no encontrado.");

        if (featured.HasValue) product.IsFeatured = featured.Value;
        else product.IsActive = !product.IsActive;
        product.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("toggle", "Product", product.Id.ToString(), after: new { product.IsActive, product.IsFeatured }, ct: ct);

        return Ok(new { product.Id, product.IsActive, product.IsFeatured });
    }

    [HttpDelete("products/{id:guid}")]
    [HasPermission("catalog.delete")]
    public async Task<IActionResult> DeleteProduct(Guid id, CancellationToken ct)
    {
        var product = await _db.Products.FirstOrDefaultAsync(p => p.Id == id && !p.IsDeleted, ct)
            ?? throw new KeyNotFoundException("Servicio no encontrado.");

        product.IsDeleted = true;
        product.IsActive = false;
        product.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("delete", "Product", product.Id.ToString(), before: new { product.Name }, ct: ct);

        return NoContent();
    }

    private static string Slugify(string value)
    {
        var normalized = value.Trim().ToLowerInvariant().Normalize(System.Text.NormalizationForm.FormD);
        var builder = new System.Text.StringBuilder();
        foreach (var ch in normalized)
        {
            var category = System.Globalization.CharUnicodeInfo.GetUnicodeCategory(ch);
            if (category == System.Globalization.UnicodeCategory.NonSpacingMark) continue;
            builder.Append(char.IsLetterOrDigit(ch) ? ch : '-');
        }
        var slug = System.Text.RegularExpressions.Regex.Replace(builder.ToString(), "-{2,}", "-").Trim('-');
        return slug.Length > 190 ? slug[..190] : slug;
    }
}
