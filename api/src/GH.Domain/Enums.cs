namespace GH.Domain;

/// <summary>Estado de una cuenta de usuario. Toda cuenta creada desde el app nace Pending
/// y solo el administrador puede activarla.</summary>
public enum UserStatus
{
    /// <summary>Solicitud aprobada pendiente de primer acceso / recién creada sin activar.</summary>
    Pending = 0,
    Active = 1,
    Suspended = 2,
    Rejected = 3,
}

public enum AccountRequestStatus
{
    Pending = 0,
    Approved = 1,
    Rejected = 2,
    Cancelled = 3,
}

public enum AccountRequestSource
{
    App = 0,
    Web = 1,
    Admin = 2,
}

/// <summary>Tipo de cliente del bufete contable-legal.</summary>
public enum ClientType
{
    /// <summary>Persona física nacional.</summary>
    Individual = 0,
    /// <summary>Persona jurídica (sociedad).</summary>
    Company = 1,
    /// <summary>Inversionista o residente extranjero (público objetivo declarado de la firma).</summary>
    ForeignInvestor = 2,
}

public enum ClientStatus
{
    Lead = 0,
    Active = 1,
    Inactive = 2,
    Blocked = 3,
}

public enum ClientSource
{
    App = 0,
    Web = 1,
    Whatsapp = 2,
    Referral = 3,
    WalkIn = 4,
    Campaign = 5,
    Phone = 6,
    Admin = 7,
}

public enum InteractionType
{
    Call = 0,
    Email = 1,
    Meeting = 2,
    Whatsapp = 3,
    Note = 4,
    Task = 5,
    System = 6,
}

/// <summary>Materia del expediente.</summary>
public enum CaseMatter
{
    Contable = 0,
    Tributario = 1,
    Legal = 2,
    Municipal = 3,
    Laboral = 4,
    Otro = 5,
}

/// <summary>Ente ante el que se tramita (instituciones costarricenses reales).</summary>
public enum CaseEntity
{
    Ninguno = 0,
    SUGEF = 1,
    ACAM = 2,
    ATV = 3,
    CCSS = 4,
    INS = 5,
    MEIC = 6,
    MAG = 7,
    ICT = 8,
    Municipalidad = 9,
    RTBF = 10,
    MinisterioSalud = 11,
    RegistroNacional = 12,
    Otro = 13,
}

public enum CaseStatus
{
    Open = 0,
    InProgress = 1,
    WaitingClient = 2,
    OnHold = 3,
    Completed = 4,
    Closed = 5,
    Cancelled = 6,
}

public enum Priority
{
    Low = 0,
    Normal = 1,
    High = 2,
    Urgent = 3,
}

public enum TaskStatus
{
    Todo = 0,
    InProgress = 1,
    Done = 2,
    Blocked = 3,
    Cancelled = 4,
}

public enum CaseEventType
{
    Created = 0,
    StatusChanged = 1,
    TaskAdded = 2,
    TaskCompleted = 3,
    DocumentAdded = 4,
    DocumentRemoved = 5,
    MessageAdded = 6,
    PaymentReceived = 7,
    Note = 8,
    DueDateChanged = 9,
    AssignmentChanged = 10,
    ProgressChanged = 11,
}

public enum DocumentCategory
{
    Expediente = 0,
    Identidad = 1,
    Contable = 2,
    Tributario = 3,
    Legal = 4,
    Municipal = 5,
    Contrato = 6,
    Comprobante = 7,
    Otro = 8,
}

public enum DeliveryMode
{
    Digital = 0,
    Presencial = 1,
    Mixto = 2,
}

public enum CartStatus
{
    Active = 0,
    Converted = 1,
    Abandoned = 2,
}

public enum OrderStatus
{
    PendingPayment = 0,
    Paid = 1,
    InProcess = 2,
    Completed = 3,
    Cancelled = 4,
    Refunded = 5,
}

public enum PaymentMethod
{
    Card = 0,
    Sinpe = 1,
    Transfer = 2,
}

public enum PaymentStatus
{
    Initiated = 0,
    Approved = 1,
    Declined = 2,
    Pending = 3,
    Refunded = 4,
}

public enum NotificationType
{
    System = 0,
    AccountApproved = 1,
    AccountRejected = 2,
    CaseCreated = 3,
    CaseStatusChanged = 4,
    TaskAssigned = 5,
    TaskDueSoon = 6,
    TaskCompleted = 7,
    DocumentAvailable = 8,
    OrderPaid = 9,
    OrderStatusChanged = 10,
    PaymentFailed = 11,
    MessageReceived = 12,
    QuoteRequested = 13,
}

public enum NotificationChannel
{
    InApp = 0,
    Push = 1,
    Email = 2,
}

public enum NotificationStatus
{
    Queued = 0,
    Sent = 1,
    Failed = 2,
    Read = 3,
}

public enum QuoteStatus
{
    New = 0,
    Contacted = 1,
    Quoted = 2,
    Converted = 3,
    Discarded = 4,
}

public enum DevicePlatform
{
    Android = 0,
    Ios = 1,
    Web = 2,
}

public enum CaseFileSource
{
    Manual = 0,
    Order = 1,
    Recurring = 2,
    Import = 3,
}
