namespace GH.Domain.Entities;

/// <summary>Expediente o caso llevado por la firma para un cliente.</summary>
public class CaseFile
{
    public Guid Id { get; set; } = Guid.NewGuid();
    /// <summary>Código legible correlativo por año: GH-EXP-2026-0001.</summary>
    public string Code { get; set; } = string.Empty;

    public Guid ClientId { get; set; }
    public Client Client { get; set; } = null!;

    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public CaseMatter Matter { get; set; } = CaseMatter.Contable;
    public CaseEntity Entity { get; set; } = CaseEntity.Ninguno;
    /// <summary>Número de trámite o expediente asignado por el ente.</summary>
    public string? ReferenceNumber { get; set; }

    public CaseStatus Status { get; set; } = CaseStatus.Open;
    public Priority Priority { get; set; } = Priority.Normal;
    public int ProgressPercent { get; set; }

    public Guid? ResponsibleUserId { get; set; }
    public User? ResponsibleUser { get; set; }

    public DateTime OpenedAt { get; set; } = DateTime.UtcNow;
    public DateTime? DueAt { get; set; }
    public DateTime? ClosedAt { get; set; }

    public decimal? AgreedAmount { get; set; }
    public string Currency { get; set; } = "USD";

    /// <summary>Si el cliente ve este expediente en el app.</summary>
    public bool ClientVisible { get; set; } = true;

    public CaseFileSource Source { get; set; } = CaseFileSource.Manual;

    /// <summary>Ítem del pedido que originó el expediente (relación simple, sin navegación:
    /// el vínculo real vive en <see cref="OrderItem.CaseFileId"/>).</summary>
    public Guid? OrderItemId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public bool IsDeleted { get; set; }

    public ICollection<CaseTask> Tasks { get; set; } = new List<CaseTask>();
    public ICollection<CaseEvent> Events { get; set; } = new List<CaseEvent>();
    public ICollection<Document> Documents { get; set; } = new List<Document>();
    public ICollection<Message> Messages { get; set; } = new List<Message>();
}

/// <summary>Tarea del expediente; puede ser visible para el cliente (checklist que él completa).</summary>
public class CaseTask
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CaseFileId { get; set; }
    public CaseFile CaseFile { get; set; } = null!;
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public TaskStatus Status { get; set; } = TaskStatus.Todo;
    public Priority Priority { get; set; } = Priority.Normal;
    public DateTime? DueAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public Guid? AssignedToUserId { get; set; }
    public User? AssignedToUser { get; set; }
    public Guid? CreatedByUserId { get; set; }
    public User? CreatedByUser { get; set; }
    public int SortOrder { get; set; }
    public bool ClientVisible { get; set; }
    /// <summary>El propio cliente puede marcarla como completada desde el app.</summary>
    public bool ClientCanComplete { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>Actuación del expediente (timeline inmutable). Alimenta el tiempo real y el push.</summary>
public class CaseEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CaseFileId { get; set; }
    public CaseFile CaseFile { get; set; } = null!;
    public CaseEventType Type { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    /// <summary>Null cuando lo generó el sistema.</summary>
    public Guid? ActorUserId { get; set; }
    public User? ActorUser { get; set; }
    public string? ActorName { get; set; }
    public bool ClientVisible { get; set; } = true;
    public string? MetadataJson { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>Mensaje entre el cliente y la firma, ligado a un expediente o al cliente.</summary>
public class Message
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ClientId { get; set; }
    public Client Client { get; set; } = null!;
    public Guid? CaseFileId { get; set; }
    public CaseFile? CaseFile { get; set; }
    public Guid SenderUserId { get; set; }
    public User SenderUser { get; set; } = null!;
    public string SenderName { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    public Guid? AttachmentDocumentId { get; set; }
    public Document? AttachmentDocument { get; set; }
    public bool IsFromClient { get; set; }
    public DateTime? ReadByStaffAt { get; set; }
    public DateTime? ReadByClientAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
