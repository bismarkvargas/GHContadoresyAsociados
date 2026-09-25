/**
 * Adaptador mock del contrato de API (docs/03-contrato-api.md).
 * Intercepta TODAS las llamadas del panel y las resuelve contra la base en memoria,
 * con latencia simulada de 150–400 ms y persistencia en localStorage.
 */

import type {
  AccountRequest,
  CaseEvent,
  CaseFile,
  CaseTask,
  Client,
  ClientInteraction,
  DashboardSummary,
  DocumentItem,
  LoginResponse,
  Message,
  Notification,
  Order,
  Paginated,
  Payment,
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
import {
  bootstrapMockDb,
  clientName,
  exchangeRate,
  getDb,
  nextCounter,
  persistDb,
  productById,
  resetDb,
  uid,
  userName,
} from './db'
import { emitRealtime } from './realtime-bus'

export class MockHttpError extends Error {
  status: number
  payload: Record<string, unknown>
  constructor(status: number, detail: string, extra: Record<string, unknown> = {}) {
    super(detail)
    this.name = 'MockHttpError'
    this.status = status
    this.payload = {
      type: `https://httpstatuses.io/${status}`,
      title: status === 401 ? 'Unauthorized' : status === 403 ? 'Forbidden' : 'Error',
      status,
      detail,
      traceId: uid('trace'),
      ...extra,
    }
  }
}

interface Ctx {
  params: Record<string, string>
  query: Record<string, string>
  body: Record<string, unknown>
  headers: Record<string, string>
  method: string
  path: string
}

/** Entrada del timeline unificado de un cliente. */
export interface TimelineEntry {
  id: string
  kind: 'case' | 'interaction'
  label: string
  title: string
  description: string | null
  actorName: string
  caseCode?: string | null
  interactionType?: string
  createdAt: string
}

type Handler = (ctx: Ctx) => unknown | Promise<unknown>

interface Route {
  method: string
  segments: string[]
  handler: Handler
}

const routes: Route[] = []
function route(method: string, path: string, handler: Handler): void {
  routes.push({ method, segments: path.split('/').filter(Boolean), handler })
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function toArray(value: unknown): string[] {
  if (value === undefined || value === null || value === '') return []
  return Array.isArray(value) ? value.map(String) : [String(value)]
}

function str(value: unknown, fallback = ''): string {
  return value === undefined || value === null ? fallback : String(value)
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function bool(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null || value === '') return fallback
  return value === true || value === 'true' || value === '1'
}

function norm(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function matchesSearch(haystack: (string | null | undefined)[], term: string): boolean {
  if (!term) return true
  const t = norm(term)
  return haystack.some((h) => h && norm(String(h)).includes(t))
}

function sortItems<T>(items: T[], sort: string | undefined, order: string | undefined): T[] {
  if (!sort) return items
  const dir = order === 'desc' ? -1 : 1
  return [...items].sort((a, b) => {
    const av = (a as Record<string, unknown>)[sort]
    const bv = (b as Record<string, unknown>)[sort]
    if (av === bv) return 0
    if (av === null || av === undefined) return 1
    if (bv === null || bv === undefined) return -1
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
    return String(av).localeCompare(String(bv), 'es') * dir
  })
}

function paginate<T>(items: T[], query: Record<string, string>): Paginated<T> {
  const page = Math.max(1, num(query.page, 1))
  const pageSize = Math.max(1, Math.min(500, num(query.pageSize, 20)))
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    total,
    page,
    pageSize,
    totalPages,
  }
}

function list<T>(
  items: T[],
  query: Record<string, string>,
  filter?: (item: T) => boolean,
  search?: (item: T) => (string | null | undefined)[],
): Paginated<T> {
  let out = items
  if (filter) out = out.filter(filter)
  if (search && query.search) out = out.filter((i) => matchesSearch(search(i), query.search))
  out = sortItems(out, query.sort, query.order)
  return paginate(out, query)
}

function inFilter(value: string | null | undefined, raw: string | undefined): boolean {
  const values = toArray(raw)
  if (values.length === 0) return true
  if (!value) return false
  return values.includes(value)
}

/** Filtro por rango de fechas ISO (se envía como `from`/`to`). */
function inDateRange(value: string | null | undefined, query: Record<string, string>): boolean {
  if (!value) return !query.from && !query.to
  const t = new Date(value).getTime()
  if (query.from && t < new Date(query.from).getTime()) return false
  if (query.to && t > new Date(query.to).getTime() + 86400000) return false
  return true
}

function currentActorId(headers: Record<string, string>): string | null {
  const auth = headers.authorization ?? headers.Authorization
  if (!auth) return null
  const token = auth.replace(/^Bearer\s+/i, '')
  const match = /^gh\.([^.]+)\./.exec(token)
  return match ? match[1]! : null
}

function requireActor(ctx: Ctx): string {
  const actor = currentActorId(ctx.headers)
  if (!actor) throw new MockHttpError(401, 'Token ausente o expirado.')
  return actor
}

function touch(entity: object): void {
  if ('updatedAt' in entity) {
    ;(entity as { updatedAt?: string }).updatedAt = new Date().toISOString()
  }
}

function audit(
  actorId: string | null,
  action: string,
  entityName: string,
  entityId: string | null,
  before: unknown,
  after: unknown,
): void {
  const db = getDb()
  db.auditLogs.unshift({
    id: uid('audit'),
    userId: actorId,
    action,
    entityName,
    entityId,
    beforeJson: before ? JSON.stringify(before) : null,
    afterJson: after ? JSON.stringify(after) : null,
    ipAddress: '127.0.0.1',
    userAgent: 'GH Admin Web (modo mock)',
    createdAt: new Date().toISOString(),
  })
}

function notify(
  userId: string,
  title: string,
  body: string,
  type: Notification['type'],
  data: Record<string, unknown> = {},
): Notification {
  const db = getDb()
  const n: Notification = {
    id: uid('notif'),
    userId,
    title,
    body,
    type,
    dataJson: JSON.stringify(data),
    channel: 'InApp',
    status: 'Sent',
    createdAt: new Date().toISOString(),
    sentAt: new Date().toISOString(),
    readAt: null,
  }
  db.notifications.unshift(n)
  return n
}

/* --- Enriquecimiento de entidades ---------------------------------- */

function clientRow(c: Client): Client {
  const db = getDb()
  const cases = db.caseFiles.filter((cf) => cf.clientId === c.id)
  const orders = db.orders.filter((o) => o.clientId === c.id)
  return {
    ...c,
    openCases: cases.filter((cf) => !['Completed', 'Closed', 'Cancelled'].includes(cf.status)).length,
    totalCases: cases.length,
    totalBilled: Number(orders.reduce((s, o) => s + o.total, 0).toFixed(2)),
  }
}

function caseRow(c: CaseFile): CaseFile {
  const db = getDb()
  const tasks = db.caseTasks.filter((t) => t.caseFileId === c.id)
  return {
    ...c,
    clientName: clientName(c.clientId),
    responsibleName: userName(c.responsibleUserId),
    taskCount: tasks.length,
    openTaskCount: tasks.filter((t) => t.status === 'Todo' || t.status === 'InProgress').length,
  }
}

function taskRow(t: CaseTask): CaseTask {
  return { ...t, assignedToName: userName(t.assignedToUserId) }
}

function eventRow(e: CaseEvent): CaseEvent {
  return { ...e, actorName: e.actorUserId ? userName(e.actorUserId) : 'Sistema' }
}

function docRow(d: DocumentItem): DocumentItem {
  const db = getDb()
  const caseFile = d.caseFileId ? db.caseFiles.find((c) => c.id === d.caseFileId) : undefined
  return {
    ...d,
    uploadedByName: userName(d.uploadedByUserId),
    caseCode: caseFile?.code ?? null,
    clientName: d.clientId ? clientName(d.clientId) : null,
    downloadUrl: `/public/files/mock-${d.id}`,
  }
}

function orderRow(o: Order): Order {
  const db = getDb()
  return {
    ...o,
    clientName: o.clientId ? clientName(o.clientId) : null,
    customerName: userName(o.userId),
    items: o.items.map((i) => {
      const cf = i.caseFileId ? db.caseFiles.find((c) => c.id === i.caseFileId) : undefined
      return { ...i, caseCode: cf?.code ?? null }
    }),
    payments: db.payments.filter((p) => p.orderId === o.id),
  }
}

function paymentRow(p: Payment): Payment {
  const db = getDb()
  const order = db.orders.find((o) => o.id === p.orderId)
  return { ...p, orderNumber: order?.number ?? null }
}

function productRow(p: Product): Product {
  const db = getDb()
  const category = db.productCategories.find((c) => c.id === p.categoryId)
  return { ...p, categorySlug: category?.slug ?? '', categoryName: category?.name ?? '' }
}

function userRow(u: User): User {
  return { ...u }
}

/* ------------------------------------------------------------------ */
/* AUTH                                                                */
/* ------------------------------------------------------------------ */

function buildLoginResponse(user: User): LoginResponse {
  const db = getDb()
  const roles = db.roles.filter((r) => user.roles.includes(r.name))
  const permissions = Array.from(new Set(roles.flatMap((r) => r.permissionCodes)))
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  return {
    accessToken: `gh.${user.id}.${Date.now().toString(36)}`,
    refreshToken: `ghr.${user.id}.${Date.now().toString(36)}`,
    expiresAt,
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      avatarUrl: user.avatarUrl ?? null,
      status: user.status,
      isStaff: user.isStaff,
      clientId: user.clientId ?? null,
    },
    roles: user.roles,
    permissions,
  }
}

route('POST', '/auth/login', (ctx) => {
  const email = norm(str(ctx.body.email)).trim()
  const password = str(ctx.body.password)
  const db = getDb()
  const user = db.users.find((u) => norm(u.email) === email)
  if (!user || db.passwords[user.email] !== password) {
    throw new MockHttpError(401, 'Credenciales inválidas. Verifique su correo y contraseña.')
  }
  if (user.status === 'Pending') {
    throw new MockHttpError(403, 'Su cuenta está pendiente de aprobación por un administrador.')
  }
  if (user.status === 'Suspended') {
    throw new MockHttpError(403, 'Su cuenta está suspendida. Contacte a la administración.')
  }
  if (user.status === 'Rejected') {
    throw new MockHttpError(403, 'Su solicitud de cuenta fue rechazada.')
  }
  if (!user.isStaff) {
    throw new MockHttpError(403, 'Esta consola es solo para usuarios de la firma (IsStaff).')
  }
  user.lastLoginAt = new Date().toISOString()
  audit(user.id, 'login', 'User', user.id, null, { email: user.email })
  persistDb()
  return buildLoginResponse(user)
})

route('POST', '/auth/refresh', (ctx) => {
  const token = str(ctx.body.refreshToken)
  const match = /^ghr\.([^.]+)\./.exec(token)
  if (!match) throw new MockHttpError(401, 'Refresh token inválido.')
  const user = getDb().users.find((u) => u.id === match[1])
  if (!user) throw new MockHttpError(401, 'Sesión no encontrada.')
  return buildLoginResponse(user)
})

route('POST', '/auth/logout', (ctx) => {
  const actor = currentActorId(ctx.headers)
  if (actor) audit(actor, 'logout', 'User', actor, null, null)
  persistDb()
  return { ok: true }
})

route('POST', '/auth/forgot-password', () => ({ message: 'Se envió un enlace de recuperación.' }))

route('POST', '/auth/reset-password', (ctx) => {
  const email = str(ctx.body.email)
  const password = str(ctx.body.newPassword)
  if (password.length < 8) throw new MockHttpError(400, 'La contraseña debe tener al menos 8 caracteres.')
  const db = getDb()
  const user = db.users.find((u) => norm(u.email) === norm(email))
  if (!user) throw new MockHttpError(404, 'Correo no registrado.')
  db.passwords[user.email] = password
  persistDb()
  return { ok: true }
})

route('POST', '/auth/change-password', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  const user = db.users.find((u) => u.id === actor)
  if (!user) throw new MockHttpError(401, 'Sesión no encontrada.')
  if (db.passwords[user.email] !== str(ctx.body.currentPassword)) {
    throw new MockHttpError(400, 'La contraseña actual no coincide.')
  }
  db.passwords[user.email] = str(ctx.body.newPassword)
  persistDb()
  return { ok: true }
})

route('GET', '/auth/me', (ctx) => {
  const actor = requireActor(ctx)
  const user = getDb().users.find((u) => u.id === actor)
  if (!user) throw new MockHttpError(401, 'Sesión no encontrada.')
  const db = getDb()
  const roles = db.roles.filter((r) => user.roles.includes(r.name))
  return {
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      avatarUrl: user.avatarUrl ?? null,
      status: user.status,
      isStaff: user.isStaff,
      clientId: user.clientId ?? null,
    },
    roles: user.roles,
    permissions: Array.from(new Set(roles.flatMap((r) => r.permissionCodes))),
  }
})

/* ------------------------------------------------------------------ */
/* PÚBLICO                                                             */
/* ------------------------------------------------------------------ */

route('GET', '/public/site', () => {
  const settings = getDb().settings
  const map: Record<string, string> = {}
  for (const s of settings) map[s.key] = s.value
  return {
    company: map,
    baseCurrency: map['currency.base'] ?? 'USD',
    exchangeRate: exchangeRate(),
    catalogsUpdatedAt: getDb().savedAt,
  }
})

route('GET', '/public/catalog/categories', () =>
  getDb().productCategories.map((c) => ({
    ...c,
    productCount: getDb().products.filter((p) => p.categoryId === c.id && !p.isDeleted).length,
  })),
)

route('GET', '/public/catalog/products', (ctx) => {
  const db = getDb()
  return list(
    db.products.filter((p) => !p.isDeleted && p.isActive).map(productRow),
    ctx.query,
    (p) =>
      inFilter(p.categorySlug, ctx.query.category) &&
      (ctx.query.featured === undefined || bool(ctx.query.featured) === p.isFeatured) &&
      (!ctx.query.minPrice || p.price >= num(ctx.query.minPrice)) &&
      (!ctx.query.maxPrice || p.price <= num(ctx.query.maxPrice)),
    (p) => [p.name, p.sku, p.slug, p.shortDescription],
  )
})

route('GET', '/public/catalog/products/:slug', (ctx) => {
  const product = getDb().products.find((p) => p.slug === ctx.params.slug)
  if (!product) throw new MockHttpError(404, 'Servicio no encontrado.')
  const related = getDb()
    .products.filter((p) => p.categoryId === product.categoryId && p.id !== product.id)
    .slice(0, 4)
    .map(productRow)
  return { ...productRow(product), related }
})

route('POST', '/public/account-requests', (ctx) => {
  const db = getDb()
  const item: AccountRequest = {
    id: uid('areq'),
    fullName: str(ctx.body.fullName),
    email: str(ctx.body.email),
    phone: str(ctx.body.phone),
    idNumber: str(ctx.body.idNumber),
    clientType: (str(ctx.body.clientType, 'Individual') as AccountRequest['clientType']) || 'Individual',
    company: ctx.body.company ? str(ctx.body.company) : null,
    message: ctx.body.message ? str(ctx.body.message) : null,
    source: (str(ctx.body.source, 'web') as AccountRequest['source']) || 'web',
    status: 'Pending',
    reviewedByUserId: null,
    reviewedAt: null,
    rejectionReason: null,
    createdUserId: null,
    ipAddress: '127.0.0.1',
    trackingCode: `GH-SEG-${Math.floor(100000 + Math.random() * 899999)}`,
    createdAt: new Date().toISOString(),
  }
  db.accountRequests.unshift(item)
  persistDb()
  emitRealtime({ type: 'accountrequest.created', payload: { id: item.id, fullName: item.fullName } })
  return { id: item.id, trackingCode: item.trackingCode, status: item.status }
})

route('GET', '/public/account-requests/status', (ctx) => {
  const email = norm(str(ctx.query.email))
  const item = getDb().accountRequests.find((a) => norm(a.email) === email)
  if (!item) throw new MockHttpError(404, 'No hay solicitudes para ese correo.')
  return { status: item.status, rejectionReason: item.rejectionReason, trackingCode: item.trackingCode }
})

route('POST', '/public/quotes', (ctx) => {
  const db = getDb()
  const product = ctx.body.serviceId ? productById(str(ctx.body.serviceId)) : undefined
  const item: QuoteRequest = {
    id: uid('quote'),
    fullName: str(ctx.body.fullName),
    email: str(ctx.body.email),
    phone: str(ctx.body.phone),
    company: ctx.body.company ? str(ctx.body.company) : null,
    serviceId: product?.id ?? null,
    message: ctx.body.message ? str(ctx.body.message) : null,
    status: 'New',
    handledByUserId: null,
    clientId: null,
    createdAt: new Date().toISOString(),
  }
  db.quotes.unshift(item)
  persistDb()
  return { id: item.id, status: item.status }
})

route('GET', '/health', () => ({
  status: 'Healthy',
  database: 'mock-in-memory',
  mode: 'mocks',
  timeStamp: new Date().toISOString(),
}))

/* ------------------------------------------------------------------ */
/* DASHBOARD                                                           */
/* ------------------------------------------------------------------ */

function startOfMonth(offset = 0): Date {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() + offset, 1)
}

route('GET', '/admin/dashboard/summary', (): DashboardSummary => {
  const db = getDb()
  const now = Date.now()
  const monthStart = startOfMonth().getTime()

  const activeClients = db.clients.filter((c) => c.status === 'Active').length
  const openCases = db.caseFiles.filter(
    (c) => !['Completed', 'Closed', 'Cancelled'].includes(c.status),
  ).length
  const overdueTasks = db.caseTasks.filter(
    (t) =>
      t.dueAt &&
      new Date(t.dueAt).getTime() < now &&
      !['Done', 'Cancelled'].includes(t.status),
  )
  const monthOrders = db.orders.filter((o) => new Date(o.createdAt).getTime() >= monthStart)
  const monthRevenue = monthOrders
    .filter((o) => !['Cancelled', 'PendingPayment'].includes(o.status))
    .reduce((s, o) => s + o.total, 0)

  const orderStatusCounts = new Map<string, { count: number; total: number }>()
  for (const o of db.orders) {
    const entry = orderStatusCounts.get(o.status) ?? { count: 0, total: 0 }
    entry.count += 1
    entry.total += o.total
    orderStatusCounts.set(o.status, entry)
  }

  const salesByMonth: { month: string; total: number; orders: number }[] = []
  for (let i = 11; i >= 0; i -= 1) {
    const d = startOfMonth(-i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const orders = db.orders.filter((o) => {
      const od = new Date(o.createdAt)
      return (
        od.getFullYear() === d.getFullYear() &&
        od.getMonth() === d.getMonth() &&
        !['Cancelled', 'PendingPayment'].includes(o.status)
      )
    })
    salesByMonth.push({
      month: key,
      total: Number(orders.reduce((s, o) => s + o.total, 0).toFixed(2)),
      orders: orders.length,
    })
  }

  const leadsFunnel = [
    { stage: 'Solicitudes nuevas', count: db.accountRequests.filter((a) => a.status === 'Pending').length, color: '#116DFF' },
    { stage: 'Cotizaciones', count: db.quotes.filter((q) => q.status === 'New' || q.status === 'Contacted').length, color: '#D49341' },
    { stage: 'Prospectos', count: db.clients.filter((c) => c.status === 'Lead').length, color: '#DF3131' },
    { stage: 'Clientes activos', count: activeClients, color: '#008250' },
  ]

  const caseStatusCounts = new Map<string, number>()
  const caseMatterCounts = new Map<string, number>()
  for (const c of db.caseFiles) {
    caseStatusCounts.set(c.status, (caseStatusCounts.get(c.status) ?? 0) + 1)
    caseMatterCounts.set(c.matter, (caseMatterCounts.get(c.matter) ?? 0) + 1)
  }

  const revenueByCategory = new Map<string, number>()
  for (const o of db.orders) {
    if (['Cancelled', 'PendingPayment'].includes(o.status)) continue
    for (const item of o.items) {
      const product = productById(item.productId)
      const cat = db.productCategories.find((c) => c.id === product?.categoryId)
      const key = cat?.name ?? 'Sin categoría'
      revenueByCategory.set(key, (revenueByCategory.get(key) ?? 0) + item.total)
    }
  }

  return {
    kpis: {
      activeClients,
      openCases,
      overdueTasks: overdueTasks.length,
      monthRevenue: Number(monthRevenue.toFixed(2)),
      pendingAccountRequests: db.accountRequests.filter((a) => a.status === 'Pending').length,
      pendingQuotes: db.quotes.filter((q) => q.status === 'New').length,
      newClientsThisMonth: db.clients.filter((c) => new Date(c.createdAt).getTime() >= monthStart).length,
      ordersThisMonth: monthOrders.length,
    },
    ordersByStatus: Array.from(orderStatusCounts.entries()).map(([status, v]) => ({
      status: status as Order['status'],
      count: v.count,
      total: Number(v.total.toFixed(2)),
    })),
    salesByMonth,
    leadsFunnel,
    latestActivities: [...db.caseEvents]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 12)
      .map(eventRow),
    pendingAccountRequests: db.accountRequests
      .filter((a) => a.status === 'Pending')
      .slice(0, 6)
      .map((a) => ({ ...a })),
    overdueTasksList: overdueTasks.slice(0, 6).map(taskRow),
    casesByStatus: Array.from(caseStatusCounts.entries()).map(([status, count]) => ({
      status: status as CaseFile['status'],
      count,
    })),
    casesByMatter: Array.from(caseMatterCounts.entries()).map(([matter, count]) => ({
      matter: matter as CaseFile['matter'],
      count,
    })),
    revenueByCategory: Array.from(revenueByCategory.entries()).map(([category, total]) => ({
      category,
      total: Number(total.toFixed(2)),
    })),
  }
})

/* ------------------------------------------------------------------ */
/* CLIENTES                                                            */
/* ------------------------------------------------------------------ */

route('GET', '/admin/clients', (ctx) =>
  list(
    getDb().clients.filter((c) => !c.isDeleted).map(clientRow),
    ctx.query,
    (c) =>
      inFilter(c.status, ctx.query.status) &&
      inFilter(c.clientType, ctx.query.clientType) &&
      inFilter(c.assignedToUserId, ctx.query.assignedToUserId) &&
      inFilter(c.source, ctx.query.source) &&
      (toArray(ctx.query.tags).length === 0 ||
        toArray(ctx.query.tags).some((t) => (c.tagsCsv ?? '').split(',').includes(t))),
    (c) => [c.legalName, c.tradeName, c.code, c.email, c.idNumber, c.phone],
  ),
)

route('GET', '/admin/clients/:id', (ctx) => {
  const client = getDb().clients.find((c) => c.id === ctx.params.id)
  if (!client) throw new MockHttpError(404, 'Cliente no encontrado.')
  return clientRow(client)
})

route('POST', '/admin/clients', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  const count = nextCounter('client')
  const client: Client = {
    id: uid('client'),
    code: `GH-CLI-${String(count).padStart(5, '0')}`,
    clientType: (str(ctx.body.clientType, 'Individual') as Client['clientType']) || 'Individual',
    legalName: str(ctx.body.legalName),
    tradeName: ctx.body.tradeName ? str(ctx.body.tradeName) : null,
    idNumber: str(ctx.body.idNumber),
    email: str(ctx.body.email),
    phone: str(ctx.body.phone),
    whatsapp: ctx.body.whatsapp ? str(ctx.body.whatsapp) : null,
    address: ctx.body.address ? str(ctx.body.address) : null,
    province: ctx.body.province ? str(ctx.body.province) : 'Guanacaste',
    canton: ctx.body.canton ? str(ctx.body.canton) : null,
    district: ctx.body.district ? str(ctx.body.district) : null,
    country: 'CR',
    status: (str(ctx.body.status, 'Lead') as Client['status']) || 'Lead',
    source: (str(ctx.body.source, 'admin') as Client['source'] & string as Client['source']) || 'web',
    assignedToUserId: ctx.body.assignedToUserId ? str(ctx.body.assignedToUserId) : null,
    tagsCsv: ctx.body.tagsCsv ? str(ctx.body.tagsCsv) : null,
    notes: ctx.body.notes ? str(ctx.body.notes) : null,
    userId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDeleted: false,
  }
  db.clients.unshift(client)
  audit(actor, 'create', 'Client', client.id, null, client)
  persistDb()
  emitRealtime({ type: 'client.updated', payload: { id: client.id, action: 'created' } })
  return clientRow(client)
})

route('PUT', '/admin/clients/:id', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  const client = db.clients.find((c) => c.id === ctx.params.id)
  if (!client) throw new MockHttpError(404, 'Cliente no encontrado.')
  const before = { ...client }
  for (const key of [
    'clientType',
    'legalName',
    'tradeName',
    'idNumber',
    'email',
    'phone',
    'whatsapp',
    'address',
    'province',
    'canton',
    'district',
    'status',
    'source',
    'assignedToUserId',
    'tagsCsv',
    'notes',
  ] as const) {
    if (key in ctx.body) {
      // @ts-expect-error asignación dinámica controlada por la lista de claves
      client[key] = ctx.body[key] === null || ctx.body[key] === '' ? null : ctx.body[key]
    }
  }
  touch(client)
  audit(actor, 'update', 'Client', client.id, before, { ...client })
  persistDb()
  emitRealtime({ type: 'client.updated', payload: { id: client.id, action: 'updated' } })
  return clientRow(client)
})

route('DELETE', '/admin/clients/:id', (ctx) => {
  const actor = requireActor(ctx)
  const client = getDb().clients.find((c) => c.id === ctx.params.id)
  if (!client) throw new MockHttpError(404, 'Cliente no encontrado.')
  client.isDeleted = true
  touch(client)
  audit(actor, 'delete', 'Client', client.id, { ...client }, null)
  persistDb()
  return { ok: true }
})

route('GET', '/admin/clients/:id/contacts', (ctx) =>
  getDb().clientContacts.filter((c) => c.clientId === ctx.params.id),
)

route('POST', '/admin/clients/:id/contacts', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  const contact = {
    id: uid('contact'),
    clientId: ctx.params.id!,
    fullName: str(ctx.body.fullName),
    position: ctx.body.position ? str(ctx.body.position) : null,
    email: str(ctx.body.email),
    phone: ctx.body.phone ? str(ctx.body.phone) : null,
    isPrimary: bool(ctx.body.isPrimary),
  }
  if (contact.isPrimary) {
    for (const c of db.clientContacts.filter((x) => x.clientId === contact.clientId)) c.isPrimary = false
  }
  db.clientContacts.push(contact)
  audit(actor, 'create', 'ClientContact', contact.id, null, contact)
  persistDb()
  return contact
})

route('DELETE', '/admin/clients/:id/contacts/:contactId', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  db.clientContacts = db.clientContacts.filter((c) => c.id !== ctx.params.contactId)
  audit(actor, 'delete', 'ClientContact', ctx.params.contactId ?? null, null, null)
  persistDb()
  return { ok: true }
})

route('GET', '/admin/clients/:id/interactions', (ctx) =>
  list(
    getDb()
      .clientInteractions.filter((i) => i.clientId === ctx.params.id)
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()),
    ctx.query,
    (i) => inFilter(i.type, ctx.query.type),
    (i) => [i.subject, i.notes],
  ),
)

route('POST', '/admin/clients/:id/interactions', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  const item: ClientInteraction = {
    id: uid('inter'),
    clientId: ctx.params.id!,
    type: (str(ctx.body.type, 'Note') as ClientInteraction['type']) || 'Note',
    subject: str(ctx.body.subject),
    notes: ctx.body.notes ? str(ctx.body.notes) : null,
    occurredAt: str(ctx.body.occurredAt, new Date().toISOString()),
    reminderAt: ctx.body.reminderAt ? str(ctx.body.reminderAt) : null,
    isCompleted: bool(ctx.body.isCompleted),
    createdByUserId: actor,
  }
  db.clientInteractions.unshift(item)
  audit(actor, 'create', 'ClientInteraction', item.id, null, item)
  persistDb()
  return item
})

route('PATCH', '/admin/clients/:id/interactions/:interactionId', (ctx) => {
  const db = getDb()
  const item = db.clientInteractions.find((i) => i.id === ctx.params.interactionId)
  if (!item) throw new MockHttpError(404, 'Interacción no encontrada.')
  if ('isCompleted' in ctx.body) item.isCompleted = bool(ctx.body.isCompleted)
  if ('reminderAt' in ctx.body) item.reminderAt = ctx.body.reminderAt ? str(ctx.body.reminderAt) : null
  persistDb()
  return item
})

route('GET', '/admin/clients/:id/timeline', (ctx): TimelineEntry[] => {
  const db = getDb()
  const clientId = ctx.params.id
  const cases = db.caseFiles.filter((c) => c.clientId === clientId).map((c) => c.id)
  const events: TimelineEntry[] = db.caseEvents
    .filter((e) => cases.includes(e.caseFileId))
    .map((e) => ({
      id: e.id,
      kind: 'case' as const,
      label: e.title,
      title: e.title,
      description: e.description ?? null,
      actorName: e.actorUserId ? userName(e.actorUserId) : 'Sistema',
      caseCode: db.caseFiles.find((c) => c.id === e.caseFileId)?.code ?? null,
      createdAt: e.createdAt,
    }))
  const interactions: TimelineEntry[] = db.clientInteractions
    .filter((i) => i.clientId === clientId)
    .map((i) => ({
      id: i.id,
      kind: 'interaction' as const,
      label: i.subject,
      title: i.subject,
      description: i.notes ?? null,
      actorName: userName(i.createdByUserId),
      interactionType: i.type,
      createdAt: i.occurredAt,
    }))
  return [...events, ...interactions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
})

/* ------------------------------------------------------------------ */
/* EXPEDIENTES                                                         */
/* ------------------------------------------------------------------ */

route('GET', '/admin/cases', (ctx) =>
  list(
    getDb().caseFiles.map(caseRow),
    ctx.query,
    (c) =>
      inFilter(c.status, ctx.query.status) &&
      inFilter(c.matter, ctx.query.matter) &&
      inFilter(c.entity, ctx.query.entity) &&
      inFilter(c.responsibleUserId, ctx.query.responsibleUserId) &&
      inFilter(c.priority, ctx.query.priority) &&
      (!ctx.query.clientId || c.clientId === ctx.query.clientId) &&
      (!ctx.query.overdue || (!!c.dueAt && new Date(c.dueAt).getTime() < Date.now() && !['Completed', 'Closed', 'Cancelled'].includes(c.status))) &&
      inDateRange(c.dueAt ?? c.openedAt, ctx.query),
    (c) => [c.code, c.title, c.clientName, c.referenceNumber],
  ),
)

route('GET', '/admin/cases/:id', (ctx) => {
  const c = getDb().caseFiles.find((x) => x.id === ctx.params.id)
  if (!c) throw new MockHttpError(404, 'Expediente no encontrado.')
  const db = getDb()
  return {
    ...caseRow(c),
    tasks: db.caseTasks.filter((t) => t.caseFileId === c.id).map(taskRow),
    events: db.caseEvents
      .filter((e) => e.caseFileId === c.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map(eventRow),
    documents: db.documents.filter((d) => d.caseFileId === c.id && !d.isDeleted).map(docRow),
    messages: db.messages
      .filter((m) => m.caseFileId === c.id)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((m) => ({ ...m, senderName: m.senderUserId ? userName(m.senderUserId) : 'Cliente' })),
    client: clientRow(getDb().clients.find((cl) => cl.id === c.clientId) ?? ({} as Client)),
  }
})

route('POST', '/admin/cases', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  const year = new Date().getFullYear()
  const n = nextCounter(`case-${year}`)
  const item: CaseFile = {
    id: uid('case'),
    code: `GH-EXP-${year}-${String(n).padStart(4, '0')}`,
    clientId: str(ctx.body.clientId),
    title: str(ctx.body.title),
    description: ctx.body.description ? str(ctx.body.description) : null,
    matter: (str(ctx.body.matter, 'Contable') as CaseFile['matter']) || 'Contable',
    entity: (str(ctx.body.entity, 'Otro') as CaseFile['entity']) || 'Otro',
    referenceNumber: ctx.body.referenceNumber ? str(ctx.body.referenceNumber) : null,
    status: 'Open',
    priority: (str(ctx.body.priority, 'Normal') as CaseFile['priority']) || 'Normal',
    responsibleUserId: ctx.body.responsibleUserId ? str(ctx.body.responsibleUserId) : actor,
    openedAt: new Date().toISOString(),
    dueAt: ctx.body.dueAt ? str(ctx.body.dueAt) : null,
    closedAt: null,
    agreedAmount: ctx.body.agreedAmount ? num(ctx.body.agreedAmount) : null,
    currency: 'USD',
    progressPercent: 0,
    clientVisible: bool(ctx.body.clientVisible, true),
    orderItemId: ctx.body.orderItemId ? str(ctx.body.orderItemId) : null,
  }
  db.caseFiles.unshift(item)
  db.caseEvents.unshift({
    id: uid('evt'),
    caseFileId: item.id,
    type: 'Created',
    title: 'Expediente creado',
    description: `Se abrió el expediente ${item.code} para ${clientName(item.clientId)}.`,
    actorUserId: actor,
    clientVisible: true,
    createdAt: new Date().toISOString(),
  })
  audit(actor, 'create', 'CaseFile', item.id, null, item)
  persistDb()
  emitRealtime({ type: 'case.updated', payload: { id: item.id, status: item.status } })
  return caseRow(item)
})

route('PUT', '/admin/cases/:id', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  const item = db.caseFiles.find((c) => c.id === ctx.params.id)
  if (!item) throw new MockHttpError(404, 'Expediente no encontrado.')
  const before = { ...item }
  for (const key of [
    'title',
    'description',
    'matter',
    'entity',
    'referenceNumber',
    'priority',
    'responsibleUserId',
    'dueAt',
    'agreedAmount',
    'progressPercent',
    'clientVisible',
  ] as const) {
    if (key in ctx.body) {
      // @ts-expect-error asignación dinámica controlada
      item[key] = ctx.body[key]
    }
  }
  touch(item)
  audit(actor, 'update', 'CaseFile', item.id, before, { ...item })
  persistDb()
  emitRealtime({ type: 'case.updated', payload: { id: item.id } })
  return caseRow(item)
})

route('PATCH', '/admin/cases/:id/status', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  const item = db.caseFiles.find((c) => c.id === ctx.params.id)
  if (!item) throw new MockHttpError(404, 'Expediente no encontrado.')
  const before = item.status
  const status = str(ctx.body.status) as CaseFile['status']
  if (!status) throw new MockHttpError(400, 'El nuevo estado es obligatorio.')
  if (status === before) return caseRow(item)
  item.status = status
  if (status === 'Completed') item.progressPercent = 100
  if (status === 'Closed' || status === 'Cancelled') item.closedAt = new Date().toISOString()
  touch(item)
  const event: CaseEvent = {
    id: uid('evt'),
    caseFileId: item.id,
    type: 'StatusChanged',
    title: 'Cambio de estado',
    description: `${before} → ${status}. ${ctx.body.note ? str(ctx.body.note) : ''}`.trim(),
    actorUserId: actor,
    clientVisible: true,
    metadataJson: JSON.stringify({ from: before, to: status }),
    createdAt: new Date().toISOString(),
  }
  db.caseEvents.unshift(event)
  notify(
    item.responsibleUserId ?? actor,
    'Cambio de estado en expediente',
    `${item.code} pasó a ${status}.`,
    'CaseStatusChanged',
    { caseFileId: item.id },
  )
  audit(actor, 'status-change', 'CaseFile', item.id, { status: before }, { status })
  persistDb()
  emitRealtime({
    type: 'case.updated',
    payload: { id: item.id, status, code: item.code, from: before },
  })
  return caseRow(item)
})

route('GET', '/admin/cases/:id/events', (ctx) =>
  getDb()
    .caseEvents.filter((e) => e.caseFileId === ctx.params.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(eventRow),
)

route('GET', '/admin/cases/:id/tasks', (ctx) =>
  getDb()
    .caseTasks.filter((t) => t.caseFileId === ctx.params.id)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(taskRow),
)

route('POST', '/admin/cases/:id/tasks', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  const caseFile = db.caseFiles.find((c) => c.id === ctx.params.id)
  if (!caseFile) throw new MockHttpError(404, 'Expediente no encontrado.')
  const item: CaseTask = {
    id: uid('task'),
    caseFileId: caseFile.id,
    title: str(ctx.body.title),
    description: ctx.body.description ? str(ctx.body.description) : null,
    status: (str(ctx.body.status, 'Todo') as CaseTask['status']) || 'Todo',
    priority: (str(ctx.body.priority, 'Normal') as CaseTask['priority']) || 'Normal',
    dueAt: ctx.body.dueAt ? str(ctx.body.dueAt) : null,
    completedAt: null,
    assignedToUserId: ctx.body.assignedToUserId ? str(ctx.body.assignedToUserId) : actor,
    createdByUserId: actor,
    sortOrder: db.caseTasks.filter((t) => t.caseFileId === caseFile.id).length,
    clientVisible: bool(ctx.body.clientVisible, true),
  }
  db.caseTasks.push(item)
  db.caseEvents.unshift({
    id: uid('evt'),
    caseFileId: caseFile.id,
    type: 'TaskAdded',
    title: 'Tarea agregada',
    description: item.title,
    actorUserId: actor,
    clientVisible: item.clientVisible,
    createdAt: new Date().toISOString(),
  })
  if (item.assignedToUserId) {
    notify(item.assignedToUserId, 'Nueva tarea asignada', item.title, 'TaskAssigned', {
      caseFileId: caseFile.id,
      taskId: item.id,
    })
  }
  audit(actor, 'create', 'CaseTask', item.id, null, item)
  persistDb()
  emitRealtime({ type: 'case.updated', payload: { id: caseFile.id } })
  return taskRow(item)
})

route('PATCH', '/admin/cases/:id/tasks/:taskId', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  const item = db.caseTasks.find((t) => t.id === ctx.params.taskId)
  if (!item) throw new MockHttpError(404, 'Tarea no encontrada.')
  const before = { ...item }
  for (const key of [
    'title',
    'description',
    'status',
    'priority',
    'dueAt',
    'assignedToUserId',
    'clientVisible',
    'sortOrder',
  ] as const) {
    if (key in ctx.body) {
      // @ts-expect-error asignación dinámica controlada
      item[key] = ctx.body[key]
    }
  }
  if (item.status === 'Done' && !item.completedAt) item.completedAt = new Date().toISOString()
  if (item.status !== 'Done') item.completedAt = null

  db.caseEvents.unshift({
    id: uid('evt'),
    caseFileId: item.caseFileId,
    type: item.status === 'Done' ? 'TaskCompleted' : 'Note',
    title: item.status === 'Done' ? 'Tarea completada' : 'Tarea actualizada',
    description: item.title,
    actorUserId: actor,
    clientVisible: item.clientVisible,
    createdAt: new Date().toISOString(),
  })
  audit(actor, 'update', 'CaseTask', item.id, before, { ...item })
  persistDb()
  if (item.status === 'Done') {
    emitRealtime({
      type: 'task.completed',
      payload: { id: item.id, caseFileId: item.caseFileId, title: item.title },
    })
  } else {
    emitRealtime({ type: 'case.updated', payload: { id: item.caseFileId } })
  }
  return taskRow(item)
})

route('DELETE', '/admin/cases/:id/tasks/:taskId', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  db.caseTasks = db.caseTasks.filter((t) => t.id !== ctx.params.taskId)
  audit(actor, 'delete', 'CaseTask', ctx.params.taskId ?? null, null, null)
  persistDb()
  return { ok: true }
})

/* ------------------------------------------------------------------ */
/* MENSAJES                                                            */
/* ------------------------------------------------------------------ */

route('GET', '/admin/messages', (ctx) =>
  list(
    getDb().messages.map((m) => ({
      ...m,
      senderName: m.senderUserId ? userName(m.senderUserId) : 'Cliente',
      clientName: clientName(m.clientId),
    })),
    ctx.query,
    (m) => (!ctx.query.clientId || m.clientId === ctx.query.clientId) && (!ctx.query.unread || !m.readByStaffAt),
    (m) => [m.body],
  ),
)

route('POST', '/admin/messages', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  const item: Message = {
    id: uid('msg'),
    caseFileId: ctx.body.caseFileId ? str(ctx.body.caseFileId) : null,
    clientId: str(ctx.body.clientId),
    senderUserId: actor,
    body: str(ctx.body.body),
    attachmentDocumentId: ctx.body.attachmentDocumentId ? str(ctx.body.attachmentDocumentId) : null,
    isFromClient: false,
    readByStaffAt: new Date().toISOString(),
    readByClientAt: null,
    createdAt: new Date().toISOString(),
  }
  db.messages.push(item)
  if (item.caseFileId) {
    db.caseEvents.unshift({
      id: uid('evt'),
      caseFileId: item.caseFileId,
      type: 'MessageAdded',
      title: 'Mensaje enviado al cliente',
      description: item.body.slice(0, 120),
      actorUserId: actor,
      clientVisible: true,
      createdAt: new Date().toISOString(),
    })
  }
  audit(actor, 'create', 'Message', item.id, null, item)
  persistDb()
  emitRealtime({ type: 'message.created', payload: { id: item.id, clientId: item.clientId } })
  return { ...item, senderName: userName(actor) }
})

/* ------------------------------------------------------------------ */
/* DOCUMENTOS                                                          */
/* ------------------------------------------------------------------ */

route('GET', '/admin/documents', (ctx) =>
  list(
    getDb().documents.filter((d) => !d.isDeleted).map(docRow),
    ctx.query,
    (d) =>
      inFilter(d.category, ctx.query.category) &&
      (!ctx.query.caseFileId || d.caseFileId === ctx.query.caseFileId) &&
      (!ctx.query.clientId || d.clientId === ctx.query.clientId) &&
      (ctx.query.clientVisible === undefined || bool(ctx.query.clientVisible) === d.clientVisible) &&
      (!ctx.query.currentOnly || bool(ctx.query.currentOnly) === d.isCurrent),
    (d) => [d.originalName, d.fileName, d.caseCode, d.clientName],
  ),
)

route('POST', '/admin/documents', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  const caseFileId = ctx.body.caseFileId ? str(ctx.body.caseFileId) : null
  const caseFile = caseFileId ? db.caseFiles.find((c) => c.id === caseFileId) : undefined
  const originalName = str(ctx.body.originalName, 'documento.pdf')
  const contentType = str(ctx.body.contentType, 'application/pdf')
  const sizeBytes = num(ctx.body.sizeBytes)
  if (sizeBytes > 25 * 1024 * 1024) {
    throw new MockHttpError(400, 'El archivo supera el máximo de 25 MB.')
  }
  const allowed = [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ]
  if (!allowed.includes(contentType)) {
    throw new MockHttpError(400, `Tipo de archivo no permitido (${contentType}).`)
  }

  // Versionado: si ya existe un documento con el mismo nombre en el mismo expediente, sube versión.
  const previous = db.documents.filter(
    (d) =>
      !d.isDeleted &&
      d.originalName === originalName &&
      (d.caseFileId ?? '') === (caseFileId ?? '') &&
      (d.clientId ?? '') === (str(ctx.body.clientId) || ''),
  )
  const version = previous.length + 1
  for (const p of previous) p.isCurrent = false

  const item: DocumentItem = {
    id: uid('doc'),
    clientId: ctx.body.clientId ? str(ctx.body.clientId) : (caseFile?.clientId ?? null),
    caseFileId,
    orderId: ctx.body.orderId ? str(ctx.body.orderId) : null,
    category: (str(ctx.body.category, 'Otro') as DocumentItem['category']) || 'Otro',
    fileName: `${caseFile ? caseFile.code : 'cliente'}-v${version}-${originalName}`,
    originalName,
    contentType,
    sizeBytes,
    storagePath: `documents/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, '0')}/${originalName}`,
    sha256: Math.random().toString(16).slice(2).padEnd(64, '0').slice(0, 64),
    version,
    isCurrent: true,
    uploadedByUserId: actor,
    uploadedAt: new Date().toISOString(),
    clientVisible: bool(ctx.body.clientVisible, true),
    isDeleted: false,
  }
  db.documents.unshift(item)

  if (caseFile) {
    db.caseEvents.unshift({
      id: uid('evt'),
      caseFileId: caseFile.id,
      type: 'DocumentAdded',
      title: 'Documento agregado',
      description: `${originalName} (v${version})`,
      actorUserId: actor,
      clientVisible: item.clientVisible,
      createdAt: new Date().toISOString(),
    })
  }
  audit(actor, 'create', 'Document', item.id, null, item)
  persistDb()
  emitRealtime({
    type: 'document.added',
    payload: { id: item.id, caseFileId: item.caseFileId, name: item.originalName },
  })
  return docRow(item)
})

route('DELETE', '/admin/documents/:id', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  const item = db.documents.find((d) => d.id === ctx.params.id)
  if (!item) throw new MockHttpError(404, 'Documento no encontrado.')
  item.isDeleted = true
  audit(actor, 'delete', 'Document', item.id, item, null)
  persistDb()
  return { ok: true }
})

route('GET', '/admin/documents/:id/versions', (ctx) => {
  const db = getDb()
  const item = db.documents.find((d) => d.id === ctx.params.id)
  if (!item) throw new MockHttpError(404, 'Documento no encontrado.')
  return db.documents
    .filter(
      (d) =>
        d.originalName === item.originalName &&
        (d.caseFileId ?? '') === (item.caseFileId ?? '') &&
        (d.clientId ?? '') === (item.clientId ?? ''),
    )
    .sort((a, b) => b.version - a.version)
    .map(docRow)
})

/* ------------------------------------------------------------------ */
/* CATÁLOGO                                                            */
/* ------------------------------------------------------------------ */

route('GET', '/admin/catalog/categories', () =>
  getDb()
    .productCategories.sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => ({
      ...c,
      productCount: getDb().products.filter((p) => p.categoryId === c.id && !p.isDeleted).length,
    })),
)

route('POST', '/admin/catalog/categories', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  const item: ProductCategory = {
    id: uid('cat'),
    slug: str(ctx.body.slug) || str(ctx.body.name).toLowerCase().replace(/\s+/g, '-'),
    name: str(ctx.body.name),
    description: str(ctx.body.description),
    iconName: str(ctx.body.iconName, 'package'),
    sortOrder: db.productCategories.length + 1,
    isActive: bool(ctx.body.isActive, true),
    imageUrl: ctx.body.imageUrl ? str(ctx.body.imageUrl) : null,
  }
  db.productCategories.push(item)
  audit(actor, 'create', 'ProductCategory', item.id, null, item)
  persistDb()
  return item
})

route('PUT', '/admin/catalog/categories/:id', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  const item = db.productCategories.find((c) => c.id === ctx.params.id)
  if (!item) throw new MockHttpError(404, 'Categoría no encontrada.')
  const before = { ...item }
  for (const key of ['slug', 'name', 'description', 'iconName', 'sortOrder', 'isActive', 'imageUrl'] as const) {
    if (key in ctx.body) {
      // @ts-expect-error asignación dinámica controlada
      item[key] = ctx.body[key]
    }
  }
  audit(actor, 'update', 'ProductCategory', item.id, before, { ...item })
  persistDb()
  return item
})

route('DELETE', '/admin/catalog/categories/:id', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  const used = db.products.filter((p) => p.categoryId === ctx.params.id && !p.isDeleted).length
  if (used > 0) throw new MockHttpError(400, `No se puede borrar: tiene ${used} servicios asociados.`)
  db.productCategories = db.productCategories.filter((c) => c.id !== ctx.params.id)
  audit(actor, 'delete', 'ProductCategory', ctx.params.id ?? null, null, null)
  persistDb()
  return { ok: true }
})

route('GET', '/admin/catalog/products', (ctx) =>
  list(
    getDb().products.filter((p) => !p.isDeleted).map(productRow),
    ctx.query,
    (p) =>
      inFilter(p.categoryId, ctx.query.categoryId) &&
      inFilter(p.categorySlug, ctx.query.category) &&
      (ctx.query.isActive === undefined || bool(ctx.query.isActive) === p.isActive) &&
      (ctx.query.isFeatured === undefined || bool(ctx.query.isFeatured) === p.isFeatured) &&
      (ctx.query.requiresCase === undefined || bool(ctx.query.requiresCase) === p.requiresCase) &&
      (!ctx.query.minPrice || p.price >= num(ctx.query.minPrice)) &&
      (!ctx.query.maxPrice || p.price <= num(ctx.query.maxPrice)),
    (p) => [p.name, p.sku, p.slug, p.shortDescription],
  ),
)

route('GET', '/admin/catalog/products/:id', (ctx) => {
  const p = getDb().products.find((x) => x.id === ctx.params.id || x.slug === ctx.params.id)
  if (!p) throw new MockHttpError(404, 'Servicio no encontrado.')
  return productRow(p)
})

route('POST', '/admin/catalog/products', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  const item: Product = {
    id: uid('prod'),
    sku: str(ctx.body.sku) || `GH-${Date.now().toString(36).toUpperCase()}`,
    slug: str(ctx.body.slug) || str(ctx.body.name).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name: str(ctx.body.name),
    shortDescription: str(ctx.body.shortDescription),
    description: str(ctx.body.description),
    price: num(ctx.body.price),
    currency: str(ctx.body.currency, 'USD'),
    taxRate: num(ctx.body.taxRate, 13),
    categoryId: str(ctx.body.categoryId),
    imageUrl: ctx.body.imageUrl ? str(ctx.body.imageUrl) : null,
    galleryJson: null,
    isActive: bool(ctx.body.isActive, true),
    isFeatured: bool(ctx.body.isFeatured),
    requiresCase: bool(ctx.body.requiresCase, true),
    deliveryMode: (str(ctx.body.deliveryMode, 'Digital') as Product['deliveryMode']) || 'Digital',
    estimatedDays: ctx.body.estimatedDays ? num(ctx.body.estimatedDays) : null,
    sortOrder: db.products.length + 1,
    sourceUrl: ctx.body.sourceUrl ? str(ctx.body.sourceUrl) : null,
    seoTitle: ctx.body.seoTitle ? str(ctx.body.seoTitle) : null,
    seoDescription: ctx.body.seoDescription ? str(ctx.body.seoDescription) : null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDeleted: false,
  }
  db.products.unshift(item)
  audit(actor, 'create', 'Product', item.id, null, item)
  persistDb()
  return productRow(item)
})

route('PUT', '/admin/catalog/products/:id', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  const item = db.products.find((p) => p.id === ctx.params.id)
  if (!item) throw new MockHttpError(404, 'Servicio no encontrado.')
  const before = { ...item }
  for (const key of [
    'sku',
    'slug',
    'name',
    'shortDescription',
    'description',
    'price',
    'currency',
    'taxRate',
    'categoryId',
    'imageUrl',
    'isActive',
    'isFeatured',
    'requiresCase',
    'deliveryMode',
    'estimatedDays',
    'sortOrder',
    'sourceUrl',
    'seoTitle',
    'seoDescription',
  ] as const) {
    if (key in ctx.body) {
      // @ts-expect-error asignación dinámica controlada
      item[key] = ctx.body[key]
    }
  }
  item.updatedAt = new Date().toISOString()
  audit(actor, 'update', 'Product', item.id, before, { ...item })
  persistDb()
  return productRow(item)
})

route('DELETE', '/admin/catalog/products/:id', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  const item = db.products.find((p) => p.id === ctx.params.id)
  if (!item) throw new MockHttpError(404, 'Servicio no encontrado.')
  item.isDeleted = true
  item.isActive = false
  audit(actor, 'delete', 'Product', item.id, item, null)
  persistDb()
  return { ok: true }
})

/* ------------------------------------------------------------------ */
/* PEDIDOS Y PAGOS                                                     */
/* ------------------------------------------------------------------ */

route('GET', '/admin/orders', (ctx) =>
  list(
    getDb().orders.map(orderRow),
    ctx.query,
    (o) =>
      inFilter(o.status, ctx.query.status) &&
      (!ctx.query.clientId || o.clientId === ctx.query.clientId) &&
      inDateRange(o.createdAt, ctx.query) &&
      (ctx.query.paid === undefined ||
        (bool(ctx.query.paid) === ['Paid', 'InProcess', 'Completed'].includes(o.status))),
    (o) => [o.number, o.clientName, o.customerName],
  ),
)

route('GET', '/admin/orders/:id', (ctx) => {
  const o = getDb().orders.find((x) => x.id === ctx.params.id || x.number === ctx.params.id)
  if (!o) throw new MockHttpError(404, 'Pedido no encontrado.')
  return orderRow(o)
})

route('PATCH', '/admin/orders/:id/status', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  const o = db.orders.find((x) => x.id === ctx.params.id)
  if (!o) throw new MockHttpError(404, 'Pedido no encontrado.')
  const before = o.status
  o.status = (str(ctx.body.status) as Order['status']) || o.status
  if (o.status === 'Paid' && !o.paidAt) o.paidAt = new Date().toISOString()
  if (o.status === 'Completed') o.completedAt = new Date().toISOString()
  audit(actor, 'status-change', 'Order', o.id, { status: before }, { status: o.status })
  persistDb()
  emitRealtime({ type: 'order.updated', payload: { id: o.id, status: o.status, number: o.number } })
  return orderRow(o)
})

route('POST', '/admin/orders/:id/refund', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  const o = db.orders.find((x) => x.id === ctx.params.id)
  if (!o) throw new MockHttpError(404, 'Pedido no encontrado.')
  if (!['Paid', 'InProcess', 'Completed'].includes(o.status)) {
    throw new MockHttpError(400, 'Solo se pueden reembolsar pedidos pagados.')
  }
  o.status = 'Refunded'
  const payment = db.payments.find((p) => p.orderId === o.id && p.status === 'Approved')
  if (payment) {
    payment.status = 'Refunded'
    payment.rawResponseJson = JSON.stringify({
      status: 'Refunded',
      reference: payment.reference,
      refundedAt: new Date().toISOString(),
      reason: str(ctx.body.reason, 'Reembolso solicitado por el cliente'),
    })
  }
  audit(actor, 'refund', 'Order', o.id, { status: o.status }, { status: 'Refunded' })
  persistDb()
  emitRealtime({ type: 'order.updated', payload: { id: o.id, status: o.status } })
  return orderRow(o)
})

route('POST', '/admin/orders/:id/create-case', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  const o = db.orders.find((x) => x.id === ctx.params.id)
  if (!o) throw new MockHttpError(404, 'Pedido no encontrado.')
  if (!o.clientId) throw new MockHttpError(400, 'El pedido no tiene cliente asociado.')
  const year = new Date().getFullYear()
  const created: CaseFile[] = []
  for (const item of o.items) {
    if (item.caseFileId) continue
    const product = productById(item.productId)
    if (product && !product.requiresCase) continue
    const n = nextCounter(`case-${year}`)
    const cf: CaseFile = {
      id: uid('case'),
      code: `GH-EXP-${year}-${String(n).padStart(4, '0')}`,
      clientId: o.clientId,
      title: item.nameSnapshot,
      description: `Expediente generado automáticamente desde el pedido ${o.number}.`,
      matter: product?.categorySlug?.includes('tribut')
        ? 'Tributario'
        : product?.categorySlug?.includes('municipal')
          ? 'Municipal'
          : product?.categorySlug?.includes('legal')
            ? 'Legal'
            : 'Contable',
      entity: 'Otro',
      referenceNumber: null,
      status: 'Open',
      priority: 'Normal',
      responsibleUserId: actor,
      openedAt: new Date().toISOString(),
      dueAt: product?.estimatedDays
        ? new Date(Date.now() + product.estimatedDays * 86400000).toISOString()
        : null,
      closedAt: null,
      agreedAmount: item.total,
      currency: o.currency,
      progressPercent: 0,
      clientVisible: true,
      orderItemId: item.id,
    }
    db.caseFiles.unshift(cf)
    item.caseFileId = cf.id
    db.caseEvents.unshift({
      id: uid('evt'),
      caseFileId: cf.id,
      type: 'Created',
      title: 'Expediente creado desde pedido',
      description: `Origen comercial: ${o.number} · ${item.nameSnapshot}`,
      actorUserId: actor,
      clientVisible: true,
      createdAt: new Date().toISOString(),
    })
    db.caseTasks.push({
      id: uid('task'),
      caseFileId: cf.id,
      title: 'Revisión documental inicial',
      description: 'Verificar documentación aportada por el cliente y confirmar requisitos del ente.',
      status: 'Todo',
      priority: 'High',
      dueAt: new Date(Date.now() + 3 * 86400000).toISOString(),
      completedAt: null,
      assignedToUserId: actor,
      createdByUserId: actor,
      sortOrder: 0,
      clientVisible: true,
    })
    db.caseTasks.push({
      id: uid('task'),
      caseFileId: cf.id,
      title: 'Contactar al cliente',
      description: 'Confirmar alcance del servicio y fechas estimadas de entrega.',
      status: 'Todo',
      priority: 'Normal',
      dueAt: new Date(Date.now() + 1 * 86400000).toISOString(),
      completedAt: null,
      assignedToUserId: actor,
      createdByUserId: actor,
      sortOrder: 1,
      clientVisible: true,
    })
    created.push(cf)
  }
  if (o.status === 'Paid') o.status = 'InProcess'
  audit(actor, 'create-case', 'Order', o.id, null, { cases: created.map((c) => c.code) })
  persistDb()
  emitRealtime({ type: 'case.updated', payload: { id: created[0]?.id ?? null, fromOrder: o.number } })
  return { created: created.map(caseRow), order: orderRow(o) }
})

route('GET', '/admin/payments', (ctx) =>
  list(
    getDb().payments.map(paymentRow),
    ctx.query,
    (p) =>
      inFilter(p.status, ctx.query.status) &&
      inFilter(p.method, ctx.query.method) &&
      inFilter(p.orderId, ctx.query.orderId) &&
      inDateRange(p.createdAt, ctx.query),
    (p) => [p.reference, p.authorizationCode, p.cardLast4, p.cardHolder, p.orderNumber],
  ),
)

route('GET', '/admin/payments/:id', (ctx) => {
  const p = getDb().payments.find((x) => x.id === ctx.params.id || x.reference === ctx.params.id)
  if (!p) throw new MockHttpError(404, 'Transacción no encontrada.')
  const order = getDb().orders.find((o) => o.id === p.orderId)
  return { ...paymentRow(p), order: order ? orderRow(order) : null }
})

/* ------------------------------------------------------------------ */
/* SOLICITUDES DE CUENTA                                               */
/* ------------------------------------------------------------------ */

route('GET', '/admin/account-requests', (ctx) => {
  const db = getDb()
  return {
    ...list(
      db.accountRequests,
      ctx.query,
      (a) =>
        inFilter(a.status, ctx.query.status) &&
        inFilter(a.source, ctx.query.source) &&
        inDateRange(a.createdAt, ctx.query),
      (a) => [a.fullName, a.email, a.idNumber, a.company, a.phone],
    ),
    pendingCount: db.accountRequests.filter((a) => a.status === 'Pending').length,
  }
})

route('GET', '/admin/account-requests/:id', (ctx) => {
  const a = getDb().accountRequests.find((x) => x.id === ctx.params.id)
  if (!a) throw new MockHttpError(404, 'Solicitud no encontrada.')
  return a
})

route('POST', '/admin/account-requests/:id/approve', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  const item = db.accountRequests.find((a) => a.id === ctx.params.id)
  if (!item) throw new MockHttpError(404, 'Solicitud no encontrada.')
  if (item.status !== 'Pending') throw new MockHttpError(400, 'La solicitud ya fue revisada.')

  const userId = uid('user')
  const clientCounter = nextCounter('client')
  const clientId = uid('client')
  const role = str(ctx.body.role, 'Cliente')

  db.clients.unshift({
    id: clientId,
    code: `GH-CLI-${String(clientCounter).padStart(5, '0')}`,
    clientType: item.clientType,
    legalName: item.company || item.fullName,
    tradeName: item.company,
    idNumber: item.idNumber,
    email: item.email,
    phone: item.phone,
    whatsapp: null,
    address: null,
    province: 'Guanacaste',
    canton: null,
    district: null,
    country: 'CR',
    status: 'Active',
    source: 'app',
    assignedToUserId: actor,
    tagsCsv: 'nuevo,app',
    notes: item.message,
    userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDeleted: false,
  })

  db.users.unshift({
    id: userId,
    email: item.email,
    fullName: item.fullName,
    phone: item.phone,
    idNumber: item.idNumber,
    status: 'Active',
    isStaff: false,
    clientId,
    avatarUrl: null,
    locale: 'es-CR',
    timeZone: 'America/Costa_Rica',
    lastLoginAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    failedLoginCount: 0,
    lockoutUntil: null,
    roles: [role],
  })
  db.passwords[item.email] = 'Cliente123!'

  item.status = 'Approved'
  item.reviewedByUserId = actor
  item.reviewedAt = new Date().toISOString()
  item.createdUserId = userId

  notify(actor, 'Solicitud de cuenta aprobada', `${item.fullName} fue aprobado y se creó su usuario.`, 'AccountApproved', {
    accountRequestId: item.id,
    userId,
  })
  audit(actor, 'approve', 'AccountRequest', item.id, { status: 'Pending' }, { status: 'Approved', userId })
  persistDb()
  emitRealtime({ type: 'accountrequest.created', payload: { id: item.id, approved: true } })
  return { request: item, user: userRow(db.users.find((u) => u.id === userId)!), clientId }
})

route('POST', '/admin/account-requests/:id/reject', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  const item = db.accountRequests.find((a) => a.id === ctx.params.id)
  if (!item) throw new MockHttpError(404, 'Solicitud no encontrada.')
  if (item.status !== 'Pending') throw new MockHttpError(400, 'La solicitud ya fue revisada.')
  const reason = str(ctx.body.reason)
  if (!reason) throw new MockHttpError(400, 'El motivo de rechazo es obligatorio.')
  item.status = 'Rejected'
  item.rejectionReason = reason
  item.reviewedByUserId = actor
  item.reviewedAt = new Date().toISOString()
  audit(actor, 'reject', 'AccountRequest', item.id, { status: 'Pending' }, { status: 'Rejected', reason })
  persistDb()
  return item
})

/* ------------------------------------------------------------------ */
/* COTIZACIONES                                                        */
/* ------------------------------------------------------------------ */

route('GET', '/admin/quotes', (ctx) => {
  const db = getDb()
  return {
    ...list(
      db.quotes.map((q) => ({
        ...q,
        serviceName: q.serviceId ? productById(q.serviceId)?.name ?? null : null,
        handledByName: q.handledByUserId ? userName(q.handledByUserId) : null,
        clientName: q.clientId ? clientName(q.clientId) : null,
      })),
      ctx.query,
      (q) =>
        inFilter(q.status, ctx.query.status) &&
        inDateRange(q.createdAt, ctx.query) &&
        (!ctx.query.serviceId || q.serviceId === ctx.query.serviceId),
      (q) => [q.fullName, q.email, q.company, q.message],
    ),
    newCount: db.quotes.filter((q) => q.status === 'New').length,
  }
})

route('PATCH', '/admin/quotes/:id', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  const item = db.quotes.find((q) => q.id === ctx.params.id)
  if (!item) throw new MockHttpError(404, 'Cotización no encontrada.')
  const before = { ...item }
  if (ctx.body.status) item.status = str(ctx.body.status) as QuoteRequest['status']
  if ('handledByUserId' in ctx.body) item.handledByUserId = ctx.body.handledByUserId ? str(ctx.body.handledByUserId) : null
  audit(actor, 'update', 'QuoteRequest', item.id, before, { ...item })
  persistDb()
  return item
})

route('POST', '/admin/quotes/:id/convert', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  const item = db.quotes.find((q) => q.id === ctx.params.id)
  if (!item) throw new MockHttpError(404, 'Cotización no encontrada.')
  if (item.clientId) throw new MockHttpError(400, 'La cotización ya fue convertida en cliente.')
  const n = nextCounter('client')
  const clientId = uid('client')
  db.clients.unshift({
    id: clientId,
    code: `GH-CLI-${String(n).padStart(5, '0')}`,
    clientType: item.company ? 'Company' : 'Individual',
    legalName: item.company || item.fullName,
    tradeName: item.company,
    idNumber: str(ctx.body.idNumber, 'PENDIENTE'),
    email: item.email,
    phone: item.phone,
    whatsapp: null,
    address: ctx.body.address ? str(ctx.body.address) : null,
    province: 'Guanacaste',
    canton: null,
    district: null,
    country: 'CR',
    status: 'Lead',
    source: 'web',
    assignedToUserId: actor,
    tagsCsv: 'cotizacion',
    notes: item.message,
    userId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDeleted: false,
  })
  item.status = 'Converted'
  item.clientId = clientId
  item.handledByUserId = actor
  audit(actor, 'convert', 'QuoteRequest', item.id, null, { clientId })
  persistDb()
  emitRealtime({ type: 'client.updated', payload: { id: clientId, fromQuote: item.id } })
  return { quote: item, clientId }
})

/* ------------------------------------------------------------------ */
/* USUARIOS Y ROLES                                                    */
/* ------------------------------------------------------------------ */

route('GET', '/admin/users', (ctx) =>
  list(
    getDb().users.map(userRow),
    ctx.query,
    (u) =>
      inFilter(u.status, ctx.query.status) &&
      (ctx.query.isStaff === undefined || bool(ctx.query.isStaff) === u.isStaff) &&
      (toArray(ctx.query.role).length === 0 || toArray(ctx.query.role).some((r) => u.roles.includes(r))),
    (u) => [u.fullName, u.email, u.idNumber, u.phone],
  ),
)

route('GET', '/admin/users/:id', (ctx) => {
  const u = getDb().users.find((x) => x.id === ctx.params.id)
  if (!u) throw new MockHttpError(404, 'Usuario no encontrado.')
  return userRow(u)
})

route('POST', '/admin/users', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  const email = str(ctx.body.email)
  if (db.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    throw new MockHttpError(400, 'Ya existe un usuario con ese correo.')
  }
  const item: User = {
    id: uid('user'),
    email,
    fullName: str(ctx.body.fullName),
    phone: str(ctx.body.phone),
    idNumber: str(ctx.body.idNumber),
    status: (str(ctx.body.status, 'Active') as User['status']) || 'Active',
    isStaff: bool(ctx.body.isStaff, true),
    clientId: ctx.body.clientId ? str(ctx.body.clientId) : null,
    avatarUrl: null,
    locale: 'es-CR',
    timeZone: 'America/Costa_Rica',
    lastLoginAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    failedLoginCount: 0,
    lockoutUntil: null,
    roles: toArray(ctx.body.roles).length ? toArray(ctx.body.roles) : ['Asistente'],
  }
  db.users.unshift(item)
  db.passwords[item.email] = str(ctx.body.password, 'Demo123!')
  audit(actor, 'create', 'User', item.id, null, item)
  persistDb()
  return userRow(item)
})

route('PUT', '/admin/users/:id', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  const item = db.users.find((u) => u.id === ctx.params.id)
  if (!item) throw new MockHttpError(404, 'Usuario no encontrado.')
  const before = { ...item }
  for (const key of ['fullName', 'phone', 'idNumber', 'email', 'isStaff', 'clientId'] as const) {
    if (key in ctx.body) {
      // @ts-expect-error asignación dinámica controlada
      item[key] = ctx.body[key]
    }
  }
  touch(item)
  audit(actor, 'update', 'User', item.id, before, { ...item })
  persistDb()
  return userRow(item)
})

route('PATCH', '/admin/users/:id/status', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  const item = db.users.find((u) => u.id === ctx.params.id)
  if (!item) throw new MockHttpError(404, 'Usuario no encontrado.')
  if (item.id === actor) throw new MockHttpError(400, 'No puede cambiar el estado de su propia cuenta.')
  const before = item.status
  item.status = str(ctx.body.status) as User['status']
  if (item.status === 'Active') {
    item.failedLoginCount = 0
    item.lockoutUntil = null
  }
  touch(item)
  audit(actor, 'status-change', 'User', item.id, { status: before }, { status: item.status })
  persistDb()
  return userRow(item)
})

route('PUT', '/admin/users/:id/roles', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  const item = db.users.find((u) => u.id === ctx.params.id)
  if (!item) throw new MockHttpError(404, 'Usuario no encontrado.')
  const before = [...item.roles]
  const roles = toArray(ctx.body.roles)
  if (!roles.length) throw new MockHttpError(400, 'Debe asignar al menos un rol.')
  item.roles = roles
  touch(item)
  audit(actor, 'assign', 'UserRole', item.id, { roles: before }, { roles })
  persistDb()
  return userRow(item)
})

route('POST', '/admin/users/:id/reset-password', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  const item = db.users.find((u) => u.id === ctx.params.id)
  if (!item) throw new MockHttpError(404, 'Usuario no encontrado.')
  const newPassword = str(ctx.body.password, `Gh${Math.floor(100000 + Math.random() * 899999)}!`)
  db.passwords[item.email] = newPassword
  audit(actor, 'reset-password', 'User', item.id, null, null)
  persistDb()
  return { ok: true, temporaryPassword: newPassword }
})

route('GET', '/admin/roles', () => {
  const db = getDb()
  return db.roles.map((r) => ({
    ...r,
    userCount: db.users.filter((u) => u.roles.includes(r.name)).length,
  }))
})

route('POST', '/admin/roles', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  const name = str(ctx.body.name)
  if (db.roles.some((r) => norm(r.name) === norm(name))) {
    throw new MockHttpError(400, 'Ya existe un rol con ese nombre.')
  }
  const role: Role = {
    id: uid('role'),
    name,
    description: str(ctx.body.description),
    isSystem: false,
    isStaffRole: bool(ctx.body.isStaffRole, true),
    createdAt: new Date().toISOString(),
    permissionCodes: toArray(ctx.body.permissionCodes),
  }
  db.roles.push(role)
  audit(actor, 'create', 'Role', role.id, null, role)
  persistDb()
  return role
})

route('PUT', '/admin/roles/:id', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  const role = db.roles.find((r) => r.id === ctx.params.id)
  if (!role) throw new MockHttpError(404, 'Rol no encontrado.')
  const before = { ...role }
  if (role.isSystem && ctx.body.name && str(ctx.body.name) !== role.name) {
    throw new MockHttpError(400, 'No se puede renombrar un rol del sistema.')
  }
  if ('name' in ctx.body) role.name = str(ctx.body.name)
  if ('description' in ctx.body) role.description = str(ctx.body.description)
  if ('isStaffRole' in ctx.body) role.isStaffRole = bool(ctx.body.isStaffRole)
  audit(actor, 'update', 'Role', role.id, before, { ...role })
  persistDb()
  return role
})

route('PUT', '/admin/roles/:id/permissions', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  const role = db.roles.find((r) => r.id === ctx.params.id)
  if (!role) throw new MockHttpError(404, 'Rol no encontrado.')
  const before = [...role.permissionCodes]
  role.permissionCodes = toArray(ctx.body.permissionCodes)
  audit(actor, 'assign', 'RolePermission', role.id, { permissions: before }, { permissions: role.permissionCodes })
  persistDb()
  return role
})

route('DELETE', '/admin/roles/:id', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  const role = db.roles.find((r) => r.id === ctx.params.id)
  if (!role) throw new MockHttpError(404, 'Rol no encontrado.')
  if (role.isSystem) throw new MockHttpError(400, 'Los roles del sistema no se pueden borrar.')
  const users = db.users.filter((u) => u.roles.includes(role.name)).length
  if (users > 0) throw new MockHttpError(400, `El rol tiene ${users} usuario(s) asignado(s).`)
  db.roles = db.roles.filter((r) => r.id !== role.id)
  audit(actor, 'delete', 'Role', role.id, role, null)
  persistDb()
  return { ok: true }
})

route('GET', '/admin/permissions', () => getDb().permissions)

/* ------------------------------------------------------------------ */
/* INFORMES                                                            */
/* ------------------------------------------------------------------ */

route('GET', '/admin/reports/sales', (ctx): ReportSales => {
  const db = getDb()
  const paid = db.orders.filter((o) => !['Cancelled', 'PendingPayment'].includes(o.status))
  const months: { month: string; total: number; orders: number }[] = []
  for (let i = 11; i >= 0; i -= 1) {
    const d = startOfMonth(-i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const orders = paid.filter((o) => {
      const od = new Date(o.createdAt)
      return od.getFullYear() === d.getFullYear() && od.getMonth() === d.getMonth()
    })
    months.push({
      month: key,
      total: Number(orders.reduce((s, o) => s + o.total, 0).toFixed(2)),
      orders: orders.length,
    })
  }

  const byCategory = new Map<string, { total: number; orders: number }>()
  const byService = new Map<string, { name: string; quantity: number; total: number }>()
  for (const o of paid) {
    for (const item of o.items) {
      const product = productById(item.productId)
      const cat = db.productCategories.find((c) => c.id === product?.categoryId)
      const catKey = cat?.name ?? 'Sin categoría'
      const catEntry = byCategory.get(catKey) ?? { total: 0, orders: 0 }
      catEntry.total += item.total
      catEntry.orders += 1
      byCategory.set(catKey, catEntry)

      const svc = byService.get(item.productId) ?? { name: item.nameSnapshot, quantity: 0, total: 0 }
      svc.quantity += item.quantity
      svc.total += item.total
      byService.set(item.productId, svc)
    }
  }

  const subtotal = paid.reduce((s, o) => s + o.subtotal, 0)
  const tax = paid.reduce((s, o) => s + o.tax, 0)
  const total = paid.reduce((s, o) => s + o.total, 0)

  void ctx
  return {
    byMonth: months,
    byCategory: Array.from(byCategory.entries())
      .map(([category, v]) => ({ category, total: Number(v.total.toFixed(2)), orders: v.orders }))
      .sort((a, b) => b.total - a.total),
    byService: Array.from(byService.entries())
      .map(([productId, v]) => ({
        productId,
        name: v.name,
        quantity: v.quantity,
        total: Number(v.total.toFixed(2)),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 30),
    totals: {
      subtotal: Number(subtotal.toFixed(2)),
      tax: Number(tax.toFixed(2)),
      total: Number(total.toFixed(2)),
      orders: paid.length,
      averageTicket: paid.length ? Number((total / paid.length).toFixed(2)) : 0,
    },
  }
})

route('GET', '/admin/reports/cases', (): ReportCases => {
  const db = getDb()
  const byStatus = new Map<string, number>()
  const byMatter = new Map<string, number>()
  const byEntity = new Map<string, number>()
  for (const c of db.caseFiles) {
    byStatus.set(c.status, (byStatus.get(c.status) ?? 0) + 1)
    byMatter.set(c.matter, (byMatter.get(c.matter) ?? 0) + 1)
    byEntity.set(c.entity, (byEntity.get(c.entity) ?? 0) + 1)
  }
  const overdue = db.caseFiles
    .filter(
      (c) =>
        c.dueAt &&
        new Date(c.dueAt).getTime() < Date.now() &&
        !['Completed', 'Closed', 'Cancelled'].includes(c.status),
    )
    .map((c) => ({
      id: c.id,
      code: c.code,
      title: c.title,
      clientName: clientName(c.clientId),
      dueAt: c.dueAt!,
      status: c.status,
    }))
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())

  return {
    byStatus: Array.from(byStatus.entries()).map(([status, count]) => ({
      status: status as CaseFile['status'],
      count,
    })),
    byMatter: Array.from(byMatter.entries()).map(([matter, count]) => ({
      matter: matter as CaseFile['matter'],
      count,
    })),
    byEntity: Array.from(byEntity.entries()).map(([entity, count]) => ({
      entity: entity as CaseFile['entity'],
      count,
    })),
    overdue,
    averageProgress: db.caseFiles.length
      ? Math.round(db.caseFiles.reduce((s, c) => s + c.progressPercent, 0) / db.caseFiles.length)
      : 0,
  }
})

route('GET', '/admin/reports/productivity', (): ReportProductivity => {
  const db = getDb()
  const now = Date.now()
  const staff = db.users.filter((u) => u.isStaff && u.status === 'Active')
  return {
    rows: staff.map((u) => {
      const cases = db.caseFiles.filter((c) => c.responsibleUserId === u.id)
      const tasks = db.caseTasks.filter((t) => t.assignedToUserId === u.id)
      return {
        userId: u.id,
        fullName: u.fullName,
        role: u.roles[0] ?? '—',
        openCases: cases.filter((c) => !['Completed', 'Closed', 'Cancelled'].includes(c.status)).length,
        closedCases: cases.filter((c) => ['Completed', 'Closed'].includes(c.status)).length,
        tasksDone: tasks.filter((t) => t.status === 'Done').length,
        tasksOverdue: tasks.filter(
          (t) => t.dueAt && new Date(t.dueAt).getTime() < now && !['Done', 'Cancelled'].includes(t.status),
        ).length,
        interactions: db.clientInteractions.filter((i) => i.createdByUserId === u.id).length,
      }
    }),
    overdueTasks: db.caseTasks
      .filter((t) => t.dueAt && new Date(t.dueAt).getTime() < now && !['Done', 'Cancelled'].includes(t.status))
      .map((t) => ({
        id: t.id,
        title: t.title,
        caseCode: db.caseFiles.find((c) => c.id === t.caseFileId)?.code ?? '—',
        assignedToName: userName(t.assignedToUserId),
        dueAt: t.dueAt ?? null,
        priority: t.priority,
        status: t.status,
      }))
      .sort((a, b) => new Date(a.dueAt ?? 0).getTime() - new Date(b.dueAt ?? 0).getTime()),
  }
})

/* ------------------------------------------------------------------ */
/* AJUSTES Y AUDITORÍA                                                 */
/* ------------------------------------------------------------------ */

route('GET', '/admin/settings', (ctx) => {
  const db = getDb()
  const items = ctx.query.group ? db.settings.filter((s) => s.group === ctx.query.group) : db.settings
  const grouped: Record<string, Setting[]> = {}
  for (const s of items) {
    grouped[s.group] = grouped[s.group] ?? []
    grouped[s.group]!.push({ ...s })
  }
  return { items: items.map((s) => ({ ...s })), groups: grouped, exchangeRate: exchangeRate() }
})

route('PUT', '/admin/settings', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  const incoming = (ctx.body.items ?? ctx.body) as unknown
  const pairs: { key: string; value: string }[] = []
  if (Array.isArray(incoming)) {
    for (const raw of incoming) {
      const entry = raw as { key?: unknown; value?: unknown }
      if (entry.key !== undefined) pairs.push({ key: String(entry.key), value: str(entry.value) })
    }
  } else if (incoming && typeof incoming === 'object') {
    for (const [key, value] of Object.entries(incoming as Record<string, unknown>)) {
      pairs.push({ key, value: str(value) })
    }
  }
  for (const pair of pairs) {
    const setting = db.settings.find((s) => s.key === pair.key)
    if (setting) {
      setting.value = pair.value
      setting.updatedAt = new Date().toISOString()
    } else {
      db.settings.push({
        key: pair.key,
        value: pair.value,
        group: 'company',
        description: '',
        updatedAt: new Date().toISOString(),
      })
    }
  }
  audit(actor, 'update', 'Setting', null, null, Object.fromEntries(pairs.map((p) => [p.key, p.value])))
  persistDb()
  return { ok: true, updated: pairs.length }
})

route('GET', '/admin/audit', (ctx) =>
  list(
    getDb().auditLogs.map((l) => ({ ...l, userName: l.userId ? userName(l.userId) : 'Sistema' })),
    ctx.query,
    (l) =>
      (!ctx.query.userId || l.userId === ctx.query.userId) &&
      inFilter(l.entityName, ctx.query.entityName) &&
      inFilter(l.action, ctx.query.action) &&
      inDateRange(l.createdAt, ctx.query),
    (l) => [l.action, l.entityName, l.entityId, l.userName],
  ),
)

/* ------------------------------------------------------------------ */
/* NOTIFICACIONES                                                      */
/* ------------------------------------------------------------------ */

route('GET', '/admin/notifications', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  return list(
    db.notifications.filter((n) => n.userId === actor),
    ctx.query,
    (n) => (ctx.query.unread === undefined || !bool(ctx.query.unread) || !n.readAt),
    (n) => [n.title, n.body],
  )
})

route('POST', '/admin/notifications/:id/read', (ctx) => {
  const db = getDb()
  const n = db.notifications.find((x) => x.id === ctx.params.id)
  if (!n) throw new MockHttpError(404, 'Notificación no encontrada.')
  n.readAt = new Date().toISOString()
  n.status = 'Read'
  persistDb()
  return n
})

route('POST', '/admin/notifications/read-all', (ctx) => {
  const actor = requireActor(ctx)
  const db = getDb()
  for (const n of db.notifications.filter((x) => x.userId === actor)) {
    n.readAt = n.readAt ?? new Date().toISOString()
    n.status = 'Read'
  }
  persistDb()
  return { ok: true }
})

route('POST', '/admin/notifications/send', (ctx) => {
  const actor = requireActor(ctx)
  const n = notify(
    str(ctx.body.userId, actor),
    str(ctx.body.title, 'Aviso'),
    str(ctx.body.body, ''),
    (str(ctx.body.type, 'System') as Notification['type']) || 'System',
    {},
  )
  audit(actor, 'send', 'Notification', n.id, null, n)
  persistDb()
  emitRealtime({ type: 'notification', payload: { id: n.id, title: n.title, body: n.body } })
  return n
})

/* ------------------------------------------------------------------ */
/* Despacho                                                            */
/* ------------------------------------------------------------------ */

function matchRoute(method: string, path: string): { route: Route; params: Record<string, string> } {
  const parts = path.split('/').filter(Boolean)
  for (const r of routes) {
    if (r.method !== method) continue
    if (r.segments.length !== parts.length) continue
    const params: Record<string, string> = {}
    let ok = true
    for (let i = 0; i < r.segments.length; i += 1) {
      const seg = r.segments[i]!
      const part = parts[i]!
      if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(part)
      else if (seg !== part) {
        ok = false
        break
      }
    }
    if (ok) return { route: r, params }
  }
  throw new MockHttpError(404, `Ruta no encontrada en el mock: ${method} ${path}`)
}

export interface MockRequest {
  method: string
  url: string
  body?: unknown
  headers?: Record<string, string>
}

export interface MockResponse<T = unknown> {
  status: number
  data: T
}

function parseBody(body: unknown): Record<string, unknown> {
  if (!body) return {}
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  if (typeof body === 'object') return body as Record<string, unknown>
  return {}
}

/** Punto de entrada del adaptador: resuelve una petición del contrato. */
export async function handleMockRequest<T = unknown>(req: MockRequest): Promise<MockResponse<T>> {
  await bootstrapMockDb()
  // Latencia simulada 150–400 ms
  await delay(150 + Math.floor(Math.random() * 250))

  const [rawPath, rawQuery = ''] = req.url.split('?')
  let path = rawPath ?? '/'
  // Quita el prefijo del API (p. ej. /ghcontadores/api/v1)
  path = path.replace(/^.*\/api\/v\d+/i, '')
  if (!path.startsWith('/')) path = `/${path}`

  const query: Record<string, string> = {}
  for (const pair of rawQuery.split('&')) {
    if (!pair) continue
    const [k, v = ''] = pair.split('=')
    if (!k) continue
    try {
      query[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '))
    } catch {
      query[decodeURIComponent(k)] = v
    }
  }

  const { route: matched, params } = matchRoute(req.method.toUpperCase(), path)
  const data = await matched.handler({
    params,
    query,
    body: parseBody(req.body),
    headers: req.headers ?? {},
    method: req.method.toUpperCase(),
    path,
  })
  return { status: 200, data: data as T }
}

export { resetDb }
