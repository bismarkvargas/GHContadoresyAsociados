import { del, get, patch, post, put, api, USE_MOCKS } from './client'
import { handleMockRequest } from './mock/router'
import type {
  AccountRequest,
  AuditLog,
  CaseEvent,
  CaseFile,
  CaseTask,
  Client,
  ClientContact,
  ClientInteraction,
  DashboardSummary,
  DocumentItem,
  ListParams,
  Message,
  Notification,
  NotificationSummary,
  Order,
  Paginated,
  Payment,
  Permission,
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

/* ------------------------------ Dashboard ------------------------------ */
export const dashboardApi = {
  summary: () => get<DashboardSummary>('/admin/dashboard/summary'),
}

/**
 * Sanea los parámetros de consulta: **nunca** se envía `undefined`, `null` ni
 * cadena vacía (la API es estricta con los tipos y responde 400). Así ninguna
 * pantalla puede construir `?clientId=undefined`.
 */
function limpio(params: ListParams): ListParams {
  const salida: ListParams = {}
  for (const [clave, valor] of Object.entries(params)) {
    if (valor === undefined || valor === null) continue
    if (typeof valor === 'string' && (valor === '' || valor === 'undefined' || valor === 'null')) continue
    if (Array.isArray(valor) && valor.length === 0) continue
    salida[clave] = valor
  }
  return salida
}

/**
 * Adapta el formulario de cliente al contrato de la API:
 * - `tags` es un **arreglo de cadenas** (el formulario trabaja con `tagsCsv`).
 * - Se descartan las claves que el formulario añade solo para la interfaz
 *   (`tagsCsv`, `createCase`).
 */
export function aCliente(
  valores: Partial<Client> & { tagsCsv?: string | null; createCase?: boolean },
): Record<string, unknown> {
  const { tagsCsv, createCase, tags, ...resto } = valores
  void createCase
  const lista = Array.isArray(tags)
    ? tags
    : typeof tagsCsv === 'string'
      ? tagsCsv
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined
  // `tags` siempre se envía como arreglo; se omite si no hay etiquetas.
  return { ...resto, ...(lista?.length ? { tags: lista } : {}) }
}

/* ------------------------------- Clientes ------------------------------ */
export const clientsApi = {
  list: (params: ListParams) => get<Paginated<Client>>('/admin/clients', limpio(params)),
  get: (id: string) => get<Client>(`/admin/clients/${id}`),
  create: (body: Partial<Client>) => post<Client>('/admin/clients', aCliente(body)),
  update: (id: string, body: Partial<Client>) => put<Client>(`/admin/clients/${id}`, aCliente(body)),
  remove: (id: string) => del<{ ok: boolean }>(`/admin/clients/${id}`),
  contacts: (id: string) => get<ClientContact[]>(`/admin/clients/${id}/contacts`),
  addContact: (id: string, body: Partial<ClientContact>) =>
    post<ClientContact>(`/admin/clients/${id}/contacts`, body),
  removeContact: (id: string, contactId: string) =>
    del<{ ok: boolean }>(`/admin/clients/${id}/contacts/${contactId}`),
  interactions: (id: string, params?: ListParams) =>
    get<Paginated<ClientInteraction>>(`/admin/clients/${id}/interactions`, limpio(params ?? {})),
  addInteraction: (id: string, body: Partial<ClientInteraction>) =>
    post<ClientInteraction>(`/admin/clients/${id}/interactions`, body),
  completeInteraction: (id: string, interactionId: string, isCompleted: boolean) =>
    patch<ClientInteraction>(`/admin/clients/${id}/interactions/${interactionId}`, { isCompleted }),
  timeline: (id: string) => get<TimelineEntry[]>(`/admin/clients/${id}/timeline`),
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

/* ------------------------------ Expedientes ---------------------------- */
export interface CaseDetail extends CaseFile {
  tasks: CaseTask[]
  events: CaseEvent[]
  documents: DocumentItem[]
  messages: Message[]
  client: Client
}

export const casesApi = {
  list: (params: ListParams) => get<Paginated<CaseFile>>('/admin/cases', limpio(params)),
  get: (id: string) => get<CaseDetail>(`/admin/cases/${id}`),
  create: (body: Partial<CaseFile>) => post<CaseFile>('/admin/cases', body),
  update: (id: string, body: Partial<CaseFile>) => put<CaseFile>(`/admin/cases/${id}`, body),
  changeStatus: (id: string, status: string, note?: string) =>
    patch<CaseFile>(`/admin/cases/${id}/status`, { status, note }),
  events: (id: string) => get<CaseEvent[]>(`/admin/cases/${id}/events`),
  tasks: (id: string) => get<CaseTask[]>(`/admin/cases/${id}/tasks`),
  createTask: (id: string, body: Partial<CaseTask>) =>
    post<CaseTask>(`/admin/cases/${id}/tasks`, body),
  updateTask: (id: string, taskId: string, body: Partial<CaseTask>) =>
    patch<CaseTask>(`/admin/cases/${id}/tasks/${taskId}`, body),
  removeTask: (id: string, taskId: string) =>
    del<{ ok: boolean }>(`/admin/cases/${id}/tasks/${taskId}`),
}

/* ------------------------------- Mensajes ------------------------------ */
export const messagesApi = {
  list: (params: ListParams) => get<Paginated<Message>>('/admin/messages', limpio(params)),
  send: (body: { caseFileId?: string | null; clientId: string; body: string }) =>
    post<Message>('/admin/messages', body),
}

/* ------------------------------ Documentos ----------------------------- */
export interface UploadInput {
  file: File
  category: string
  caseFileId?: string | null
  clientId?: string | null
  clientVisible: boolean
}

export const documentsApi = {
  list: (params: ListParams) => get<Paginated<DocumentItem>>('/admin/documents', limpio(params)),
  versions: (id: string) => get<DocumentItem[]>(`/admin/documents/${id}/versions`),
  remove: (id: string) => del<{ ok: boolean }>(`/admin/documents/${id}`),

  /** Subida múltiple (multipart). En modo mock se resuelve contra el adaptador. */
  async upload(inputs: UploadInput[]): Promise<DocumentItem[]> {
    const created: DocumentItem[] = []
    for (const input of inputs) {
      if (USE_MOCKS) {
        const response = await handleMockRequest<DocumentItem>({
          method: 'POST',
          url: '/admin/documents',
          body: {
            originalName: input.file.name,
            contentType: input.file.type || 'application/pdf',
            sizeBytes: input.file.size,
            category: input.category,
            caseFileId: input.caseFileId ?? null,
            clientId: input.clientId ?? null,
            clientVisible: input.clientVisible,
          },
          headers: { authorization: `Bearer ${localStorage.getItem('gh.accessToken') ?? ''}` },
        })
        created.push(response.data)
      } else {
        const form = new FormData()
        form.append('file', input.file)
        form.append('category', input.category)
        form.append('clientVisible', String(input.clientVisible))
        if (input.caseFileId) form.append('caseFileId', input.caseFileId)
        if (input.clientId) form.append('clientId', input.clientId)
        const { data } = await api.post<DocumentItem>('/admin/documents', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        created.push(data)
      }
    }
    return created
  },
}

/* ------------------------------- Catálogo ------------------------------ */
export const catalogApi = {
  categories: () => get<ProductCategory[]>('/admin/catalog/categories'),
  createCategory: (body: Partial<ProductCategory>) =>
    post<ProductCategory>('/admin/catalog/categories', body),
  updateCategory: (id: string, body: Partial<ProductCategory>) =>
    put<ProductCategory>(`/admin/catalog/categories/${id}`, body),
  removeCategory: (id: string) => del<{ ok: boolean }>(`/admin/catalog/categories/${id}`),

  products: (params: ListParams) => get<Paginated<Product>>('/admin/catalog/products', limpio(params)),
  product: (id: string) => get<Product>(`/admin/catalog/products/${id}`),
  createProduct: (body: Partial<Product>) => post<Product>('/admin/catalog/products', body),
  updateProduct: (id: string, body: Partial<Product>) =>
    put<Product>(`/admin/catalog/products/${id}`, body),
  removeProduct: (id: string) => del<{ ok: boolean }>(`/admin/catalog/products/${id}`),
}

/* -------------------------------- Pedidos ------------------------------ */
export const ordersApi = {
  list: (params: ListParams) => get<Paginated<Order>>('/admin/orders', limpio(params)),
  get: (id: string) => get<Order>(`/admin/orders/${id}`),
  changeStatus: (id: string, status: string) => patch<Order>(`/admin/orders/${id}/status`, { status }),
  refund: (id: string, reason: string) => post<Order>(`/admin/orders/${id}/refund`, { reason }),
  createCase: (id: string) =>
    post<{ created: CaseFile[]; order: Order }>(`/admin/orders/${id}/create-case`),
}

/* --------------------------------- Pagos ------------------------------- */
export const paymentsApi = {
  list: (params: ListParams) => get<Paginated<Payment>>('/admin/payments', limpio(params)),
  get: (id: string) => get<Payment & { order: Order | null }>(`/admin/payments/${id}`),
}

/* ------------------------- Solicitudes de cuenta ----------------------- */
/** Bandeja de solicitudes: paginado + contador de pendientes. */
export type AccountRequestPage = Paginated<AccountRequest> & { pendingCount: number }
/** Bandeja de cotizaciones: paginado + contador de nuevas. */
export type QuoteRequestPage = Paginated<QuoteRequest> & { newCount: number }

export const accountRequestsApi = {
  list: (params: ListParams) => get<AccountRequestPage>('/admin/account-requests', limpio(params)),
  get: (id: string) => get<AccountRequest>(`/admin/account-requests/${id}`),
  approve: (id: string, role = 'Cliente') =>
    post<{ request: AccountRequest; user: User; clientId: string }>(
      `/admin/account-requests/${id}/approve`,
      { role },
    ),
  reject: (id: string, reason: string) =>
    post<AccountRequest>(`/admin/account-requests/${id}/reject`, { reason }),
}

/* ------------------------------ Cotizaciones --------------------------- */
export const quotesApi = {
  list: (params: ListParams) => get<QuoteRequestPage>('/admin/quotes', limpio(params)),
  update: (id: string, body: Partial<QuoteRequest>) =>
    patch<QuoteRequest>(`/admin/quotes/${id}`, body),
  convert: (id: string, body: { idNumber?: string; address?: string } = {}) =>
    post<{ quote: QuoteRequest; clientId: string }>(`/admin/quotes/${id}/convert`, body),
}

/* -------------------------------- Usuarios ----------------------------- */
export const usersApi = {
  list: (params: ListParams) => get<Paginated<User>>('/admin/users', limpio(params)),
  get: (id: string) => get<User>(`/admin/users/${id}`),
  create: (body: Partial<User> & { password?: string; roles?: string[] }) =>
    post<User>('/admin/users', body),
  update: (id: string, body: Partial<User>) => put<User>(`/admin/users/${id}`, body),
  changeStatus: (id: string, status: string) => patch<User>(`/admin/users/${id}/status`, { status }),
  setRoles: (id: string, roles: string[]) => put<User>(`/admin/users/${id}/roles`, { roles }),
  resetPassword: (id: string, password?: string) =>
    post<{ ok: boolean; temporaryPassword: string }>(`/admin/users/${id}/reset-password`, { password }),
}

/* ---------------------------- Roles y permisos ------------------------- */
export const rolesApi = {
  list: () => get<Role[]>('/admin/roles'),
  create: (body: Partial<Role>) => post<Role>('/admin/roles', body),
  update: (id: string, body: Partial<Role>) => put<Role>(`/admin/roles/${id}`, body),
  setPermissions: (id: string, permissionCodes: string[]) =>
    put<Role>(`/admin/roles/${id}/permissions`, { permissionCodes }),
  remove: (id: string) => del<{ ok: boolean }>(`/admin/roles/${id}`),
  permissions: () => get<Permission[]>('/admin/permissions'),
}

/* -------------------------------- Informes ----------------------------- */
export const reportsApi = {
  sales: (params?: ListParams) => get<ReportSales>('/admin/reports/sales', params),
  cases: () => get<ReportCases>('/admin/reports/cases'),
  productivity: () => get<ReportProductivity>('/admin/reports/productivity'),
}

/* --------------------------- Ajustes y auditoría ----------------------- */
export interface SettingsPageData {
  items: Setting[]
  groups: Record<string, Setting[]>
  exchangeRate: number
}

export const settingsApi = {
  list: (group?: string) =>
    get<SettingsPageData>('/admin/settings', group ? { group } : undefined),
  /**
   * La API espera `{ values: [{ key, value }] }`. Con `{ items: [...] }` responde
   * 400 («The Values field is required»), así que el panel envía `values`.
   */
  update: (items: { key: string; value: string }[]) =>
    put<{ ok: boolean; updated: number }>('/admin/settings', { values: items }),
}

export const auditApi = {
  list: (params: ListParams) =>
    get<Paginated<AuditLog & { userName: string }>>('/admin/audit', limpio(params)),
}

/* ---------------------------- Notificaciones --------------------------- */
export const notificationsApi = {
  /** Bandeja de administración: GET /admin/notifications (paginado y filtrable). */
  list: (params: ListParams) => get<Paginated<Notification>>('/admin/notifications', limpio(params)),
  /** Contadores de la campana: GET /admin/notifications/summary. */
  summary: () => get<NotificationSummary>('/admin/notifications/summary'),
  /** Reenvío de una notificación concreta. */
  resend: (id: string) => post<{ message: string }>(`/admin/notifications/${id}/resend`),
  /** Envío manual desde el panel. */
  send: (body: { userId?: string; title: string; body: string; type?: string }) =>
    post<{ message: string; userId?: string }>('/admin/notifications/send', body),
  /**
   * Marcar como leída. La API todavía no expone estos endpoints; el panel lo
   * comprueba y, si responden 404, informa en lugar de reintentar en bucle.
   */
  markRead: (id: string) => post<Notification>(`/admin/notifications/${id}/read`),
  markAllRead: () => post<{ ok: boolean }>('/admin/notifications/read-all'),
}
