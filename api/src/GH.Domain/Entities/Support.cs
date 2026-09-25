namespace GH.Domain.Entities;

/// <summary>Solicitud de cotización (formulario del sitio y del app).</summary>
public class QuoteRequest
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Phone { get; set; } = string.Empty;
    public string? Company { get; set; }
    public Guid? ServiceId { get; set; }
    public Product? Service { get; set; }
    public string? Message { get; set; }

    public QuoteStatus Status { get; set; } = QuoteStatus.New;
    public Guid? HandledByUserId { get; set; }
    public User? HandledByUser { get; set; }
    public Guid? ClientId { get; set; }
    public Client? Client { get; set; }
    public string? InternalNotes { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>Notificación in-app y/o push enviada a un usuario.</summary>
public class Notification
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;

    public string Title { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    public NotificationType Type { get; set; } = NotificationType.System;
    public NotificationChannel Channel { get; set; } = NotificationChannel.InApp;
    public NotificationStatus Status { get; set; } = NotificationStatus.Queued;

    public string? DataJson { get; set; }
    /// <summary>Ruta del app a la que navegar al pulsar la notificación.</summary>
    public string? DeepLink { get; set; }

    public string? FcmMessageId { get; set; }
    public string? Error { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? SentAt { get; set; }
    public DateTime? ReadAt { get; set; }
}

/// <summary>Bitácora de auditoría de todas las acciones administrativas.</summary>
public class AuditLog
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? UserId { get; set; }
    public User? User { get; set; }
    public string? UserName { get; set; }
    public string Action { get; set; } = string.Empty;
    public string EntityName { get; set; } = string.Empty;
    public string? EntityId { get; set; }
    public string? BeforeJson { get; set; }
    public string? AfterJson { get; set; }
    public string? IpAddress { get; set; }
    public string? UserAgent { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>Configuración del sistema (marca, contactos, monedas, pasarela).</summary>
public class Setting
{
    public string Key { get; set; } = string.Empty;
    public string? Value { get; set; }
    public string Group { get; set; } = "General";
    public string? Description { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>Contador atómico para generar códigos correlativos.</summary>
public class EntityCounter
{
    public string Key { get; set; } = string.Empty;
    public long Value { get; set; }
}
