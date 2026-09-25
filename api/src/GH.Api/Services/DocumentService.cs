using GH.Api.Contracts;
using GH.Domain;
using GH.Domain.Abstractions;
using GH.Domain.Entities;
using GH.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace GH.Api.Services;

/// <summary>
/// Lógica compartida de documentos: valida el archivo, lo guarda en disco, registra la
/// versión, crea la actuación en el expediente y avisa al cliente (tiempo real + push).
/// </summary>
public class DocumentService
{
    private readonly GhDbContext _db;
    private readonly IStorageService _storage;
    private readonly ICurrentUser _current;
    private readonly INotificationService _notifications;
    private readonly IRealtimeNotifier _realtime;
    private readonly IAuditLogger _audit;

    public DocumentService(GhDbContext db, IStorageService storage, ICurrentUser current,
        INotificationService notifications, IRealtimeNotifier realtime, IAuditLogger audit)
    {
        _db = db;
        _storage = storage;
        _current = current;
        _notifications = notifications;
        _realtime = realtime;
        _audit = audit;
    }

    public async Task<DocumentDto> UploadAsync(IFormFile file, DocumentUploadRequest request, Guid? forcedClientId, CancellationToken ct)
    {
        if (file is null || file.Length == 0)
            throw new ArgumentException("No se recibió ningún archivo.");

        var contentType = string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType;
        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        var looksLikePdf = extension == ".pdf" || contentType.Contains("pdf", StringComparison.OrdinalIgnoreCase);

        var allowed = GH.Infrastructure.Services.StorageService.AllowedContentTypes.Contains(contentType)
                      || looksLikePdf
                      || extension is ".pdf" or ".png" or ".jpg" or ".jpeg" or ".webp" or ".doc" or ".docx" or ".xls" or ".xlsx" or ".zip";

        if (!allowed)
            throw new ArgumentException("Tipo de archivo no permitido. Se aceptan PDF, imágenes, Word, Excel y ZIP.");

        if (file.Length > 25 * 1024 * 1024)
            throw new ArgumentException("El archivo supera el máximo permitido de 25 MB.");

        var clientId = forcedClientId ?? request.ClientId;
        if (clientId is null) throw new ArgumentException("Debe indicar el cliente al que pertenece el documento.");

        var client = await _db.Clients.FirstOrDefaultAsync(c => c.Id == clientId && !c.IsDeleted, ct)
                     ?? throw new KeyNotFoundException("El cliente indicado no existe.");

        if (request.CaseFileId.HasValue && !await _db.CaseFiles.AnyAsync(c => c.Id == request.CaseFileId && c.ClientId == client.Id, ct))
            throw new ArgumentException("El expediente indicado no pertenece a este cliente.");

        await using var stream = file.OpenReadStream();
        var stored = await _storage.SaveAsync(stream, file.FileName, contentType, ct);

        var groupId = Guid.NewGuid();
        var previous = request.CaseFileId.HasValue
            ? await _db.Documents.Where(d => d.CaseFileId == request.CaseFileId && d.OriginalName == file.FileName && d.IsCurrent)
                .OrderByDescending(d => d.Version).FirstOrDefaultAsync(ct)
            : null;
        if (previous is not null)
        {
            previous.IsCurrent = false;
            groupId = previous.VersionGroupId ?? Guid.NewGuid();
            previous.VersionGroupId = groupId;
        }

        var document = new Document
        {
            ClientId = client.Id,
            CaseFileId = request.CaseFileId,
            OrderId = request.OrderId,
            Category = request.Category,
            FileName = stored.FileName,
            OriginalName = Path.GetFileName(file.FileName),
            ContentType = contentType,
            SizeBytes = stored.SizeBytes,
            StoragePath = stored.StoragePath,
            Sha256 = stored.Sha256,
            Version = previous is null ? 1 : previous.Version + 1,
            VersionGroupId = groupId,
            IsCurrent = true,
            UploadedByUserId = _current.UserId,
            UploadedByName = _current.FullName ?? _current.Email ?? "Sistema",
            ClientVisible = request.ClientVisible,
            Description = request.Description,
        };
        _db.Documents.Add(document);

        if (request.CaseFileId.HasValue)
        {
            _db.CaseEvents.Add(new CaseEvent
            {
                CaseFileId = request.CaseFileId.Value,
                Type = CaseEventType.DocumentAdded,
                Title = $"Documento agregado: {document.OriginalName}",
                Description = request.Description,
                ActorUserId = _current.UserId,
                ActorName = document.UploadedByName,
                ClientVisible = request.ClientVisible,
            });
        }

        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("upload", "Document", document.Id.ToString(),
            after: new { document.OriginalName, document.Category, document.SizeBytes }, ct: ct);

        // Aviso al cliente en tiempo real y por push (solo si el documento es visible).
        if (client.UserId.HasValue && request.ClientVisible && !_current.IsStaff)
        {
            await _notifications.NotifyUserAsync(client.UserId.Value, NotificationType.DocumentAvailable,
                "Nuevo documento disponible",
                $"Se agregó «{document.OriginalName}» a su expediente.",
                deepLink: request.CaseFileId.HasValue ? $"/cases/{request.CaseFileId}" : "/documents",
                data: new { documentId = document.Id, caseFileId = request.CaseFileId }, ct: ct);
        }
        else
        {
            await _realtime.ToStaffAsync("document.added", new
            {
                documentId = document.Id,
                clientId = client.Id,
                caseFileId = request.CaseFileId,
                originalName = document.OriginalName,
                uploadedBy = document.UploadedByName,
                at = DateTime.UtcNow,
            }, ct);

            // El personal subió un documento visible: se notifica al cliente.
            if (client.UserId.HasValue && request.ClientVisible)
            {
                await _notifications.NotifyUserAsync(client.UserId.Value, NotificationType.DocumentAvailable,
                    "Nuevo documento disponible",
                    $"GH Contadores agregó «{document.OriginalName}» a su expediente.",
                    deepLink: request.CaseFileId.HasValue ? $"/cases/{request.CaseFileId}" : "/documents",
                    data: new { documentId = document.Id, caseFileId = request.CaseFileId }, ct: ct);
            }
        }

        return await ToDtoAsync(document, ct);
    }

    public Task<DocumentDto> ToDtoAsync(Document document, CancellationToken ct = default)
    {
        var url = $"/api/v1/public/files/{_storage.CreateDownloadToken(document.StoragePath, document.OriginalName, document.ContentType, TimeSpan.FromMinutes(15))}";
        return Task.FromResult(DocumentDto.From(document, url));
    }

    public DownloadLinkDto CreateLink(Document document)
    {
        var token = _storage.CreateDownloadToken(document.StoragePath, document.OriginalName, document.ContentType, TimeSpan.FromMinutes(15));
        return new DownloadLinkDto($"/api/v1/public/files/{token}", DateTime.UtcNow.AddMinutes(15));
    }
}
