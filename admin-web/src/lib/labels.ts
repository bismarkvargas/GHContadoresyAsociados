import type {
  AccountRequestStatus,
  CaseEntity,
  CaseEventType,
  CaseMatter,
  CaseStatus,
  CaseTaskStatus,
  ClientSource,
  ClientStatus,
  ClientType,
  DeliveryMode,
  DocumentCategory,
  InteractionType,
  NotificationType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Priority,
  QuoteStatus,
  UserStatus,
} from '@/types'

/** Clase de color por tono semántico de marca. */
export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'

export const toneClasses: Record<Tone, string> = {
  neutral: 'bg-surface text-ink-700',
  primary: 'bg-primary-50 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
  info: 'bg-info/10 text-info',
}

interface Meta {
  label: string
  tone: Tone
}

export const clientTypeMeta: Record<ClientType, Meta> = {
  Individual: { label: 'Persona física', tone: 'info' },
  Company: { label: 'Persona jurídica', tone: 'neutral' },
  ForeignInvestor: { label: 'Inversionista extranjero', tone: 'primary' },
}

export const clientStatusMeta: Record<ClientStatus, Meta> = {
  Lead: { label: 'Prospecto', tone: 'info' },
  Active: { label: 'Activo', tone: 'success' },
  Inactive: { label: 'Inactivo', tone: 'neutral' },
  Blocked: { label: 'Bloqueado', tone: 'danger' },
}

export const clientSourceMeta: Record<ClientSource, Meta> = {
  app: { label: 'App móvil', tone: 'info' },
  web: { label: 'Sitio web', tone: 'neutral' },
  whatsapp: { label: 'WhatsApp', tone: 'success' },
  referral: { label: 'Referido', tone: 'primary' },
  walkin: { label: 'Presencial', tone: 'neutral' },
  campaign: { label: 'Campaña', tone: 'warning' },
}

export const userStatusMeta: Record<UserStatus, Meta> = {
  Pending: { label: 'Pendiente', tone: 'warning' },
  Active: { label: 'Activo', tone: 'success' },
  Suspended: { label: 'Suspendido', tone: 'danger' },
  Rejected: { label: 'Rechazado', tone: 'neutral' },
}

export const caseStatusMeta: Record<CaseStatus, Meta> = {
  Open: { label: 'Abierto', tone: 'info' },
  InProgress: { label: 'En proceso', tone: 'primary' },
  WaitingClient: { label: 'Espera cliente', tone: 'warning' },
  OnHold: { label: 'En pausa', tone: 'neutral' },
  Completed: { label: 'Completado', tone: 'success' },
  Closed: { label: 'Cerrado', tone: 'neutral' },
  Cancelled: { label: 'Cancelado', tone: 'danger' },
}

export const caseMatterMeta: Record<CaseMatter, Meta> = {
  Contable: { label: 'Contable', tone: 'info' },
  Tributario: { label: 'Tributario', tone: 'primary' },
  Legal: { label: 'Legal', tone: 'neutral' },
  Municipal: { label: 'Municipal', tone: 'warning' },
  Laboral: { label: 'Laboral', tone: 'success' },
  Otro: { label: 'Otro', tone: 'neutral' },
}

export const caseEntityMeta: Record<CaseEntity, Meta> = {
  SUGEF: { label: 'SUGEF', tone: 'info' },
  ACAM: { label: 'ACAM', tone: 'info' },
  ATV: { label: 'ATV', tone: 'primary' },
  CCSS: { label: 'CCSS', tone: 'success' },
  INS: { label: 'INS', tone: 'warning' },
  MEIC: { label: 'MEIC', tone: 'neutral' },
  MAG: { label: 'MAG', tone: 'success' },
  ICT: { label: 'ICT', tone: 'info' },
  Municipalidad: { label: 'Municipalidad', tone: 'warning' },
  RTBF: { label: 'RTBF', tone: 'neutral' },
  Otro: { label: 'Otro', tone: 'neutral' },
}

export const priorityMeta: Record<Priority, Meta> = {
  Low: { label: 'Baja', tone: 'neutral' },
  Normal: { label: 'Normal', tone: 'info' },
  High: { label: 'Alta', tone: 'warning' },
  Urgent: { label: 'Urgente', tone: 'danger' },
}

export const taskStatusMeta: Record<CaseTaskStatus, Meta> = {
  Todo: { label: 'Por hacer', tone: 'neutral' },
  InProgress: { label: 'En curso', tone: 'primary' },
  Done: { label: 'Completada', tone: 'success' },
  Blocked: { label: 'Bloqueada', tone: 'danger' },
  Cancelled: { label: 'Cancelada', tone: 'neutral' },
}

export const caseEventTypeMeta: Record<CaseEventType, Meta> = {
  Created: { label: 'Expediente creado', tone: 'info' },
  StatusChanged: { label: 'Cambio de estado', tone: 'primary' },
  TaskAdded: { label: 'Tarea agregada', tone: 'neutral' },
  TaskCompleted: { label: 'Tarea completada', tone: 'success' },
  DocumentAdded: { label: 'Documento agregado', tone: 'info' },
  MessageAdded: { label: 'Mensaje', tone: 'neutral' },
  PaymentReceived: { label: 'Pago recibido', tone: 'success' },
  Note: { label: 'Nota', tone: 'neutral' },
  DueDateChanged: { label: 'Vencimiento cambiado', tone: 'warning' },
}

export const interactionTypeMeta: Record<InteractionType, Meta> = {
  Call: { label: 'Llamada', tone: 'info' },
  Email: { label: 'Correo', tone: 'neutral' },
  Meeting: { label: 'Reunión', tone: 'primary' },
  Whatsapp: { label: 'WhatsApp', tone: 'success' },
  Note: { label: 'Nota', tone: 'neutral' },
  Task: { label: 'Tarea', tone: 'warning' },
  System: { label: 'Sistema', tone: 'neutral' },
}

export const documentCategoryMeta: Record<DocumentCategory, Meta> = {
  Expediente: { label: 'Expediente', tone: 'info' },
  Identidad: { label: 'Identidad', tone: 'primary' },
  Contable: { label: 'Contable', tone: 'success' },
  Tributario: { label: 'Tributario', tone: 'warning' },
  Legal: { label: 'Legal', tone: 'neutral' },
  Municipal: { label: 'Municipal', tone: 'warning' },
  Contrato: { label: 'Contrato', tone: 'primary' },
  Comprobante: { label: 'Comprobante', tone: 'success' },
  Otro: { label: 'Otro', tone: 'neutral' },
}

export const orderStatusMeta: Record<OrderStatus, Meta> = {
  PendingPayment: { label: 'Pendiente de pago', tone: 'warning' },
  Paid: { label: 'Pagado', tone: 'success' },
  InProcess: { label: 'En proceso', tone: 'primary' },
  Completed: { label: 'Completado', tone: 'success' },
  Cancelled: { label: 'Cancelado', tone: 'neutral' },
  Refunded: { label: 'Reembolsado', tone: 'danger' },
}

export const paymentStatusMeta: Record<PaymentStatus, Meta> = {
  Initiated: { label: 'Iniciado', tone: 'neutral' },
  Approved: { label: 'Aprobado', tone: 'success' },
  Declined: { label: 'Rechazado', tone: 'danger' },
  Pending: { label: 'Pendiente', tone: 'warning' },
  Refunded: { label: 'Reembolsado', tone: 'info' },
}

export const paymentMethodMeta: Record<PaymentMethod, Meta> = {
  Card: { label: 'Tarjeta', tone: 'primary' },
  Sinpe: { label: 'SINPE Móvil', tone: 'success' },
  Transfer: { label: 'Transferencia', tone: 'info' },
}

export const accountRequestStatusMeta: Record<AccountRequestStatus, Meta> = {
  Pending: { label: 'Pendiente', tone: 'warning' },
  Approved: { label: 'Aprobada', tone: 'success' },
  Rejected: { label: 'Rechazada', tone: 'danger' },
  Cancelled: { label: 'Cancelada', tone: 'neutral' },
}

export const quoteStatusMeta: Record<QuoteStatus, Meta> = {
  New: { label: 'Nueva', tone: 'warning' },
  Contacted: { label: 'Contactada', tone: 'info' },
  Quoted: { label: 'Cotizada', tone: 'primary' },
  Converted: { label: 'Convertida', tone: 'success' },
  Discarded: { label: 'Descartada', tone: 'neutral' },
}

export const deliveryModeMeta: Record<DeliveryMode, Meta> = {
  Digital: { label: 'Digital', tone: 'info' },
  Presencial: { label: 'Presencial', tone: 'warning' },
  Mixto: { label: 'Mixto', tone: 'primary' },
}

export const notificationTypeMeta: Record<NotificationType, Meta> = {
  AccountApproved: { label: 'Cuenta aprobada', tone: 'success' },
  AccountRejected: { label: 'Cuenta rechazada', tone: 'danger' },
  CaseCreated: { label: 'Expediente creado', tone: 'info' },
  CaseStatusChanged: { label: 'Cambio de estado', tone: 'primary' },
  TaskAssigned: { label: 'Tarea asignada', tone: 'info' },
  TaskDueSoon: { label: 'Tarea por vencer', tone: 'warning' },
  TaskCompleted: { label: 'Tarea completada', tone: 'success' },
  DocumentAvailable: { label: 'Documento disponible', tone: 'info' },
  OrderPaid: { label: 'Pedido pagado', tone: 'success' },
  OrderStatusChanged: { label: 'Estado de pedido', tone: 'primary' },
  PaymentFailed: { label: 'Pago fallido', tone: 'danger' },
  MessageReceived: { label: 'Mensaje recibido', tone: 'info' },
  System: { label: 'Sistema', tone: 'neutral' },
}

/* --- Listas para selects ------------------------------------------- */

export function keysOf<T extends Record<string, Meta>>(record: T): (keyof T)[] {
  return Object.keys(record) as (keyof T)[]
}

export function labelOf<T extends Record<string, Meta>>(
  record: T,
  key: string | null | undefined,
): string {
  if (!key) return '—'
  const meta = (record as Record<string, Meta>)[key]
  return meta ? meta.label : key
}

export function toneOf<T extends Record<string, Meta>>(
  record: T,
  key: string | null | undefined,
): Tone {
  if (!key) return 'neutral'
  const meta = (record as Record<string, Meta>)[key]
  return meta ? meta.tone : 'neutral'
}

/* --- Catálogos de valores para los formularios --------------------- */

export const provinces = [
  'San José',
  'Alajuela',
  'Cartago',
  'Heredia',
  'Guanacaste',
  'Puntarenas',
  'Limón',
]

export const caseEntityList: CaseEntity[] = [
  'SUGEF',
  'ACAM',
  'ATV',
  'CCSS',
  'INS',
  'MEIC',
  'MAG',
  'ICT',
  'Municipalidad',
  'RTBF',
  'Otro',
]

export const caseMatterList: CaseMatter[] = [
  'Contable',
  'Tributario',
  'Legal',
  'Municipal',
  'Laboral',
  'Otro',
]

export const priorityList: Priority[] = ['Low', 'Normal', 'High', 'Urgent']
export const caseStatusList: CaseStatus[] = [
  'Open',
  'InProgress',
  'WaitingClient',
  'OnHold',
  'Completed',
  'Closed',
  'Cancelled',
]
export const caseStatusBoardOrder: CaseStatus[] = [
  'Open',
  'InProgress',
  'WaitingClient',
  'OnHold',
  'Completed',
  'Closed',
]
export const taskStatusList: CaseTaskStatus[] = ['Todo', 'InProgress', 'Done', 'Blocked', 'Cancelled']
export const clientTypeList: ClientType[] = ['Individual', 'Company', 'ForeignInvestor']
export const clientStatusList: ClientStatus[] = ['Lead', 'Active', 'Inactive', 'Blocked']
export const clientSourceList: ClientSource[] = [
  'app',
  'web',
  'whatsapp',
  'referral',
  'walkin',
  'campaign',
]
export const orderStatusList: OrderStatus[] = [
  'PendingPayment',
  'Paid',
  'InProcess',
  'Completed',
  'Cancelled',
  'Refunded',
]
export const paymentStatusList: PaymentStatus[] = [
  'Initiated',
  'Approved',
  'Declined',
  'Pending',
  'Refunded',
]
export const interactionTypeList: InteractionType[] = [
  'Call',
  'Email',
  'Meeting',
  'Whatsapp',
  'Note',
  'Task',
  'System',
]
export const documentCategoryList: DocumentCategory[] = [
  'Expediente',
  'Identidad',
  'Contable',
  'Tributario',
  'Legal',
  'Municipal',
  'Contrato',
  'Comprobante',
  'Otro',
]
export const deliveryModeList: DeliveryMode[] = ['Digital', 'Presencial', 'Mixto']
export const quoteStatusList: QuoteStatus[] = [
  'New',
  'Contacted',
  'Quoted',
  'Converted',
  'Discarded',
]
