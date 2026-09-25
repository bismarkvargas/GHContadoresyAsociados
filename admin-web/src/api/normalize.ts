/**
 * Normalización de la API .NET real hacia el modelo interno del panel.
 *
 * La API en producción devuelve varias formas distintas a las del contrato de
 * referencia (`docs/03-contrato-api.md`): nombres de campo diferentes
 * (`amount` vs `total`, `label` vs `month`, `recentActivity` vs `latestActivities`),
 * envoltorios (`{ client, cases, tasks… }`), etiquetas ya traducidas
 * (`{ name, slug, count }`) y el comodín de permisos `"*"`.
 *
 * Este módulo traduce en el borde (interceptor de axios) para que los componentes
 * sigan consumiendo un único modelo. Con `VITE_USE_MOCKS=true` no se aplica.
 */

import type {
  AccountRequest,
  AuditLog,
  CaseFile,
  CaseStatus,
  Client,
  ClientSource,
  ClientStatus,
  DashboardSummary,
  DocumentItem,
  Message,
  Notification,
  Order,
  OrderStatus,
  Paginated,
  Payment,
  PaymentStatus,
  Product,
  ProductCategory,
  QuoteRequest,
  ReportCases,
  ReportProductivity,
  ReportSales,
  Role,
  Setting,
  User,
} from '@/types'

type Rec = Record<string, unknown>

const asRecord = (value: unknown): Rec => (value && typeof value === 'object' ? (value as Rec) : {})
const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])
const str = (value: unknown, fallback = ''): string =>
  value === null || value === undefined ? fallback : String(value)
const num = (value: unknown, fallback = 0): number => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}
const bool = (value: unknown, fallback = false): boolean =>
  typeof value === 'boolean' ? value : value === 'true' ? true : value === 'false' ? false : fallback

/* ------------------------------------------------------------------ */
/* Mapas de compatibilidad                                             */
/* ------------------------------------------------------------------ */

const caseStatusMap: Record<string, CaseStatus> = {
  Abierto: 'Open',
  Open: 'Open',
  'En proceso': 'InProgress',
  InProgress: 'InProgress',
  'En espera del cliente': 'WaitingClient',
  'Espera cliente': 'WaitingClient',
  WaitingClient: 'WaitingClient',
  'En pausa': 'OnHold',
  OnHold: 'OnHold',
  Completado: 'Completed',
  Completed: 'Completed',
  Cerrado: 'Closed',
  Closed: 'Closed',
  Cancelado: 'Cancelled',
  Cancelled: 'Cancelled',
}

const clientStatusMap: Record<string, ClientStatus> = {
  Prospecto: 'Lead',
  Lead: 'Lead',
  Activo: 'Active',
  Active: 'Active',
  Inactivo: 'Inactive',
  Inactive: 'Inactive',
  Bloqueado: 'Blocked',
  Blocked: 'Blocked',
}

const orderStatusMap: Record<string, OrderStatus> = {
  'Pendiente de pago': 'PendingPayment',
  PendingPayment: 'PendingPayment',
  Pagado: 'Paid',
  Paid: 'Paid',
  'En proceso': 'InProcess',
  InProcess: 'InProcess',
  Completado: 'Completed',
  Completed: 'Completed',
  Cancelado: 'Cancelled',
  Cancelled: 'Cancelled',
  Reembolsado: 'Refunded',
  Refunded: 'Refunded',
}

const paymentStatusMap: Record<string, PaymentStatus> = {
  Iniciado: 'Initiated',
  Initiated: 'Initiated',
  Aprobado: 'Approved',
  Approved: 'Approved',
  Rechazado: 'Declined',
  Declined: 'Declined',
  Pendiente: 'Pending',
  Pending: 'Pending',
  Reembolsado: 'Refunded',
  Refunded: 'Refunded',
}

const clientSourceMap: Record<string, ClientSource> = {
  App: 'app',
  app: 'app',
  Web: 'web',
  web: 'web',
  WhatsApp: 'whatsapp',
  whatsapp: 'whatsapp',
  Referido: 'referral',
  referral: 'referral',
  Presencial: 'walkin',
  walkin: 'walkin',
  Campaña: 'campaign',
  campaign: 'campaign',
  Phone: 'referral',
}

function mapValue<T extends string>(map: Record<string, T>, value: unknown, fallback: T): T {
  const key = str(value)
  return map[key] ?? (key as T) ?? fallback
}

/* ------------------------------------------------------------------ */
/* Permisos                                                            */
/* ------------------------------------------------------------------ */

/** La API devuelve `["*"]` para los roles con acceso total. */
export function normalizePermissions(raw: unknown): string[] {
  const list = asArray<unknown>(raw).map((p) => str(p)).filter(Boolean)
  if (list.some((p) => p === '*' || p.endsWith('.*') && p.length <= 2)) return ['*']
  return list
}

/* ------------------------------------------------------------------ */
/* Paginación                                                          */
/* ------------------------------------------------------------------ */

function normalizePage<T>(raw: unknown, mapper: (item: Rec) => T): Paginated<T> {
  const page = asRecord(raw)

  // Variantes: {items,total,page,pageSize,totalPages} | {data:[…], count} | array plano
  if (Array.isArray(raw)) {
    const items = raw.map((i) => mapper(asRecord(i)))
    return { items, total: items.length, page: 1, pageSize: items.length || 20, totalPages: 1 }
  }

  const rawItems = page.items ?? page.data ?? page.results ?? []
  const items = asArray<Rec>(rawItems).map(mapper)
  const total = num(page.total ?? page.totalCount ?? page.count, items.length)
  const pageNumber = num(page.page ?? page.pageNumber, 1)
  const pageSize = num(page.pageSize ?? page.size, items.length || 20)
  return {
    items,
    total,
    page: pageNumber,
    pageSize,
    totalPages: num(page.totalPages, Math.max(1, Math.ceil(total / Math.max(1, pageSize)))),
  }
}

/* ------------------------------------------------------------------ */
/* Entidades                                                           */
/* ------------------------------------------------------------------ */

export function normalizeClient(raw: unknown): Client {
  const c = asRecord(raw)
  const counts = asRecord(c.counts)
  const tags = Array.isArray(c.tags)
    ? asArray<unknown>(c.tags).map((t) => str(t))
    : str(c.tagsCsv)
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)

  return {
    id: str(c.id),
    code: str(c.code),
    clientType: (str(c.clientType, 'Individual') as Client['clientType']) || 'Individual',
    legalName: str(c.legalName ?? c.name),
    tradeName: (c.tradeName as string | null) ?? null,
    idNumber: str(c.idNumber),
    email: str(c.email),
    phone: str(c.phone),
    whatsapp: (c.whatsapp as string | null) ?? null,
    address: (c.address as string | null) ?? null,
    province: (c.province as string | null) ?? null,
    canton: (c.canton as string | null) ?? null,
    district: (c.district as string | null) ?? null,
    country: str(c.country, 'CR'),
    status: mapValue(clientStatusMap, c.status, 'Active'),
    source: mapValue(clientSourceMap, c.source, 'web'),
    assignedToUserId: (c.assignedToUserId as string | null) ?? null,
    assignedToName: (c.assignedToName as string | null) ?? null,
    tags,
    tagsCsv: tags.join(','),
    notes: (c.notes as string | null) ?? null,
    userId: (c.userId as string | null) ?? null,
    hasAppAccount: bool(c.hasAppAccount, !!c.userId),
    lastContactAt: (c.lastContactAt as string | null) ?? null,
    createdAt: str(c.createdAt),
    updatedAt: str(c.updatedAt ?? c.createdAt),
    isDeleted: bool(c.isDeleted),
    openCases: num(counts.openCases ?? c.openCases),
    totalCases: num(counts.caseFiles ?? c.totalCases),
    totalBilled: num(counts.totalSpent ?? c.totalBilled),
    counts: {
      caseFiles: num(counts.caseFiles),
      openCases: num(counts.openCases),
      overdueTasks: num(counts.overdueTasks),
      documents: num(counts.documents),
      orders: num(counts.orders),
      totalSpent: num(counts.totalSpent),
    },
  }
}

export function normalizeCase(raw: unknown): CaseFile {
  const c = asRecord(raw)
  const taskCounts = asRecord(c.taskCounts)
  return {
    id: str(c.id),
    code: str(c.code),
    clientId: str(c.clientId),
    clientName: str(c.clientName),
    clientCode: (c.clientCode as string | null) ?? null,
    title: str(c.title),
    description: (c.description as string | null) ?? null,
    matter: (str(c.matter, 'Otro') as CaseFile['matter']) || 'Otro',
    entity: (str(c.entity, 'Otro') as CaseFile['entity']) || 'Otro',
    referenceNumber: (c.referenceNumber as string | null) ?? null,
    status: mapValue(caseStatusMap, c.status, 'Open'),
    priority: (str(c.priority, 'Normal') as CaseFile['priority']) || 'Normal',
    responsibleUserId: (c.responsibleUserId as string | null) ?? null,
    responsibleName: (c.responsibleName as string | null) ?? null,
    openedAt: str(c.openedAt ?? c.createdAt),
    dueAt: (c.dueAt as string | null) ?? null,
    closedAt: (c.closedAt as string | null) ?? null,
    agreedAmount: c.agreedAmount === null || c.agreedAmount === undefined ? null : num(c.agreedAmount),
    currency: str(c.currency, 'USD'),
    progressPercent: num(c.progressPercent),
    clientVisible: bool(c.clientVisible, true),
    orderItemId: (c.orderItemId as string | null) ?? null,
    source: (c.source as string | null) ?? null,
    documentCount: num(c.documentCount),
    taskCount: num(taskCounts.total ?? c.taskCount),
    openTaskCount: num(taskCounts.open ?? taskCounts.pending ?? c.openTaskCount),
    taskCounts: {
      total: num(taskCounts.total),
      open: num(taskCounts.open),
      done: num(taskCounts.done),
      overdue: num(taskCounts.overdue),
    },
  }
}

export function normalizeDocument(raw: unknown): DocumentItem {
  const d = asRecord(raw)
  return {
    id: str(d.id),
    clientId: (d.clientId as string | null) ?? null,
    caseFileId: (d.caseFileId as string | null) ?? null,
    orderId: (d.orderId as string | null) ?? null,
    category: (str(d.category, 'Otro') as DocumentItem['category']) || 'Otro',
    fileName: str(d.fileName),
    originalName: str(d.originalName ?? d.fileName),
    contentType: str(d.contentType),
    sizeBytes: num(d.sizeBytes ?? d.size),
    storagePath: str(d.storagePath),
    sha256: str(d.sha256),
    version: num(d.version, 1),
    isCurrent: bool(d.isCurrent, true),
    uploadedByUserId: (d.uploadedByUserId as string | null) ?? null,
    uploadedByName: (d.uploadedByName as string | null) ?? null,
    uploadedAt: str(d.uploadedAt ?? d.createdAt),
    clientVisible: bool(d.clientVisible, true),
    isDeleted: bool(d.isDeleted),
    caseCode: (d.caseCode as string | null) ?? null,
    clientName: (d.clientName as string | null) ?? null,
    downloadUrl: (d.downloadUrl as string | undefined) ?? undefined,
  }
}
function normalizeOrderItem(raw: unknown, orderId: string): Order['items'][number] {
  const i = asRecord(raw)
  return {
    id: str(i.id),
    orderId: str(i.orderId, orderId),
    productId: str(i.productId),
    nameSnapshot: str(i.nameSnapshot ?? i.name),
    unitPrice: num(i.unitPrice),
    quantity: num(i.quantity, 1),
    total: num(i.total),
    caseFileId: (i.caseFileId as string | null) ?? null,
    caseCode: (i.caseCode as string | null) ?? null,
  }
}

export function normalizePayment(raw: unknown): Payment {
  const p = asRecord(raw)
  return {
    id: str(p.id),
    orderId: str(p.orderId),
    orderNumber: (p.orderNumber as string | null) ?? null,
    provider: str(p.provider, 'GH-Simulated'),
    method: (str(p.method, 'Card') as Payment['method']) || 'Card',
    status: mapValue(paymentStatusMap, p.status, 'Pending'),
    amount: num(p.amount),
    currency: str(p.currency, 'USD'),
    reference: str(p.reference),
    authorizationCode: (p.authorizationCode as string | null) ?? null,
    cardBrand: (p.cardBrand as string | null) ?? null,
    cardLast4: (p.cardLast4 as string | null) ?? null,
    cardHolder: (p.cardHolder as string | null) ?? null,
    failureReason: (p.failureReason as string | null) ?? null,
    rawRequestJson: (p.rawRequestJson as string | null) ?? null,
    rawResponseJson: (p.rawResponseJson as string | null) ?? null,
    createdAt: str(p.createdAt),
    processedAt: (p.processedAt as string | null) ?? null,
  }
}

export function normalizeOrder(raw: unknown): Order {
  const o = asRecord(raw)
  const id = str(o.id)
  const items = asArray<Rec>(o.items).map((i) => normalizeOrderItem(i, id))
  const payments = asArray<Rec>(o.payments).map((p) => normalizePayment({ ...p, orderId: p.orderId ?? id }))
  return {
    id,
    number: str(o.number),
    userId: str(o.userId),
    customerName: (o.customerName as string | null) ?? null,
    clientId: (o.clientId as string | null) ?? null,
    clientName: (o.clientName as string | null) ?? (o.customerName as string | null) ?? null,
    status: mapValue(orderStatusMap, o.status, 'PendingPayment'),
    subtotal: num(o.subtotal),
    discount: num(o.discount),
    tax: num(o.tax),
    total: num(o.total),
    currency: str(o.currency, 'USD'),
    notes: (o.notes as string | null) ?? null,
    requiresInvoice: bool(o.requiresInvoice),
    invoiceDataJson: (o.invoiceDataJson as string | null) ?? null,
    items,
    payments,
    createdAt: str(o.createdAt),
    paidAt: (o.paidAt as string | null) ?? null,
    completedAt: (o.completedAt as string | null) ?? null,
  }
}

export function normalizeProduct(raw: unknown): Product {
  const p = asRecord(raw)
  return {
    id: str(p.id),
    sku: str(p.sku),
    slug: str(p.slug),
    name: str(p.name),
    shortDescription: str(p.shortDescription),
    description: str(p.description),
    price: num(p.price),
    currency: str(p.currency, 'USD'),
    taxRate: num(p.taxRate, 13),
    categoryId: str(p.categoryId),
    categorySlug: str(p.categorySlug),
    categoryName: str(p.categoryName),
    imageUrl: (p.imageUrl as string | null) ?? null,
    galleryJson: Array.isArray(p.gallery) ? JSON.stringify(p.gallery) : ((p.galleryJson as string | null) ?? null),
    isActive: bool(p.isActive, true),
    isFeatured: bool(p.isFeatured),
    requiresCase: bool(p.requiresCase, true),
    deliveryMode: (str(p.deliveryMode, 'Digital') as Product['deliveryMode']) || 'Digital',
    estimatedDays: p.estimatedDays === null || p.estimatedDays === undefined ? null : num(p.estimatedDays),
    sortOrder: num(p.sortOrder),
    sourceUrl: (p.sourceUrl as string | null) ?? null,
    seoTitle: (p.seoTitle as string | null) ?? null,
    seoDescription: (p.seoDescription as string | null) ?? null,
    createdAt: str(p.createdAt),
    updatedAt: str(p.updatedAt ?? p.createdAt),
    isDeleted: bool(p.isDeleted),
  }
}

export function normalizeCategory(raw: unknown): ProductCategory {
  const c = asRecord(raw)
  return {
    id: str(c.id),
    slug: str(c.slug),
    name: str(c.name),
    description: str(c.description),
    iconName: str(c.iconName, 'package'),
    sortOrder: num(c.sortOrder),
    isActive: bool(c.isActive, true),
    imageUrl: (c.imageUrl as string | null) ?? null,
    productCount: num(c.productCount),
  }
}

export function normalizeAccountRequest(raw: unknown): AccountRequest {
  const a = asRecord(raw)
  return {
    id: str(a.id),
    fullName: str(a.fullName),
    email: str(a.email),
    phone: str(a.phone),
    idNumber: str(a.idNumber),
    clientType: (str(a.clientType, 'Individual') as AccountRequest['clientType']) || 'Individual',
    company: (a.company as string | null) ?? null,
    message: (a.message as string | null) ?? null,
    source: (str(a.source, 'app').toLowerCase() as AccountRequest['source']) || 'app',
    status: (str(a.status, 'Pending') as AccountRequest['status']) || 'Pending',
    reviewedByUserId: (a.reviewedByUserId as string | null) ?? null,
    reviewedByName: (a.reviewedByName as string | null) ?? null,
    reviewedAt: (a.reviewedAt as string | null) ?? null,
    rejectionReason: (a.rejectionReason as string | null) ?? null,
    createdUserId: (a.createdUserId as string | null) ?? null,
    clientId: (a.clientId ?? a.createdClientId ?? null) as string | null,
    clientCode: (a.clientCode ?? a.createdClientCode ?? null) as string | null,
    autoApproved: bool(a.autoApproved),
    ipAddress: (a.ipAddress as string | null) ?? null,
    trackingCode: str(a.trackingCode),
    createdAt: str(a.createdAt),
  }
}

export function normalizeQuote(raw: unknown): QuoteRequest {
  const q = asRecord(raw)
  return {
    id: str(q.id),
    fullName: str(q.fullName),
    email: str(q.email),
    phone: str(q.phone),
    company: (q.company as string | null) ?? null,
    serviceId: (q.serviceId as string | null) ?? null,
    serviceName: (q.serviceName as string | null) ?? null,
    message: (q.message as string | null) ?? null,
    status: (str(q.status, 'New') as QuoteRequest['status']) || 'New',
    handledByUserId: (q.handledByUserId as string | null) ?? null,
    handledByName: (q.handledByName as string | null) ?? null,
    clientId: (q.clientId as string | null) ?? null,
    createdAt: str(q.createdAt),
  }
}

export function normalizeUser(raw: unknown): User {
  const u = asRecord(raw)
  return {
    id: str(u.id),
    email: str(u.email),
    fullName: str(u.fullName),
    phone: (u.phone as string | null) ?? null,
    idNumber: (u.idNumber as string | null) ?? null,
    status: (str(u.status, 'Active') as User['status']) || 'Active',
    isStaff: bool(u.isStaff),
    clientId: (u.clientId as string | null) ?? null,
    avatarUrl: (u.avatarUrl as string | null) ?? null,
    locale: str(u.locale, 'es-CR'),
    timeZone: str(u.timeZone, 'America/Costa_Rica'),
    lastLoginAt: (u.lastLoginAt as string | null) ?? null,
    createdAt: str(u.createdAt),
    updatedAt: str(u.updatedAt ?? u.createdAt),
    failedLoginCount: num(u.failedLoginCount),
    lockoutUntil: (u.lockoutUntil as string | null) ?? null,
    roles: asArray<unknown>(u.roles).map((r) => str(r)),
  }
}

export function normalizeRole(raw: unknown): Role {
  const r = asRecord(raw)
  return {
    id: str(r.id),
    name: str(r.name),
    description: str(r.description),
    isSystem: bool(r.isSystem),
    isStaffRole: bool(r.isStaffRole, true),
    createdAt: str(r.createdAt),
    permissionCodes: asArray<unknown>(r.permissions ?? r.permissionCodes).map((p) => str(p)),
    userCount: num(r.userCount),
  }
}

export function normalizeAuditLog(raw: unknown): AuditLog & { userName: string } {
  const a = asRecord(raw)
  return {
    id: str(a.id),
    userId: (a.userId as string | null) ?? null,
    userName: str(a.userName, 'Sistema'),
    action: str(a.action),
    entityName: str(a.entityName),
    entityId: (a.entityId as string | null) ?? null,
    beforeJson: (a.beforeJson as string | null) ?? null,
    afterJson: (a.afterJson as string | null) ?? null,
    ipAddress: (a.ipAddress as string | null) ?? null,
    userAgent: (a.userAgent as string | null) ?? null,
    createdAt: str(a.createdAt),
  }
}

export function normalizeNotification(raw: unknown): Notification {
  const n = asRecord(raw)
  return {
    id: str(n.id),
    userId: str(n.userId),
    title: str(n.title),
    body: str(n.body),
    type: (str(n.type, 'System') as Notification['type']) || 'System',
    dataJson: (n.dataJson as string | null) ?? null,
    channel: (str(n.channel, 'InApp') as Notification['channel']) || 'InApp',
    status: (str(n.status, 'Sent') as Notification['status']) || 'Sent',
    createdAt: str(n.createdAt),
    sentAt: (n.sentAt as string | null) ?? null,
    readAt: (n.readAt as string | null) ?? null,
  }
}

export function normalizeMessage(raw: unknown): Message {
  const m = asRecord(raw)
  return {
    id: str(m.id),
    caseFileId: (m.caseFileId as string | null) ?? null,
    clientId: str(m.clientId),
    senderUserId: (m.senderUserId as string | null) ?? null,
    senderName: (m.senderName as string | null) ?? null,
    body: str(m.body),
    attachmentDocumentId: (m.attachmentDocumentId as string | null) ?? null,
    isFromClient: bool(m.isFromClient),
    readByStaffAt: (m.readByStaffAt as string | null) ?? null,
    readByClientAt: (m.readByClientAt as string | null) ?? null,
    createdAt: str(m.createdAt),
  }
}

/* ------------------------------------------------------------------ */
/* Detalle de expediente (la API ya lo devuelve completo)              */
/* ------------------------------------------------------------------ */

export interface NormalizedCaseDetail extends CaseFile {
  tasks: unknown[]
  events: unknown[]
  documents: DocumentItem[]
  messages: Message[]
  client: Client
}

export function normalizeCaseDetail(raw: unknown): NormalizedCaseDetail {
  const c = asRecord(raw)
  const base = normalizeCase(raw)
  const client = asRecord(c.client)
  return {
    ...base,
    clientName: base.clientName || str(client.legalName),
    tasks: asArray<Rec>(c.tasks),
    events: asArray<Rec>(c.events),
    documents: asArray<Rec>(c.documents).map(normalizeDocument),
    messages: asArray<Rec>(c.messages).map(normalizeMessage),
    client: normalizeClient(client),
  }
}

/** Detalle de cliente: el listado devuelve un objeto plano, el detalle un envoltorio. */
export function normalizeClientDetail(raw: unknown): Client {
  const wrapper = asRecord(raw)
  if (wrapper.client) return normalizeClient(wrapper.client)
  return normalizeClient(raw)
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

export function normalizeDashboard(raw: unknown): DashboardSummary {
  const d = asRecord(raw)
  const kpis = asRecord(d.kpis)
  const recentActivity = asArray<Rec>(d.recentActivity ?? d.latestActivities)
  const leadsBySource = asArray<Rec>(d.leadsBySource)

  return {
    kpis: {
      activeClients: num(kpis.activeClients ?? d.activeClients),
      openCases: num(kpis.openCases ?? d.openCases),
      overdueTasks: num(kpis.overdueTasks ?? d.overdueTasks),
      monthRevenue: num(kpis.monthRevenue ?? d.revenueThisMonth),
      pendingAccountRequests: num(kpis.pendingAccountRequests ?? d.pendingAccountRequests),
      pendingQuotes: num(kpis.pendingQuotes ?? d.newQuotes),
      newClientsThisMonth: num(kpis.newClientsThisMonth ?? d.newClientsThisMonth),
      ordersThisMonth: num(kpis.ordersThisMonth ?? d.ordersThisMonth),
      unreadMessages: num(kpis.unreadMessages ?? d.unreadMessages),
      documentsThisMonth: num(kpis.documentsThisMonth ?? d.documentsThisMonth),
    },
    ordersByStatus: asArray<Rec>(d.ordersByStatus).map((o) => ({
      status: mapValue(orderStatusMap, o.slug ?? o.status, 'Paid'),
      count: num(o.count),
      total: num(o.total ?? o.amount),
    })),
    salesByMonth: asArray<Rec>(d.salesByMonth).map((m) => ({
      month: str(m.month ?? m.label),
      total: num(m.total ?? m.amount),
      orders: num(m.orders ?? m.count),
    })),
    leadsFunnel:
      asArray<Rec>(d.leadsFunnel).length > 0
        ? asArray<Rec>(d.leadsFunnel).map((l) => ({
            stage: str(l.stage ?? l.name),
            count: num(l.count),
            color: str(l.color ?? '#DF3131'),
          }))
        : [
            {
              stage: 'Solicitudes pendientes',
              count: num(d.pendingAccountRequests),
              color: '#116DFF',
            },
            { stage: 'Cotizaciones nuevas', count: num(d.newQuotes), color: '#D49341' },
            ...leadsBySource.map((l) => ({
              stage: `Origen: ${str(l.name)}`,
              count: num(l.count),
              color: '#DF3131',
            })),
            { stage: 'Clientes activos', count: num(d.activeClients), color: '#008250' },
          ],
    latestActivities: recentActivity.map((a) => ({
      id: str(a.id),
      caseFileId: str(a.caseFileId),
      type: 'Note',
      title: str(a.title),
      description: str(a.description),
      actorUserId: null,
      actorName: str(a.actor, 'Sistema'),
      clientVisible: true,
      createdAt: str(a.at ?? a.createdAt),
    })),
    pendingAccountRequests: asArray<Rec>(d.pendingAccountRequests).map(normalizeAccountRequest),
    overdueTasksList: asArray<Rec>(d.overdueTasksList ?? d.overdueTasks_top).map((t) => ({
      id: str(t.id),
      caseFileId: str(t.caseFileId),
      title: str(t.title),
      description: null,
      status: (str(t.status, 'Todo') as import('@/types').CaseTaskStatus) || 'Todo',
      priority: (str(t.priority, 'Normal') as import('@/types').Priority) || 'Normal',
      dueAt: (t.dueAt as string | null) ?? null,
      completedAt: null,
      assignedToUserId: (t.assignedToUserId as string | null) ?? null,
      assignedToName: str(t.assignedToName, 'Sin asignar'),
      createdByUserId: null,
      sortOrder: 0,
      clientVisible: true,
    })),
    casesByStatus: asArray<Rec>(d.casesByStatus).map((c) => ({
      status: mapValue(caseStatusMap, c.slug ?? c.status, 'Open'),
      count: num(c.count),
    })),
    casesByMatter: asArray<Rec>(d.casesByMatter).map((c) => ({
      matter: (str(c.slug ?? c.matter, 'Otro') as CaseFile['matter']) || 'Otro',
      count: num(c.count),
    })),
    revenueByCategory: asArray<Rec>(d.revenueByCategory ?? d.revenueByCategories).map((r) => ({
      category: str(r.category ?? r.name),
      total: num(r.total ?? r.amount),
    })),
  }
}

/* ------------------------------------------------------------------ */
/* Informes                                                            */
/* ------------------------------------------------------------------ */

export function normalizeReportSales(raw: unknown): ReportSales {
  const r = asRecord(raw)
  const totals = asRecord(r.totals)
  const byMonth = asArray<Rec>(r.byMonth).map((m) => ({
    month: str(m.month ?? m.label),
    total: num(m.total ?? m.amount),
    orders: num(m.orders ?? m.count),
  }))
  const total = num(totals.total ?? r.totalRevenue, byMonth.reduce((s, m) => s + m.total, 0))
  const orders = num(totals.orders ?? r.totalOrders, byMonth.reduce((s, m) => s + m.orders, 0))
  return {
    byMonth,
    byCategory: asArray<Rec>(r.byCategory).map((c) => ({
      category: str(c.category ?? c.name),
      total: num(c.total ?? c.amount),
      orders: num(c.orders ?? c.count),
    })),
    byService: asArray<Rec>(r.byService ?? r.topProducts).map((p) => ({
      productId: str(p.productId ?? p.id ?? p.name),
      name: str(p.name),
      quantity: num(p.quantity ?? p.count),
      total: num(p.total ?? p.amount),
    })),
    totals: {
      subtotal: num(totals.subtotal, total),
      tax: num(totals.tax),
      total,
      orders,
      averageTicket: num(totals.averageTicket ?? r.averageTicket, orders ? total / orders : 0),
    },
  }
}

export function normalizeReportCases(raw: unknown): ReportCases {
  const r = asRecord(raw)
  const byStatus = asArray<Rec>(r.byStatus).map((s) => ({
    status: mapValue(caseStatusMap, s.slug ?? s.status, 'Open'),
    count: num(s.count),
  }))
  const byMatter = asArray<Rec>(r.byMatter).map((m) => ({
    matter: (str(m.slug ?? m.matter, 'Otro') as CaseFile['matter']) || 'Otro',
    count: num(m.count),
  }))
  return {
    byStatus,
    byMatter,
    byEntity: asArray<Rec>(r.byEntity).map((e) => ({
      entity: (str(e.slug ?? e.entity ?? e.name, 'Otro') as CaseFile['entity']) || 'Otro',
      count: num(e.count),
    })),
    overdue: asArray<Rec>(r.overdue).map((o) => ({
      id: str(o.id),
      code: str(o.code),
      title: str(o.title),
      clientName: str(o.clientName),
      dueAt: str(o.dueAt ?? o.createdAt),
      status: mapValue(caseStatusMap, o.status, 'Open'),
    })),
    averageProgress: num(r.averageProgress),
  }
}

export function normalizeReportProductivity(raw: unknown): ReportProductivity {
  const r = asRecord(raw)
  return {
    rows: asArray<Rec>(r.rows ?? r.workers).map((w) => ({
      userId: str(w.userId ?? w.id),
      fullName: str(w.fullName ?? w.name),
      role: str(w.role, '—'),
      openCases: num(w.openCases),
      closedCases: num(w.closedCases ?? w.completedThisMonth),
      tasksDone: num(w.tasksDone ?? w.completedThisMonth),
      tasksOverdue: num(w.tasksOverdue ?? w.overdueTasks),
      interactions: num(w.interactions),
    })),
    overdueTasks: asArray<Rec>(r.overdueTasks).map((t) => ({
      id: str(t.id),
      title: str(t.title),
      caseCode: str(t.caseCode),
      assignedToName: str(t.assignedToName, 'Sin asignar'),
      dueAt: (t.dueAt as string | null) ?? null,
      priority: (str(t.priority, 'Normal') as import('@/types').Priority) || 'Normal',
      status: (str(t.status, 'Todo') as import('@/types').CaseTaskStatus) || 'Todo',
    })),
  }
}

/* ------------------------------------------------------------------ */
/* Ajustes                                                             */
/* ------------------------------------------------------------------ */

export interface NormalizedSettings {
  items: Setting[]
  groups: Record<string, Setting[]>
  exchangeRate: number
}

/**
 * La API agrupa los ajustes con etiquetas en español («Registro», «Catálogo»,
 * «Marca»…), mientras el panel usa claves internas (`registration`, `company`…).
 * Se traducen en ambos sentidos para que la interfaz y los guards funcionen.
 */
const GRUPOS_API_A_PANEL: Record<string, string> = {
  empresa: 'company',
  company: 'company',
  marca: 'branding',
  branding: 'branding',
  registro: 'registration',
  registration: 'registration',
  monedas: 'currency',
  moneda: 'currency',
  currency: 'currency',
  notificaciones: 'notifications',
  notifications: 'notifications',
  mensajes: 'messages',
  messages: 'messages',
  pasarela: 'payment',
  pago: 'payment',
  pagos: 'payment',
  payment: 'payment',
  catalogo: 'catalog',
  catálogo: 'catalog',
  catalog: 'catalog',
  expedientes: 'cases',
  cases: 'cases',
  ventas: 'sales',
  sales: 'sales',
}

/**
 * La API nombra los ajustes de marca como `brand.primaryColor`, `brand.accentColor`…,
 * mientras la interfaz usa `branding.primary`, `branding.accent`… Se traducen en
 * ambos sentidos (y se aceptan las dos formas al leer).
 */
const CLAVES_API_A_PANEL: Record<string, string> = {
  'brand.primaryColor': 'branding.primary',
  'brand.accentColor': 'branding.accent',
  'brand.inkColor': 'branding.ink',
  'brand.successColor': 'branding.success',
  'brand.logoUrl': 'branding.logoLight',
  'brand.logoLightUrl': 'branding.logoLight',
  'brand.iconUrl': 'branding.logoIcon',
  'brand.name': 'branding.legalName',
  'brand.shortName': 'branding.shortName',
}

const CLAVES_PANEL_A_API: Record<string, string> = Object.fromEntries(
  Object.entries(CLAVES_API_A_PANEL).map(([api, panel]) => [panel, api]),
)

/** Traduce una clave del panel a la que espera la API (si tiene equivalente). */
export function claveParaApi(clave: string): string {
  return CLAVES_PANEL_A_API[clave] ?? clave
}

export function grupoDeAjuste(grupo: string): string {
  const clave = grupo.trim().toLowerCase()
  return GRUPOS_API_A_PANEL[clave] ?? clave
}

/** ¿Ya hay un ajuste con esa clave entre los leídos? */
function yaPresente(items: Setting[], clave: string): boolean {
  return items.some((s) => s.key === clave)
}

export function normalizeSettings(raw: unknown, fallbackRate = 520): NormalizedSettings {
  const list = Array.isArray(raw) ? raw : asArray<Rec>(asRecord(raw).items)
  const items: Setting[] = []
  const groups: Record<string, Setting[]> = {}

  for (const [i, entry] of list.entries()) {
    const s = asRecord(entry)
    const grupoOriginal = str(s.group, 'company')
    const claveApi = str(s.key, `setting.${i}`)
    const valor = str(s.value)
    const grupoPanel = grupoDeAjuste(grupoOriginal)

    // Un color de marca expuesto con otro nombre también se publica como token del
    // panel (branding.primary / branding.accent), sin duplicar si ya existe.
    const aliasPorColor =
      /^#[0-9a-f]{6}$/i.test(valor) && grupoPanel === 'branding'
        ? /primary/i.test(claveApi)
          ? 'branding.primary'
          : /accent|lima/i.test(claveApi)
            ? 'branding.accent'
            : null
        : null

    const disponibles = [...items, ...Object.values(groups).flat()]
    const clavePanel = aliasPorColor && !yaPresente(disponibles, aliasPorColor)
      ? aliasPorColor
      : (CLAVES_API_A_PANEL[claveApi] ?? claveApi)

    const item: Setting = {
      key: clavePanel,
      value: valor,
      group: grupoPanel,
      groupRaw: grupoOriginal,
      description: str(s.description, claveApi),
      updatedAt: str(s.updatedAt ?? new Date().toISOString()),
      apiKey: claveApi,
    }
    items.push(item)
    groups[grupoPanel] = groups[grupoPanel] ?? []
    groups[grupoPanel]!.push(item)
  }

  const rate = items.find((s) => /usdToCrc|cambio|exchange/i.test(s.key))
  return { items, groups, exchangeRate: rate ? num(rate.value, fallbackRate) : fallbackRate }
}

/* ------------------------------------------------------------------ */
/* Normalizador por ruta                                               */
/* ------------------------------------------------------------------ */

const itemsMappers: Record<string, (item: Rec) => unknown> = {
  clients: normalizeClient,
  cases: normalizeCase,
  documents: normalizeDocument,
  orders: normalizeOrder,
  payments: normalizePayment,
  'account-requests': normalizeAccountRequest,
  quotes: normalizeQuote,
  users: normalizeUser,
  audit: normalizeAuditLog,
  notifications: normalizeNotification,
  messages: normalizeMessage,
  'catalog/products': normalizeProduct,
}

/** Rutas de listado que llegan con `{items,…}`. */
function listKey(path: string): string | null {
  const clean = path.split('?')[0]?.replace(/\/$/, '').replace(/^.*\/api\/v\d+/, '') ?? ''
  for (const key of Object.keys(itemsMappers)) {
    if (clean === `/admin/${key}` || clean.endsWith(`/admin/${key}`)) return key
  }
  return null
}

/**
 * Aplica la normalización que corresponda según la ruta de la petición.
 * Devuelve el mismo valor si la ruta no necesita traducción.
 */
export function normalizeApiPayload(url: string, data: unknown): unknown {
  const path = url.split('?')[0] ?? ''

  // Autenticación: permisos con comodín
  if (/\/auth\/(login|refresh|me)$/.test(path)) {
    const d = asRecord(data)
    return { ...d, permissions: normalizePermissions(d.permissions) }
  }

  if (path.includes('/admin/dashboard/summary')) return normalizeDashboard(data)

  if (path.includes('/admin/reports/sales')) return normalizeReportSales(data)
  if (path.includes('/admin/reports/cases')) return normalizeReportCases(data)
  if (path.includes('/admin/reports/productivity')) return normalizeReportProductivity(data)

  if (path.includes('/admin/settings')) return normalizeSettings(data)

  if (path.includes('/admin/catalog/categories')) return asArray<Rec>(data).map(normalizeCategory)
  if (/\/admin\/catalog\/products\/[^/]+$/.test(path)) return normalizeProduct(data)

  if (/\/admin\/clients\/[^/]+\/timeline$/.test(path)) return asArray<Rec>(data)
  if (/\/admin\/clients\/[^/]+\/contacts$/.test(path)) return asArray<Rec>(data)
  if (/\/admin\/clients\/[^/]+\/interactions$/.test(path)) return normalizePage(data, (i) => i)
  if (/\/admin\/clients\/[^/]+$/.test(path)) return normalizeClientDetail(data)

  if (/\/admin\/cases\/[^/]+\/events$/.test(path)) return asArray<Rec>(data)
  if (/\/admin\/cases\/[^/]+\/tasks$/.test(path)) return asArray<Rec>(data)
  if (/\/admin\/cases\/[^/]+\/tasks\/[^/]+$/.test(path)) return asRecord(data)
  if (/\/admin\/cases\/[^/]+$/.test(path)) return normalizeCaseDetail(data)

  if (/\/admin\/orders\/[^/]+$/.test(path)) return normalizeOrder(data)
  if (/\/admin\/payments\/[^/]+$/.test(path)) {
    const d = asRecord(data)
    return { ...normalizePayment(d), order: d.order ? normalizeOrder(d.order) : null }
  }
  if (/\/admin\/documents\/[^/]+\/versions$/.test(path)) return asArray<Rec>(data).map(normalizeDocument)

  if (path.includes('/admin/roles')) {
    return Array.isArray(data) ? asArray<Rec>(data).map(normalizeRole) : normalizeRole(data)
  }
  if (path.includes('/admin/account-requests')) {
    const d = asRecord(data)
    if (Array.isArray(data)) return normalizePage(data, normalizeAccountRequest)
    if ('items' in d) {
      return {
        ...normalizePage(d, normalizeAccountRequest),
        pendingCount: num(d.pendingCount ?? d.pending),
      }
    }
    return normalizeAccountRequest(data)
  }
  if (path.includes('/admin/quotes')) {
    const d = asRecord(data)
    if (Array.isArray(data)) return normalizePage(data, normalizeQuote)
    if ('items' in d) {
      return { ...normalizePage(d, normalizeQuote), newCount: num(d.newCount ?? d.new) }
    }
    return normalizeQuote(data)
  }

  // Listados genéricos
  const key = listKey(path)
  if (key) {
    const mapper = itemsMappers[key]!
    if (Array.isArray(data)) return normalizePage(data, mapper)
    return normalizePage(data, mapper)
  }

  return data
}
