using GH.Api.Contracts;
using GH.Api.Services;
using GH.Domain;
using GH.Domain.Abstractions;
using GH.Domain.Entities;
using GH.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace GH.Api.Controllers;

/// <summary>Endpoints pÃºblicos: informaciÃ³n de la firma, catÃ¡logo, solicitud de cuenta,
/// cotizaciones y descarga de documentos firmados. No requieren autenticaciÃ³n.</summary>
[ApiController]
[Route("api/v1/public")]
[AllowAnonymous]
public class PublicController : ControllerBase
{
    private readonly GhDbContext _db;
    private readonly ICodeGenerator _codes;
    private readonly IRealtimeNotifier _realtime;
    private readonly INotificationService _notifications;
    private readonly IStorageService _storage;
    private readonly IAuditLogger _audit;
    private readonly AccountActivationService _activacion;

    public PublicController(GhDbContext db, ICodeGenerator codes, IRealtimeNotifier realtime,
        INotificationService notifications, IStorageService storage, IAuditLogger audit,
        AccountActivationService activacion)
    {
        _db = db;
        _codes = codes;
        _realtime = realtime;
        _notifications = notifications;
        _storage = storage;
        _audit = audit;
        _activacion = activacion;
    }

    /// <summary>InformaciÃ³n de marca, contacto y configuraciÃ³n de venta del app.</summary>
    [HttpGet("site")]
    public async Task<ActionResult<SiteDto>> Site(CancellationToken ct)
    {
        var settings = await _db.Settings.AsNoTracking().ToDictionaryAsync(s => s.Key, s => s.Value ?? string.Empty, ct);
        string Get(string key, string fallback = "") => settings.TryGetValue(key, out var v) && !string.IsNullOrWhiteSpace(v) ? v : fallback;

        var currency = new CurrencyDto(
            Get("sales.baseCurrency", "USD"),
            Get("sales.secondaryCurrency", "CRC"),
            decimal.TryParse(Get("sales.usdToCrc", "520"), out var rate) ? rate : 520m);

        var modo = await _activacion.GetModeAsync(ct);
        var automatico = AccountActivationService.EsAutomatico(modo);

        return Ok(new SiteDto(
            new BrandDto(
                Get("brand.name", "GH Contadores & Asociados"),
                Get("brand.shortName", "GH Contadores"),
                Get("brand.primaryColor", "#1E2B58"),
                Get("brand.inkColor", "#1E2B58"),
                Get("brand.accentColor", "#C4D82D"),
                Get("brand.successColor", "#008250"),
                Get("brand.logoUrl")),
            new CompanyDto(
                Get("company.legalName", "GH Contadores & Asociados"),
                Get("company.address", "Huacas, Santa Cruz, Guanacaste, Costa Rica"),
                Get("company.phone1", "+506 2653 6634"),
                Get("company.phone2", "+506 8846 9454"),
                Get("company.email", "gustavo.ghcontadores@outlook.com"),
                Get("company.supportEmail", "pedidos@ghcontadores.net"),
                Get("company.website", "https://www.ghcontadores.net"),
                Get("company.country", "Costa Rica"),
                Get("company.timeZone", "America/Costa_Rica")),
            currency,
            new PaymentConfigDto(
                Get("payments.provider", "GH-Simulated"),
                Get("payments.testCardApproved", "4242 4242 4242 4242"),
                Get("payments.testCardDeclined", "4000 0000 0000 0002"),
                Get("payments.testCardPending", "4000 0000 0000 9995"),
                true),
            new RegistrationConfigDto(
                modo,
                automatico,
                automatico
                    ? "Cree su cuenta y empiece a comprar de inmediato: se activa al instante."
                    : Get("registration.message", "Solicite su cuenta: GH Contadores la revisa y la activa.")),
            Get("catalog.sourceUrl", "https://www.ghcontadores.net/category/servicios")));
    }

    /// <summary>CategorÃ­as del catÃ¡logo con el nÃºmero de servicios activos.</summary>
    [HttpGet("catalog/categories")]
    public async Task<ActionResult<IReadOnlyList<ProductCategoryDto>>> Categories(CancellationToken ct)
    {
        var counts = await _db.Products.AsNoTracking()
            .Where(p => p.IsActive && !p.IsDeleted)
            .GroupBy(p => p.CategoryId)
            .Select(g => new { CategoryId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.CategoryId, x => x.Count, ct);

        var categories = await _db.ProductCategories.AsNoTracking()
            .Where(c => c.IsActive)
            .OrderBy(c => c.SortOrder)
            .ToListAsync(ct);

        return Ok(categories.Select(c => ProductCategoryDto.From(c, counts.GetValueOrDefault(c.Id))).ToList());
    }

    /// <summary>CatÃ¡logo de servicios con bÃºsqueda, filtros y paginaciÃ³n.</summary>
    [HttpGet("catalog/products")]
    public async Task<ActionResult<PagedResult<ProductDto>>> Products(
        [FromQuery] string? category, [FromQuery] string? search, [FromQuery] bool? featured,
        [FromQuery] decimal? minPrice, [FromQuery] decimal? maxPrice,
        [FromQuery] string? sort, [FromQuery] string? order,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        var query = _db.Products.AsNoTracking().Include(p => p.Category)
            .Where(p => p.IsActive && !p.IsDeleted && p.Category.IsActive);

        if (!string.IsNullOrWhiteSpace(category))
            query = query.Where(p => p.Category.Slug == category);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(p => p.Name.Contains(term) || (p.ShortDescription != null && p.ShortDescription.Contains(term))
                                     || (p.Description != null && p.Description.Contains(term)));
        }
        if (featured == true) query = query.Where(p => p.IsFeatured);
        if (minPrice.HasValue) query = query.Where(p => p.Price >= minPrice.Value);
        if (maxPrice.HasValue) query = query.Where(p => p.Price <= maxPrice.Value);

        query = (sort?.ToLowerInvariant(), order?.ToLowerInvariant()) switch
        {
            ("price", "desc") => query.OrderByDescending(p => p.Price),
            ("price", _) => query.OrderBy(p => p.Price),
            ("name", "desc") => query.OrderByDescending(p => p.Name),
            ("name", _) => query.OrderBy(p => p.Name),
            _ => query.OrderByDescending(p => p.IsFeatured).ThenBy(p => p.SortOrder),
        };

        var paged = await query.ToPagedResultAsync(page, pageSize, ct);
        var items = paged.Items.Select(p => ProductDto.From(p)).ToList();
        return Ok(new PagedResult<ProductDto>(items, paged.Total, paged.Page, paged.PageSize));
    }

    /// <summary>Ficha completa de un servicio con servicios relacionados.</summary>
    [HttpGet("catalog/products/{slug}")]
    public async Task<ActionResult<object>> Product(string slug, CancellationToken ct)
    {
        var product = await _db.Products.AsNoTracking().Include(p => p.Category)
            .FirstOrDefaultAsync(p => p.Slug == slug && p.IsActive && !p.IsDeleted, ct);

        if (product is null) return NotFound(new ProblemDetails { Title = "Servicio no encontrado", Status = 404 });

        var related = await _db.Products.AsNoTracking()
            .Where(p => p.CategoryId == product.CategoryId && p.Id != product.Id && p.IsActive && !p.IsDeleted)
            .OrderByDescending(p => p.IsFeatured).ThenBy(p => p.SortOrder)
            .Take(6)
            .ToListAsync(ct);

        return Ok(new
        {
            product = ProductDto.From(product),
            related = related.Select(p => ProductDto.From(p)).ToList(),
        });
    }

    /// <summary>Solicitud de creaciÃ³n de cuenta desde el app. Queda pendiente de aprobaciÃ³n del administrador.</summary>
    [HttpPost("account-requests")]
    [EnableRateLimiting("public-write")]
    public async Task<ActionResult<AccountRequestStatusDto>> CreateAccountRequest([FromBody] AccountRequestCreateRequest request, CancellationToken ct)
    {
        var email = (request.Email ?? string.Empty).Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(request.FullName) || string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(request.Phone))
            return BadRequest(new ProblemDetails { Title = "Datos incompletos", Detail = "El nombre, el correo y el telÃ©fono son obligatorios.", Status = 400 });

        if (!email.Contains('@') || !email.Contains('.'))
            return BadRequest(new ProblemDetails { Title = "Correo no vÃ¡lido", Status = 400 });

        var existing = await _db.AccountRequests
            .Where(r => r.Email == email && r.Status == AccountRequestStatus.Pending)
            .OrderByDescending(r => r.CreatedAt)
            .FirstOrDefaultAsync(ct);

        if (existing is not null)
        {
            return Ok(new AccountRequestStatusDto(existing.TrackingCode, existing.Email, existing.Status,
                AccessResolver.Label(existing.Status), existing.RejectionReason, existing.CreatedAt, existing.ReviewedAt, false));
        }

        if (await _db.Users.AnyAsync(u => u.Email == email && !u.IsDeleted, ct))
            return Conflict(new ProblemDetails
            {
                Title = "Correo ya registrado",
                Detail = "Ya existe una cuenta con este correo. Inicie sesiÃ³n o recupere su contraseÃ±a.",
                Status = 409,
            });

        // La contraseÃ±a que elige el solicitante se valida y se guarda cifrada en la propia
        // solicitud, para que al aprobarla (en cualquier modo) pueda entrar con la suya.
        if (!string.IsNullOrWhiteSpace(request.Password) && request.Password.Length < 8)
            return BadRequest(new ProblemDetails
            {
                Title = "ContraseÃ±a demasiado corta",
                Detail = "La contraseÃ±a debe tener al menos 8 caracteres.",
                Status = 400,
            });

        var hasher = new PasswordHasher<User>();
        var entity = new AccountRequest
        {
            FullName = request.FullName.Trim(),
            Email = email,
            Phone = (request.Phone ?? string.Empty).Trim(),
            IdNumber = request.IdNumber?.Trim(),
            ClientType = request.ClientType,
            Company = request.Company?.Trim(),
            Message = request.Message?.Trim(),
            Source = AccountRequestSource.App,
            Status = AccountRequestStatus.Pending,
            TrackingCode = await _codes.NextTrackingCodeAsync(ct),
            IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString(),
        };
        if (!string.IsNullOrWhiteSpace(request.Password))
            entity.PasswordHash = hasher.HashPassword(new User { Email = email, FullName = entity.FullName }, request.Password);

        _db.AccountRequests.Add(entity);
        await _db.SaveChangesAsync(ct);

        // Modo configurado por el administrador (Ajustes â†’ Registro de clientes):
        //   Â· automatic â†’ la cuenta se activa al instante, sin visto bueno.
        //   Â· approval  â†’ queda pendiente y aparece en el panel para aprobarla o rechazarla.
        var modo = await _activacion.GetModeAsync(ct);
        if (AccountActivationService.EsAutomatico(modo))
        {
            var resultado = await _activacion.ActivarAsync(entity, ct: ct);

            await _audit.LogAsync("auto-approve", "AccountRequest", entity.Id.ToString(),
                after: new { entity.Email, clientCode = resultado.Client.Code, modo }, ct: ct);

            await _realtime.ToStaffAsync("accountrequest.created", new
            {
                id = entity.Id,
                fullName = entity.FullName,
                email = entity.Email,
                phone = entity.Phone,
                clientType = entity.ClientType.ToString(),
                company = entity.Company,
                trackingCode = entity.TrackingCode,
                autoApproved = true,
                createdAt = entity.CreatedAt,
            }, ct);

            await _notifications.NotifyStaffAsync(NotificationType.System,
                "Cuenta creada automÃ¡ticamente",
                $"{entity.FullName} se registrÃ³ y su cuenta quedÃ³ activa (modo de registro automÃ¡tico).",
                deepLink: $"/admin/clients/{resultado.Client.Id}",
                data: new { accountRequestId = entity.Id, clientId = resultado.Client.Id });

            return Ok(new AccountRequestStatusDto(entity.TrackingCode, entity.Email, entity.Status,
                AccessResolver.Label(entity.Status), null, entity.CreatedAt, entity.ReviewedAt, true,
                AutoApproved: true,
                TemporaryPassword: resultado.PasswordTemporal,
                ClientId: resultado.Client.Id,
                ClientCode: resultado.Client.Code));
        }

        await OnAccountRequestCreatedAsync(entity, ct);

        return Ok(new AccountRequestStatusDto(entity.TrackingCode, entity.Email, entity.Status,
            AccessResolver.Label(entity.Status), null, entity.CreatedAt, null, false));
    }

    /// <summary>Estado de una solicitud de cuenta (consulta desde el app mientras espera aprobaciÃ³n).</summary>
    [HttpGet("account-requests/status")]
    public async Task<ActionResult<AccountRequestStatusDto>> GetAccountRequestStatus([FromQuery] string email, [FromQuery] string? trackingCode, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(email))
            return BadRequest(new ProblemDetails { Title = "Correo requerido", Status = 400 });

        var normalized = email.Trim().ToLowerInvariant();
        var query = _db.AccountRequests.AsNoTracking().Where(r => r.Email == normalized);
        if (!string.IsNullOrWhiteSpace(trackingCode)) query = query.Where(r => r.TrackingCode == trackingCode);

        var request = await query.OrderByDescending(r => r.CreatedAt).FirstOrDefaultAsync(ct);
        if (request is null) return NotFound(new ProblemDetails { Title = "Solicitud no encontrada", Status = 404 });

        var canLogin = await _db.Users.AnyAsync(u => u.Email == normalized && u.Status == UserStatus.Active && !u.IsDeleted, ct);
        var cliente = canLogin
            ? await _db.Clients.AsNoTracking().FirstOrDefaultAsync(c => c.Email == normalized || c.User!.Email == normalized, ct)
            : null;

        return Ok(new AccountRequestStatusDto(request.TrackingCode, request.Email, request.Status,
            AccessResolver.Label(request.Status), request.RejectionReason, request.CreatedAt, request.ReviewedAt,
            canLogin,
            AutoApproved: request.ReviewedByUserId is null && request.Status == AccountRequestStatus.Approved,
            ClientId: request.CreatedClientId,
            ClientCode: cliente?.Code));
    }

    /// <summary>EnvÃ­a una solicitud de cotizaciÃ³n desde la web o el app.</summary>
    [HttpPost("quotes")]
    [EnableRateLimiting("public-write")]
    public async Task<ActionResult<IdResponse>> CreateQuote([FromBody] QuoteCreateRequest request, CancellationToken ct)
    {
        var email = (request.Email ?? string.Empty).Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(request.FullName) || string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(request.Phone))
            return BadRequest(new ProblemDetails { Title = "Datos incompletos", Detail = "Nombre, correo y telÃ©fono son obligatorios.", Status = 400 });

        var quote = new QuoteRequest
        {
            FullName = request.FullName.Trim(),
            Email = email,
            Phone = request.Phone.Trim(),
            Company = request.Company?.Trim(),
            ServiceId = request.ServiceId,
            Message = request.Message?.Trim(),
            Status = QuoteStatus.New,
        };
        _db.QuoteRequests.Add(quote);
        await _db.SaveChangesAsync(ct);

        await _notifications.NotifyStaffAsync(NotificationType.QuoteRequested,
            "Nueva solicitud de cotizaciÃ³n",
            $"{quote.FullName} solicitÃ³ una cotizaciÃ³n ({quote.Email}).",
            deepLink: "/admin/quotes",
            data: new { quoteId = quote.Id });

        await _audit.LogAsync("create", "QuoteRequest", quote.Id.ToString(), after: new { quote.FullName, quote.Email }, ct: ct);

        return Ok(new IdResponse(quote.Id, Message: "Solicitud de cotizaciÃ³n recibida. Le contactaremos a la brevedad."));
    }

    /// <summary>Descarga un documento usando un token firmado (HMAC, 15 minutos) generado por la API.</summary>
    [HttpGet("files/{token}")]
    public async Task<IActionResult> DownloadSigned(string token, CancellationToken ct)
    {
        if (!_storage.TryValidateDownloadToken(token, out var download) || download is null)
            return Unauthorized(new ProblemDetails { Title = "Enlace no vÃ¡lido o expirado", Status = 401 });

        try
        {
            var stream = await _storage.OpenReadAsync(download.StoragePath, ct);
            return File(stream, download.ContentType, download.FileName);
        }
        catch (FileNotFoundException)
        {
            return NotFound(new ProblemDetails { Title = "Archivo no encontrado", Status = 404 });
        }
    }

    private async Task OnAccountRequestCreatedAsync(AccountRequest entity, CancellationToken ct)
    {
        // Aviso inmediato al panel de administraciÃ³n (grupo staff) + notificaciÃ³n persistida.
        await _realtime.ToStaffAsync("accountrequest.created", new
        {
            id = entity.Id,
            fullName = entity.FullName,
            email = entity.Email,
            phone = entity.Phone,
            clientType = entity.ClientType.ToString(),
            company = entity.Company,
            trackingCode = entity.TrackingCode,
            createdAt = entity.CreatedAt,
        }, ct);

        await _notifications.NotifyStaffAsync(NotificationType.System,
            "Nueva solicitud de cuenta",
            $"{entity.FullName} solicitÃ³ crear una cuenta ({entity.Email}). Requiere aprobaciÃ³n.",
            deepLink: "/admin/account-requests",
            data: new { accountRequestId = entity.Id });

        await _audit.LogAsync("create", "AccountRequest", entity.Id.ToString(),
            after: new { entity.FullName, entity.Email, entity.TrackingCode }, ct: ct);
    }
}
