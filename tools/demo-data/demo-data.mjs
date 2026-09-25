// ---------------------------------------------------------------------------
// Datos de demostración realistas para GH Contadores y Asociados.
//
// Se ejecuta contra la API desplegada con las credenciales del administrador y crea
// clientes típicos del negocio (extranjeros, sociedades, profesionales) con sus
// expedientes, tareas y actuaciones, para que el panel y el app muestren un caso real.
//
// Uso:  node demo-data.mjs [URL_API]
// ---------------------------------------------------------------------------
const BASE = process.argv[2] ?? 'https://demostracion.es/ghcontadores/api/v1'
const ADMIN = { email: 'admin@ghcontadores.net', password: 'Gh.Admin2026' }

const hoy = new Date()
const dias = (n) => new Date(hoy.getTime() + n * 86400000).toISOString()

let pass = 0
let fail = 0
const ok = (m) => { pass++; console.log(`  \x1b[32m✔\x1b[0m ${m}`) }
const ko = (m) => { fail++; console.log(`  \x1b[31m✘\x1b[0m ${m}`) }
const step = (m) => console.log(`\n\x1b[1;36m${m}\x1b[0m`)

let token = ''

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  return { ok: res.ok, status: res.status, data }
}

// Perfiles representativos del negocio real de la firma (docs/01).
const CLIENTES = [
  {
    clientType: 'ForeignInvestor',
    legalName: 'Blue Wave Holdings LLC',
    tradeName: 'Blue Wave Rentals',
    idNumber: 'E-3101789456',
    email: 'contacto@bluewave-rentals.com',
    phone: '+1 305 555 0142',
    whatsapp: '+506 8712 0099',
    address: 'Playa Grande, Santa Cruz, Guanacaste',
    province: 'Guanacaste',
    canton: 'Santa Cruz',
    district: 'Tamarindo',
    country: 'Estados Unidos',
    status: 'Active',
    source: 'Referral',
    tags: ['extranjero', 'alquiler-vacacional', 'inversionista'],
    notes: 'Inversionista estadounidense con tres propiedades de alquiler vacacional. Requiere contabilidad mensual, inscripción tributaria y declaración de rentas de capital.',
    casos: [
      {
        title: 'Inscripción tributaria D-140 y RTBF',
        matter: 'Tributario',
        entity: 'ATV',
        status: 'InProgress',
        priority: 'High',
        progress: 40,
        dueAt: dias(12),
        agreedAmount: 203.4,
        description: 'Inscripción del inversionista ante la Administración Tributaria Virtual y registro de transparencia de beneficiarios finales.',
        tareas: [
          ['Recopilar pasaporte y prueba de domicilio', 'Done', -6],
          ['Presentar formulario D-140', 'InProgress', 3],
          ['Registrar beneficiarios finales (RTBF)', 'Todo', 9],
          ['Entregar constancia de inscripción', 'Todo', 14],
        ],
      },
      {
        title: 'Contabilidad mensual de alquiler vacacional',
        matter: 'Contable',
        entity: 'ATV',
        status: 'Open',
        priority: 'Normal',
        progress: 10,
        dueAt: dias(20),
        agreedAmount: 169.5,
        description: 'Registro de ingresos por alquiler, gastos deducibles y declaración mensual de IVA.',
        tareas: [
          ['Recibir facturas del período', 'InProgress', 5],
          ['Conciliación bancaria', 'Todo', 8],
        ],
      },
    ],
  },
  {
    clientType: 'Company',
    legalName: 'Distribuidora Guanacaste S.A.',
    tradeName: 'DG Alimentos',
    idNumber: '3-101-456789',
    email: 'administracion@dgalimentos.cr',
    phone: '+506 2665 1234',
    whatsapp: '+506 8845 3321',
    address: 'Zona Industrial, Nicoya, Guanacaste',
    province: 'Guanacaste',
    canton: 'Nicoya',
    district: 'Nicoya',
    country: 'Costa Rica',
    status: 'Active',
    source: 'WalkIn',
    tags: ['pyme', 'alimentos', 'mensual'],
    notes: 'Distribuidora de alimentos con planilla de 14 colaboradores. Necesita contabilidad mensual, CCSS y patente comercial al día.',
    casos: [
      {
        title: 'Renovación de patente comercial 2026',
        matter: 'Municipal',
        entity: 'Municipalidad',
        status: 'WaitingClient',
        priority: 'High',
        progress: 65,
        dueAt: dias(6),
        agreedAmount: 339,
        description: 'Renovación anual de la patente comercial ante la Municipalidad de Nicoya, con estado de cuenta y pago de impuestos.',
        tareas: [
          ['Estado de cuenta municipal', 'Done', -4],
          ['Pago de impuestos municipales', 'Done', -2],
          ['Cargar personería jurídica actualizada', 'Todo', 4],
          ['Retirar patente renovada', 'Todo', 8],
        ],
      },
      {
        title: 'Declaración de renta y cierre fiscal 2025',
        matter: 'Tributario',
        entity: 'ATV',
        status: 'InProgress',
        priority: 'Urgent',
        progress: 55,
        dueAt: dias(3),
        agreedAmount: 226,
        description: 'Elaboración del cierre fiscal, conciliaciones y presentación de la declaración de renta.',
        tareas: [
          ['Conciliaciones contables', 'Done', -8],
          ['Elaboración del cierre fiscal', 'InProgress', 1],
          ['Presentación de la declaración', 'Todo', 3],
        ],
      },
      {
        title: 'Trámites ante la CCSS (planilla y licencias)',
        matter: 'Laboral',
        entity: 'CCSS',
        status: 'OnHold',
        priority: 'Low',
        progress: 20,
        dueAt: dias(25),
        agreedAmount: 169.5,
        description: 'Actualización de la planilla de 14 colaboradores y gestión de licencias ante la Caja Costarricense del Seguro Social.',
        tareas: [['Verificar planilla declarada', 'Todo', 10]],
      },
    ],
  },
  {
    clientType: 'Individual',
    legalName: 'Dr. Mauricio Salas Fernández',
    tradeName: 'Consultorio Salas',
    idNumber: '1-0987-0654',
    email: 'msalas@consultoriosalas.cr',
    phone: '+506 8701 5566',
    whatsapp: '+506 8701 5566',
    address: '200 m norte del hospital, Liberia, Guanacaste',
    province: 'Guanacaste',
    canton: 'Liberia',
    district: 'Liberia',
    country: 'Costa Rica',
    status: 'Active',
    source: 'Phone',
    tags: ['profesional', 'salud', 'trimestral'],
    notes: 'Médico independiente con dos locales. Requiere contabilidad trimestral, permiso sanitario y facturación electrónica.',
    casos: [
      {
        title: 'Renovación del permiso sanitario',
        matter: 'Legal',
        entity: 'MinisterioSalud',
        status: 'Open',
        priority: 'Normal',
        progress: 15,
        dueAt: dias(30),
        agreedAmount: 226,
        description: 'Trámite de renovación del permiso de funcionamiento sanitario de los dos consultorios.',
        tareas: [
          ['Reunir requisitos del Ministerio de Salud', 'InProgress', 7],
          ['Presentar solicitud', 'Todo', 18],
        ],
      },
      {
        title: 'Configuración de facturación electrónica',
        matter: 'Contable',
        entity: 'ATV',
        status: 'Completed',
        priority: 'Normal',
        progress: 100,
        dueAt: dias(-10),
        agreedAmount: 282.5,
        description: 'Configuración de la llave criptográfica, certificados y administración de facturas electrónicas.',
        tareas: [
          ['Solicitar llave criptográfica', 'Done', -30],
          ['Configurar certificados', 'Done', -20],
          ['Capacitación de facturación', 'Done', -12],
        ],
      },
    ],
  },
]

async function main() {
  console.log(`\n\x1b[1mDatos de demostración — GH Contadores\x1b[0m\nAPI: ${BASE}`)

  step('Inicio de sesión del administrador')
  const login = await api('POST', '/auth/login', ADMIN)
  if (!login.ok) { ko(`no se pudo iniciar sesión: HTTP ${login.status}`); process.exit(1) }
  token = login.data.accessToken
  ok('sesión iniciada')

  step('Personal de la firma disponible como responsable')
  const staff = await api('GET', '/admin/users/staff')
  const equipo = staff.data ?? []
  ok(`${equipo.length} profesionales disponibles: ${equipo.map((u) => u.fullName).join(', ')}`)

  const existentes = await api('GET', '/admin/clients?pageSize=100')
  const yaCreados = new Set((existentes.data?.items ?? []).map((c) => c.legalName))

  for (const [indice, cliente] of CLIENTES.entries()) {
    step(`Cliente ${indice + 1}/${CLIENTES.length}: ${cliente.legalName}`)

    let clientId = (existentes.data?.items ?? []).find((c) => c.legalName === cliente.legalName)?.id

    if (!clientId) {
      const { casos, ...datos } = cliente
      const creado = await api('POST', '/admin/clients', {
        ...datos,
        assignedToUserId: equipo[indice % Math.max(equipo.length, 1)]?.id ?? null,
        createAppAccount: true,
        accountPassword: 'Gh.Cliente2026',
      })
      if (!creado.ok) { ko(`no se pudo crear el cliente: HTTP ${creado.status} · ${JSON.stringify(creado.data).slice(0, 200)}`); continue }
      clientId = creado.data.id
      ok(`cliente creado · ${creado.data.code}`)
    } else {
      ok(`el cliente ya existía · ${clientId.slice(0, 8)}`)
    }

    const expedientesActuales = await api('GET', `/admin/cases?clientId=${clientId}&pageSize=50`)
    const titulos = new Set((expedientesActuales.data?.items ?? []).map((c) => c.title))

    for (const caso of cliente.casos) {
      if (titulos.has(caso.title)) { ok(`expediente ya existente: ${caso.title}`); continue }

      const { tareas, ...datosCaso } = caso
      const creado = await api('POST', '/admin/cases', {
        clientId,
        ...datosCaso,
        referenceNumber: null,
        responsibleUserId: equipo[indice % Math.max(equipo.length, 1)]?.id ?? null,
        currency: 'USD',
        clientVisible: true,
        tasks: tareas.map(([title, status, offset], i) => ({
          title,
          description: null,
          status,
          priority: 'Normal',
          dueAt: dias(offset),
          assignedToUserId: null,
          sortOrder: i + 1,
          clientVisible: true,
          clientCanComplete: status === 'Todo' && offset > 0,
        })),
      })

      if (!creado.ok) { ko(`expediente «${caso.title}»: HTTP ${creado.status} · ${JSON.stringify(creado.data).slice(0, 200)}`); continue }
      ok(`expediente creado · ${creado.data.code} · ${caso.title}`)
    }
  }

  step('Resumen del entorno')
  const panel = await api('GET', '/admin/dashboard/summary')
  const s = panel.data ?? {}
  console.log(`     clientes activos: ${s.activeClients} · expedientes abiertos: ${s.openCases} · tareas vencidas: ${s.overdueTasks}`)
  console.log(`     solicitudes pendientes: ${s.pendingAccountRequests} · cotizaciones nuevas: ${s.newQuotes}`)
  console.log(`     ingresos del mes: ${s.revenueThisMonth} USD · pedidos: ${s.ordersThisMonth}`)
  s.activeClients >= 4 ? ok('el entorno tiene datos suficientes para la demostración') : ko('faltan clientes de demostración')

  console.log(`\n\x1b[1m==================================================\x1b[0m`)
  console.log(`  Operaciones correctas: \x1b[32m${pass}\x1b[0m   ·   Incidencias: \x1b[31m${fail}\x1b[0m`)
  console.log(`\x1b[1m==================================================\x1b[0m\n`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error('\x1b[31mError inesperado:\x1b[0m', e); process.exit(1) })
