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

/// <summary>Usuarios, roles y permisos: el administrador controla quién puede hacer qué
/// tanto en el panel como en el app.</summary>
[ApiController]
[Route("api/v1/admin")]
[Authorize]
public class AdminAccessController : ControllerBase
{
    private readonly GhDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditLogger _audit;
    private readonly IRealtimeNotifier _realtime;
    private readonly INotificationService _notifications;
    private readonly PasswordHasher<User> _hasher = new();

    public AdminAccessController(GhDbContext db, ICurrentUser current, IAuditLogger audit,
        IRealtimeNotifier realtime, INotificationService notifications)
    {
        _db = db;
        _current = current;
        _audit = audit;
        _realtime = realtime;
        _notifications = notifications;
    }

    // ------------------------------------------------------------------ permisos
    [HttpGet("permissions")]
    [HasPermission("roles.view")]
    public async Task<ActionResult<IReadOnlyList<PermissionDto>>> Permissions(CancellationToken ct)
    {
        var permissions = await _db.Permissions.AsNoTracking().OrderBy(p => p.Module).ThenBy(p => p.SortOrder).ToListAsync(ct);
        return Ok(permissions.Select(p => new PermissionDto(p.Id, p.Code, p.Module, p.Action, p.Description, p.SortOrder)).ToList());
    }

    // ------------------------------------------------------------------ roles
    [HttpGet("roles")]
    [HasPermission("roles.view")]
    public async Task<ActionResult<IReadOnlyList<RoleDto>>> Roles(CancellationToken ct)
    {
        var roles = await _db.Roles.AsNoTracking().Include(r => r.RolePermissions).ThenInclude(rp => rp.Permission).ToListAsync(ct);
        var counts = await _db.UserRoles.AsNoTracking().GroupBy(ur => ur.RoleId)
            .Select(g => new { RoleId = g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.RoleId, x => x.Count, ct);

        return Ok(roles.Select(r => new RoleDto(r.Id, r.Name, r.Description, r.IsSystem, r.IsStaffRole,
            counts.GetValueOrDefault(r.Id), r.RolePermissions.Select(rp => rp.Permission.Code).OrderBy(c => c).ToList())).ToList());
    }

    [HttpPost("roles")]
    [HasPermission("roles.create")]
    public async Task<ActionResult<RoleDto>> CreateRole([FromBody] RoleUpsertRequest request, CancellationToken ct)
    {
        if (await _db.Roles.AnyAsync(r => r.Name == request.Name, ct))
            throw new InvalidOperationException("Ya existe un rol con ese nombre.");

        var role = new Role
        {
            Name = request.Name.Trim(),
            Description = request.Description?.Trim(),
            IsStaffRole = request.IsStaffRole,
            IsSystem = false,
        };
        _db.Roles.Add(role);
        await _db.SaveChangesAsync(ct);

        await ApplyPermissionsAsync(role.Id, request.PermissionCodes, ct);
        await _audit.LogAsync("create", "Role", role.Id.ToString(), after: new { role.Name }, ct: ct);

        var permissions = await _db.RolePermissions.AsNoTracking().Where(rp => rp.RoleId == role.Id)
            .Select(rp => rp.Permission.Code).ToListAsync(ct);
        return Ok(new RoleDto(role.Id, role.Name, role.Description, role.IsSystem, role.IsStaffRole, 0, permissions));
    }

    [HttpPut("roles/{id:guid}")]
    [HasPermission("roles.edit")]
    public async Task<ActionResult<RoleDto>> UpdateRole(Guid id, [FromBody] RoleUpsertRequest request, CancellationToken ct)
    {
        var role = await _db.Roles.FirstOrDefaultAsync(r => r.Id == id, ct)
            ?? throw new KeyNotFoundException("Rol no encontrado.");

        if (role.IsSystem && !string.Equals(role.Name, request.Name.Trim(), StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("No se puede renombrar un rol de sistema.");
        if (await _db.Roles.AnyAsync(r => r.Name == request.Name && r.Id != id, ct))
            throw new InvalidOperationException("Ya existe un rol con ese nombre.");

        role.Name = role.IsSystem ? role.Name : request.Name.Trim();
        role.Description = request.Description?.Trim();
        role.IsStaffRole = request.IsStaffRole;
        await _db.SaveChangesAsync(ct);

        await ApplyPermissionsAsync(role.Id, request.PermissionCodes, ct);
        await _audit.LogAsync("update", "Role", role.Id.ToString(), after: new { role.Name, Permissions = request.PermissionCodes.Count }, ct: ct);

        var permissions = await _db.RolePermissions.AsNoTracking().Where(rp => rp.RoleId == role.Id)
            .Select(rp => rp.Permission.Code).ToListAsync(ct);
        var users = await _db.UserRoles.CountAsync(ur => ur.RoleId == role.Id, ct);

        // Los usuarios con este rol refrescan sus permisos al instante (app y admin).
        await NotifyRoleChangeAsync(role.Id, ct);

        return Ok(new RoleDto(role.Id, role.Name, role.Description, role.IsSystem, role.IsStaffRole, users, permissions));
    }

    [HttpDelete("roles/{id:guid}")]
    [HasPermission("roles.delete")]
    public async Task<IActionResult> DeleteRole(Guid id, CancellationToken ct)
    {
        var role = await _db.Roles.FirstOrDefaultAsync(r => r.Id == id, ct)
            ?? throw new KeyNotFoundException("Rol no encontrado.");

        if (role.IsSystem) throw new InvalidOperationException("Los roles de sistema no se pueden eliminar.");
        if (await _db.UserRoles.AnyAsync(ur => ur.RoleId == id, ct))
            throw new InvalidOperationException("Hay usuarios con este rol asignado. Reasígnelos antes de eliminarlo.");

        await _db.Roles.Where(r => r.Id == id).ExecuteDeleteAsync(ct);
        await _audit.LogAsync("delete", "Role", id.ToString(), before: new { role.Name }, ct: ct);
        return NoContent();
    }

    private async Task ApplyPermissionsAsync(Guid roleId, IReadOnlyList<string>? codes, CancellationToken ct)
    {
        var wanted = codes?.Where(c => !string.IsNullOrWhiteSpace(c)).Distinct().ToList() ?? new List<string>();
        var permissionIds = await _db.Permissions.Where(p => wanted.Contains(p.Code)).Select(p => p.Id).ToListAsync(ct);

        await _db.RolePermissions.Where(rp => rp.RoleId == roleId).ExecuteDeleteAsync(ct);
        foreach (var permissionId in permissionIds)
            _db.RolePermissions.Add(new RolePermission { RoleId = roleId, PermissionId = permissionId });
        await _db.SaveChangesAsync(ct);
    }

    private async Task NotifyRoleChangeAsync(Guid roleId, CancellationToken ct)
    {
        var userIds = await _db.UserRoles.AsNoTracking().Where(ur => ur.RoleId == roleId).Select(ur => ur.UserId).ToListAsync(ct);
        foreach (var userId in userIds)
        {
            var (roles, permissions) = await AccessResolver.ResolveAsync(_db, userId, ct);
            await _realtime.ToUserAsync(userId, "permissions.changed", new
            {
                roles,
                permissions,
                at = DateTime.UtcNow,
                message = "Sus permisos se actualizaron. La aplicación se adaptará automáticamente.",
            }, ct);
        }
    }

    // ------------------------------------------------------------------ usuarios
    [HttpGet("users")]
    [HasPermission("users.view")]
    public async Task<ActionResult<PagedResult<UserDto>>> Users(
        [FromQuery] string? search, [FromQuery] UserStatus? status, [FromQuery] bool? isStaff, [FromQuery] Guid? roleId,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        var query = _db.Users.AsNoTracking().Where(u => !u.IsDeleted).AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(u => u.FullName.Contains(term) || u.Email.Contains(term)
                                     || (u.Phone != null && u.Phone.Contains(term)));
        }
        if (status.HasValue) query = query.Where(u => u.Status == status);
        if (isStaff.HasValue) query = query.Where(u => u.IsStaff == isStaff);
        if (roleId.HasValue)
        {
            var userIds = await _db.UserRoles.Where(ur => ur.RoleId == roleId).Select(ur => ur.UserId).ToListAsync(ct);
            query = query.Where(u => userIds.Contains(u.Id));
        }

        var paged = await query.OrderByDescending(u => u.CreatedAt).ToPagedResultAsync(page, pageSize, ct);
        var ids = paged.Items.Select(u => u.Id).ToList();

        var roleMap = await _db.UserRoles.AsNoTracking().Where(ur => ids.Contains(ur.UserId))
            .GroupBy(ur => ur.UserId)
            .Select(g => new { UserId = g.Key, Roles = g.Select(x => x.Role.Name).ToList() })
            .ToDictionaryAsync(x => x.UserId, x => x.Roles, ct);

        var clientMap = await _db.Clients.AsNoTracking().Where(c => c.UserId != null && ids.Contains(c.UserId.Value))
            .Select(c => new { c.UserId, c.LegalName, c.Code })
            .ToDictionaryAsync(x => x.UserId!.Value, x => new { x.LegalName, x.Code }, ct);

        var items = paged.Items.Select(u =>
        {
            var client = clientMap.GetValueOrDefault(u.Id);
            return UserDto.From(u, roleMap.GetValueOrDefault(u.Id) ?? new List<string>(), client?.LegalName, client?.Code);
        }).ToList();

        return Ok(new PagedResult<UserDto>(items, paged.Total, paged.Page, paged.PageSize));
    }

    [HttpGet("users/{id:guid}")]
    [HasPermission("users.view")]
    public async Task<ActionResult<object>> User(Guid id, CancellationToken ct)
    {
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == id && !u.IsDeleted, ct)
            ?? throw new KeyNotFoundException("Usuario no encontrado.");

        var (roles, permissions) = await AccessResolver.ResolveAsync(_db, id, ct);
        var roleIds = await _db.UserRoles.AsNoTracking().Where(ur => ur.UserId == id).Select(ur => ur.RoleId).ToListAsync(ct);
        var client = await _db.Clients.AsNoTracking().FirstOrDefaultAsync(c => c.UserId == id, ct);
        var devices = await _db.DeviceTokens.AsNoTracking().Where(d => d.UserId == id)
            .Select(d => new { d.Id, d.Platform, d.DeviceModel, d.AppVersion, d.IsActive, d.LastSeenAt }).ToListAsync(ct);

        return Ok(new
        {
            user = UserDto.From(user, roles, client?.LegalName, client?.Code),
            roles,
            roleIds,
            permissions,
            clientId = client?.Id,
            devices,
        });
    }

    [HttpPost("users")]
    [HasPermission("users.create")]
    public async Task<ActionResult<UserDto>> CreateUser([FromBody] UserCreateRequest request, CancellationToken ct)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        if (await _db.Users.AnyAsync(u => u.Email == email, ct))
            throw new InvalidOperationException("Ya existe un usuario con ese correo.");
        if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 8)
            throw new ArgumentException("La contraseña debe tener al menos 8 caracteres.");

        var user = new User
        {
            Email = email,
            FullName = request.FullName.Trim(),
            Phone = request.Phone?.Trim(),
            IdNumber = request.IdNumber?.Trim(),
            IsStaff = request.IsStaff,
            Status = request.Status,
            ClientId = request.ClientId,
        };
        user.PasswordHash = _hasher.HashPassword(user, request.Password);
        _db.Users.Add(user);
        await _db.SaveChangesAsync(ct);

        foreach (var roleId in request.RoleIds ?? Array.Empty<Guid>())
            _db.UserRoles.Add(new UserRole { UserId = user.Id, RoleId = roleId });

        if (request.ClientId.HasValue)
        {
            var client = await _db.Clients.FirstOrDefaultAsync(c => c.Id == request.ClientId, ct);
            if (client is not null) client.UserId = user.Id;
        }

        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("create", "User", user.Id.ToString(), after: new { user.Email, user.IsStaff }, ct: ct);

        var (roles, _) = await AccessResolver.ResolveAsync(_db, user.Id, ct);
        return Ok(UserDto.From(user, roles));
    }

    [HttpPut("users/{id:guid}")]
    [HasPermission("users.edit")]
    public async Task<ActionResult<UserDto>> UpdateUser(Guid id, [FromBody] UserUpdateRequest request, CancellationToken ct)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == id && !u.IsDeleted, ct)
            ?? throw new KeyNotFoundException("Usuario no encontrado.");

        var before = new { user.FullName, user.IsStaff };
        user.FullName = request.FullName.Trim();
        user.Phone = request.Phone?.Trim();
        user.IdNumber = request.IdNumber?.Trim();
        user.AvatarUrl = request.AvatarUrl?.Trim();
        if (request.IsStaff.HasValue) user.IsStaff = request.IsStaff.Value;
        user.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("update", "User", user.Id.ToString(), before, new { user.FullName, user.IsStaff }, ct: ct);

        var (roles, _) = await AccessResolver.ResolveAsync(_db, id, ct);
        return Ok(UserDto.From(user, roles));
    }

    /// <summary>Activa, suspende o rechaza una cuenta. Solo el administrador puede activarla.</summary>
    [HttpPatch("users/{id:guid}/status")]
    [HasPermission("users.edit")]
    public async Task<ActionResult<object>> ChangeStatus(Guid id, [FromBody] ChangeUserStatusRequest request, CancellationToken ct)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == id && !u.IsDeleted, ct)
            ?? throw new KeyNotFoundException("Usuario no encontrado.");

        if (user.Id == _current.UserId && request.Status != UserStatus.Active)
            throw new InvalidOperationException("No puede desactivar su propia cuenta.");

        var previous = user.Status;
        user.Status = request.Status;
        user.UpdatedAt = DateTime.UtcNow;

        if (request.Status != UserStatus.Active)
        {
            await _db.RefreshTokens.Where(r => r.UserId == id && !r.RevokedAt.HasValue)
                .ExecuteUpdateAsync(s => s.SetProperty(r => r.RevokedAt, DateTime.UtcNow), ct);
        }

        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("change-status", "User", id.ToString(), new { Status = previous.ToString() }, new { Status = request.Status.ToString(), request.Reason }, ct: ct);

        await _realtime.ToUserAsync(id, "account.status", new
        {
            status = request.Status.ToString(),
            reason = request.Reason,
            at = DateTime.UtcNow,
        }, ct);

        if (request.Status == UserStatus.Active)
        {
            await _notifications.NotifyUserAsync(id, NotificationType.AccountApproved,
                "Su cuenta está activa",
                request.Reason ?? "Su cuenta fue habilitada. Ya puede usar la aplicación.",
                deepLink: "/home", ct: ct);
        }

        return Ok(new { message = "Estado actualizado.", status = user.Status.ToString() });
    }

    [HttpPut("users/{id:guid}/roles")]
    [HasPermission("users.roles")]
    public async Task<ActionResult<object>> SetRoles(Guid id, [FromBody] SetUserRolesRequest request, CancellationToken ct)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == id && !u.IsDeleted, ct)
            ?? throw new KeyNotFoundException("Usuario no encontrado.");

        await _db.UserRoles.Where(ur => ur.UserId == id).ExecuteDeleteAsync(ct);
        foreach (var roleId in request.RoleIds.Distinct())
            _db.UserRoles.Add(new UserRole { UserId = id, RoleId = roleId });
        await _db.SaveChangesAsync(ct);

        var (roles, permissions) = await AccessResolver.ResolveAsync(_db, id, ct);
        await _audit.LogAsync("set-roles", "User", id.ToString(), after: new { roles }, ct: ct);

        await _realtime.ToUserAsync(id, "permissions.changed", new { roles, permissions, at = DateTime.UtcNow }, ct);

        return Ok(new { roles, permissions });
    }

    [HttpPost("users/{id:guid}/reset-password")]
    [HasPermission("users.edit")]
    public async Task<ActionResult<object>> ResetPassword(Guid id, [FromBody] AdminResetPasswordRequest request, CancellationToken ct)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == id && !u.IsDeleted, ct)
            ?? throw new KeyNotFoundException("Usuario no encontrado.");

        if (string.IsNullOrWhiteSpace(request.NewPassword) || request.NewPassword.Length < 8)
            throw new ArgumentException("La contraseña debe tener al menos 8 caracteres.");

        user.PasswordHash = _hasher.HashPassword(user, request.NewPassword);
        user.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        await _db.RefreshTokens.Where(r => r.UserId == id && !r.RevokedAt.HasValue)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.RevokedAt, DateTime.UtcNow), ct);

        await _audit.LogAsync("reset-password", "User", id.ToString(), ct: ct);
        await _notifications.NotifyUserAsync(id, NotificationType.System,
            "Contraseña restablecida",
            "Un administrador restableció su contraseña. Por seguridad, inicie sesión de nuevo.",
            deepLink: "/login", sendPush: false, ct: ct);

        return Ok(new { message = "Contraseña restablecida." });
    }

    /// <summary>Listado de personal de la firma para selectores de responsable/asignación.</summary>
    [HttpGet("users/staff")]
    [HasPermission("users.view")]
    public async Task<ActionResult<object>> Staff(CancellationToken ct)
    {
        var staff = await _db.Users.AsNoTracking()
            .Where(u => u.IsStaff && !u.IsDeleted && u.Status == UserStatus.Active)
            .OrderBy(u => u.FullName)
            .Select(u => new { u.Id, u.FullName, u.Email, u.AvatarUrl })
            .ToListAsync(ct);
        return Ok(staff);
    }
}
