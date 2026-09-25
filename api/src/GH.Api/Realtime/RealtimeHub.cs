using GH.Domain.Abstractions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace GH.Api.Realtime;

/// <summary>
/// Hub de tiempo real. El app y el admin se conectan con el JWT en la query string y
/// reciben al instante toda gestión hecha sobre sus expedientes, pedidos y documentos.
/// Grupos: user:{id} (cada usuario), staff (todo el personal), case:{id} (seguimiento de un expediente).
/// </summary>
[Authorize]
public class RealtimeHub : Hub
{
    public override async Task OnConnectedAsync()
    {
        var userId = Context.UserIdentifier
                     ?? Context.User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;

        if (!string.IsNullOrEmpty(userId))
            await Groups.AddToGroupAsync(Context.ConnectionId, $"user:{userId}");

        var isStaff = string.Equals(Context.User?.FindFirst("isStaff")?.Value, "true", StringComparison.OrdinalIgnoreCase);
        if (isStaff)
            await Groups.AddToGroupAsync(Context.ConnectionId, "staff");

        await base.OnConnectedAsync();
    }

    /// <summary>El cliente se suscribe al detalle en vivo de un expediente concreto.</summary>
    public Task JoinCase(string caseFileId) => Groups.AddToGroupAsync(Context.ConnectionId, $"case:{caseFileId}");

    public Task LeaveCase(string caseFileId) => Groups.RemoveFromGroupAsync(Context.ConnectionId, $"case:{caseFileId}");

    /// <summary>Latido para mantener viva la conexión en redes móviles.</summary>
    public Task Ping() => Clients.Caller.SendAsync("pong", DateTime.UtcNow);
}

/// <summary>Emite eventos de dominio por SignalR hacia los grupos correspondientes.</summary>
public class SignalRRealtimeNotifier : IRealtimeNotifier
{
    private readonly IHubContext<RealtimeHub> _hub;
    private readonly ILogger<SignalRRealtimeNotifier> _logger;

    public SignalRRealtimeNotifier(IHubContext<RealtimeHub> hub, ILogger<SignalRRealtimeNotifier> logger)
    {
        _hub = hub;
        _logger = logger;
    }

    public Task ToUserAsync(Guid userId, string eventName, object payload, CancellationToken ct = default)
        => SafeSend($"user:{userId}", eventName, payload);

    public Task ToStaffAsync(string eventName, object payload, CancellationToken ct = default)
        => SafeSend("staff", eventName, payload);

    public Task ToCaseAsync(Guid caseFileId, string eventName, object payload, CancellationToken ct = default)
        => SafeSend($"case:{caseFileId}", eventName, payload);

    public Task ToClientsAsync(string eventName, object payload, CancellationToken ct = default)
        => SafeSend(null, eventName, payload);

    private async Task SafeSend(string? group, string eventName, object payload)
    {
        try
        {
            if (group is null) await _hub.Clients.All.SendAsync(eventName, payload);
            else await _hub.Clients.Group(group).SendAsync(eventName, payload);
        }
        catch (Exception ex)
        {
            // Un fallo de tiempo real nunca debe romper la operación de negocio.
            _logger.LogWarning(ex, "No se pudo emitir el evento de tiempo real {Event} al grupo {Group}.", eventName, group);
        }
    }
}
