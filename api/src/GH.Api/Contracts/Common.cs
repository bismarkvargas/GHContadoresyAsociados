namespace GH.Api.Contracts;

/// <summary>Resultado paginado estándar de todos los listados.</summary>
public record PagedResult<T>(IReadOnlyList<T> Items, int Total, int Page, int PageSize)
{
    public int TotalPages => PageSize <= 0 ? 0 : (int)Math.Ceiling(Total / (double)PageSize);
    public bool HasNext => Page * PageSize < Total;
    public bool HasPrevious => Page > 1;
}

public record IdResponse(Guid Id, string? Code = null, string? Number = null, string? Message = null);

public record OperationResponse(bool Success, string Message);

/// <summary>Entrada del historial unificado de un cliente (CRM + expedientes + ventas).</summary>
public record TimelineItemDto(
    string Id,
    string Kind,
    string Title,
    string? Description,
    DateTime At,
    string? Actor,
    Guid? CaseFileId = null,
    string? CaseFileCode = null,
    string? Icon = null);

public static class QueryableExtensions
{
    public static async Task<PagedResult<T>> ToPagedResultAsync<T>(
        this IQueryable<T> query, int page, int pageSize, CancellationToken ct = default)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize is < 1 or > 200 ? 20 : pageSize;
        var total = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.CountAsync(query, ct);
        var items = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.ToListAsync(
            query.Skip((page - 1) * pageSize).Take(pageSize), ct);
        return new PagedResult<T>(items, total, page, pageSize);
    }
}
