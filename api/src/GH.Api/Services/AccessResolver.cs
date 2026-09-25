using GH.Domain;
using GH.Domain.Entities;
using GH.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace GH.Api.Services;

/// <summary>Resuelve roles y permisos efectivos de un usuario y los cachea por petición.</summary>
public static class AccessResolver
{
    public static async Task<(List<string> Roles, List<string> Permissions)> ResolveAsync(GhDbContext db, Guid userId, CancellationToken ct = default)
    {
        var roleNames = await db.UserRoles.AsNoTracking()
            .Where(ur => ur.UserId == userId)
            .Select(ur => ur.Role.Name)
            .ToListAsync(ct);

        if (roleNames.Any(r => string.Equals(r, "SuperAdmin", StringComparison.OrdinalIgnoreCase)))
            return (roleNames, new List<string> { "*" });

        var roleIds = await db.UserRoles.AsNoTracking()
            .Where(ur => ur.UserId == userId)
            .Select(ur => ur.RoleId)
            .ToListAsync(ct);

        var permissions = await db.RolePermissions.AsNoTracking()
            .Where(rp => roleIds.Contains(rp.RoleId))
            .Select(rp => rp.Permission.Code)
            .Distinct()
            .ToListAsync(ct);

        return (roleNames, permissions);
    }

    public static List<string> RolesOf(IEnumerable<string> roleNames) => roleNames.ToList();

    /// <summary>Traduce un estado de expediente a una etiqueta legible en español.</summary>
    public static string Label(CaseStatus status) => status switch
    {
        CaseStatus.Open => "Abierto",
        CaseStatus.InProgress => "En proceso",
        CaseStatus.WaitingClient => "En espera del cliente",
        CaseStatus.OnHold => "En pausa",
        CaseStatus.Completed => "Completado",
        CaseStatus.Closed => "Cerrado",
        CaseStatus.Cancelled => "Cancelado",
        _ => status.ToString(),
    };

    public static string Label(OrderStatus status) => status switch
    {
        OrderStatus.PendingPayment => "Pendiente de pago",
        OrderStatus.Paid => "Pagado",
        OrderStatus.InProcess => "En proceso",
        OrderStatus.Completed => "Completado",
        OrderStatus.Cancelled => "Cancelado",
        OrderStatus.Refunded => "Reembolsado",
        _ => status.ToString(),
    };

    public static string Label(AccountRequestStatus status) => status switch
    {
        AccountRequestStatus.Pending => "Pendiente de revisión",
        AccountRequestStatus.Approved => "Aprobada",
        AccountRequestStatus.Rejected => "Rechazada",
        AccountRequestStatus.Cancelled => "Cancelada",
        _ => status.ToString(),
    };

    public static string Label(PaymentStatus status) => status switch
    {
        PaymentStatus.Initiated => "Iniciado",
        PaymentStatus.Approved => "Aprobado",
        PaymentStatus.Declined => "Rechazado",
        PaymentStatus.Pending => "Pendiente",
        PaymentStatus.Refunded => "Reembolsado",
        _ => status.ToString(),
    };

    public static string Label(NotificationType type) => type switch
    {
        NotificationType.AccountApproved => "Cuenta aprobada",
        NotificationType.AccountRejected => "Cuenta rechazada",
        NotificationType.CaseCreated => "Expediente creado",
        NotificationType.CaseStatusChanged => "Cambio de estado del expediente",
        NotificationType.TaskAssigned => "Tarea asignada",
        NotificationType.TaskDueSoon => "Tarea por vencer",
        NotificationType.TaskCompleted => "Tarea completada",
        NotificationType.DocumentAvailable => "Documento disponible",
        NotificationType.OrderPaid => "Pedido pagado",
        NotificationType.OrderStatusChanged => "Cambio de estado del pedido",
        NotificationType.PaymentFailed => "Pago rechazado",
        NotificationType.MessageReceived => "Mensaje nuevo",
        NotificationType.QuoteRequested => "Cotización solicitada",
        _ => "Aviso del sistema",
    };
}
