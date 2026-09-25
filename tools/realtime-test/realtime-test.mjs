// ---------------------------------------------------------------------------
// Prueba de tiempo real de GH Contadores
//
// Comprueba el requisito más delicado del sistema: "toda gestión hecha en el admin
// debe verse en el app del cliente en tiempo real".
//
//  1. Inicia sesión como administrador y como cliente de demostración.
//  2. Abre DOS conexiones SignalR contra wss://demostracion.es/ghcontadores/hubs/realtime
//     (una por usuario, con el JWT en la query string, igual que hacen el panel y el app).
//  3. El administrador cambia el estado de un expediente del cliente.
//  4. Verifica que el cliente recibe `case.updated` y `notification` sin recargar.
//
// Uso:  node realtime-test.mjs [URL_BASE]
// ---------------------------------------------------------------------------
import * as signalR from '@microsoft/signalr'
import WebSocket from 'ws'

const BASE = process.argv[2] ?? 'https://demostracion.es/ghcontadores/api/v1'
const HUB = BASE.replace(/\/api\/v1\/?$/, '') + '/hubs/realtime'

const ADMIN = { email: 'admin@ghcontadores.net', password: 'Gh.Admin2026' }
const CLIENTE = { email: 'cliente@demo.cr', password: 'Gh.Cliente2026' }

let pass = 0
let fail = 0
const ok = (m) => { pass++; console.log(`  \x1b[32m✔\x1b[0m ${m}`) }
const ko = (m) => { fail++; console.log(`  \x1b[31m✘\x1b[0m ${m}`) }
const step = (m) => console.log(`\n\x1b[1;36m${m}\x1b[0m`)

async function login({ email, password }) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(`login ${email}: HTTP ${res.status}`)
  return res.json()
}

function connect(token, label, received) {
  const connection = new signalR.HubConnectionBuilder()
    .withUrl(`${HUB}?access_token=${encodeURIComponent(token)}`, { transport: signalR.HttpTransportType.WebSockets, WebSocket })
    .withAutomaticReconnect()
    .configureLogging(signalR.LogLevel.None)
    .build()

  for (const evt of ['notification', 'case.updated', 'case.event', 'task.completed', 'document.added', 'message.created', 'order.updated']) {
    connection.on(evt, (payload) => {
      received.push({ evt, payload, at: new Date().toISOString() })
      console.log(`     · [${label}] ${evt} → ${JSON.stringify(payload).slice(0, 120)}`)
    })
  }
  return connection
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  console.log(`\n\x1b[1mPrueba de tiempo real — GH Contadores\x1b[0m\nHub: ${HUB}\nAPI: ${BASE}`)

  step('1 · Sesiones')
  const admin = await login(ADMIN)
  const cliente = await login(CLIENTE)
  ok(`administrador ${ADMIN.email} · permisos: ${admin.permissions.length}`)
  ok(`cliente ${CLIENTE.email} · clienteId ${cliente.user.clientId}`)

  step('2 · Conexión de los dos clientes al hub')
  const eventosAdmin = []
  const eventosCliente = []
  const connAdmin = connect(admin.accessToken, 'admin', eventosAdmin)
  const connCliente = connect(cliente.accessToken, 'cliente', eventosCliente)

  try {
    await connAdmin.start()
    ok('el panel de administración se conecta a SignalR')
  } catch (e) {
    ko(`no se pudo conectar el admin: ${e.message}`)
    process.exit(1)
  }

  try {
    await connCliente.start()
    ok('el app del cliente se conecta a SignalR')
  } catch (e) {
    ko(`no se pudo conectar el cliente: ${e.message}`)
    process.exit(1)
  }

  step('3 · El administrador gestiona el expediente del cliente')
  const casos = await fetch(`${BASE}/me/cases`, { headers: { Authorization: `Bearer ${cliente.accessToken}` } }).then((r) => r.json())
  if (!casos.length) {
    ko('el cliente no tiene expedientes para probar')
    process.exit(1)
  }
  const caso = casos[0]
  ok(`expediente de prueba: ${caso.code} · estado actual ${caso.status}`)

  const destino = caso.status === 'InProgress' ? 'WaitingClient' : 'InProgress'
  const parche = await fetch(`${BASE}/admin/cases/${caso.id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.accessToken}` },
    body: JSON.stringify({ status: destino, progressPercent: 55, note: 'Prueba automática de tiempo real.' }),
  })
  parche.ok ? ok(`el admin cambió el estado a ${destino} (HTTP 200)`) : ko(`el cambio de estado devolvió HTTP ${parche.status}`)

  step('4 · Recepción en tiempo real')
  await esperar(4000)

  const clienteRecibioCaso = eventosCliente.some((e) => e.evt === 'case.updated')
  const clienteRecibioAviso = eventosCliente.some((e) => e.evt === 'notification')
  const adminRecibioCaso = eventosAdmin.some((e) => e.evt === 'case.updated')

  clienteRecibioCaso ? ok('el app recibió case.updated sin recargar') : ko('el app NO recibió case.updated')
  clienteRecibioAviso ? ok('el app recibió la notificación push/in-app') : ko('el app NO recibió la notificación')
  adminRecibioCaso ? ok('el panel recibió el evento de expediente') : ko('el panel NO recibió el evento')

  if (clienteRecibioCaso) {
    const evt = eventosCliente.find((e) => e.evt === 'case.updated')
    evt.payload?.code === caso.code
      ? ok(`el evento corresponde al expediente ${evt.payload.code} y trae el estado ${evt.payload.status}`)
      : ko(`el evento no trae el expediente esperado: ${JSON.stringify(evt.payload).slice(0, 160)}`)
  }

  step('5 · Notificaciones persistidas (respaldo si el app está cerrado)')
  const bandeja = await fetch(`${BASE}/me/notifications?pageSize=5`, { headers: { Authorization: `Bearer ${cliente.accessToken}` } }).then((r) => r.json())
  const reciente = bandeja.items?.[0]
  bandeja.total > 0 && reciente
    ? ok(`bandeja del cliente: ${bandeja.total} avisos · último: «${reciente.title}»`)
    : ko('el cliente no tiene notificaciones en su bandeja')

  await connAdmin.stop()
  await connCliente.stop()

  console.log(`\n\x1b[1m==================================================\x1b[0m`)
  console.log(`  Comprobaciones superadas: \x1b[32m${pass}\x1b[0m   ·   Fallidas: \x1b[31m${fail}\x1b[0m`)
  console.log(`\x1b[1m==================================================\x1b[0m\n`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('\x1b[31mError inesperado:\x1b[0m', e)
  process.exit(1)
})
