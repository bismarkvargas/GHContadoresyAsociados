using GH.Domain;
using GH.Domain.Abstractions;
using GH.Domain.Entities;
using GH.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace GH.Infrastructure.Services;

/// <summary>
/// Servicio central de notificaciones: persiste la notificación in-app, respeta las
/// preferencias del usuario, envía el push a todos sus dispositivos activos y emite el
/// evento en tiempo real para que el app lo vea al instante.
/// </summary>
public class NotificationService : INotificationService
{
    private static readonly System.Text.Json.JsonSerializerOptions JsonOpts = new()
    {
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
    };

    private readonly GhDbContext _db;
    private readonly IPushSender _push;
    private readonly IRealtimeNotifier _realtime;
    private readonly ILogger<NotificationService> _logger;

    public NotificationService(GhDbContext db, IPushSender push, IRealtimeNotifier realtime, ILogger<NotificationService> logger)
    {
        _db = db;
        _push = push;
        _realtime = realtime;
        _logger = logger;
    }

    public async Task NotifyUserAsync(Guid userId, NotificationType type, string title, string body,
        string? deepLink = null, object? data = null, bool sendPush = true, CancellationToken ct = default)
    {
        var prefs = await _db.NotificationPreferences.AsNoTracking()
            .FirstOrDefaultAsync(p => p.UserId == userId && p.Type == type, ct);

        var allowInApp = prefs?.InApp ?? true;
        var allowPush = (prefs?.Push ?? true) && sendPush;

        var dataJson = data is null ? null : System.Text.Json.JsonSerializer.Serialize(data, JsonOpts);

        if (allowInApp)
        {
            _db.Notifications.Add(new Notification
            {
                UserId = userId,
                Title = title,
                Body = body,
                Type = type,
                Channel = NotificationChannel.InApp,
                Status = NotificationStatus.Sent,
                DataJson = dataJson,
                DeepLink = deepLink,
                CreatedAt = DateTime.UtcNow,
                SentAt = DateTime.UtcNow,
            });
            await _db.SaveChangesAsync(ct);
        }

        var realtimePayload = new { type = type.ToString(), title, body, deepLink, data, createdAt = DateTime.UtcNow };
        await _realtime.ToUserAsync(userId, "notification", realtimePayload, ct);

        if (!allowPush) return;

        var tokens = await _db.DeviceTokens
            .Where(t => t.UserId == userId && t.IsActive)
            .Select(t => t.Token)
            .ToListAsync(ct);
        if (tokens.Count == 0) return;

        var pushData = new Dictionary<string, string>
        {
            ["type"] = type.ToString(),
            ["deepLink"] = deepLink ?? string.Empty,
            ["title"] = title,
            ["body"] = body,
        };
        if (data is not null)
        {
            foreach (var kv in ToDictionary(data))
                pushData[kv.Key] = kv.Value;
        }

        var result = await _push.SendAsync(tokens, title, body, pushData, ct);

        if (result.InvalidTokens.Count > 0)
        {
            var invalid = await _db.DeviceTokens.Where(t => result.InvalidTokens.Contains(t.Token)).ToListAsync(ct);
            foreach (var t in invalid) t.IsActive = false;
            await _db.SaveChangesAsync(ct);
        }

        _logger.LogInformation("Push {Type} a {User}: {Ok} enviados, {Failed} fallidos.", type, userId, result.SuccessCount, result.FailureCount);
    }

    public async Task NotifyStaffAsync(NotificationType type, string title, string body,
        string? deepLink = null, object? data = null, CancellationToken ct = default)
    {
        var staffIds = await _db.Users.AsNoTracking()
            .Where(u => u.IsStaff && u.Status == UserStatus.Active && !u.IsDeleted)
            .Select(u => u.Id)
            .ToListAsync(ct);

        foreach (var id in staffIds)
            await NotifyUserAsync(id, type, title, body, deepLink, data, sendPush: false, ct);

        // Aviso inmediato al panel de administración (todos los conectados al grupo staff).
        await _realtime.ToStaffAsync("notification", new
        {
            type = type.ToString(),
            title,
            body,
            deepLink,
            data,
            createdAt = DateTime.UtcNow,
        }, ct);
    }

    private static IEnumerable<KeyValuePair<string, string>> ToDictionary(object data)
    {
        if (data is IDictionary<string, string> s)
        {
            foreach (var kv in s) yield return kv;
            yield break;
        }
        if (data is IReadOnlyDictionary<string, string> r)
        {
            foreach (var kv in r) yield return kv;
            yield break;
        }

        System.Text.Json.JsonDocument? doc = null;
        try
        {
            doc = System.Text.Json.JsonDocument.Parse(System.Text.Json.JsonSerializer.Serialize(data));
            if (doc.RootElement.ValueKind != System.Text.Json.JsonValueKind.Object) yield break;
            foreach (var p in doc.RootElement.EnumerateObject())
                yield return new KeyValuePair<string, string>(p.Name,
                    p.Value.ValueKind == System.Text.Json.JsonValueKind.String ? p.Value.GetString() ?? string.Empty : p.Value.ToString());
        }
        finally
        {
            doc?.Dispose();
        }
    }
}
