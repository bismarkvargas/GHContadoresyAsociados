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

namespace GH.Api.Controllers.Admin;

/// <summary>Solicitudes de cuenta (onboarding del app) y cotizaciones entrantes.</summary>
[ApiController]
[Route("api/v1/admin")]
[Authorize]
public class AdminOnboardingController : ControllerBase
{
    private readonly GhDbContext _db;
    private readonly ICurrentUser _current;
    private readonly ICodeGenerator _codes;
    private readonly IAuditLogger _audit;
    private readonly INotificationService _notifications;
    private readonly IRealtimeNotifier _realtime;
    private readonly PasswordHasher<User> _hasher = new();

    public AdminOnboardingController(GhDbContext db, ICurrentUser current, ICodeGenerator codes, IAuditLogger audit,
        INotificationService notifications, IRealtimeNotifier realtime)
    {
        _db = db;
        _current = current;
        _codes = codes;
        _audit = audit;
        _notifications = notifications;
        _realtime = realtime;
    }

    // ------------------------------------------------------------------ solicitudes de cuenta
    [HttpGet("account-requests")]
    [HasPermission("accountrequests.view")]
    public async Task<ActionResult<PagedResult<AccountRequestDto>>> List(
        [FromQuery] AccountRequestStatus? status, [FromQuery] string? search,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        var query = _db.AccountRequests.AsNoTracking().Include(r => r.ReviewedByUser).Include(r => r.CreatedClient).AsQueryable();

        if (status.HasValue) query = query.Where(r => r.Status == status);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(r => r.FullName.Contains(term) || r.Email.Contains(term)
                                     || r.Phone.Contains(term) || r.TrackingCode.Contains(term));
        }

        var paged = await query.OrderByDescending(r => r.CreatedAt).ToPagedResultAsync(page, pageSize, ct);
        var items = paged.Items.Select(r => AccountRequestDto.From(r, r.ReviewedByUser?.FullName, r.CreatedClient?.Code)).ToList();
        return Ok(new PagedResult<AccountRequestDto>(items, paged.Total, paged.Page, paged.PageSize));
    }

    [HttpGet("account-requests/pending-count")]
    [HasPermission("accountrequests.view")]
    public async Task<ActionResult<object>> PendingCount(CancellationToken ct)
        => Ok(new { count = await _db.AccountRequests.CountAsync(r => r.Status == AccountRequestStatus.Pending, ct) });

    [HttpGet("account-requests/{id:guid}")]
    [HasPermission("accountrequests.view")]
    public async Task<ActionResult<AccountRequestDto>> Detail(Guid id, CancellationToken ct)
    {
        var request = await _db.AccountRequests.AsNoTracking().Include(r => r.ReviewedByUser).Include(r => r.CreatedClient)
            .FirstOrDefaultAsync(r => r.Id == id, ct)
            ?? throw new KeyNotFoundException("Solicitud no encontrada.");
        return Ok(AccountRequestDto.From(request, request.ReviewedByUser?.FullName, request.CreatedClient?.Code));
    }

    /// <summary>
    /// Aprueba la solicitud: crea el usuario cliente (activo), su ficha en el CRM y le
    /// envía la notificación push de bienvenida. Es el único camino para activar una cuenta.
    /// </summary>
    [HttpPost("account-requests/{id:guid}/approve")]
    [HasPermission("accountrequests.approve")]
    public async Task<ActionResult<object>> Approve(Guid id, [FromBody] ApproveAccountRequestRequest? request, CancellationToken ct)
    {
        var accountRequest = await _db.AccountRequests.FirstOrDefaultAsync(r => r.Id == id, ct)
            ?? throw new KeyNotFoundException("Solicitud no encontrada.");

        if (accountRequest.Status == AccountRequestStatus.Approved)
            throw new InvalidOperationException("Esta solicitud ya fue aprobada.");

        var email = accountRequest.Email.Trim().ToLowerInvariant();
        var existingUser = await _db.Users.FirstOrDefaultAsync(u => u.Email == email, ct);

        User user;
        if (existingUser is not null)
        {
            user = existingUser;
            user.Status = UserStatus.Active;
            user.IsDeleted = false;
            user.UpdatedAt = DateTime.UtcNow;
        }
        else
        {
            user = new User
            {
                Email = email,
                FullName = accountRequest.FullName,
                Phone = accountRequest.Phone,
                IdNumber = accountRequest.IdNumber,
                Status = UserStatus.Active,
                IsStaff = false,
            };
            user.PasswordHash = _hasher.HashPassword(user, "Gh.Cliente2026");
            _db.Users.Add(user);
            await _db.SaveChangesAsync(ct);
        }

        // Ficha de cliente en el CRM vinculada a la cuenta del app.
        var client = await _db.Clients.FirstOrDefaultAsync(c => c.UserId == user.Id && !c.IsDeleted, ct);
        if (client is null)
        {
            client = new Client
            {
                Code = await _codes.NextClientCodeAsync(ct),
                ClientType = request?.ClientType ?? accountRequest.ClientType,
                LegalName = string.IsNullOrWhiteSpace(accountRequest.Company) ? accountRequest.FullName : accountRequest.Company!,
                TradeName = accountRequest.Company,
                IdNumber = accountRequest.IdNumber,
                Email = email,
                Phone = accountRequest.Phone,
                Whatsapp = accountRequest.Phone,
                Country = "Costa Rica",
                Status = ClientStatus.Active,
                Source = accountRequest.Source == AccountRequestSource.Web ? ClientSource.Web : ClientSource.App,
                Notes = accountRequest.Message,
                TagsCsv = request?.Tags,
                AssignedToUserId = request?.AssignedToUserId ?? _current.UserId,
                UserId = user.Id,
                LastContactAt = DateTime.UtcNow,
            };
            _db.Clients.Add(client);
            await _db.SaveChangesAsync(ct);
        }

        user.ClientId = client.Id;

        var roleId = request?.RoleId;
        Role? role;
        if (roleId.HasValue)
            role = await _db.Roles.FirstOrDefaultAsync(r => r.Id == roleId, ct);
        else
            role = await _db.Roles.FirstOrDefaultAsync(r => r.Name == "Cliente", ct);

        if (role is not null && !await _db.UserRoles.AnyAsync(ur => ur.UserId == user.Id && ur.RoleId == role.Id, ct))
            _db.UserRoles.Add(new UserRole { UserId = user.Id, RoleId = role.Id });

        accountRequest.Status = AccountRequestStatus.Approved;
        accountRequest.ReviewedByUserId = _current.UserId;
        accountRequest.ReviewedAt = DateTime.UtcNow;
        accountRequest.CreatedUserId = user.Id;
        accountRequest.CreatedClientId = client.Id;
        accountRequest.RejectionReason = null;

        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("approve", "AccountRequest", accountRequest.Id.ToString(),
            after: new { accountRequest.Email, clientCode = client.Code, userId = user.Id }, ct: ct);

        await _notifications.NotifyUserAsync(user.Id, NotificationType.AccountApproved,
            "¡Su cuenta fue aprobada!",
            request?.WelcomeMessage ?? "Ya puede iniciar sesión y consultar sus expedientes, documentos y pedidos desde el app.",
            deepLink: "/home",
            data: new { clientId = client.Id, clientCode = client.Code }, ct: ct);

        await _realtime.ToStaffAsync("accountrequest.approved", new
        {
            accountRequestId = accountRequest.Id, email, userId = user.Id, clientId = client.Id,
            clientCode = client.Code, at = DateTime.UtcNow,
        }, ct);

        // El app que está esperando en la pantalla de seguimiento recibe el cambio al instante.
        await _realtime.ToUserAsync(user.Id, "account.approved", new { clientId = client.Id, clientCode = client.Code, canLogin = true }, ct);

        return Ok(new
        {
            message = "Solicitud aprobada. El cliente ya puede iniciar sesión.",
            userId = user.Id,
            clientId = client.Id,
            clientCode = client.Code,
            temporaryPassword = existingUser is null ? "Gh.Cliente2026" : null,
        });
    }

    [HttpPost("account-requests/{id:guid}/reject")]
    [HasPermission("accountrequests.reject")]
    public async Task<ActionResult<object>> Reject(Guid id, [FromBody] RejectAccountRequestRequest request, CancellationToken ct)
    {
        var accountRequest = await _db.AccountRequests.FirstOrDefaultAsync(r => r.Id == id, ct)
            ?? throw new KeyNotFoundException("Solicitud no encontrada.");

        if (string.IsNullOrWhiteSpace(request.Reason))
            throw new ArgumentException("Indique el motivo del rechazo.");

        accountRequest.Status = AccountRequestStatus.Rejected;
        accountRequest.RejectionReason = request.Reason.Trim();
        accountRequest.ReviewedByUserId = _current.UserId;
        accountRequest.ReviewedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("reject", "AccountRequest", accountRequest.Id.ToString(), after: new { request.Reason }, ct: ct);

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == accountRequest.Email, ct);
        if (user is not null)
        {
            user.Status = UserStatus.Rejected;
            user.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(ct);

            await _notifications.NotifyUserAsync(user.Id, NotificationType.AccountRejected,
                "Solicitud de cuenta no aprobada",
                $"Su solicitud no fue aprobada. Motivo: {request.Reason}",
                deepLink: "/account-status",
                data: new { accountRequestId = accountRequest.Id }, ct: ct);
        }

        await _realtime.ToStaffAsync("accountrequest.rejected", new
        {
            accountRequestId = accountRequest.Id, email = accountRequest.Email, at = DateTime.UtcNow,
        }, ct);

        return Ok(new { message = "Solicitud rechazada.", reason = request.Reason });
    }

    /// <summary>Reapertura una solicitud rechazada para volver a revisarla.</summary>
    [HttpPost("account-requests/{id:guid}/reopen")]
    [HasPermission("accountrequests.approve")]
    public async Task<ActionResult<object>> Reopen(Guid id, CancellationToken ct)
    {
        var accountRequest = await _db.AccountRequests.FirstOrDefaultAsync(r => r.Id == id, ct)
            ?? throw new KeyNotFoundException("Solicitud no encontrada.");

        accountRequest.Status = AccountRequestStatus.Pending;
        accountRequest.RejectionReason = null;
        accountRequest.ReviewedAt = null;
        accountRequest.ReviewedByUserId = null;
        await _db.SaveChangesAsync(ct);

        return Ok(new { message = "Solicitud reabierta." });
    }

    // ------------------------------------------------------------------ cotizaciones
    [HttpGet("quotes")]
    [HasPermission("quotes.view")]
    public async Task<ActionResult<PagedResult<QuoteDto>>> Quotes(
        [FromQuery] QuoteStatus? status, [FromQuery] string? search,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        var query = _db.QuoteRequests.AsNoTracking().Include(q => q.Service).Include(q => q.HandledByUser).Include(q => q.Client).AsQueryable();

        if (status.HasValue) query = query.Where(q => q.Status == status);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(q => q.FullName.Contains(term) || q.Email.Contains(term) || q.Phone.Contains(term));
        }

        var paged = await query.OrderByDescending(q => q.CreatedAt).ToPagedResultAsync(page, pageSize, ct);
        var items = paged.Items.Select(q => QuoteDto.From(q, q.Service?.Name, q.HandledByUser?.FullName, q.Client?.LegalName)).ToList();
        return Ok(new PagedResult<QuoteDto>(items, paged.Total, paged.Page, paged.PageSize));
    }

    [HttpPatch("quotes/{id:guid}")]
    [HasPermission("quotes.edit")]
    public async Task<ActionResult<QuoteDto>> UpdateQuote(Guid id, [FromBody] QuoteUpdateRequest request, CancellationToken ct)
    {
        var quote = await _db.QuoteRequests.Include(q => q.Service).Include(q => q.HandledByUser).Include(q => q.Client)
            .FirstOrDefaultAsync(q => q.Id == id, ct)
            ?? throw new KeyNotFoundException("Cotización no encontrada.");

        quote.Status = request.Status;
        quote.InternalNotes = request.InternalNotes?.Trim();
        quote.HandledByUserId = _current.UserId;
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("update", "QuoteRequest", quote.Id.ToString(), after: new { Status = request.Status.ToString() }, ct: ct);

        return Ok(QuoteDto.From(quote, quote.Service?.Name, quote.HandledByUser?.FullName, quote.Client?.LegalName));
    }

    /// <summary>Convierte una cotización en cliente del CRM.</summary>
    [HttpPost("quotes/{id:guid}/convert")]
    [HasPermission("quotes.convert")]
    public async Task<ActionResult<object>> ConvertQuote(Guid id, CancellationToken ct)
    {
        var quote = await _db.QuoteRequests.FirstOrDefaultAsync(q => q.Id == id, ct)
            ?? throw new KeyNotFoundException("Cotización no encontrada.");

        if (quote.ClientId.HasValue)
            return Ok(new { message = "Esta cotización ya está vinculada a un cliente.", clientId = quote.ClientId });

        var client = new Client
        {
            Code = await _codes.NextClientCodeAsync(ct),
            ClientType = string.IsNullOrWhiteSpace(quote.Company) ? ClientType.Individual : ClientType.Company,
            LegalName = string.IsNullOrWhiteSpace(quote.Company) ? quote.FullName : quote.Company!,
            TradeName = quote.Company,
            Email = quote.Email,
            Phone = quote.Phone,
            Whatsapp = quote.Phone,
            Country = "Costa Rica",
            Status = ClientStatus.Lead,
            Source = ClientSource.Web,
            AssignedToUserId = _current.UserId,
            Notes = quote.Message,
            LastContactAt = DateTime.UtcNow,
        };
        _db.Clients.Add(client);
        await _db.SaveChangesAsync(ct);

        quote.ClientId = client.Id;
        quote.Status = QuoteStatus.Converted;
        quote.HandledByUserId = _current.UserId;
        await _db.SaveChangesAsync(ct);

        await _audit.LogAsync("convert", "QuoteRequest", quote.Id.ToString(), after: new { clientId = client.Id, client.Code }, ct: ct);
        await _realtime.ToStaffAsync("client.created", new { clientId = client.Id, code = client.Code, legalName = client.LegalName }, ct);

        return Ok(new { message = "Cotización convertida en cliente.", clientId = client.Id, clientCode = client.Code });
    }
}
