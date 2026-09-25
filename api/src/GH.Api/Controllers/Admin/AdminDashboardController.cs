using GH.Api.Auth;
using GH.Api.Contracts;
using GH.Api.Services;
using GH.Domain;
using GH.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaskStatus = GH.Domain.TaskStatus;

namespace GH.Api.Controllers.Admin;

/// <summary>Panel de control y explotación de datos del negocio.</summary>
[ApiController]
[Route("api/v1/admin")]
[Authorize]
public class AdminDashboardController : ControllerBase
{
    private readonly GhDbContext _db;

    public AdminDashboardController(GhDbContext db) => _db = db;

    private static DateTime MonthStart(int offsetMonths = 0)
    {
        var now = DateTime.UtcNow;
        return new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(offsetMonths);
    }

    /// <summary>Indicadores del dashboard con actividad reciente para el panel en vivo.</summary>
    [HttpGet("dashboard/summary")]
    [HasPermission("reports.view")]
    public async Task<ActionResult<DashboardSummaryDto>> Summary(CancellationToken ct)
    {
        var monthStart = MonthStart();
        var lastMonthStart = MonthStart(-1);

        var activeClients = await _db.Clients.CountAsync(c => !c.IsDeleted && c.Status == ClientStatus.Active, ct);
        var newClients = await _db.Clients.CountAsync(c => !c.IsDeleted && c.CreatedAt >= monthStart, ct);
        var openCases = await _db.CaseFiles.CountAsync(c => !c.IsDeleted
            && (c.Status == CaseStatus.Open || c.Status == CaseStatus.InProgress
                || c.Status == CaseStatus.WaitingClient || c.Status == CaseStatus.OnHold), ct);
        var overdueTasks = await _db.CaseTasks.CountAsync(t => t.DueAt != null && t.DueAt < DateTime.UtcNow
            && (t.Status == TaskStatus.Todo || t.Status == TaskStatus.InProgress || t.Status == TaskStatus.Blocked), ct);
        var pendingRequests = await _db.AccountRequests.CountAsync(r => r.Status == AccountRequestStatus.Pending, ct);
        var newQuotes = await _db.QuoteRequests.CountAsync(q => q.Status == QuoteStatus.New, ct);

        var paidThisMonth = await _db.Orders.AsNoTracking()
            .Where(o => o.CreatedAt >= monthStart && (o.Status == OrderStatus.Paid || o.Status == OrderStatus.InProcess || o.Status == OrderStatus.Completed))
            .ToListAsync(ct);
        var paidLastMonth = await _db.Orders.AsNoTracking()
            .Where(o => o.CreatedAt >= lastMonthStart && o.CreatedAt < monthStart
                        && (o.Status == OrderStatus.Paid || o.Status == OrderStatus.InProcess || o.Status == OrderStatus.Completed))
            .ToListAsync(ct);

        var ordersThisMonth = await _db.Orders.CountAsync(o => o.CreatedAt >= monthStart, ct);
        var unreadMessages = await _db.Messages.CountAsync(m => m.IsFromClient && m.ReadByStaffAt == null, ct);
        var documentsThisMonth = await _db.Documents.CountAsync(d => !d.IsDeleted && d.UploadedAt >= monthStart, ct);

        // Ventas de los últimos 6 meses.
        var since = MonthStart(-5);
        var ordersForChart = await _db.Orders.AsNoTracking()
            .Where(o => o.CreatedAt >= since)
            .Select(o => new { o.CreatedAt, o.Total, o.Status })
            .ToListAsync(ct);

        var salesByMonth = Enumerable.Range(0, 6).Select(i =>
        {
            var start = MonthStart(-5 + i);
            var end = start.AddMonths(1);
            var slice = ordersForChart.Where(o => o.CreatedAt >= start && o.CreatedAt < end).ToList();
            var paid = slice.Where(o => o.Status is OrderStatus.Paid or OrderStatus.InProcess or OrderStatus.Completed).ToList();
            return new SalesPointDto(start.ToString("MMM yyyy"), paid.Sum(o => o.Total), paid.Count);
        }).ToList();

        var cases = await _db.CaseFiles.AsNoTracking().Where(c => !c.IsDeleted)
            .Select(c => new { c.Status, c.Matter }).ToListAsync(ct);
        var ordersAll = await _db.Orders.AsNoTracking().Select(o => o.Status).ToListAsync(ct);

        var casesByStatus = cases.GroupBy(c => c.Status)
            .Select(g => new NameCountDto(AccessResolver.Label(g.Key), g.Key.ToString(), g.Count())).ToList();
        var casesByMatter = cases.GroupBy(c => c.Matter)
            .Select(g => new NameCountDto(MatterLabel(g.Key), g.Key.ToString(), g.Count())).ToList();
        var ordersByStatus = ordersAll.GroupBy(s => s)
            .Select(g => new NameCountDto(AccessResolver.Label(g.Key), g.Key.ToString(), g.Count())).ToList();
        var leadsBySource = await _db.Clients.AsNoTracking().Where(c => !c.IsDeleted)
            .GroupBy(c => c.Source).Select(g => new NameCountDto(g.Key.ToString(), g.Key.ToString(), g.Count(), null))
            .ToListAsync(ct);

        // Actividad reciente combinada.
        var activity = new List<RecentActivityDto>();
        var recentEvents = await _db.CaseEvents.AsNoTracking().Include(e => e.CaseFile).Include(e => e.ActorUser)
            .OrderByDescending(e => e.CreatedAt).Take(10).ToListAsync(ct);
        activity.AddRange(recentEvents.Select(e => new RecentActivityDto(
            e.Id.ToString(), "case", e.Title, e.CaseFile?.Code, e.ActorUser?.FullName ?? e.ActorName, e.CreatedAt,
            $"/admin/cases/{e.CaseFileId}")));

        var recentOrders = await _db.Orders.AsNoTracking().Include(o => o.Client)
            .OrderByDescending(o => o.CreatedAt).Take(6).ToListAsync(ct);
        activity.AddRange(recentOrders.Select(o => new RecentActivityDto(
            o.Id.ToString(), "order", $"Pedido {o.Number} · {o.Total:N2} {o.Currency}",
            AccessResolver.Label(o.Status), o.CustomerName ?? o.Client?.LegalName, o.CreatedAt, $"/admin/orders/{o.Id}")));

        var recentRequests = await _db.AccountRequests.AsNoTracking()
            .Where(r => r.Status == AccountRequestStatus.Pending)
            .OrderByDescending(r => r.CreatedAt).Take(6).ToListAsync(ct);
        activity.AddRange(recentRequests.Select(r => new RecentActivityDto(
            r.Id.ToString(), "account-request", $"Solicitud de cuenta: {r.FullName}", r.Email, null, r.CreatedAt,
            "/admin/account-requests")));

        return Ok(new DashboardSummaryDto(
            activeClients, newClients, openCases, overdueTasks, pendingRequests, newQuotes,
            paidThisMonth.Sum(o => o.Total), paidLastMonth.Sum(o => o.Total),
            ordersThisMonth, paidThisMonth.Count, unreadMessages, documentsThisMonth,
            salesByMonth, casesByStatus, casesByMatter, ordersByStatus,
            activity.OrderByDescending(a => a.At).Take(15).ToList(), leadsBySource));
    }

    private static string MatterLabel(CaseMatter matter) => matter switch
    {
        CaseMatter.Contable => "Contable",
        CaseMatter.Tributario => "Tributario",
        CaseMatter.Legal => "Legal",
        CaseMatter.Municipal => "Municipal",
        CaseMatter.Laboral => "Laboral",
        _ => "Otro",
    };

    [HttpGet("reports/sales")]
    [HasPermission("reports.view")]
    public async Task<ActionResult<SalesReportDto>> Sales([FromQuery] DateTime? from, [FromQuery] DateTime? to, CancellationToken ct)
    {
        var start = from ?? MonthStart(-11);
        var end = to ?? DateTime.UtcNow.AddDays(1);

        var orders = await _db.Orders.AsNoTracking().Include(o => o.Items).ThenInclude(i => i.Product).ThenInclude(p => p.Category)
            .Where(o => o.CreatedAt >= start && o.CreatedAt < end).ToListAsync(ct);

        var paid = orders.Where(o => o.Status is OrderStatus.Paid or OrderStatus.InProcess or OrderStatus.Completed).ToList();

        var byMonth = paid.GroupBy(o => new { o.CreatedAt.Year, o.CreatedAt.Month })
            .OrderBy(g => g.Key.Year).ThenBy(g => g.Key.Month)
            .Select(g => new SalesPointDto(new DateTime(g.Key.Year, g.Key.Month, 1).ToString("MMM yyyy"), g.Sum(o => o.Total), g.Count()))
            .ToList();

        var items = paid.SelectMany(o => o.Items).ToList();
        var byCategory = items.GroupBy(i => i.Product?.Category?.Name ?? "Sin categoría")
            .Select(g => new NameCountDto(g.Key, null, g.Sum(i => i.Quantity), g.Sum(i => i.Total))).ToList();
        var topProducts = items.GroupBy(i => i.NameSnapshot)
            .Select(g => new NameCountDto(g.Key, null, g.Sum(i => i.Quantity), g.Sum(i => i.Total)))
            .OrderByDescending(x => x.Amount).Take(15).ToList();
        var byStatus = orders.GroupBy(o => o.Status)
            .Select(g => new NameCountDto(AccessResolver.Label(g.Key), g.Key.ToString(), g.Count(), g.Sum(o => o.Total))).ToList();

        return Ok(new SalesReportDto(
            paid.Sum(o => o.Total),
            orders.Count,
            paid.Count == 0 ? 0 : paid.Sum(o => o.Total) / paid.Count,
            byMonth, byCategory, topProducts, byStatus));
    }

    [HttpGet("reports/cases")]
    [HasPermission("reports.view")]
    public async Task<ActionResult<CaseReportDto>> Cases(CancellationToken ct)
    {
        var cases = await _db.CaseFiles.AsNoTracking().Include(c => c.ResponsibleUser).Where(c => !c.IsDeleted).ToListAsync(ct);
        var tasks = await _db.CaseTasks.AsNoTracking().ToListAsync(ct);

        var closed = cases.Where(c => c.ClosedAt.HasValue).ToList();
        var avgDays = closed.Count == 0 ? 0 : closed.Average(c => (c.ClosedAt!.Value - c.OpenedAt).TotalDays);

        var byResponsible = cases.GroupBy(c => new { c.ResponsibleUserId, Name = c.ResponsibleUser?.FullName ?? "Sin asignar" })
            .Select(g => new WorkerLoadDto(
                g.Key.ResponsibleUserId ?? Guid.Empty,
                g.Key.Name,
                g.Count(c => c.Status is CaseStatus.Open or CaseStatus.InProgress or CaseStatus.WaitingClient or CaseStatus.OnHold),
                tasks.Count(t => cases.Where(c => c.Id == t.CaseFileId && c.ResponsibleUserId == g.Key.ResponsibleUserId).Any()
                                 && (t.Status is TaskStatus.Todo or TaskStatus.InProgress)),
                tasks.Count(t => t.DueAt.HasValue && t.DueAt < DateTime.UtcNow
                                 && cases.Where(c => c.Id == t.CaseFileId && c.ResponsibleUserId == g.Key.ResponsibleUserId).Any()
                                 && (t.Status is TaskStatus.Todo or TaskStatus.InProgress or TaskStatus.Blocked)),
                tasks.Count(t => t.Status == TaskStatus.Done && t.CompletedAt.HasValue && t.CompletedAt >= MonthStart()
                                 && cases.Where(c => c.Id == t.CaseFileId && c.ResponsibleUserId == g.Key.ResponsibleUserId).Any())))
            .OrderByDescending(w => w.OpenCases).ToList();

        return Ok(new CaseReportDto(
            cases.Count,
            cases.Count(c => c.Status is CaseStatus.Open or CaseStatus.InProgress or CaseStatus.WaitingClient or CaseStatus.OnHold),
            cases.Count(c => c.DueAt.HasValue && c.DueAt < DateTime.UtcNow
                             && c.Status != CaseStatus.Completed && c.Status != CaseStatus.Closed && c.Status != CaseStatus.Cancelled),
            Math.Round(avgDays, 1),
            cases.GroupBy(c => c.Status).Select(g => new NameCountDto(AccessResolver.Label(g.Key), g.Key.ToString(), g.Count())).ToList(),
            cases.GroupBy(c => c.Matter).Select(g => new NameCountDto(MatterLabel(g.Key), g.Key.ToString(), g.Count())).ToList(),
            cases.GroupBy(c => c.Entity).Select(g => new NameCountDto(g.Key.ToString(), g.Key.ToString(), g.Count())).ToList(),
            byResponsible));
    }

    [HttpGet("reports/productivity")]
    [HasPermission("reports.view")]
    public async Task<ActionResult<ProductivityReportDto>> Productivity(CancellationToken ct)
    {
        var staff = await _db.Users.AsNoTracking().Where(u => u.IsStaff && !u.IsDeleted)
            .Select(u => new { u.Id, u.FullName }).ToListAsync(ct);

        var cases = await _db.CaseFiles.AsNoTracking().Where(c => !c.IsDeleted).ToListAsync(ct);
        var tasks = await _db.CaseTasks.AsNoTracking().ToListAsync(ct);
        var since = MonthStart(-5);

        var workers = staff.Select(s => new WorkerLoadDto(
            s.Id, s.FullName,
            cases.Count(c => c.ResponsibleUserId == s.Id && (c.Status is CaseStatus.Open or CaseStatus.InProgress or CaseStatus.WaitingClient or CaseStatus.OnHold)),
            tasks.Count(t => t.AssignedToUserId == s.Id && (t.Status is TaskStatus.Todo or TaskStatus.InProgress)),
            tasks.Count(t => t.AssignedToUserId == s.Id && t.DueAt.HasValue && t.DueAt < DateTime.UtcNow
                             && (t.Status is TaskStatus.Todo or TaskStatus.InProgress or TaskStatus.Blocked)),
            tasks.Count(t => t.AssignedToUserId == s.Id && t.Status == TaskStatus.Done && t.CompletedAt.HasValue && t.CompletedAt >= MonthStart())))
            .OrderByDescending(w => w.CompletedThisMonth).ToList();

        var byMonth = Enumerable.Range(0, 6).Select(i =>
        {
            var start = MonthStart(-5 + i);
            var end = start.AddMonths(1);
            var done = tasks.Count(t => t.Status == TaskStatus.Done && t.CompletedAt >= start && t.CompletedAt < end);
            return new SalesPointDto(start.ToString("MMM yyyy"), done, done);
        }).ToList();

        return Ok(new ProductivityReportDto(workers, byMonth));
    }
}
