using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using GH.Domain.Abstractions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace GH.Infrastructure.Services;

public class FirebaseOptions
{
    /// <summary>JSON completo de la cuenta de servicio (Firebase Console → Configuración → Cuentas de servicio).</summary>
    public string ServiceAccountJson { get; set; } = string.Empty;
    /// <summary>Ruta alternativa al archivo JSON de la cuenta de servicio.</summary>
    public string ServiceAccountPath { get; set; } = string.Empty;
    /// <summary>Si es true y no hay credenciales, se registra el envío sin llamar a FCM (entorno de desarrollo).</summary>
    public bool LogOnlyWhenNotConfigured { get; set; } = true;
}

/// <summary>
/// Envío de notificaciones push con FCM HTTP v1 (sin dependencias externas):
/// firma un JWT con la clave privada de la cuenta de servicio, lo intercambia por un
/// access token de Google y publica el mensaje en la API v1 de FCM.
/// </summary>
public class FirebasePushSender : IPushSender
{
    private const string TokenUrl = "https://oauth2.googleapis.com/token";
    private const string Scope = "https://www.googleapis.com/auth/firebase.messaging";

    private readonly FirebaseOptions _options;
    private readonly IHttpClientFactory _httpFactory;
    private readonly ILogger<FirebasePushSender> _logger;

    private ServiceAccount? _account;
    private string? _accessToken;
    private DateTime _accessTokenExpiresAt = DateTime.MinValue;
    private readonly SemaphoreSlim _tokenLock = new(1, 1);

    private sealed record ServiceAccount(string project_id, string client_email, string private_key, string? token_uri);

    public FirebasePushSender(IOptions<FirebaseOptions> options, IHttpClientFactory httpFactory, ILogger<FirebasePushSender> logger)
    {
        _options = options.Value;
        _httpFactory = httpFactory;
        _logger = logger;
        LoadAccount();
    }

    public bool IsConfigured => _account is not null;

    private void LoadAccount()
    {
        try
        {
            var json = _options.ServiceAccountJson;
            if (string.IsNullOrWhiteSpace(json) && !string.IsNullOrWhiteSpace(_options.ServiceAccountPath) && File.Exists(_options.ServiceAccountPath))
                json = File.ReadAllText(_options.ServiceAccountPath);
            if (string.IsNullOrWhiteSpace(json)) return;

            _account = JsonSerializer.Deserialize<ServiceAccount>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            if (string.IsNullOrWhiteSpace(_account?.private_key)) _account = null;
            if (_account is not null) _logger.LogInformation("Firebase push configurado para el proyecto {Project}.", _account.project_id);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "No se pudo cargar la cuenta de servicio de Firebase; el push quedará en modo registro.");
            _account = null;
        }
    }

    public async Task<PushResult> SendAsync(IReadOnlyCollection<string> deviceTokens, string title, string body,
        IReadOnlyDictionary<string, string> data, CancellationToken ct = default)
    {
        if (deviceTokens.Count == 0) return new PushResult(true, 0, 0, Array.Empty<string>(), null);

        if (!IsConfigured)
        {
            if (_options.LogOnlyWhenNotConfigured)
                _logger.LogInformation("[PUSH simulado] {Count} dispositivo(s) · {Title}: {Body}", deviceTokens.Count, title, body);
            return new PushResult(false, 0, deviceTokens.Count, Array.Empty<string>(), "Firebase no configurado (push en modo registro).");
        }

        string accessToken;
        try
        {
            accessToken = await GetAccessTokenAsync(ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "No se pudo obtener el access token de Google.");
            return new PushResult(false, 0, deviceTokens.Count, Array.Empty<string>(), ex.Message);
        }

        var client = _httpFactory.CreateClient("fcm");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        var ok = 0;
        var failed = 0;
        var invalid = new List<string>();
        string? lastError = null;

        foreach (var token in deviceTokens)
        {
            var payload = new
            {
                message = new
                {
                    token,
                    notification = new { title, body },
                    data = data.ToDictionary(k => k.Key, v => v.Value ?? string.Empty),
                    android = new { priority = "high", notification = new { channel_id = "gh_default", sound = "default" } },
                    apns = new { headers = new Dictionary<string, string> { ["apns-priority"] = "10" }, payload = new { aps = new { sound = "default", badge = 1 } } },
                },
            };

            try
            {
                var url = $"https://fcm.googleapis.com/v1/projects/{_account!.project_id}/messages:send";
                using var content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
                using var response = await client.PostAsync(url, content, ct);
                var text = await response.Content.ReadAsStringAsync(ct);

                if (response.IsSuccessStatusCode)
                {
                    ok++;
                }
                else
                {
                    failed++;
                    lastError = text.Length > 500 ? text[..500] : text;
                    // Token inválido o caducado: se marca para desactivarlo.
                    if (text.Contains("UNREGISTERED") || text.Contains("INVALID_ARGUMENT") || text.Contains("SENDER_ID_MISMATCH"))
                        invalid.Add(token);
                    _logger.LogWarning("FCM rechazó el envío ({Status}): {Body}", (int)response.StatusCode, lastError);
                }
            }
            catch (Exception ex)
            {
                failed++;
                lastError = ex.Message;
                _logger.LogWarning(ex, "Error enviando push a un dispositivo.");
            }
        }

        return new PushResult(failed == 0, ok, failed, invalid, lastError);
    }

    private async Task<string> GetAccessTokenAsync(CancellationToken ct)
    {
        if (!string.IsNullOrEmpty(_accessToken) && _accessTokenExpiresAt > DateTime.UtcNow.AddMinutes(2))
            return _accessToken;

        await _tokenLock.WaitAsync(ct);
        try
        {
            if (!string.IsNullOrEmpty(_accessToken) && _accessTokenExpiresAt > DateTime.UtcNow.AddMinutes(2))
                return _accessToken;

            var now = DateTimeOffset.UtcNow;
            var header = Base64Url(Encoding.UTF8.GetBytes("{\"alg\":\"RS256\",\"typ\":\"JWT\"}"));
            var claims = Base64Url(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new Dictionary<string, object>
            {
                ["iss"] = _account!.client_email,
                ["scope"] = Scope,
                ["aud"] = string.IsNullOrWhiteSpace(_account.token_uri) ? TokenUrl : _account.token_uri!,
                ["iat"] = now.ToUnixTimeSeconds(),
                ["exp"] = now.AddHours(1).ToUnixTimeSeconds(),
            })));
            var signingInput = $"{header}.{claims}";

            using var rsa = RSA.Create();
            rsa.ImportFromPem(_account.private_key);
            var signature = Base64Url(rsa.SignData(Encoding.ASCII.GetBytes(signingInput), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1));
            var jwt = $"{signingInput}.{signature}";

            var client = _httpFactory.CreateClient("fcm");
            using var content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["grant_type"] = "urn:ietf:params:oauth:grant-type:jwt-bearer",
                ["assertion"] = jwt,
            });
            using var response = await client.PostAsync(string.IsNullOrWhiteSpace(_account.token_uri) ? TokenUrl : _account.token_uri, content, ct);
            var text = await response.Content.ReadAsStringAsync(ct);
            if (!response.IsSuccessStatusCode) throw new InvalidOperationException($"Google OAuth {(int)response.StatusCode}: {text}");

            using var doc = JsonDocument.Parse(text);
            _accessToken = doc.RootElement.GetProperty("access_token").GetString()!;
            var expiresIn = doc.RootElement.TryGetProperty("expires_in", out var e) ? e.GetInt32() : 3600;
            _accessTokenExpiresAt = DateTime.UtcNow.AddSeconds(expiresIn);
            return _accessToken;
        }
        finally
        {
            _tokenLock.Release();
        }
    }

    private static string Base64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
