using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Options;

namespace GH.Api.Auth;

/// <summary>Prefijo de las políticas de autorización generadas dinámicamente.</summary>
public static class PermissionPolicy
{
    public const string Prefix = "perm:";
    public static string For(string permission) => Prefix + permission;
}

/// <summary>Exige un permiso granular concreto, p. ej. [HasPermission("clients.create")].</summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = true)]
public class HasPermissionAttribute : AuthorizeAttribute
{
    public HasPermissionAttribute(string permission) : base(PermissionPolicy.For(permission)) { }
}

public class PermissionRequirement : IAuthorizationRequirement
{
    public string Permission { get; }
    public PermissionRequirement(string permission) => Permission = permission;
}

/// <summary>
/// Genera una política por cada permiso solicitado (no hace falta declararlas a mano):
/// cualquier política "perm:modulo.accion" se resuelve a un PermissionRequirement.
/// </summary>
public class PermissionPolicyProvider : IAuthorizationPolicyProvider
{
    private readonly DefaultAuthorizationPolicyProvider _fallback;

    public PermissionPolicyProvider(IOptions<AuthorizationOptions> options) => _fallback = new DefaultAuthorizationPolicyProvider(options);

    public Task<AuthorizationPolicy> GetDefaultPolicyAsync() => _fallback.GetDefaultPolicyAsync();

    public Task<AuthorizationPolicy?> GetFallbackPolicyAsync() => _fallback.GetFallbackPolicyAsync();

    public Task<AuthorizationPolicy?> GetPolicyAsync(string policyName)
    {
        if (policyName.StartsWith(PermissionPolicy.Prefix, StringComparison.OrdinalIgnoreCase))
        {
            var permission = policyName[PermissionPolicy.Prefix.Length..];
            var policy = new AuthorizationPolicyBuilder()
                .RequireAuthenticatedUser()
                .AddRequirements(new PermissionRequirement(permission))
                .Build();
            return Task.FromResult<AuthorizationPolicy?>(policy);
        }
        return _fallback.GetPolicyAsync(policyName);
    }
}

/// <summary>
/// Concede el acceso si el token incluye el permiso exigido. El rol SuperAdmin
/// (o un token con el permiso comodín "*") tiene acceso total.
/// </summary>
public class PermissionAuthorizationHandler : AuthorizationHandler<PermissionRequirement>
{
    protected override Task HandleRequirementAsync(AuthorizationHandlerContext context, PermissionRequirement requirement)
    {
        var permissions = context.User.FindAll("perm").Select(c => c.Value).ToList();

        if (permissions.Contains("*", StringComparer.OrdinalIgnoreCase) ||
            permissions.Contains(requirement.Permission, StringComparer.OrdinalIgnoreCase) ||
            context.User.IsInRole("SuperAdmin"))
        {
            context.Succeed(requirement);
        }

        return Task.CompletedTask;
    }
}
