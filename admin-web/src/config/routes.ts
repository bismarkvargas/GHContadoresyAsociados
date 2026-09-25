/**
 * Rutas del panel con su pantalla y los permisos que exigen.
 * Esta tabla es la fuente única para el router, el sidebar y RUTAS.md.
 * `permission: null` significa que cualquier usuario staff autenticado puede verla.
 */

import {
  Activity,
  BarChart3,
  Briefcase,
  ClipboardList,
  CreditCard,
  FileStack,
  FileText,
  Gauge,
  LayoutGrid,
  MessageSquareQuote,
  Package,
  Settings as SettingsIcon,
  ShieldCheck,
  Tags,
  UserCheck,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  /** Ruta del router (sin el base). */
  path: string
  label: string
  icon: LucideIcon
  /** Permiso requerido para verla y acceder. `null` = cualquier staff. */
  permission: string | null
  /** Grupo del menú lateral. */
  group: string
  description: string
  /** Oculto del menú pero accesible por URL. */
  hidden?: boolean
}

export const navGroups = [
  'Operación',
  'Comercial',
  'Configuración',
] as const

export const navItems: NavItem[] = [
  {
    path: '/',
    label: 'Dashboard',
    icon: Gauge,
    permission: 'reports.view',
    group: 'Operación',
    description: 'KPIs, ventas, embudo de leads y actividad en vivo.',
  },
  {
    path: '/clientes',
    label: 'Clientes',
    icon: Users,
    permission: 'clients.view',
    group: 'Operación',
    description: 'CRM: listado, ficha, contactos e interacciones.',
  },
  {
    path: '/expedientes',
    label: 'Expedientes',
    icon: Briefcase,
    permission: 'cases.view',
    group: 'Operación',
    description: 'Casos por estado y materia, tareas, timeline y mensajes.',
  },
  {
    path: '/expedientes/tablero',
    label: 'Tablero kanban',
    icon: LayoutGrid,
    permission: 'cases.view',
    group: 'Operación',
    description: 'Vista kanban de expedientes por estado.',
  },
  {
    path: '/documentos',
    label: 'Documentos',
    icon: FileStack,
    permission: 'documents.view',
    group: 'Operación',
    description: 'Subida múltiple, categorías, versionado y visibilidad.',
  },
  {
    path: '/pedidos',
    label: 'Pedidos',
    icon: ClipboardList,
    permission: 'orders.view',
    group: 'Comercial',
    description: 'Pedidos de la tienda, facturación y generación de expediente.',
  },
  {
    path: '/pagos',
    label: 'Pagos',
    icon: CreditCard,
    permission: 'payments.view',
    group: 'Comercial',
    description: 'Transacciones de la pasarela simulada con request/response.',
  },
  {
    path: '/catalogo',
    label: 'Catálogo',
    icon: Package,
    permission: 'catalog.view',
    group: 'Comercial',
    description: 'Categorías y los 62 servicios reales del sitio.',
  },
  {
    path: '/catalogo/categorias',
    label: 'Categorías',
    icon: Tags,
    permission: 'catalog.view',
    group: 'Comercial',
    description: 'Las 4 categorías primarias del catálogo.',
  },
  {
    path: '/cotizaciones',
    label: 'Cotizaciones',
    icon: MessageSquareQuote,
    permission: 'quotes.view',
    group: 'Comercial',
    description: 'Bandeja del formulario web y conversión a cliente.',
  },
  {
    path: '/solicitudes',
    label: 'Solicitudes de cuenta',
    icon: UserCheck,
    permission: 'accountrequests.view',
    group: 'Operación',
    description: 'Aprobación o rechazo con motivo; al aprobar se crea el usuario.',
  },
  {
    path: '/informes',
    label: 'Informes',
    icon: BarChart3,
    permission: 'reports.view',
    group: 'Comercial',
    description: 'Ventas, expedientes y productividad con exportación CSV.',
  },
  {
    path: '/usuarios',
    label: 'Usuarios',
    icon: ShieldCheck,
    permission: 'users.view',
    group: 'Configuración',
    description: 'CRUD de usuarios, roles múltiples y estados.',
  },
  {
    path: '/roles',
    label: 'Roles y permisos',
    icon: ShieldCheck,
    permission: 'roles.view',
    group: 'Configuración',
    description: 'Matriz de permisos por módulo y acción.',
  },
  {
    path: '/auditoria',
    label: 'Auditoría',
    icon: Activity,
    permission: 'settings.view',
    group: 'Configuración',
    description: 'Log de acciones con diff antes/después.',
  },
  {
    path: '/ajustes',
    label: 'Ajustes',
    icon: SettingsIcon,
    permission: 'settings.view',
    group: 'Configuración',
    description: 'Empresa, marca, monedas, plantillas y pasarela.',
  },
]

export const routePermissions: {
  path: string
  screen: string
  view: string | null
  extra: string[]
}[] = [
  { path: '/login', screen: 'Inicio de sesión a pantalla completa', view: null, extra: [] },
  { path: '/', screen: 'Dashboard', view: 'reports.view', extra: [] },
  { path: '/clientes', screen: 'Clientes (listado CRM)', view: 'clients.view', extra: ['clients.create'] },
  { path: '/clientes/nuevo', screen: 'Alta de cliente', view: 'clients.view', extra: ['clients.create'] },
  { path: '/clientes/:id', screen: 'Ficha de cliente (pestañas)', view: 'clients.view', extra: ['clients.edit', 'clients.assign'] },
  { path: '/expedientes', screen: 'Expedientes (listado)', view: 'cases.view', extra: ['cases.create'] },
  { path: '/expedientes/nuevo', screen: 'Alta de expediente', view: 'cases.view', extra: ['cases.create'] },
  { path: '/expedientes/tablero', screen: 'Tablero kanban de expedientes', view: 'cases.view', extra: ['cases.edit'] },
  { path: '/expedientes/:id', screen: 'Detalle de expediente (tareas, timeline, documentos, mensajes)', view: 'cases.view', extra: ['cases.edit', 'cases.assign'] },
  { path: '/documentos', screen: 'Documentos', view: 'documents.view', extra: ['documents.create', 'documents.delete'] },
  { path: '/catalogo', screen: 'Catálogo de servicios', view: 'catalog.view', extra: ['catalog.create', 'catalog.edit', 'catalog.delete'] },
  { path: '/catalogo/categorias', screen: 'Categorías del catálogo', view: 'catalog.view', extra: ['catalog.create', 'catalog.edit', 'catalog.delete'] },
  { path: '/pedidos', screen: 'Pedidos (listado)', view: 'orders.view', extra: ['orders.edit'] },
  { path: '/pedidos/:id', screen: 'Detalle de pedido', view: 'orders.view', extra: ['orders.edit'] },
  { path: '/pagos', screen: 'Pagos (transacciones)', view: 'payments.view', extra: ['payments.export'] },
  { path: '/cotizaciones', screen: 'Cotizaciones del formulario web', view: 'quotes.view', extra: ['quotes.edit', 'quotes.approve'] },
  { path: '/solicitudes', screen: 'Solicitudes de cuenta', view: 'accountrequests.view', extra: ['accountrequests.approve'] },
  { path: '/informes', screen: 'Informes', view: 'reports.view', extra: ['reports.export'] },
  { path: '/usuarios', screen: 'Usuarios', view: 'users.view', extra: ['users.create', 'users.edit', 'users.delete'] },
  { path: '/roles', screen: 'Roles y permisos', view: 'roles.view', extra: ['roles.create', 'roles.edit', 'roles.delete'] },
  { path: '/ajustes', screen: 'Ajustes', view: 'settings.view', extra: ['settings.edit'] },
  { path: '/auditoria', screen: 'Auditoría', view: 'settings.view', extra: [] },
  { path: '*', screen: 'Página no encontrada / sin permiso', view: null, extra: [] },
]

/** Permiso de vista exigido por cada ruta del router (para las guardas). */
export const routeViewPermission: Record<string, string> = {
  '/': 'reports.view',
  '/clientes': 'clients.view',
  '/expedientes': 'cases.view',
  '/documentos': 'documents.view',
  '/catalogo': 'catalog.view',
  '/pedidos': 'orders.view',
  '/pagos': 'payments.view',
  '/cotizaciones': 'quotes.view',
  '/solicitudes': 'accountrequests.view',
  '/informes': 'reports.view',
  '/usuarios': 'users.view',
  '/roles': 'roles.view',
  '/ajustes': 'settings.view',
  '/auditoria': 'settings.view',
}

export const icons = { FileText }
