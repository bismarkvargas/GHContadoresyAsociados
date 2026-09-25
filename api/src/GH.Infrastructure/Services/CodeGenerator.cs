using GH.Domain.Abstractions;
using GH.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace GH.Infrastructure.Services;

/// <summary>Contadores correlativos atómicos. Usa los contadores de MySQL para evitar carreras.</summary>
public class CodeGenerator : ICodeGenerator
{
    private readonly GhDbContext _db;
    private readonly IDateTimeProvider _clock;

    public CodeGenerator(GhDbContext db, IDateTimeProvider clock)
    {
        _db = db;
        _clock = clock;
    }

    private async Task<long> NextAsync(string key, CancellationToken ct)
    {
        await _db.Database.ExecuteSqlRawAsync(
            "INSERT INTO `EntityCounters` (`CounterKey`, `Value`) VALUES ({0}, 1) ON DUPLICATE KEY UPDATE `Value` = `Value` + 1;",
            new object[] { key }, ct);

        var conn = _db.Database.GetDbConnection();
        var wasClosed = conn.State != System.Data.ConnectionState.Open;
        if (wasClosed) await conn.OpenAsync(ct);
        try
        {
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT `Value` FROM `EntityCounters` WHERE `CounterKey` = @k";
            var p = cmd.CreateParameter();
            p.ParameterName = "@k";
            p.Value = key;
            cmd.Parameters.Add(p);
            var result = await cmd.ExecuteScalarAsync(ct);
            return Convert.ToInt64(result ?? 1L);
        }
        finally
        {
            if (wasClosed) await conn.CloseAsync();
        }
    }

    private static string DateStamp() => DateTime.UtcNow.ToString("yyyyMMdd");

    public async Task<string> NextClientCodeAsync(CancellationToken ct = default)
    {
        var n = await NextAsync("client", ct);
        return $"GH-CLI-{n:D5}";
    }

    public async Task<string> NextCaseCodeAsync(CancellationToken ct = default)
    {
        var n = await NextAsync($"case-{_clock.UtcNow.Year}", ct);
        return $"GH-EXP-{_clock.UtcNow.Year}-{n:D4}";
    }

    public async Task<string> NextOrderNumberAsync(CancellationToken ct = default)
    {
        var n = await NextAsync($"order-{_clock.UtcNow.Year}", ct);
        return $"GH-ORD-{_clock.UtcNow.Year}-{n:D5}";
    }

    public async Task<string> NextTrackingCodeAsync(CancellationToken ct = default)
    {
        var n = await NextAsync("account-request", ct);
        var stamp = DateStamp();
        return $"GH-SOL-{stamp[2..]}-{n:D4}";
    }
}
