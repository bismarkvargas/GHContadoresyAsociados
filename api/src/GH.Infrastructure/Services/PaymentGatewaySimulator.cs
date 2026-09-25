using System.Security.Cryptography;
using GH.Domain;
using GH.Domain.Entities;

namespace GH.Infrastructure.Services;

public record PaymentRequest(
    PaymentMethod Method,
    decimal Amount,
    string Currency,
    string? CardNumber,
    string? CardHolder,
    string? Expiry,
    string? Cvv,
    int? Installments,
    string? Reference);

public record PaymentOutcome(
    PaymentStatus Status,
    string Reference,
    string? AuthorizationCode,
    string? CardBrand,
    string? CardLast4,
    string? FailureReason,
    string RawRequestJson,
    string RawResponseJson);

/// <summary>
/// Pasarela de pago SIMULADA. No contacta ninguna red de pagos ni almacena datos de
/// tarjeta: solo valida el formato (Luhn), decide un resultado reproducible y guarda
/// la traza cruda para que el admin pueda auditar la transacción de demostración.
///
/// Tarjetas de prueba:
///   4242 4242 4242 4242 -> aprobado
///   4000 0000 0000 0002 -> rechazado (fondos insuficientes)
///   4000 0000 0000 9995 -> pendiente de confirmación
/// SINPE Móvil y transferencia quedan en estado pendiente hasta que el admin confirme.
/// </summary>
public class PaymentGatewaySimulator
{
    public const string Provider = "GH-Simulated";
    private const string ApprovedCard = "4242424242424242";
    private const string DeclinedCard = "4000000000000002";
    private const string PendingCard = "4000000000009995";

    public PaymentOutcome Process(PaymentRequest request)
    {
        var reference = $"SIM-{DateTime.UtcNow:yyyyMMddHHmmss}-{RandomNumberGenerator.GetHexString(6)}";
        var requestJson = System.Text.Json.JsonSerializer.Serialize(new
        {
            provider = Provider,
            method = request.Method.ToString(),
            amount = request.Amount,
            currency = request.Currency,
            installments = request.Installments,
            // Nunca se registra el número completo ni el CVV.
            card = request.CardNumber is null ? null : MaskCard(request.CardNumber),
            reference = request.Reference,
            simulated = true,
        });

        if (request.Method != PaymentMethod.Card)
        {
            var label = request.Method == PaymentMethod.Sinpe ? "SINPE Móvil" : "transferencia bancaria";
            return new PaymentOutcome(PaymentStatus.Pending, reference, null, null, null,
                $"Pago por {label} registrado. Queda pendiente de confirmación por GH Contadores.",
                requestJson, System.Text.Json.JsonSerializer.Serialize(new { status = "PENDING", provider = Provider, reference }));
        }

        var digits = Normalize(request.CardNumber);
        if (!IsValidCard(digits))
        {
            return new PaymentOutcome(PaymentStatus.Declined, reference, null, Brand(digits), Last4(digits),
                "Los datos de la tarjeta no son válidos (número, vencimiento o CVV).",
                requestJson, System.Text.Json.JsonSerializer.Serialize(new { status = "DECLINED", code = "invalid_card" }));
        }

        var auth = RandomNumberGenerator.GetInt32(100000, 999999).ToString();

        return digits switch
        {
            ApprovedCard => new PaymentOutcome(PaymentStatus.Approved, reference, auth, Brand(digits), Last4(digits), null,
                requestJson, System.Text.Json.JsonSerializer.Serialize(new { status = "APPROVED", code = "00", authorization = auth })),

            DeclinedCard => new PaymentOutcome(PaymentStatus.Declined, reference, null, Brand(digits), Last4(digits),
                "Transacción rechazada por el emisor: fondos insuficientes.",
                requestJson, System.Text.Json.JsonSerializer.Serialize(new { status = "DECLINED", code = "51" })),

            PendingCard => new PaymentOutcome(PaymentStatus.Pending, reference, null, Brand(digits), Last4(digits),
                "Transacción en revisión por el emisor. Te avisaremos cuando se confirme.",
                requestJson, System.Text.Json.JsonSerializer.Serialize(new { status = "PENDING", code = "P1" })),

            // Cualquier otra tarjeta válida se aprueba de forma determinista según su dígito final.
            _ => digits.EndsWith('0')
                ? new PaymentOutcome(PaymentStatus.Declined, reference, null, Brand(digits), Last4(digits),
                    "Transacción rechazada por el emisor.", requestJson,
                    System.Text.Json.JsonSerializer.Serialize(new { status = "DECLINED", code = "05" }))
                : new PaymentOutcome(PaymentStatus.Approved, reference, auth, Brand(digits), Last4(digits), null,
                    requestJson, System.Text.Json.JsonSerializer.Serialize(new { status = "APPROVED", code = "00", authorization = auth })),
        };
    }

    public static string Normalize(string? card) =>
        new((card ?? string.Empty).Where(char.IsDigit).ToArray());

    public static string MaskCard(string card)
    {
        var d = Normalize(card);
        return d.Length < 4 ? "****" : $"**** **** **** {d[^4..]}";
    }

    public static string? Last4(string? card)
    {
        var d = Normalize(card);
        return d.Length >= 4 ? d[^4..] : null;
    }

    public static string? Brand(string? card)
    {
        var d = Normalize(card);
        if (d.Length == 0) return null;
        if (d.StartsWith('4')) return "Visa";
        if (d.StartsWith("51") || d.StartsWith("52") || d.StartsWith("53") || d.StartsWith("54") || d.StartsWith("55")) return "Mastercard";
        if (d.StartsWith("34") || d.StartsWith("37")) return "American Express";
        return "Otra";
    }

    public static bool IsValidCard(string? cardNumber)
    {
        var d = Normalize(cardNumber);
        if (d.Length is < 13 or > 19) return false;

        var sum = 0;
        var alternate = false;
        for (var i = d.Length - 1; i >= 0; i--)
        {
            var n = d[i] - '0';
            if (alternate)
            {
                n *= 2;
                if (n > 9) n -= 9;
            }
            sum += n;
            alternate = !alternate;
        }
        return sum % 10 == 0;
    }
}
