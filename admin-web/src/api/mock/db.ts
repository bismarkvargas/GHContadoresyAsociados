/**
 * Base de datos en memoria del modo mock.
 * - Se genera una sola vez con datos realistas y se persiste en localStorage.
 * - Es un singleton compartido por el adaptador axios y por MockRealtime,
 *   de modo que los eventos en vivo mutan exactamente los mismos datos que ve la UI.
 */

import type {
  AccountRequest,
  AuditLog,
  CaseEntity,
  CaseEvent,
  CaseFile,
  CaseMatter,
  CaseStatus,
  CaseTask,
  Client,
  ClientContact,
  ClientInteraction,
  ClientSource,
  ClientType,
  DocumentItem,
  Message,
  Notification,
  Order,
  OrderItem,
  OrderStatus,
  Payment,
  Permission,
  Product,
  ProductCategory,
  QuoteRequest,
  Role,
  Setting,
  User,
} from '@/types'
import {
  allPermissionCodes,
  company,
  defaultExchangeRate,
  permissionActions,
  permissionModules,
  seedRolePermissions,
  seedRoles,
  seedSettings,
} from '@/lib/constants'
import { slugify } from '@/lib/format'

export const MOCK_DB_VERSION = 8
const STORAGE_KEY = 'gh.mock.db.v8'

export interface MockDb {
  version: number
  savedAt: string
  users: User[]
  /** Contraseñas del modo mock (solo demo, nunca viajan al cliente real). */
  passwords: Record<string, string>
  roles: Role[]
  permissions: Permission[]
  notifications: Notification[]
  accountRequests: AccountRequest[]
  clients: Client[]
  clientContacts: ClientContact[]
  clientInteractions: ClientInteraction[]
  caseFiles: CaseFile[]
  caseTasks: CaseTask[]
  caseEvents: CaseEvent[]
  messages: Message[]
  documents: DocumentItem[]
  productCategories: ProductCategory[]
  products: Product[]
  orders: Order[]
  orderItems: OrderItem[]
  payments: Payment[]
  quotes: QuoteRequest[]
  auditLogs: AuditLog[]
  settings: Setting[]
  counters: Record<string, number>
}

/* ------------------------------------------------------------------ */
/* Utilidades deterministas                                            */
/* ------------------------------------------------------------------ */

let idSeed = 1000
export function uid(prefix = 'id'): string {
  idSeed += 1
  const rnd = Math.random().toString(16).slice(2, 10)
  const t = Date.now().toString(16)
  return `${prefix}-${t}-${idSeed}-${rnd}`
}

/** PRNG determinista para que la demo sea reproducible. */
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(20260214)
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]!
const int = (min: number, max: number): number => Math.floor(rnd() * (max - min + 1)) + min

const NOW = Date.now()
const DAY = 86400000

function iso(daysFromNow: number, hour = 9, minute = 0): string {
  const d = new Date(NOW + daysFromNow * DAY)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}
function isoAgo(daysAgo: number, hour = 9, minute = 0): string {
  return iso(-daysAgo, hour, minute)
}

/* ------------------------------------------------------------------ */
/* Plantillas de datos                                                 */
/* ------------------------------------------------------------------ */

const personNames = [
  'Marco Vinicio Alfaro Chacón',
  'Silvia Eugenia Mora Jiménez',
  'Randall Esteban Quesada Vargas',
  'Karla Patricia Solano Araya',
  'Óscar Alberto Cordero Méndez',
  'Natalia de los Ángeles Bustos Rojas',
  'Luis Fernando Ramírez Calderón',
  'Vanessa María Ureña Guillén',
  'Douglas Alberto Mora Sánchez',
  'Priscila Andrea Zúñiga Barquero',
  'Allen Josué Picado Montero',
  'Wendy Tatiana Chavarría López',
  'German Antonio Espinoza Rivas',
  'Ivannia Rocío Segura Madrigal',
  'Fabián Andrés Portuguez Núñez',
  'Cristina Isabel Fonseca Ramírez',
  'Roy Gerardo Angulo Villalobos',
  'Melissa Fernanda Campos Agüero',
  'Edwin Mauricio Vega Salas',
  'Gabriela María Rojas Hernández',
  'Jeffry Alonso Blanco Céspedes',
  'Yorleny Auxiliadora Matarrita Cubero',
  'Mario Alberto Chinchilla Ruiz',
  'Rebeca del Carmen Artavia Pineda',
  'Esteban Josué Herrera Monge',
  'Paola Andrea Retana Campos',
  'Marvin Alonso Leiva Arguedas',
  'Daniela Sofía Valverde Quirós',
]

const companyNames = [
  'Inversiones Pacífico Azul S.A.',
  'Blue Wave Holdings LLC',
  'Distribuidora Guanacaste S.A.',
  'Hotel Playa Grande del Pacífico S.A.',
  'Restaurante Sabor Tico Tamarindo Ltda.',
  'Constructora Guanacaste Vertical S.A.',
  'Tamarindo Surf Resort S.R.L.',
  'Agroindustrias Santa Cruz S.A.',
  'Servicios Turísticos Nicoya Azul S.A.',
  'Comercial Huacas del Norte Ltda.',
  'Finca Orgánica Nosara S.A.',
  'Transportes Conchal Verde S.A.',
]

const foreignNames = [
  'Jonathan Robert Whitfield',
  'Samantha Lee Kowalski',
  'Pierre Étienne Delacroix',
  'Ingrid Solveig Andersson',
  'Michael Anthony Brennan',
  'Yuki Tanaka Nakamura',
]

const cantons = ['Santa Cruz', 'Nicoya', 'Carrillo', 'Liberia', 'Hojancha', 'Nandayure']
const districts = ['Huacas', 'Tamarindo', 'Flamingo', 'Nosara', 'Santa Cruz centro', 'Brasilito']
const tags = [
  'vip',
  'extranjero',
  'moroso',
  'recurrente',
  'hotelería',
  'construcción',
  'agro',
  'urgente',
  'referido',
  'zona-costera',
]

const caseTitlesByMatter: Record<CaseMatter, string[]> = {
  Contable: [
    'Contabilidad mensual y estados financieros',
    'Conciliación bancaria anual',
    'Liquidación laboral de planilla',
    'Implementación de facturación electrónica',
  ],
  Tributario: [
    'Declaración D-101 de renta anual',
    'Declaración D-103 mensual de IVA',
    'Inscripción y trámite RTBF',
    'Declaración D-115 de sociedades inactivas',
    'Constancia de ingresos ante ATV',
  ],
  Legal: [
    'Constitución de sociedad anónima',
    'Poder especial para representación',
    'Composición accionaria y traspaso de acciones',
    'Contrato de arrendamiento comercial',
    'Permiso de funcionamiento ante SUGEF',
  ],
  Municipal: [
    'Patente comercial municipal',
    'Renovación de patente comercial',
    'Licencia de venta de licores',
    'Permiso de construcción municipal',
  ],
  Laboral: [
    'Inscripción de patrono ante CCSS',
    'Póliza de riesgo de trabajo INS',
    'Reglamento interior de trabajo',
  ],
  Otro: ['Trámite especial de asesoría integral'],
}

const entityByMatter: Record<CaseMatter, CaseEntity[]> = {
  Contable: ['ATV', 'Otro', 'CCSS'],
  Tributario: ['ATV', 'RTBF', 'Otro'],
  Legal: ['SUGEF', 'ACAM', 'MEIC', 'Otro'],
  Municipal: ['Municipalidad', 'Otro'],
  Laboral: ['CCSS', 'INS'],
  Otro: ['Otro', 'MAG', 'ICT'],
}

const docNames = [
  'cedula-frontal.pdf',
  'cedula-reversal.pdf',
  'personeria-juridica.pdf',
  'escritura-constitucion.pdf',
  'estado-financiero-2025.xlsx',
  'declaracion-d101-2025.pdf',
  'declaracion-d103-enero.pdf',
  'contrato-arrendamiento.docx',
  'comprobante-sinpe.jpg',
  'patente-municipal-2026.pdf',
  'timbre-ccia.pdf',
  'constancia-ingresos.pdf',
  'planilla-ccss.xlsx',
  'poliza-ins.pdf',
]

const docCategories = [
  'Expediente',
  'Identidad',
  'Contable',
  'Tributario',
  'Legal',
  'Municipal',
  'Contrato',
  'Comprobante',
  'Otro',
] as const

const messageBodies = [
  'Buenas tardes, adjunto la documentación solicitada para continuar con el trámite.',
  'Estimado cliente, necesitamos el timbre de la CCIA vigente para presentar el expediente.',
  'Le confirmamos que la presentación ante el ente ya fue realizada; quedamos a la espera de resolución.',
  '¿Podría indicarnos la fecha en que desea que gestionemos la renovación de la patente?',
  'Recibimos la resolución favorable. Procedemos con el cierre del expediente.',
  'Recordatorio: el vencimiento de la declaración mensual es el próximo día 15.',
  'Ya cargamos la constancia de ingresos en su expediente, puede descargarla desde el app.',
]

/* ------------------------------------------------------------------ */
/* Generación                                                          */
/* ------------------------------------------------------------------ */

interface CatalogSeed {
  categories: {
    slug: string
    name: string
    icon: string
    order: number
    description: string
    productCount?: number
  }[]
  products: {
    slug: string
    sku: string
    name: string
    price: number
    currency: string
    categorySlug: string
    categoryName: string
    shortDescription: string
    description: string
    imageUrl: string
    isFeatured: boolean
    requiresCase: boolean
    estimatedDays: number | null
    sourceUrl: string
  }[]
}

let catalogCache: CatalogSeed | null = null

/** Carga el catálogo real extraído del sitio (public/catalog.seed.json). */
export async function loadCatalogSeed(): Promise<CatalogSeed | null> {
  if (catalogCache) return catalogCache
  try {
    const base = import.meta.env.BASE_URL || '/'
    const url = `${base.replace(/\/$/, '')}/catalog.seed.json`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    catalogCache = (await res.json()) as CatalogSeed
    return catalogCache
  } catch {
    // Sin catálogo real el panel sigue funcionando (el módulo Catálogo queda vacío).
    return null
  }
}

export function buildEmptyDb(): MockDb {
  return {
    version: MOCK_DB_VERSION,
    savedAt: new Date().toISOString(),
    users: [],
    passwords: {},
    roles: [],
    permissions: [],
    notifications: [],
    accountRequests: [],
    clients: [],
    clientContacts: [],
    clientInteractions: [],
    caseFiles: [],
    caseTasks: [],
    caseEvents: [],
    messages: [],
    documents: [],
    productCategories: [],
    products: [],
    orders: [],
    orderItems: [],
    payments: [],
    quotes: [],
    auditLogs: [],
    settings: [],
    counters: {},
  }
}

function buildPermissions(): Permission[] {
  const out: Permission[] = []
  for (const m of permissionModules) {
    for (const a of permissionActions) {
      const code = `${m.key}.${a.key}`
      if (!allPermissionCodes.includes(code)) continue
      out.push({
        id: `perm-${code}`,
        code,
        module: m.key,
        action: a.key,
        description: `${a.label} · ${m.label}`,
      })
    }
  }
  return out
}

function buildRoles(): Role[] {
  return seedRoles.map((r, i) => ({
    id: `role-${r.name.toLowerCase()}`,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    isStaffRole: r.isStaffRole,
    createdAt: isoAgo(400 - i),
    permissionCodes: seedRolePermissions[r.name] ?? [],
  }))
}

interface StaffSeed {
  id: string
  email: string
  fullName: string
  phone: string
  idNumber: string
  role: string
  password: string
  avatar?: string
}

const staffSeed: StaffSeed[] = [
  {
    id: 'user-admin',
    email: 'admin@ghcontadores.net',
    fullName: 'Gustavo Hernández Rojas',
    phone: '+506 8846 9454',
    idNumber: '5-0234-0567',
    role: 'SuperAdmin',
    password: 'Gh.Admin2026',
  },
  {
    id: 'user-gerencia',
    email: 'gerencia@ghcontadores.net',
    fullName: 'María Fernanda Rojas Vega',
    phone: '+506 2653 6634',
    idNumber: '5-0455-0778',
    role: 'Admin',
    password: 'Gh.Gerencia2026',
  },
  {
    id: 'user-abogado',
    email: 'abogado@ghcontadores.net',
    fullName: 'Lic. Jorge Andrés Salas Mora',
    phone: '+506 8712 3344',
    idNumber: '1-1122-0334',
    role: 'Abogado',
    password: 'Gh.Abogado2026',
  },
  {
    id: 'user-contador',
    email: 'contador@ghcontadores.net',
    fullName: 'CPA Ana Lucía Villalobos Cruz',
    phone: '+506 8899 1122',
    idNumber: '2-0567-0891',
    role: 'Contador',
    password: 'Gh.Contador2026',
  },
  {
    id: 'user-asistente',
    email: 'asistente@ghcontadores.net',
    fullName: 'Katherine Mora Zeledón',
    phone: '+506 8866 5544',
    idNumber: '5-0678-0912',
    role: 'Asistente',
    password: 'Gh.Asistente2026',
  },
  {
    id: 'user-contador2',
    email: 'pablo.mendez@ghcontadores.net',
    fullName: 'CPA Pablo Méndez Araya',
    phone: '+506 8733 2211',
    idNumber: '1-0890-0123',
    role: 'Contador',
    password: 'Gh.Contador2026',
  },
]

export async function buildSeedDb(): Promise<MockDb> {
  const db = buildEmptyDb()
  const catalog = await loadCatalogSeed()

  /* Usuarios de la firma */
  db.roles = buildRoles()
  db.permissions = buildPermissions()
  db.settings = seedSettings.map((s) => ({ ...s, updatedAt: isoAgo(20) }))

  db.users = staffSeed.map((s, i) => ({
    id: s.id,
    email: s.email,
    fullName: s.fullName,
    phone: s.phone,
    idNumber: s.idNumber,
    status: 'Active',
    isStaff: true,
    clientId: null,
    avatarUrl: null,
    locale: 'es-CR',
    timeZone: company.timeZone,
    lastLoginAt: isoAgo(i === 0 ? 0 : i, 8 + i, 15),
    createdAt: isoAgo(500 - i * 20),
    updatedAt: isoAgo(i + 1),
    failedLoginCount: 0,
    lockoutUntil: null,
    roles: [s.role],
  }))
  for (const s of staffSeed) db.passwords[s.email] = s.password

  const staffIds = staffSeed.map((s) => s.id)
  const lawyerId = 'user-abogado'
  const accountantId = 'user-contador'
  const accountant2Id = 'user-contador2'
  const assistantId = 'user-asistente'
  const adminId = 'user-admin'

  /* Categorías y productos (catálogo real del sitio) */
  if (catalog) {
    db.productCategories = catalog.categories.map((c, i) => ({
      id: `cat-${c.slug}`,
      slug: c.slug,
      name: c.name,
      description: c.description,
      iconName: c.icon,
      sortOrder: c.order ?? i + 1,
      isActive: true,
      imageUrl: null,
      productCount: catalog.products.filter((p) => p.categorySlug === c.slug).length,
    }))

    db.products = catalog.products.map((p, i) => {
      const category = db.productCategories.find((c) => c.slug === p.categorySlug)
      return {
        id: `prod-${p.slug}`,
        sku: p.sku,
        slug: p.slug,
        name: p.name,
        shortDescription: p.shortDescription,
        description: p.description,
        price: p.price,
        currency: p.currency || 'USD',
        taxRate: 13,
        categoryId: category?.id ?? '',
        imageUrl: p.imageUrl,
        galleryJson: null,
        isActive: true,
        isFeatured: !!p.isFeatured,
        requiresCase: p.requiresCase !== false,
        deliveryMode: 'Digital',
        estimatedDays: p.estimatedDays ?? int(3, 25),
        sortOrder: i + 1,
        sourceUrl: p.sourceUrl,
        seoTitle: p.name,
        seoDescription: p.shortDescription,
        createdAt: isoAgo(300 - i),
        updatedAt: isoAgo(int(1, 60)),
        isDeleted: false,
      }
    })
  }

  /* Clientes */
  const clientSources: ClientSource[] = ['app', 'web', 'whatsapp', 'referral', 'walkin', 'campaign']
  const clientStatuses: Client['status'][] = [
    'Active',
    'Active',
    'Active',
    'Lead',
    'Inactive',
    'Blocked',
    'Active',
    'Lead',
  ]
  const clientTypes: ClientType[] = [
    'Company',
    'Individual',
    'ForeignInvestor',
    'Company',
    'Individual',
    'Company',
    'ForeignInvestor',
    'Individual',
  ]

  const clients: Client[] = []
  const totalClients = 34

  for (let i = 0; i < totalClients; i += 1) {
    const type = clientTypes[i % clientTypes.length]!
    const isCompany = type === 'Company'
    const legalName = isCompany
      ? companyNames[i % companyNames.length]!
      : type === 'ForeignInvestor'
        ? foreignNames[i % foreignNames.length]!
        : personNames[i % personNames.length]!
    const status = i < 26 ? 'Active' : clientStatuses[i % clientStatuses.length]!
    const emailBase = legalName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z ]/g, '')
      .split(' ')
      .slice(0, 2)
      .join('.')

    const client: Client = {
      id: `client-${String(i + 1).padStart(3, '0')}`,
      code: `GH-CLI-${String(i + 1).padStart(5, '0')}`,
      clientType: type,
      legalName,
      tradeName: isCompany ? legalName.replace(/ S\.A\.| Ltda\.| S\.R\.L\./, '') : null,
      idNumber: isCompany
        ? `3-101-${String(400000 + i * 137).slice(0, 6)}`
        : type === 'ForeignInvestor'
          ? `P${String(1000000 + i * 73).slice(0, 7)}`
          : `1-${String(1000 + i)}-${String(300 + i)}`,
      email: `${emailBase}@${isCompany ? 'empresa' : 'correo'}.cr`,
      phone: `+506 ${int(6000, 8999)} ${int(1000, 9999)}`,
      whatsapp: i % 3 === 0 ? `+506 ${int(6000, 8999)} ${int(1000, 9999)}` : null,
      address: `${int(50, 400)} m ${pick(['norte', 'sur', 'este', 'oeste'])} de ${pick(['la iglesia', 'el supermercado', 'la escuela', 'la plaza de deportes'])}`,
      province: 'Guanacaste',
      canton: pick(cantons),
      district: pick(districts),
      country: 'CR',
      status,
      source: clientSources[i % clientSources.length]!,
      assignedToUserId: pick(staffIds),
      tagsCsv: i % 4 === 0 ? `${tags[i % tags.length]},${tags[(i + 3) % tags.length]}` : tags[i % tags.length]!,
      notes: isCompany
        ? 'Cliente con contabilidad mensual contratada. Facturación electrónica activa.'
        : null,
      userId: null,
      createdAt: isoAgo(int(10, 420), int(8, 17)),
      updatedAt: isoAgo(int(0, 20), int(8, 17)),
      isDeleted: false,
    }
    clients.push(client)
  }

  /* Cuentas del app aprobadas previamente: crea usuarios Cliente vinculados */
  for (let i = 0; i < 12; i += 1) {
    const client = clients[i]!
    const userId = `user-client-${String(i + 1).padStart(3, '0')}`
    client.userId = userId
    db.users.push({
      id: userId,
      email: client.email,
      fullName: client.legalName,
      phone: client.phone,
      idNumber: client.idNumber,
      status: 'Active',
      isStaff: false,
      clientId: client.id,
      avatarUrl: null,
      locale: 'es-CR',
      timeZone: company.timeZone,
      lastLoginAt: isoAgo(int(0, 15), int(7, 21)),
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
      failedLoginCount: 0,
      lockoutUntil: null,
      roles: ['Cliente'],
    })
    db.passwords[client.email] = 'Cliente123!'
  }

  /* Usuarios staff pendientes/suspendidos para el módulo Usuarios */
  db.users.push(
    {
      id: 'user-pendiente',
      email: 'nuevo.contador@ghcontadores.net',
      fullName: 'Mauricio Solís Brenes',
      phone: '+506 8321 7788',
      idNumber: '1-0999-0555',
      status: 'Pending',
      isStaff: true,
      clientId: null,
      avatarUrl: null,
      locale: 'es-CR',
      timeZone: company.timeZone,
      lastLoginAt: null,
      createdAt: isoAgo(4, 10),
      updatedAt: isoAgo(4, 10),
      failedLoginCount: 0,
      lockoutUntil: null,
      roles: ['Asistente'],
    },
    {
      id: 'user-suspendido',
      email: 'ex.asistente@ghcontadores.net',
      fullName: 'Róger Jiménez Prado',
      phone: '+506 8555 9911',
      idNumber: '5-0111-0222',
      status: 'Suspended',
      isStaff: true,
      clientId: null,
      avatarUrl: null,
      locale: 'es-CR',
      timeZone: company.timeZone,
      lastLoginAt: isoAgo(38, 15),
      createdAt: isoAgo(300, 9),
      updatedAt: isoAgo(38, 16),
      failedLoginCount: 5,
      lockoutUntil: null,
      roles: ['Asistente'],
    },
  )
  db.passwords['nuevo.contador@ghcontadores.net'] = 'Demo123!'
  db.passwords['ex.asistente@ghcontadores.net'] = 'Demo123!'

  db.clients = clients

  /* Contactos e interacciones */
  for (const [i, client] of clients.entries()) {
    db.clientContacts.push({
      id: uid('contact'),
      clientId: client.id,
      fullName: client.legalName,
      position: client.clientType === 'Company' ? 'Representante legal' : 'Titular',
      email: client.email,
      phone: client.phone,
      isPrimary: true,
    })
    if (client.clientType === 'Company' && i % 2 === 0) {
      db.clientContacts.push({
        id: uid('contact'),
        clientId: client.id,
        fullName: personNames[(i + 7) % personNames.length]!,
        position: pick(['Contador interno', 'Gerente administrativo', 'Encargado de planilla']),
        email: `contacto@${slugify(client.tradeName ?? 'empresa')}.cr`,
        phone: `+506 ${int(6000, 8999)} ${int(1000, 9999)}`,
        isPrimary: false,
      })
    }

    const interactionCount = int(2, 6)
    for (let k = 0; k < interactionCount; k += 1) {
      const type = pick(['Call', 'Email', 'Meeting', 'Whatsapp', 'Note', 'Task'] as const)
      const occurred = isoAgo(int(1, 90), int(8, 17), int(0, 59))
      db.clientInteractions.push({
        id: uid('inter'),
        clientId: client.id,
        type,
        subject:
          type === 'Call'
            ? 'Llamada de seguimiento'
            : type === 'Meeting'
              ? 'Reunión en oficina Huacas'
              : type === 'Email'
                ? 'Envío de documentación'
                : type === 'Whatsapp'
                  ? 'Consulta por WhatsApp'
                  : type === 'Task'
                    ? 'Preparar borrador de contrato'
                    : 'Nota interna',
        notes: pick(messageBodies),
        occurredAt: occurred,
        reminderAt: k === 0 && i % 3 === 0 ? iso(int(1, 12), 9) : null,
        isCompleted: k !== 0,
        createdByUserId: pick(staffIds),
      })
    }
  }

  /* Expedientes, tareas, timeline y documentos */
  const matters: CaseMatter[] = ['Contable', 'Tributario', 'Legal', 'Municipal', 'Laboral', 'Otro']
  const statuses: CaseStatus[] = ['Open', 'InProgress', 'WaitingClient', 'Completed', 'OnHold', 'Closed']
  const priorities = ['Low', 'Normal', 'High', 'Urgent'] as const
  const perYear: Record<string, number> = {}

  for (let i = 0; i < 58; i += 1) {
    const client = clients[i % clients.length]!
    const matter = matters[i % matters.length]!
    const year = 2026
    perYear[year] = (perYear[year] ?? 0) + 1
    const code = `GH-EXP-${year}-${String(perYear[year]).padStart(4, '0')}`
    const status = statuses[i % statuses.length]!
    const openedAt = isoAgo(int(5, 260), int(8, 16))
    const dueAt = isoAgo(int(-60, 40), 17)
    const responsible = pick([lawyerId, accountantId, accountant2Id, assistantId])
    const done = status === 'Completed' || status === 'Closed'
    const caseId = `case-${String(i + 1).padStart(3, '0')}`

    const caseFile: CaseFile = {
      id: caseId,
      code,
      clientId: client.id,
      title: pick(caseTitlesByMatter[matter]),
      description:
        'Gestión integral del trámite: revisión documental, presentación ante el ente correspondiente y seguimiento hasta la resolución. Incluye asesoría de un profesional asignado.',
      matter,
      entity: pick(entityByMatter[matter]),
      referenceNumber: i % 3 === 0 ? `REF-${int(100000, 999999)}` : null,
      status,
      priority: priorities[i % priorities.length]!,
      responsibleUserId: responsible,
      openedAt,
      dueAt,
      closedAt: done ? isoAgo(int(1, 30), 16) : null,
      agreedAmount: pick([169.5, 282.5, 339, 480.25, 960.5, 120, 85]),
      currency: 'USD',
      progressPercent: done ? 100 : int(10, 90),
      clientVisible: i % 7 !== 0,
      orderItemId: null,
    }
    db.caseFiles.push(caseFile)

    db.caseEvents.push({
      id: uid('evt'),
      caseFileId: caseId,
      type: 'Created',
      title: 'Expediente creado',
      description: `Se abrió el expediente ${code} para ${client.legalName}.`,
      actorUserId: adminId,
      clientVisible: true,
      createdAt: openedAt,
    })

    const taskCount = int(2, 6)
    for (let k = 0; k < taskCount; k += 1) {
      const taskStatus = done
        ? 'Done'
        : pick(['Todo', 'InProgress', 'Done', 'Blocked'] as const)
      const taskDue = iso(int(-20, 30), 17)
      const task: CaseTask = {
        id: uid('task'),
        caseFileId: caseId,
        title: pick([
          'Recopilar documentación del cliente',
          'Revisar estados financieros',
          'Presentar formulario ante el ente',
          'Confirmar pago de derechos de trámite',
          'Redactar borrador y enviar a revisión',
          'Firmar y protocolizar documento',
          'Actualizar expediente digital',
        ]),
        description: pick(messageBodies),
        status: taskStatus,
        priority: priorities[k % priorities.length]!,
        dueAt: taskDue,
        completedAt: taskStatus === 'Done' ? isoAgo(int(1, 15), 15) : null,
        assignedToUserId: pick([lawyerId, accountantId, accountant2Id, assistantId]),
        createdByUserId: adminId,
        sortOrder: k,
        clientVisible: k % 2 === 0,
      }
      db.caseTasks.push(task)
      db.caseEvents.push({
        id: uid('evt'),
        caseFileId: caseId,
        type: 'TaskAdded',
        title: 'Tarea agregada',
        description: task.title,
        actorUserId: adminId,
        clientVisible: true,
        createdAt: isoAgo(int(2, 60), int(9, 17)),
      })
    }

    const msgCount = int(1, 3)
    for (let k = 0; k < msgCount; k += 1) {
      const fromClient = k % 2 === 1
      db.messages.push({
        id: uid('msg'),
        caseFileId: caseId,
        clientId: client.id,
        senderUserId: fromClient ? client.userId ?? null : pick(staffIds),
        body: pick(messageBodies),
        attachmentDocumentId: null,
        isFromClient: fromClient,
        readByStaffAt: fromClient ? null : isoAgo(int(1, 5), 12),
        readByClientAt: fromClient ? null : null,
        createdAt: isoAgo(int(1, 30), int(9, 18), int(0, 59)),
      })
    }

    const docCount = int(1, 4)
    for (let k = 0; k < docCount; k += 1) {
      const originalName = docNames[(i + k) % docNames.length]!
      const contentType = originalName.endsWith('.pdf')
        ? 'application/pdf'
        : originalName.endsWith('.jpg')
          ? 'image/jpeg'
          : originalName.endsWith('.xlsx')
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      db.documents.push({
        id: uid('doc'),
        clientId: client.id,
        caseFileId: caseId,
        orderId: null,
        category: docCategories[(i + k) % docCategories.length]!,
        fileName: `${caseCodeSafe(code)}-${k + 1}-${originalName}`,
        originalName,
        contentType,
        sizeBytes: int(45_000, 8_400_000),
        storagePath: `documents/2026/02/${originalName}`,
        sha256: Math.random().toString(16).slice(2).padEnd(64, '0').slice(0, 64),
        version: 1,
        isCurrent: true,
        uploadedByUserId: pick(staffIds),
        uploadedAt: isoAgo(int(1, 90), int(9, 17)),
        clientVisible: k % 3 !== 2,
        isDeleted: false,
      })
    }
  }

  /* Documentos sueltos de cliente (sin expediente) */
  for (let i = 0; i < 8; i += 1) {
    const client = clients[(i * 3) % clients.length]!
    const originalName = docNames[(i + 5) % docNames.length]!
    db.documents.push({
      id: uid('doc'),
      clientId: client.id,
      caseFileId: null,
      orderId: null,
      category: docCategories[i % docCategories.length]!,
      fileName: `cliente-${i + 1}-${originalName}`,
      originalName,
      contentType: originalName.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg',
      sizeBytes: int(80_000, 4_200_000),
      storagePath: `documents/2026/01/${originalName}`,
      sha256: Math.random().toString(16).slice(2).padEnd(64, '0').slice(0, 64),
      version: 1,
      isCurrent: true,
      uploadedByUserId: assistantId,
      uploadedAt: isoAgo(int(3, 120), int(9, 17)),
      clientVisible: true,
      isDeleted: false,
    })
  }

  /* Pedidos, ítems y pagos */
  const orderStatuses: OrderStatus[] = ['PendingPayment', 'Paid', 'InProcess', 'Completed', 'Refunded', 'Cancelled']
  const productsForOrders = db.products.length
    ? db.products
    : ([
        { id: 'prod-demo', name: 'Servicio de demostración', price: 169.5, sku: 'GH-DEMO' },
      ] as unknown as Product[])

  for (let i = 0; i < 46; i += 1) {
    const client = clients[i % clients.length]!
    const status = orderStatuses[i % orderStatuses.length]!
    const createdAt = isoAgo(int(3, 300), int(8, 20), int(0, 59))
    const orderId = `order-${String(i + 1).padStart(3, '0')}`
    const number = `GH-ORD-2026-${String(i + 1).padStart(5, '0')}`
    const itemCount = int(1, 3)
    const items: OrderItem[] = []
    let subtotal = 0

    for (let k = 0; k < itemCount; k += 1) {
      const product = productsForOrders[(i * 3 + k) % productsForOrders.length]!
      const quantity = k === 0 ? 1 : int(1, 2)
      const total = Number((product.price * quantity).toFixed(2))
      subtotal += total
      items.push({
        id: uid('oitem'),
        orderId,
        productId: product.id,
        nameSnapshot: product.name,
        unitPrice: product.price,
        quantity,
        total,
        caseFileId: k === 0 && status !== 'PendingPayment' && status !== 'Cancelled' ? db.caseFiles[i % db.caseFiles.length]?.id ?? null : null,
      })
    }

    const tax = Number((subtotal * 0.13).toFixed(2))
    const discount = i % 9 === 0 ? Number((subtotal * 0.05).toFixed(2)) : 0
    const total = Number((subtotal + tax - discount).toFixed(2))
    const requiresInvoice = i % 3 === 0
    const clientIsCompany = client.clientType === 'Company'

    db.orders.push({
      id: orderId,
      number,
      userId: client.userId ?? adminId,
      clientId: client.id,
      status,
      subtotal: Number(subtotal.toFixed(2)),
      discount,
      tax,
      total,
      currency: 'USD',
      notes: i % 5 === 0 ? 'Cliente solicita factura electrónica a nombre de la sociedad.' : null,
      requiresInvoice,
      invoiceDataJson: requiresInvoice
        ? JSON.stringify({
            legalName: client.legalName,
            idNumber: client.idNumber,
            email: client.email,
            phone: client.phone,
            address: client.address ?? '',
            activityCode: clientIsCompany ? '6810.0' : '6910.0',
          })
        : null,
      items,
      createdAt,
      paidAt: status === 'PendingPayment' || status === 'Cancelled' ? null : isoAgo(int(1, 280), 12),
      completedAt: status === 'Completed' ? isoAgo(int(1, 60), 15) : null,
    })
    db.orderItems.push(...items)

    if (status !== 'PendingPayment' && status !== 'Cancelled') {
      const method = pick(['Card', 'Sinpe', 'Transfer'] as const)
      const payStatus = status === 'Refunded' ? 'Refunded' : 'Approved'
      const reference = `GH-PAY-${String(90000 + i)}`
      db.payments.push({
        id: uid('pay'),
        orderId,
        provider: 'GH-Simulated',
        method,
        status: payStatus,
        amount: total,
        currency: 'USD',
        reference,
        authorizationCode: payStatus === 'Approved' || payStatus === 'Refunded' ? String(int(100000, 999999)) : null,
        cardBrand: method === 'Card' ? pick(['Visa', 'Mastercard', 'Amex']) : null,
        cardLast4: method === 'Card' ? pick(['4242', '0002', '9995', '1881', '3456']) : null,
        cardHolder: method === 'Card' ? client.legalName : null,
        failureReason: null,
        rawRequestJson: JSON.stringify({
          amount: Math.round(total * 100),
          currency: 'USD',
          method,
          reference,
          customer: { name: client.legalName, email: client.email },
        }),
        rawResponseJson: JSON.stringify({
          status: payStatus,
          authorizationCode: payStatus === 'Approved' ? String(int(100000, 999999)) : null,
          reference,
          processedAt: createdAt,
        }),
        createdAt,
        processedAt: createdAt,
      })
    } else if (i % 4 === 0) {
      // Intento iniciado y rechazado: alimenta la bandeja de pagos
      const reference = `GH-PAY-${String(70000 + i)}`
      db.payments.push({
        id: uid('pay'),
        orderId,
        provider: 'GH-Simulated',
        method: 'Card',
        status: 'Declined',
        amount: total,
        currency: 'USD',
        reference,
        authorizationCode: null,
        cardBrand: 'Visa',
        cardLast4: '0002',
        cardHolder: client.legalName,
        failureReason: 'Tarjeta rechazada por el emisor',
        rawRequestJson: JSON.stringify({ amount: Math.round(total * 100), reference }),
        rawResponseJson: JSON.stringify({ status: 'Declined', reference }),
        createdAt,
        processedAt: createdAt,
      })
    }

    if (i % 6 === 0) {
      db.payments.push({
        id: uid('pay'),
        orderId,
        provider: 'GH-Simulated',
        method: 'Sinpe',
        status: 'Pending',
        amount: total,
        currency: 'USD',
        reference: `GH-PAY-${String(50000 + i)}`,
        cardBrand: null,
        cardLast4: null,
        cardHolder: client.legalName,
        failureReason: null,
        rawRequestJson: JSON.stringify({ amount: Math.round(total * 100), method: 'Sinpe' }),
        rawResponseJson: JSON.stringify({ status: 'Pending', note: 'Esperando confirmación del SINPE' }),
        createdAt,
        processedAt: null,
      })
    }
  }

  /* Solicitudes de cuenta */
  const requestStatuses: AccountRequest['status'][] = [
    'Pending',
    'Pending',
    'Pending',
    'Pending',
    'Pending',
    'Approved',
    'Rejected',
    'Cancelled',
  ]
  for (let i = 0; i < 16; i += 1) {
    const status = requestStatuses[i % requestStatuses.length]!
    const type = clientTypes[(i + 3) % clientTypes.length]!
    const fullName =
      type === 'Company' ? companyNames[(i + 2) % companyNames.length]! : personNames[(i + 11) % personNames.length]!
    const createdAt = isoAgo(int(0, 45), int(7, 22), int(0, 59))
    db.accountRequests.push({
      id: uid('areq'),
      fullName,
      email: `solicitud${i + 1}@${type === 'Company' ? 'empresa' : 'correo'}.cr`,
      phone: `+506 ${int(6000, 8999)} ${int(1000, 9999)}`,
      idNumber:
        type === 'Company'
          ? `3-101-${int(100000, 999999)}`
          : `1-${int(1000, 1999)}-${int(100, 999)}`,
      clientType: type,
      company: type === 'Company' ? fullName : null,
      message: pick([
        'Necesito contabilidad mensual para mi empresa en Tamarindo.',
        'Quisiera constituir una sociedad para operar un hotel boutique.',
        'Requiero renovar la patente comercial y la licencia de licores.',
        'Soy inversionista extranjero y necesito ayuda con la parte tributaria.',
        'Quiero inscribirme en el régimen de tributación simplificada.',
      ]),
      source: pick(['app', 'web', 'admin'] as const),
      status,
      reviewedByUserId: status === 'Pending' ? null : adminId,
      reviewedAt: status === 'Pending' ? null : isoAgo(int(0, 20), 11),
      rejectionReason: status === 'Rejected' ? 'Documentación de identidad ilegible.' : null,
      createdUserId: status === 'Approved' ? `user-client-${String(int(1, 12)).padStart(3, '0')}` : null,
      ipAddress: `190.${int(1, 250)}.${int(1, 250)}.${int(1, 250)}`,
      trackingCode: `GH-SEG-${String(int(100000, 999999))}`,
      createdAt,
    })
  }

  /* Cotizaciones del formulario web */
  const quoteStatuses: QuoteRequest['status'][] = [
    'New',
    'New',
    'Contacted',
    'Quoted',
    'Converted',
    'Discarded',
    'New',
  ]
  for (let i = 0; i < 14; i += 1) {
    const product = productsForOrders[(i * 5) % productsForOrders.length]!
    db.quotes.push({
      id: uid('quote'),
      fullName: personNames[(i + 4) % personNames.length]!,
      email: `cotizacion${i + 1}@correo.cr`,
      phone: `+506 ${int(6000, 8999)} ${int(1000, 9999)}`,
      company: i % 3 === 0 ? companyNames[i % companyNames.length]! : null,
      serviceId: product.id,
      message: pick([
        '¿Cuánto cuesta constituir una sociedad y cuánto tarda?',
        'Necesito el precio de la renovación de patente más la licencia de licores.',
        '¿Atienden clientes que no viven en Costa Rica?',
        'Quiero saber el costo mensual de llevar la contabilidad de un restaurante.',
      ]),
      status: quoteStatuses[i % quoteStatuses.length]!,
      handledByUserId: i % 3 === 0 ? null : pick(staffIds),
      clientId: i % 7 === 4 ? clients[i % clients.length]!.id : null,
      createdAt: isoAgo(int(0, 60), int(7, 21), int(0, 59)),
    })
  }

  /* Notificaciones */
  const notifTypes: Notification['type'][] = [
    'AccountApproved',
    'CaseStatusChanged',
    'TaskAssigned',
    'TaskDueSoon',
    'DocumentAvailable',
    'OrderPaid',
    'PaymentFailed',
    'MessageReceived',
    'System',
  ]
  for (let i = 0; i < 18; i += 1) {
    const type = notifTypes[i % notifTypes.length]!
    const read = i > 5
    db.notifications.push({
      id: uid('notif'),
      userId: adminId,
      title:
        type === 'AccountApproved'
          ? 'Solicitud de cuenta aprobada'
          : type === 'CaseStatusChanged'
            ? 'Cambio de estado en expediente'
            : type === 'TaskAssigned'
              ? 'Nueva tarea asignada'
              : type === 'TaskDueSoon'
                ? 'Tarea próxima a vencer'
                : type === 'DocumentAvailable'
                  ? 'Documento disponible'
                  : type === 'OrderPaid'
                    ? 'Pedido pagado'
                    : type === 'PaymentFailed'
                      ? 'Pago rechazado'
                      : type === 'MessageReceived'
                        ? 'Mensaje de cliente'
                        : 'Aviso del sistema',
      body: pick([
        'Se registró movimiento en el expediente GH-EXP-2026-0007.',
        'El cliente subió documentación nueva que requiere revisión.',
        'La declaración mensual vence en 3 días.',
        'Se acreditó un pago en la pasarela simulada.',
        'Un cliente envió un mensaje en el expediente asignado.',
      ]),
      type,
      dataJson: JSON.stringify({ entityId: db.caseFiles[i % db.caseFiles.length]?.id ?? null }),
      channel: 'InApp',
      status: read ? 'Read' : 'Sent',
      createdAt: isoAgo(i * 0.4, int(7, 20), int(0, 59)),
      sentAt: isoAgo(i * 0.4, int(7, 20), int(0, 59)),
      readAt: read ? isoAgo(i * 0.4 - 0.1, int(7, 20)) : null,
    })
  }

  /* Auditoría */
  const auditSeeds: { action: string; entity: string }[] = [
    { action: 'login', entity: 'User' },
    { action: 'create', entity: 'Client' },
    { action: 'update', entity: 'CaseFile' },
    { action: 'status-change', entity: 'CaseFile' },
    { action: 'approve', entity: 'AccountRequest' },
    { action: 'reject', entity: 'AccountRequest' },
    { action: 'create', entity: 'Document' },
    { action: 'delete', entity: 'Document' },
    { action: 'update', entity: 'Product' },
    { action: 'refund', entity: 'Order' },
    { action: 'assign', entity: 'CaseTask' },
    { action: 'update', entity: 'Setting' },
  ]
  for (let i = 0; i < 60; i += 1) {
    const seed = auditSeeds[i % auditSeeds.length]!
    const actor = staffSeed[i % staffSeed.length]!
    const entityId =
      seed.entity === 'Client'
        ? clients[i % clients.length]!.id
        : seed.entity === 'CaseFile'
          ? db.caseFiles[i % db.caseFiles.length]!.id
          : uid('entity')
    const before =
      seed.action === 'create'
        ? null
        : JSON.stringify({
            status: pick(['Active', 'Open', 'InProgress', 'Pending']),
            updatedAt: isoAgo(int(2, 40)),
          })
    const after = JSON.stringify({
      status: pick(['Active', 'InProgress', 'Completed', 'Approved']),
      updatedAt: isoAgo(int(0, 2)),
    })
    db.auditLogs.push({
      id: uid('audit'),
      userId: actor.id,
      action: seed.action,
      entityName: seed.entity,
      entityId,
      beforeJson: before,
      afterJson: after,
      ipAddress: `190.${int(1, 250)}.${int(1, 250)}.${int(1, 250)}`,
      userAgent: pick([
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/17.2',
        'GHAdminApp/1.0 (Android 14)',
      ]),
      createdAt: isoAgo(i * 0.6, int(7, 21), int(0, 59)),
    })
  }

  db.counters = { 'case-2026': perYear[2026] ?? 0, 'order-2026': 46, 'client': totalClients }

  return db
}

function caseCodeSafe(code: string): string {
  return code.replace(/[^A-Za-z0-9-]/g, '')
}

/* ------------------------------------------------------------------ */
/* Persistencia                                                        */
/* ------------------------------------------------------------------ */

let db: MockDb | null = null

export function getDb(): MockDb {
  if (db) return db
  // Carga síncrona desde localStorage; el seed real se aplica en bootstrap().
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as MockDb
      if (parsed.version === MOCK_DB_VERSION) {
        db = parsed
        return db
      }
    }
  } catch {
    /* almacenamiento no disponible */
  }
  db = buildEmptyDb()
  return db
}

export function setDb(next: MockDb): void {
  db = next
}

export function persistDb(): void {
  if (!db) return
  db.savedAt = new Date().toISOString()
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  } catch {
    /* cuota excedida: se sigue operando en memoria */
  }
}

export function resetDb(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignorado */
  }
  db = null
}

let bootstrapPromise: Promise<MockDb> | null = null

/** Garantiza que la base mock exista y esté sembrada antes de la primera llamada. */
export function bootstrapMockDb(force = false): Promise<MockDb> {
  if (force) {
    resetDb()
    bootstrapPromise = null
  }
  if (bootstrapPromise) return bootstrapPromise
  const existing = getDb()
  if (existing.users.length > 0) {
    bootstrapPromise = Promise.resolve(existing)
    return bootstrapPromise
  }
  bootstrapPromise = buildSeedDb().then((seeded) => {
    setDb(seeded)
    persistDb()
    return seeded
  })
  return bootstrapPromise
}

/* ------------------------------------------------------------------ */
/* Helpers de consulta                                                 */
/* ------------------------------------------------------------------ */

export function userById(id: string | null | undefined): User | undefined {
  if (!id) return undefined
  return getDb().users.find((u) => u.id === id)
}

export function userName(id: string | null | undefined): string {
  return userById(id)?.fullName ?? 'Sistema'
}

export function clientById(id: string | null | undefined): Client | undefined {
  if (!id) return undefined
  return getDb().clients.find((c) => c.id === id)
}

export function clientName(id: string | null | undefined): string {
  return clientById(id)?.legalName ?? '—'
}

export function nextCounter(key: string): number {
  const database = getDb()
  const next = (database.counters[key] ?? 0) + 1
  database.counters[key] = next
  return next
}

export function productById(id: string | null | undefined): Product | undefined {
  if (!id) return undefined
  return getDb().products.find((p) => p.id === id)
}

export function exchangeRate(): number {
  const setting = getDb().settings.find((s) => s.key === 'currency.usdToCrc')
  const parsed = setting ? Number(setting.value) : defaultExchangeRate
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultExchangeRate
}
