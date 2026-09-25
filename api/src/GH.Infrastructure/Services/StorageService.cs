using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using GH.Domain.Abstractions;
using GH.Domain.Entities;
using GH.Infrastructure.Data;
using Microsoft.Extensions.Options;

namespace GH.Infrastructure.Services;

public class DateTimeProvider : IDateTimeProvider
{
    public DateTime UtcNow => DateTime.UtcNow;
}

public class StorageOptions
{
    /// <summary>Carpeta raíz de los documentos. Por defecto ./storage/documents.</summary>
    public string RootPath { get; set; } = "storage";
    public long MaxFileSizeBytes { get; set; } = 25 * 1024 * 1024;
    public string SigningKey { get; set; } = string.Empty;
    public int DownloadTokenMinutes { get; set; } = 15;
    public string PublicBaseUrl { get; set; } = string.Empty;
}

/// <summary>
/// Guarda los documentos en disco con nombre aleatorio, calcula SHA-256 y firma las
/// descargas con HMAC-SHA256 (nunca se expone la carpeta directamente).
/// </summary>
public class StorageService : IStorageService
{
    private readonly StorageOptions _options;
    private readonly IDateTimeProvider _clock;

    public static readonly string[] AllowedContentTypes =
    {
        "application/pdf",
        "image/png",
        "image/jpeg",
        "image/webp",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/zip",
    };

    public StorageService(IOptions<StorageOptions> options, IDateTimeProvider clock)
    {
        _options = options.Value;
        _clock = clock;
        if (string.IsNullOrWhiteSpace(_options.SigningKey))
            _options.SigningKey = "gh-contadores-development-signing-key-change-me";
        Directory.CreateDirectory(Root());
    }

    public string Root() => Path.IsPathRooted(_options.RootPath)
        ? _options.RootPath
        : Path.Combine(AppContext.BaseDirectory, _options.RootPath);

    public async Task<StoredFile> SaveAsync(Stream content, string originalName, string contentType, CancellationToken ct = default)
    {
        var now = _clock.UtcNow;
        var relative = Path.Combine(now.ToString("yyyy"), now.ToString("MM"));
        var absoluteDir = Path.Combine(Root(), relative);
        Directory.CreateDirectory(absoluteDir);

        var ext = Path.GetExtension(originalName);
        if (string.IsNullOrWhiteSpace(ext)) ext = ".bin";
        var fileName = $"{Guid.NewGuid():N}{ext.ToLowerInvariant()}";
        var absolute = Path.Combine(absoluteDir, fileName);

        await using (var fs = File.Create(absolute))
        {
            await content.CopyToAsync(fs, ct);
        }

        var info = new FileInfo(absolute);
        string sha;
        await using (var fs = File.OpenRead(absolute))
        {
            sha = Convert.ToHexString(await SHA256.HashDataAsync(fs, ct)).ToLowerInvariant();
        }

        var storagePath = Path.Combine(relative, fileName).Replace('\\', '/');
        return new StoredFile(storagePath, fileName, info.Length, sha);
    }

    public Task<Stream> OpenReadAsync(string storagePath, CancellationToken ct = default)
    {
        var absolute = Resolve(storagePath);
        if (!File.Exists(absolute)) throw new FileNotFoundException("Documento no encontrado en disco.", storagePath);
        return Task.FromResult<Stream>(File.OpenRead(absolute));
    }

    public Task DeleteAsync(string storagePath, CancellationToken ct = default)
    {
        var absolute = Resolve(storagePath);
        if (File.Exists(absolute)) File.Delete(absolute);
        return Task.CompletedTask;
    }

    private string Resolve(string storagePath)
    {
        var normalized = storagePath.Replace('/', Path.DirectorySeparatorChar).TrimStart(Path.DirectorySeparatorChar);
        var absolute = Path.GetFullPath(Path.Combine(Root(), normalized));
        var rootFull = Path.GetFullPath(Root());
        if (!absolute.StartsWith(rootFull, StringComparison.OrdinalIgnoreCase))
            throw new UnauthorizedAccessException("Ruta de documento fuera del almacenamiento permitido.");
        return absolute;
    }

    // ----- Tokens de descarga firmados -----

    private sealed record Payload(string p, string n, string c, long e);

    public string CreateDownloadToken(string storagePath, string fileName, string contentType, TimeSpan ttl)
    {
        var payload = new Payload(storagePath, fileName, contentType,
            new DateTimeOffset(_clock.UtcNow.Add(ttl), TimeSpan.Zero).ToUnixTimeSeconds());
        var json = JsonSerializer.SerializeToUtf8Bytes(payload);
        var body = Base64Url(json);
        var sig = Base64Url(Sign(body));
        return $"{body}.{sig}";
    }

    public bool TryValidateDownloadToken(string token, out SignedDownload? download)
    {
        download = null;
        if (string.IsNullOrWhiteSpace(token)) return false;
        var parts = token.Split('.');
        if (parts.Length != 2) return false;

        try
        {
            var expected = Base64Url(Sign(parts[0]));
            if (!CryptographicOperations.FixedTimeEquals(
                    Encoding.ASCII.GetBytes(expected), Encoding.ASCII.GetBytes(parts[1])))
                return false;

            var payload = JsonSerializer.Deserialize<Payload>(FromBase64Url(parts[0]));
            if (payload is null) return false;
            if (DateTimeOffset.FromUnixTimeSeconds(payload.e) < DateTimeOffset.UtcNow) return false;

            download = new SignedDownload(payload.p, payload.n, payload.c, DateTimeOffset.FromUnixTimeSeconds(payload.e).UtcDateTime);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private byte[] Sign(string body)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(_options.SigningKey));
        return hmac.ComputeHash(Encoding.ASCII.GetBytes(body));
    }

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[] FromBase64Url(string value)
    {
        var s = value.Replace('-', '+').Replace('_', '/');
        switch (s.Length % 4)
        {
            case 2: s += "=="; break;
            case 3: s += "="; break;
        }
        return Convert.FromBase64String(s);
    }
}

public class AuditLogger : IAuditLogger
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = false,
    };

    private readonly GhDbContext _db;
    private readonly ICurrentUser _current;

    public AuditLogger(GhDbContext db, ICurrentUser current)
    {
        _db = db;
        _current = current;
    }

    public async Task LogAsync(string action, string entityName, string? entityId, object? before = null, object? after = null, CancellationToken ct = default)
    {
        // Cualquier fallo de auditoría nunca debe romper la operación de negocio.
        try
        {
            _db.AuditLogs.Add(new AuditLog
            {
                UserId = _current.UserId,
                UserName = _current.FullName ?? _current.Email,
                Action = action,
                EntityName = entityName,
                EntityId = entityId,
                BeforeJson = Safe(before),
                AfterJson = Safe(after),
                IpAddress = _current.IpAddress,
                UserAgent = _current.UserAgent,
                CreatedAt = DateTime.UtcNow,
            });
            await _db.SaveChangesAsync(ct);
        }
        catch
        {
            // ignorado a propósito
        }
    }

    private static string? Safe(object? value)
    {
        if (value is null) return null;
        try
        {
            var json = JsonSerializer.Serialize(value, JsonOpts);
            return json.Length > 4000 ? json[..4000] : json;
        }
        catch
        {
            return null;
        }
    }
}
