using GH.Domain;
using GH.Domain.Entities;
using TaskStatus = GH.Domain.TaskStatus;

namespace GH.Api.Contracts;

// ------------------------------------------------------------------ CRM: clientes
public record ClientCountsDto(int CaseFiles, int OpenCases, int OverdueTasks, int Documents, int Orders, decimal TotalSpent);

public record ClientDto(
    Guid Id,
    string Code,
    ClientType ClientType,
    string LegalName,
    string? TradeName,
    string? IdNumber,
    string? Email,
    string? Phone,
    string? Whatsapp,
    string? Address,
    string? Province,
    string? Canton,
    string? District,
    string Country,
    ClientStatus Status,
    ClientSource Source,
    Guid? AssignedToUserId,
    string? AssignedToName,
    IReadOnlyList<string> Tags,
    string? Notes,
    Guid? UserId,
    bool HasAppAccount,
    string? UserEmail,
    DateTime? LastContactAt,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    ClientCountsDto? Counts = null)
{
    public static ClientDto From(Client c, ClientCountsDto? counts = null, string? appUserEmail = null) =>
        new(c.Id, c.Code, c.ClientType, c.LegalName, c.TradeName, c.IdNumber, c.Email, c.Phone, c.Whatsapp,
            c.Address, c.Province, c.Canton, c.District, c.Country, c.Status, c.Source,
            c.AssignedToUserId, c.AssignedToUser?.FullName, SplitTags(c.TagsCsv), c.Notes,
            c.UserId, c.UserId.HasValue, appUserEmail, c.LastContactAt, c.CreatedAt, c.UpdatedAt, counts);

    public static IReadOnlyList<string> SplitTags(string? csv) =>
        string.IsNullOrWhiteSpace(csv)
            ? Array.Empty<string>()
            : csv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
}

public record ClientCreateRequest(
    ClientType ClientType,
    string LegalName,
    string? TradeName,
    string? IdNumber,
    string? Email,
    string? Phone,
    string? Whatsapp,
    string? Address,
    string? Province,
    string? Canton,
    string? District,
    string? Country,
    ClientStatus Status,
    ClientSource Source,
    Guid? AssignedToUserId,
    IReadOnlyList<string>? Tags,
    string? Notes,
    bool CreateAppAccount,
    string? AccountPassword);

public record ClientUpdateRequest(
    ClientType ClientType,
    string LegalName,
    string? TradeName,
    string? IdNumber,
    string? Email,
    string? Phone,
    string? Whatsapp,
    string? Address,
    string? Province,
    string? Canton,
    string? District,
    string? Country,
    ClientStatus Status,
    ClientSource Source,
    Guid? AssignedToUserId,
    IReadOnlyList<string>? Tags,
    string? Notes);

public record ClientContactDto(Guid Id, Guid ClientId, string FullName, string? Position, string? Email, string? Phone, bool IsPrimary, DateTime CreatedAt)
{
    public static ClientContactDto From(ClientContact c) => new(c.Id, c.ClientId, c.FullName, c.Position, c.Email, c.Phone, c.IsPrimary, c.CreatedAt);
}

public record ClientContactRequest(string FullName, string? Position, string? Email, string? Phone, bool IsPrimary);

public record ClientInteractionDto(
    Guid Id, Guid ClientId, InteractionType Type, string Subject, string? Notes,
    DateTime OccurredAt, DateTime? ReminderAt, bool IsCompleted, Guid? CreatedByUserId, string? CreatedByName, DateTime CreatedAt)
{
    public static ClientInteractionDto From(ClientInteraction i) =>
        new(i.Id, i.ClientId, i.Type, i.Subject, i.Notes, i.OccurredAt, i.ReminderAt, i.IsCompleted,
            i.CreatedByUserId, i.CreatedByUser?.FullName, i.CreatedAt);
}

public record ClientInteractionRequest(
    InteractionType Type, string Subject, string? Notes, DateTime? OccurredAt, DateTime? ReminderAt, bool IsCompleted);

// ------------------------------------------------------------------ Expedientes
public record CaseTaskCountsDto(int Total, int Done, int Pending, int Overdue);

public record CaseFileDto(
    Guid Id,
    string Code,
    Guid ClientId,
    string ClientName,
    string? ClientCode,
    string Title,
    string? Description,
    CaseMatter Matter,
    CaseEntity Entity,
    string? ReferenceNumber,
    CaseStatus Status,
    Priority Priority,
    int ProgressPercent,
    Guid? ResponsibleUserId,
    string? ResponsibleName,
    DateTime OpenedAt,
    DateTime? DueAt,
    DateTime? ClosedAt,
    decimal? AgreedAmount,
    string Currency,
    bool ClientVisible,
    CaseFileSource Source,
    Guid? OrderItemId,
    int DocumentCount,
    CaseTaskCountsDto? TaskCounts,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    IReadOnlyList<CaseTaskDto>? Tasks = null,
    IReadOnlyList<DocumentDto>? Documents = null)
{
    public static CaseFileDto From(CaseFile c, int documentCount = 0, CaseTaskCountsDto? counts = null) =>
        new(c.Id, c.Code, c.ClientId, c.Client?.LegalName ?? string.Empty, c.Client?.Code, c.Title, c.Description,
            c.Matter, c.Entity, c.ReferenceNumber, c.Status, c.Priority, c.ProgressPercent,
            c.ResponsibleUserId, c.ResponsibleUser?.FullName, c.OpenedAt, c.DueAt, c.ClosedAt,
            c.AgreedAmount, c.Currency, c.ClientVisible, c.Source, c.OrderItemId,
            documentCount, counts, c.CreatedAt, c.UpdatedAt);
}

public record CaseCreateRequest(
    Guid ClientId,
    string Title,
    string? Description,
    CaseMatter Matter,
    CaseEntity Entity,
    string? ReferenceNumber,
    CaseStatus Status,
    Priority Priority,
    int ProgressPercent,
    Guid? ResponsibleUserId,
    DateTime? DueAt,
    decimal? AgreedAmount,
    string? Currency,
    bool ClientVisible,
    IReadOnlyList<CaseTaskRequest>? Tasks);

public record CaseUpdateRequest(
    string Title,
    string? Description,
    CaseMatter Matter,
    CaseEntity Entity,
    string? ReferenceNumber,
    Priority Priority,
    int ProgressPercent,
    Guid? ResponsibleUserId,
    DateTime? DueAt,
    decimal? AgreedAmount,
    string? Currency,
    bool ClientVisible);

public record CaseStatusChangeRequest(CaseStatus Status, int? ProgressPercent, string? Note, bool NotifyClient = true);

public record CaseTaskDto(
    Guid Id, Guid CaseFileId, string Title, string? Description, TaskStatus Status, Priority Priority,
    DateTime? DueAt, DateTime? CompletedAt, Guid? AssignedToUserId, string? AssignedToName,
    Guid? CreatedByUserId, string? CreatedByName, int SortOrder, bool ClientVisible, bool ClientCanComplete,
    bool IsOverdue, DateTime CreatedAt, DateTime UpdatedAt)
{
    public static CaseTaskDto From(CaseTask t) =>
        new(t.Id, t.CaseFileId, t.Title, t.Description, t.Status, t.Priority, t.DueAt, t.CompletedAt,
            t.AssignedToUserId, t.AssignedToUser?.FullName, t.CreatedByUserId, t.CreatedByUser?.FullName,
            t.SortOrder, t.ClientVisible, t.ClientCanComplete,
            t.DueAt.HasValue && t.DueAt < DateTime.UtcNow
                && (t.Status is TaskStatus.Todo or TaskStatus.InProgress or TaskStatus.Blocked),
            t.CreatedAt, t.UpdatedAt);
}

public record CaseTaskRequest(
    string Title, string? Description, TaskStatus Status, Priority Priority, DateTime? DueAt,
    Guid? AssignedToUserId, int SortOrder, bool ClientVisible, bool ClientCanComplete);

public record CaseTaskUpdateRequest(
    string Title, string? Description, TaskStatus Status, Priority Priority, DateTime? DueAt,
    Guid? AssignedToUserId, int SortOrder, bool ClientVisible, bool ClientCanComplete);

public record CaseEventDto(
    Guid Id, Guid CaseFileId, CaseEventType Type, string Title, string? Description,
    Guid? ActorUserId, string? ActorName, bool ClientVisible, string? MetadataJson, DateTime CreatedAt)
{
    public static CaseEventDto From(CaseEvent e) =>
        new(e.Id, e.CaseFileId, e.Type, e.Title, e.Description, e.ActorUserId,
            e.ActorUser?.FullName ?? e.ActorName, e.ClientVisible, e.MetadataJson, e.CreatedAt);
}

public record MessageDto(
    Guid Id, Guid ClientId, Guid? CaseFileId, string? CaseFileCode, Guid SenderUserId, string SenderName,
    string Body, bool IsFromClient, Guid? AttachmentDocumentId, string? AttachmentName,
    bool ReadByStaff, bool ReadByClient, DateTime CreatedAt)
{
    public static MessageDto From(Message m) =>
        new(m.Id, m.ClientId, m.CaseFileId, m.CaseFile?.Code, m.SenderUserId, m.SenderName, m.Body, m.IsFromClient,
            m.AttachmentDocumentId, m.AttachmentDocument?.OriginalName, m.ReadByStaffAt.HasValue, m.ReadByClientAt.HasValue, m.CreatedAt);
}

public record SendMessageRequest(Guid? CaseFileId, string Body, Guid? AttachmentDocumentId);

// ------------------------------------------------------------------ Documentos
public record DocumentDto(
    Guid Id,
    Guid? ClientId,
    Guid? CaseFileId,
    string? CaseFileCode,
    Guid? OrderId,
    DocumentCategory Category,
    string FileName,
    string OriginalName,
    string ContentType,
    long SizeBytes,
    int Version,
    bool IsCurrent,
    string UploadedByName,
    bool ClientVisible,
    string? Description,
    DateTime UploadedAt,
    string? DownloadUrl)
{
    public static DocumentDto From(Document d, string? downloadUrl = null) =>
        new(d.Id, d.ClientId, d.CaseFileId, d.CaseFile?.Code, d.OrderId, d.Category, d.FileName, d.OriginalName,
            d.ContentType, d.SizeBytes, d.Version, d.IsCurrent, d.UploadedByName, d.ClientVisible, d.Description,
            d.UploadedAt, downloadUrl);
}

public record DocumentUploadRequest(
    Guid? ClientId, Guid? CaseFileId, Guid? OrderId, DocumentCategory Category, bool ClientVisible, string? Description);

public record DownloadLinkDto(string Url, DateTime ExpiresAt);

// ------------------------------------------------------------------ Venta
public record CartItemDto(
    Guid Id, Guid ProductId, string ProductName, string ProductSlug, string? ImageUrl,
    decimal UnitPrice, int Quantity, decimal Total, string Currency, bool RequiresCase, string? EstimatedDelivery)
{
    public static CartItemDto From(CartItem i) =>
        new(i.Id, i.ProductId, i.Product?.Name ?? string.Empty, i.Product?.Slug ?? string.Empty, i.Product?.ImageUrl,
            i.UnitPrice, i.Quantity, i.UnitPrice * i.Quantity, i.Product?.Currency ?? "USD",
            i.Product?.RequiresCase ?? true,
            i.Product?.EstimatedDays is int d ? $"{d} días hábiles" : null);
}

public record CartDto(Guid Id, IReadOnlyList<CartItemDto> Items, int ItemCount, decimal Subtotal, decimal Tax, decimal Total, string Currency);

public record AddCartItemRequest(Guid ProductId, int Quantity, string? Notes);
public record UpdateCartItemRequest(int Quantity);

public record OrderItemDto(
    Guid Id, Guid ProductId, string NameSnapshot, decimal UnitPrice, int Quantity, decimal Total, Guid? CaseFileId, string? CaseFileCode)
{
    public static OrderItemDto From(OrderItem i) =>
        new(i.Id, i.ProductId, i.NameSnapshot, i.UnitPrice, i.Quantity, i.Total, i.CaseFileId, i.CaseFile?.Code);
}

public record PaymentDto(
    Guid Id, Guid OrderId, string OrderNumber, string Provider, PaymentMethod Method, PaymentStatus Status,
    decimal Amount, string Currency, string Reference, string? AuthorizationCode, string? CardBrand,
    string? CardLast4, string? CardHolder, string? FailureReason, DateTime CreatedAt, DateTime? ProcessedAt)
{
    public static PaymentDto From(Payment p, string? orderNumber = null) =>
        new(p.Id, p.OrderId, orderNumber ?? p.Order?.Number ?? string.Empty, p.Provider, p.Method, p.Status,
            p.Amount, p.Currency, p.Reference, p.AuthorizationCode, p.CardBrand, p.CardLast4, p.CardHolder,
            p.FailureReason, p.CreatedAt, p.ProcessedAt);
}

public record OrderDto(
    Guid Id, string Number, Guid UserId, Guid? ClientId, string? ClientName, OrderStatus Status,
    decimal Subtotal, decimal Discount, decimal Tax, decimal Total, string Currency,
    string? CustomerName, string? CustomerEmail, string? CustomerPhone, string? Notes,
    bool RequiresInvoice, string? InvoiceDataJson, DateTime CreatedAt, DateTime? PaidAt, DateTime? CompletedAt,
    IReadOnlyList<OrderItemDto>? Items = null, IReadOnlyList<PaymentDto>? Payments = null)
{
    public static OrderDto From(Order o, bool withItems = true) =>
        new(o.Id, o.Number, o.UserId, o.ClientId, o.Client?.LegalName, o.Status, o.Subtotal, o.Discount, o.Tax,
            o.Total, o.Currency, o.CustomerName, o.CustomerEmail, o.CustomerPhone, o.Notes, o.RequiresInvoice,
            o.InvoiceDataJson, o.CreatedAt, o.PaidAt, o.CompletedAt,
            withItems ? o.Items.Select(OrderItemDto.From).ToList() : null,
            withItems ? o.Payments.Select(p => PaymentDto.From(p, o.Number)).ToList() : null);
}

public record CheckoutItemRequest(Guid ProductId, int Quantity, string? Notes);

public record InvoiceDataDto(string? LegalName, string? IdNumber, string? Email, string? Phone, string? Address, string? Activity);

public record CreateOrderRequest(
    IReadOnlyList<CheckoutItemRequest>? Items,
    bool UseCart,
    string? CustomerName,
    string? CustomerEmail,
    string? CustomerPhone,
    string? Notes,
    bool RequiresInvoice,
    InvoiceDataDto? InvoiceData);

public record CardDto(string Number, string Holder, string Expiry, string Cvv);

public record PayOrderRequest(PaymentMethod Method, CardDto? Card, int? Installments, string? Reference, string? SinpePhone);

public record CheckoutResultDto(
    OrderDto Order,
    PaymentDto Payment,
    bool Succeeded,
    string Message,
    IReadOnlyList<string> CreatedCaseCodes);

public record OrderStatusChangeRequest(OrderStatus Status, string? Note, bool NotifyClient = true);
public record RefundRequest(string Reason);

// ------------------------------------------------------------------ Informes
public record DashboardSummaryDto(
    int ActiveClients,
    int NewClientsThisMonth,
    int OpenCases,
    int OverdueTasks,
    int PendingAccountRequests,
    int NewQuotes,
    decimal RevenueThisMonth,
    decimal RevenueLastMonth,
    int OrdersThisMonth,
    int PaidOrdersThisMonth,
    int UnreadMessages,
    int DocumentsThisMonth,
    IReadOnlyList<SalesPointDto> SalesByMonth,
    IReadOnlyList<NameCountDto> CasesByStatus,
    IReadOnlyList<NameCountDto> CasesByMatter,
    IReadOnlyList<NameCountDto> OrdersByStatus,
    IReadOnlyList<RecentActivityDto> RecentActivity,
    IReadOnlyList<NameCountDto> LeadsBySource);

public record SalesPointDto(string Label, decimal Amount, int Orders);
public record NameCountDto(string Name, string? Slug, int Count, decimal? Amount = null);

public record RecentActivityDto(
    string Id, string Kind, string Title, string? Description, string? Actor, DateTime At, string? Link);

public record SalesReportDto(
    decimal TotalRevenue, int TotalOrders, decimal AverageTicket,
    IReadOnlyList<SalesPointDto> ByMonth, IReadOnlyList<NameCountDto> ByCategory,
    IReadOnlyList<NameCountDto> TopProducts, IReadOnlyList<NameCountDto> ByStatus);

public record CaseReportDto(
    int Total, int Open, int Overdue, double AverageDaysToClose,
    IReadOnlyList<NameCountDto> ByStatus, IReadOnlyList<NameCountDto> ByMatter,
    IReadOnlyList<NameCountDto> ByEntity, IReadOnlyList<WorkerLoadDto> ByResponsible);

public record WorkerLoadDto(Guid UserId, string Name, int OpenCases, int OpenTasks, int OverdueTasks, int CompletedThisMonth);

public record ProductivityReportDto(IReadOnlyList<WorkerLoadDto> Workers, IReadOnlyList<SalesPointDto> TasksCompletedByMonth);
