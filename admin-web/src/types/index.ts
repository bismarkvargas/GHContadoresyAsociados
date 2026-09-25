/**
 * Tipos del dominio — espejo de docs/02-modelo-datos.md.
 * Todos los identificadores son GUID string; todas las fechas ISO-8601 UTC.
 */

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface ListParams {
  page?: number
  pageSize?: number
  sort?: string
  order?: 'asc' | 'desc'
  search?: string
  [key: string]: unknown
}

/* ------------------------------------------------------------------ */
/* Identidad                                                           */
/* ------------------------------------------------------------------ */

export type UserStatus = 'Pending' | 'Active' | 'Suspended' | 'Rejected'

export interface User {
  id: string
  email: string
  fullName: string
  phone?: string | null
  idNumber?: string | null
  status: UserStatus
  isStaff: boolean
  clientId?: string | null
  avatarUrl?: string | null
  locale: string
  timeZone: string
  lastLoginAt?: string | null
  createdAt: string
  updatedAt: string
  failedLoginCount: number
  lockoutUntil?: string | null
  roles: string[]
}

export interface Role {
  id: string
  name: string
  description: string
  isSystem: boolean
  isStaffRole: boolean
  createdAt: string
  permissionCodes: string[]
  userCount?: number
}

export interface Permission {
  id: string
  code: string
  module: string
  action: string
  description: string
}

export interface AuthUser {
  id: string
  fullName: string
  email: string
  avatarUrl?: string | null
  status: UserStatus
  isStaff: boolean
  clientId?: string | null
}

export interface LoginResponse {
  accessToken: string
  refreshToken: string
  expiresAt: string
  user: AuthUser
  roles: string[]
  permissions: string[]
}

export interface Notification {
  id: string
  userId: string
  /** Contrato real de la API: destinatario resuelto y enlace profundo. */
  userEmail?: string | null
  userName?: string | null
  title: string
  body: string
  type: NotificationType
  dataJson?: string | null
  deepLink?: string | null
  channel: 'Push' | 'InApp' | 'Email' | string
  status: 'Queued' | 'Sent' | 'Failed' | 'Read' | string
  isRead?: boolean
  fcmMessageId?: string | null
  error?: string | null
  createdAt: string
  sentAt?: string | null
  readAt?: string | null
}

/** Resumen de la bandeja de notificaciones (`GET /admin/notifications/summary`). */
export interface NotificationSummary {
  total: number
  unread: number
  byType: { type: NotificationType | string; label: string; count: number }[]
  last30Days: number
}

export type NotificationType =
  | 'AccountApproved'
  | 'AccountRejected'
  | 'CaseCreated'
  | 'CaseStatusChanged'
  | 'TaskAssigned'
  | 'TaskDueSoon'
  | 'TaskCompleted'
  | 'DocumentAvailable'
  | 'OrderPaid'
  | 'OrderStatusChanged'
  | 'PaymentFailed'
  | 'MessageReceived'
  | 'System'

/* ------------------------------------------------------------------ */
/* Solicitudes de cuenta                                               */
/* ------------------------------------------------------------------ */

export type AccountRequestStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled'

export interface AccountRequest {
  id: string
  fullName: string
  email: string
  phone: string
  idNumber: string
  clientType: ClientType
  company?: string | null
  message?: string | null
  source: 'app' | 'web' | 'admin'
  status: AccountRequestStatus
  reviewedByUserId?: string | null
  reviewedAt?: string | null
  rejectionReason?: string | null
  createdUserId?: string | null
  ipAddress?: string | null
  trackingCode: string
  createdAt: string
}

/* ------------------------------------------------------------------ */
/* CRM                                                                 */
/* ------------------------------------------------------------------ */

export type ClientType = 'Individual' | 'Company' | 'ForeignInvestor'
export type ClientStatus = 'Lead' | 'Active' | 'Inactive' | 'Blocked'
export type ClientSource = 'app' | 'web' | 'whatsapp' | 'referral' | 'walkin' | 'campaign'

export interface Client {
  id: string
  code: string
  clientType: ClientType
  legalName: string
  tradeName?: string | null
  idNumber: string
  email: string
  phone: string
  whatsapp?: string | null
  address?: string | null
  province?: string | null
  canton?: string | null
  district?: string | null
  country: string
  status: ClientStatus
  source: ClientSource | string
  assignedToUserId?: string | null
  assignedToName?: string | null
  tags?: string[]
  /** Compatibilidad con la forma antigua del contrato (`TagsCsv`). */
  tagsCsv?: string | null
  notes?: string | null
  userId?: string | null
  hasAppAccount?: boolean
  lastContactAt?: string | null
  createdAt: string
  updatedAt: string
  isDeleted: boolean
  // Derivados (los calcula la API para la ficha)
  openCases?: number
  totalCases?: number
  totalBilled?: number
  counts?: {
    caseFiles?: number
    openCases?: number
    overdueTasks?: number
    documents?: number
    orders?: number
    totalSpent?: number
  }
}

export interface ClientContact {
  id: string
  clientId: string
  fullName: string
  position?: string | null
  email: string
  phone?: string | null
  isPrimary: boolean
}

export type InteractionType = 'Call' | 'Email' | 'Meeting' | 'Whatsapp' | 'Note' | 'Task' | 'System'

export interface ClientInteraction {
  id: string
  clientId: string
  type: InteractionType
  subject: string
  notes?: string | null
  occurredAt: string
  reminderAt?: string | null
  isCompleted: boolean
  createdByUserId?: string | null
}

/* ------------------------------------------------------------------ */
/* Expedientes                                                         */
/* ------------------------------------------------------------------ */

export type CaseMatter = 'Contable' | 'Tributario' | 'Legal' | 'Municipal' | 'Laboral' | 'Otro'
export type CaseEntity =
  | 'SUGEF'
  | 'ACAM'
  | 'ATV'
  | 'CCSS'
  | 'INS'
  | 'MEIC'
  | 'MAG'
  | 'ICT'
  | 'Municipalidad'
  | 'RTBF'
  | 'Otro'
export type CaseStatus =
  | 'Open'
  | 'InProgress'
  | 'WaitingClient'
  | 'OnHold'
  | 'Completed'
  | 'Closed'
  | 'Cancelled'
export type Priority = 'Low' | 'Normal' | 'High' | 'Urgent'

export interface CaseFile {
  id: string
  code: string
  clientId: string
  clientName?: string
  clientCode?: string | null
  title: string
  description?: string | null
  matter: CaseMatter
  entity: CaseEntity
  referenceNumber?: string | null
  status: CaseStatus
  priority: Priority
  responsibleUserId?: string | null
  responsibleName?: string | null
  openedAt: string
  dueAt?: string | null
  closedAt?: string | null
  agreedAmount?: number | null
  currency: string
  progressPercent: number
  clientVisible: boolean
  orderItemId?: string | null
  source?: string | null
  documentCount?: number
  taskCount?: number
  openTaskCount?: number
  /** La API devuelve los conteos agrupados. */
  taskCounts?: { total?: number; open?: number; done?: number; overdue?: number }
}

export type CaseTaskStatus = 'Todo' | 'InProgress' | 'Done' | 'Blocked' | 'Cancelled'

export interface CaseTask {
  id: string
  caseFileId: string
  title: string
  description?: string | null
  status: CaseTaskStatus
  priority: Priority
  dueAt?: string | null
  completedAt?: string | null
  assignedToUserId?: string | null
  assignedToName?: string | null
  createdByUserId?: string | null
  sortOrder: number
  clientVisible: boolean
}

export type CaseEventType =
  | 'Created'
  | 'StatusChanged'
  | 'TaskAdded'
  | 'TaskCompleted'
  | 'DocumentAdded'
  | 'MessageAdded'
  | 'PaymentReceived'
  | 'Note'
  | 'DueDateChanged'

export interface CaseEvent {
  id: string
  caseFileId: string
  type: CaseEventType
  title: string
  description?: string | null
  actorUserId?: string | null
  actorName?: string | null
  clientVisible: boolean
  metadataJson?: string | null
  createdAt: string
}

export interface Message {
  id: string
  caseFileId?: string | null
  clientId: string
  senderUserId?: string | null
  senderName?: string | null
  body: string
  attachmentDocumentId?: string | null
  isFromClient: boolean
  readByStaffAt?: string | null
  readByClientAt?: string | null
  createdAt: string
}

/* ------------------------------------------------------------------ */
/* Documentos                                                          */
/* ------------------------------------------------------------------ */

export type DocumentCategory =
  | 'Expediente'
  | 'Identidad'
  | 'Contable'
  | 'Tributario'
  | 'Legal'
  | 'Municipal'
  | 'Contrato'
  | 'Comprobante'
  | 'Otro'

export interface DocumentItem {
  id: string
  clientId?: string | null
  caseFileId?: string | null
  orderId?: string | null
  category: DocumentCategory
  fileName: string
  originalName: string
  contentType: string
  sizeBytes: number
  storagePath: string
  sha256: string
  version: number
  isCurrent: boolean
  uploadedByUserId?: string | null
  uploadedByName?: string | null
  uploadedAt: string
  clientVisible: boolean
  isDeleted: boolean
  caseCode?: string | null
  clientName?: string | null
  downloadUrl?: string
}

/* ------------------------------------------------------------------ */
/* Catálogo                                                            */
/* ------------------------------------------------------------------ */

export type DeliveryMode = 'Digital' | 'Presencial' | 'Mixto'

export interface ProductCategory {
  id: string
  slug: string
  name: string
  description: string
  iconName: string
  sortOrder: number
  isActive: boolean
  imageUrl?: string | null
  productCount?: number
}

export interface Product {
  id: string
  sku: string
  slug: string
  name: string
  shortDescription: string
  description: string
  price: number
  currency: string
  taxRate: number
  categoryId: string
  categorySlug?: string
  categoryName?: string
  imageUrl?: string | null
  galleryJson?: string | null
  isActive: boolean
  isFeatured: boolean
  requiresCase: boolean
  deliveryMode: DeliveryMode
  estimatedDays?: number | null
  sortOrder: number
  sourceUrl?: string | null
  seoTitle?: string | null
  seoDescription?: string | null
  createdAt: string
  updatedAt: string
  isDeleted: boolean
}

/* ------------------------------------------------------------------ */
/* Venta                                                               */
/* ------------------------------------------------------------------ */

export type OrderStatus =
  | 'PendingPayment'
  | 'Paid'
  | 'InProcess'
  | 'Completed'
  | 'Cancelled'
  | 'Refunded'

export interface OrderItem {
  id: string
  orderId: string
  productId: string
  nameSnapshot: string
  unitPrice: number
  quantity: number
  total: number
  caseFileId?: string | null
  caseCode?: string | null
}

export interface InvoiceData {
  legalName: string
  idNumber: string
  email: string
  phone?: string
  address?: string
  activityCode?: string
}

export interface Order {
  id: string
  number: string
  userId: string
  customerName?: string | null
  clientId?: string | null
  clientName?: string | null
  status: OrderStatus
  subtotal: number
  discount: number
  tax: number
  total: number
  currency: string
  notes?: string | null
  requiresInvoice: boolean
  invoiceDataJson?: string | null
  items: OrderItem[]
  payments?: Payment[]
  createdAt: string
  paidAt?: string | null
  completedAt?: string | null
}

export type PaymentMethod = 'Card' | 'Sinpe' | 'Transfer'
export type PaymentStatus = 'Initiated' | 'Approved' | 'Declined' | 'Pending' | 'Refunded'

export interface Payment {
  id: string
  orderId: string
  orderNumber?: string | null
  provider: string
  method: PaymentMethod
  status: PaymentStatus
  amount: number
  currency: string
  reference: string
  authorizationCode?: string | null
  cardBrand?: string | null
  cardLast4?: string | null
  cardHolder?: string | null
  failureReason?: string | null
  rawRequestJson?: string | null
  rawResponseJson?: string | null
  createdAt: string
  processedAt?: string | null
}

/* ------------------------------------------------------------------ */
/* Soporte                                                             */
/* ------------------------------------------------------------------ */

export type QuoteStatus = 'New' | 'Contacted' | 'Quoted' | 'Converted' | 'Discarded'

export interface QuoteRequest {
  id: string
  fullName: string
  email: string
  phone: string
  company?: string | null
  serviceId?: string | null
  serviceName?: string | null
  message?: string | null
  status: QuoteStatus
  handledByUserId?: string | null
  handledByName?: string | null
  clientId?: string | null
  createdAt: string
}

export interface AuditLog {
  id: string
  userId?: string | null
  userName?: string | null
  action: string
  entityName: string
  entityId?: string | null
  beforeJson?: string | null
  afterJson?: string | null
  ipAddress?: string | null
  userAgent?: string | null
  createdAt: string
}

export interface Setting {
  key: string
  value: string
  group: string
  description: string
  updatedAt: string
}

export interface DashboardSummary {
  kpis: {
    activeClients: number
    openCases: number
    overdueTasks: number
    monthRevenue: number
    pendingAccountRequests: number
    pendingQuotes: number
    newClientsThisMonth: number
    ordersThisMonth: number
    unreadMessages?: number
    documentsThisMonth?: number
  }
  ordersByStatus: { status: OrderStatus; count: number; total: number }[]
  salesByMonth: { month: string; total: number; orders: number }[]
  leadsFunnel: { stage: string; count: number; color: string }[]
  latestActivities: CaseEvent[]
  pendingAccountRequests: AccountRequest[]
  overdueTasksList: CaseTask[]
  casesByStatus: { status: CaseStatus; count: number }[]
  casesByMatter: { matter: CaseMatter; count: number }[]
  revenueByCategory: { category: string; total: number }[]
}

export interface ReportSales {
  byMonth: { month: string; total: number; orders: number }[]
  byCategory: { category: string; total: number; orders: number }[]
  byService: { productId: string; name: string; quantity: number; total: number }[]
  totals: { subtotal: number; tax: number; total: number; orders: number; averageTicket: number }
}

export interface ReportCases {
  byStatus: { status: CaseStatus; count: number }[]
  byMatter: { matter: CaseMatter; count: number }[]
  byEntity: { entity: CaseEntity; count: number }[]
  overdue: { id: string; code: string; title: string; clientName: string; dueAt: string; status: CaseStatus }[]
  averageProgress: number
}

export interface ReportProductivity {
  rows: {
    userId: string
    fullName: string
    role: string
    openCases: number
    closedCases: number
    tasksDone: number
    tasksOverdue: number
    interactions: number
  }[]
  overdueTasks: {
    id: string
    title: string
    caseCode: string
    assignedToName: string
    dueAt: string | null
    priority: Priority
    status: CaseTaskStatus
  }[]
}
