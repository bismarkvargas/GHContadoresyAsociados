namespace GH.Domain.Entities;

/// <summary>Documento (PDF, imagen u Office) asociado a un cliente, expediente o pedido.</summary>
public class Document
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? ClientId { get; set; }
    public Client? Client { get; set; }
    public Guid? CaseFileId { get; set; }
    public CaseFile? CaseFile { get; set; }
    public Guid? OrderId { get; set; }
    public Order? Order { get; set; }

    public DocumentCategory Category { get; set; } = DocumentCategory.Expediente;
    /// <summary>Nombre del archivo tal como se guardó en disco.</summary>
    public string FileName { get; set; } = string.Empty;
    /// <summary>Nombre original subido por el usuario.</summary>
    public string OriginalName { get; set; } = string.Empty;
    public string ContentType { get; set; } = "application/pdf";
    public long SizeBytes { get; set; }
    /// <summary>Ruta relativa dentro de la carpeta de almacenamiento.</summary>
    public string StoragePath { get; set; } = string.Empty;
    public string? Sha256 { get; set; }
    public int Version { get; set; } = 1;
    public bool IsCurrent { get; set; } = true;
    /// <summary>Agrupa versiones del mismo documento lógico.</summary>
    public Guid? VersionGroupId { get; set; }

    public Guid? UploadedByUserId { get; set; }
    public User? UploadedByUser { get; set; }
    public string UploadedByName { get; set; } = string.Empty;
    /// <summary>Si el cliente puede verlo y descargarlo desde el app.</summary>
    public bool ClientVisible { get; set; } = true;
    public string? Description { get; set; }
    public DateTime UploadedAt { get; set; } = DateTime.UtcNow;
    public bool IsDeleted { get; set; }
}
