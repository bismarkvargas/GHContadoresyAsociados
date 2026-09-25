using System.Security.Claims;
using GH.Domain.Abstractions;

namespace GH.Api.Services;

/// <summary>Implementación de <see cref="ICurrentUser"/> basada en el HttpContext de la petición.</summary>
public class CurrentUser : ICurrentUser
{
    private readonly IHttpContextAccessor _accessor;

    public CurrentUser(IHttpContextAccessor accessor) => _accessor = accessor;

    private ClaimsPrincipal? Principal => _accessor.HttpContext?.User;

    public Guid? UserId
    {
        get
        {
            var raw = Principal?.FindFirstValue(ClaimTypes.NameIdentifier)
                      ?? Principal?.FindFirstValue("sub");
            return Guid.TryParse(raw, out var id) ? id : null;
        }
    }

    public string? Email => Principal?.FindFirstValue(ClaimTypes.Email);
    public string? FullName => Principal?.FindFirstValue(ClaimTypes.Name);

    public bool IsAuthenticated => Principal?.Identity?.IsAuthenticated ?? false;

    public bool IsStaff => string.Equals(Principal?.FindFirstValue("isStaff"), "true", StringComparison.OrdinalIgnoreCase);

    public Guid? ClientId
    {
        get
        {
            var raw = Principal?.FindFirstValue("clientId");
            return Guid.TryParse(raw, out var id) ? id : null;
        }
    }

    public IReadOnlyCollection<string> Permissions =>
        Principal?.FindAll("perm").Select(c => c.Value).ToArray() ?? Array.Empty<string>();

    public bool HasPermission(string code) =>
        Permissions.Contains("*", StringComparer.OrdinalIgnoreCase) ||
        Permissions.Contains(code, StringComparer.OrdinalIgnoreCase);

    public string? IpAddress => _accessor.HttpContext?.Connection.RemoteIpAddress?.ToString();

    public string? UserAgent
    {
        get
        {
            var ua = _accessor.HttpContext?.Request.Headers.UserAgent.ToString();
            if (string.IsNullOrWhiteSpace(ua)) return null;
            return ua.Length > 300 ? ua[..300] : ua;
        }
    }
}
