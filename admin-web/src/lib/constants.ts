/** Constantes de negocio — datos reales de la firma (docs/01 §1) y catálogo de permisos (docs/02 §1). */

export const company = {
  legalName: 'GH Contadores & Asociados',
  shortName: 'GH Contadores',
  tagline: 'En GH Contadores lo resolvemos por usted',
  address: 'Ruta Nacional Secundaria 155, Huacas, Santa Cruz, Guanacaste, Costa Rica',
  addressShort: 'Huacas, Santa Cruz, Guanacaste, CR',
  phones: ['+506 2653 6634', '+506 8846 9454'],
  emailManagement: 'gustavo.ghcontadores@outlook.com',
  emailOrders: 'pedidos@ghcontadores.net',
  currency: 'USD',
  timeZone: 'America/Costa_Rica',
  site: 'https://www.ghcontadores.net',
} as const

export const defaultExchangeRate = 512.5

/** Módulos del catálogo de permisos (docs/02 §1). */
export const permissionModules = [
  { key: 'clients', label: 'Clientes' },
  { key: 'cases', label: 'Expedientes' },
  { key: 'documents', label: 'Documentos' },
  { key: 'catalog', label: 'Catálogo' },
  { key: 'orders', label: 'Pedidos' },
  { key: 'payments', label: 'Pagos' },
  { key: 'accountrequests', label: 'Solicitudes de cuenta' },
  { key: 'users', label: 'Usuarios' },
  { key: 'roles', label: 'Roles y permisos' },
  { key: 'reports', label: 'Informes' },
  { key: 'settings', label: 'Ajustes y auditoría' },
  { key: 'quotes', label: 'Cotizaciones' },
  { key: 'messages', label: 'Mensajes' },
  { key: 'notifications', label: 'Notificaciones' },
] as const

export const permissionActions = [
  { key: 'view', label: 'Ver' },
  { key: 'create', label: 'Crear' },
  { key: 'edit', label: 'Editar' },
  { key: 'delete', label: 'Borrar' },
  { key: 'approve', label: 'Aprobar' },
  { key: 'export', label: 'Exportar' },
  { key: 'assign', label: 'Asignar' },
  { key: 'send', label: 'Enviar' },
] as const

export type PermissionModuleKey = (typeof permissionModules)[number]['key']

/** Códigos que realmente existen en el catálogo semilla. */
export const permissionCodes: string[] = permissionModules.flatMap((m) =>
  permissionActions
    .filter((a) => {
      if (a.key === 'approve') return m.key === 'accountrequests' || m.key === 'quotes'
      if (a.key === 'export') return m.key === 'reports' || m.key === 'payments'
      if (a.key === 'assign') return m.key === 'cases' || m.key === 'clients'
      if (a.key === 'send') return m.key === 'notifications' || m.key === 'messages'
      return true
    })
    .map((a) => `${m.key}.${a.key}`),
)

export const allPermissionCodes = permissionCodes

function inModule(moduleKey: PermissionModuleKey, actions: string[]): string[] {
  return actions.map((a) => `${moduleKey}.${a}`)
}

/** Permisos semilla por rol (docs/02 — tabla resumen). */
export const seedRolePermissions: Record<string, string[]> = {
  SuperAdmin: allPermissionCodes,
  Admin: allPermissionCodes,
  Abogado: [
    ...inModule('clients', ['view', 'edit', 'assign']),
    ...inModule('cases', ['view', 'create', 'edit', 'assign']),
    ...inModule('documents', ['view', 'create', 'delete']),
    ...inModule('catalog', ['view']),
    ...inModule('orders', ['view']),
    ...inModule('payments', ['view']),
    ...inModule('messages', ['view', 'create', 'send']),
    ...inModule('reports', ['view']),
    ...inModule('notifications', ['view']),
  ],
  Contador: [
    ...inModule('clients', ['view', 'edit']),
    ...inModule('cases', ['view', 'create', 'edit']),
    ...inModule('documents', ['view', 'create']),
    ...inModule('catalog', ['view']),
    ...inModule('orders', ['view']),
    ...inModule('payments', ['view']),
    ...inModule('messages', ['view', 'create', 'send']),
    ...inModule('reports', ['view']),
    ...inModule('notifications', ['view']),
  ],
  Asistente: [
    ...inModule('clients', ['view', 'create', 'edit']),
    ...inModule('cases', ['view', 'edit']),
    ...inModule('documents', ['view', 'create']),
    ...inModule('catalog', ['view']),
    ...inModule('orders', ['view', 'edit']),
    ...inModule('payments', ['view']),
    ...inModule('accountrequests', ['view']),
    ...inModule('messages', ['view', 'create', 'send']),
    ...inModule('notifications', ['view']),
  ],
  Cliente: [
    ...inModule('documents', ['view', 'create']),
    ...inModule('messages', ['view', 'create', 'send']),
    ...inModule('notifications', ['view']),
  ],
}

/** Roles semilla (docs/02 §1). */
export const seedRoles = [
  {
    name: 'SuperAdmin',
    description: 'Acceso total al sistema, incluida la gestión de usuarios y roles.',
    isSystem: true,
    isStaffRole: true,
  },
  {
    name: 'Admin',
    description: 'Administración operativa completa del despacho.',
    isSystem: true,
    isStaffRole: true,
  },
  {
    name: 'Abogado',
    description: 'Gestión legal de expedientes, documentos y comunicación con clientes.',
    isSystem: true,
    isStaffRole: true,
  },
  {
    name: 'Contador',
    description: 'Gestión contable y tributaria de expedientes y declaraciones.',
    isSystem: true,
    isStaffRole: true,
  },
  {
    name: 'Asistente',
    description: 'Apoyo administrativo: clientes, documentos y seguimiento de pedidos.',
    isSystem: true,
    isStaffRole: true,
  },
  {
    name: 'Cliente',
    description: 'Acceso del cliente final desde el app a sus expedientes y documentos.',
    isSystem: true,
    isStaffRole: false,
  },
]

export const settingGroups = [
  { key: 'company', label: 'Datos de la empresa' },
  { key: 'branding', label: 'Marca y colores' },
  { key: 'currency', label: 'Monedas y tipo de cambio' },
  { key: 'notifications', label: 'Plantillas de notificación' },
  { key: 'messages', label: 'Plantillas de mensajes' },
  { key: 'payment', label: 'Pasarela simulada' },
] as const

/** Ajustes semilla persistidos por la API. */
export const seedSettings: { key: string; value: string; group: string; description: string }[] = [
  { key: 'company.legalName', value: company.legalName, group: 'company', description: 'Razón social de la firma' },
  { key: 'company.tradeName', value: company.shortName, group: 'company', description: 'Nombre comercial' },
  { key: 'company.address', value: company.address, group: 'company', description: 'Dirección física' },
  { key: 'company.phone1', value: company.phones[0], group: 'company', description: 'Teléfono principal' },
  { key: 'company.phone2', value: company.phones[1], group: 'company', description: 'Teléfono secundario / WhatsApp' },
  { key: 'company.emailManagement', value: company.emailManagement, group: 'company', description: 'Correo de gerencia' },
  { key: 'company.emailOrders', value: company.emailOrders, group: 'company', description: 'Correo de pedidos' },
  { key: 'company.timeZone', value: company.timeZone, group: 'company', description: 'Zona horaria comercial' },
  { key: 'branding.primary', value: '#DF3131', group: 'branding', description: 'Rojo corporativo' },
  { key: 'branding.primary600', value: '#C42121', group: 'branding', description: 'Rojo hover / pressed' },
  { key: 'branding.primary50', value: '#FDECEC', group: 'branding', description: 'Rojo suave de fondo' },
  { key: 'branding.ink', value: '#212121', group: 'branding', description: 'Tinta / estructura' },
  { key: 'branding.danger', value: '#E62214', group: 'branding', description: 'Rojo de acción' },
  { key: 'branding.success', value: '#008250', group: 'branding', description: 'Verde de éxito' },
  { key: 'branding.warning', value: '#D49341', group: 'branding', description: 'Ámbar de advertencia' },
  { key: 'branding.info', value: '#116DFF', group: 'branding', description: 'Azul informativo' },
  { key: 'branding.surface', value: '#ECEFF3', group: 'branding', description: 'Superficie clara' },
  { key: 'currency.base', value: 'USD', group: 'currency', description: 'Moneda base del catálogo' },
  { key: 'currency.secondary', value: 'CRC', group: 'currency', description: 'Moneda secundaria' },
  { key: 'currency.usdToCrc', value: String(defaultExchangeRate), group: 'currency', description: 'Tipo de cambio USD → CRC' },
  { key: 'currency.taxRateDefault', value: '13', group: 'currency', description: 'IVA por defecto (%)' },
  {
    key: 'notifications.templates.accountApproved',
    value: 'Su cuenta fue aprobada. Ya puede ingresar con el correo {{email}}.',
    group: 'notifications',
    description: 'Plantilla: cuenta aprobada',
  },
  {
    key: 'notifications.templates.caseStatus',
    value: 'El expediente {{code}} cambió a {{status}}.',
    group: 'notifications',
    description: 'Plantilla: cambio de estado de expediente',
  },
  {
    key: 'notifications.templates.taskDueSoon',
    value: 'La tarea "{{title}}" vence el {{dueAt}}.',
    group: 'notifications',
    description: 'Plantilla: tarea por vencer',
  },
  {
    key: 'messages.templates.welcome',
    value: 'Bienvenido a GH Contadores y Asociados. Su expediente {{code}} fue creado y un profesional fue asignado.',
    group: 'messages',
    description: 'Mensaje de bienvenida del expediente',
  },
  {
    key: 'messages.templates.docsRequest',
    value: 'Para continuar con su trámite necesitamos que suba los siguientes documentos:',
    group: 'messages',
    description: 'Solicitud de documentos',
  },
  { key: 'payment.provider', value: 'GH-Simulated', group: 'payment', description: 'Proveedor de pasarela' },
  { key: 'payment.cardApproved', value: '4242 4242 4242 4242', group: 'payment', description: 'Tarjeta de prueba aprobada' },
  { key: 'payment.cardDeclined', value: '4000 0000 0000 0002', group: 'payment', description: 'Tarjeta de prueba rechazada' },
  { key: 'payment.cardPending', value: '4000 0000 0000 9995', group: 'payment', description: 'Tarjeta de prueba pendiente' },
  { key: 'payment.currency', value: 'USD', group: 'payment', description: 'Moneda de cobro' },
  {
    key: 'payment.webhookUrl',
    value: '/ghcontadores/api/v1/webhooks/payments',
    group: 'payment',
    description: 'URL de notificación de la pasarela',
  },
]
