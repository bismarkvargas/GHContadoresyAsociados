namespace GH.Domain.Entities;

/// <summary>Cliente del CRM (persona física, sociedad o inversionista extranjero).</summary>
public class Client
{
    public Guid Id { get; set; } = Guid.NewGuid();
    /// <summary>Código legible correlativo: GH-CLI-00001.</summary>
    public string Code { get; set; } = string.Empty;
    public ClientType ClientType { get; set; } = ClientType.Individual;

    public string LegalName { get; set; } = string.Empty;
    public string? TradeName { get; set; }
    /// <summary>Cédula física/jurídica, NIT o pasaporte.</summary>
    public string? IdNumber { get; set; }

    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string? Whatsapp { get; set; }
    public string? Address { get; set; }
    public string? Province { get; set; }
    public string? Canton { get; set; }
    public string? District { get; set; }
    public string Country { get; set; } = "Costa Rica";

    public ClientStatus Status { get; set; } = ClientStatus.Lead;
    public ClientSource Source { get; set; } = ClientSource.Admin;
    public Guid? AssignedToUserId { get; set; }
    public User? AssignedToUser { get; set; }
    /// <summary>Etiquetas separadas por coma (se exponen como arreglo en la API).</summary>
    public string? TagsCsv { get; set; }
    public string? Notes { get; set; }

    /// <summary>Cuenta del app vinculada a este cliente.</summary>
    public Guid? UserId { get; set; }
    public User? User { get; set; }

    public DateTime? LastContactAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public bool IsDeleted { get; set; }

    public ICollection<ClientContact> Contacts { get; set; } = new List<ClientContact>();
    public ICollection<ClientInteraction> Interactions { get; set; } = new List<ClientInteraction>();
    public ICollection<CaseFile> CaseFiles { get; set; } = new List<CaseFile>();
    public ICollection<Document> Documents { get; set; } = new List<Document>();
    public ICollection<Order> Orders { get; set; } = new List<Order>();
}

public class ClientContact
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ClientId { get; set; }
    public Client Client { get; set; } = null!;
    public string FullName { get; set; } = string.Empty;
    public string? Position { get; set; }
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public bool IsPrimary { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>Interacción del CRM: llamada, reunión, correo, nota o tarea con recordatorio.</summary>
public class ClientInteraction
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ClientId { get; set; }
    public Client Client { get; set; } = null!;
    public InteractionType Type { get; set; }
    public string Subject { get; set; } = string.Empty;
    public string? Notes { get; set; }
    public DateTime OccurredAt { get; set; } = DateTime.UtcNow;
    public DateTime? ReminderAt { get; set; }
    public bool IsCompleted { get; set; }
    public Guid? CreatedByUserId { get; set; }
    public User? CreatedByUser { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
