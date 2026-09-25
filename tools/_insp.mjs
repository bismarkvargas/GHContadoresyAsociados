/**
 * Inspección de la API real de producción: inicia sesión y reporta la FORMA
 * exacta de cada respuesta para compararla con lo que espera el panel.
 *
 *   node tools/_insp.mjs
 */
const BASE = 'https://demostracion.es/ghcontadores/api/v1'

const EMAIL = process.env.GH_EMAIL ?? 'admin@ghcontadores.net'
const PASSWORD = process.env.GH_PASSWORD ?? 'Gh.Admin2026'

function shape(value, depth = 0, maxDepth = 2) {
  if (value === null) return 'null'
  if (Array.isArray(value)) {
    if (!value.length) return '[]'
    return `[${value.length} × ${depth >= maxDepth ? '…' : shape(value[0], depth + 1, maxDepth)}]`
  }
  const t = typeof value
  if (t !== 'object') return t === 'string' ? `"${String(value).slice(0, 24)}"` : String(value)
  if (depth >= maxDepth) return '{…}'
  const entries = Object.entries(value).map(([k, v]) => `${k}: ${shape(v, depth + 1, maxDepth)}`)
  return `{ ${entries.join(', ')} }`
}

let token = null

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    json = text.slice(0, 200)
  }
  return { status: res.status, json }
}

async function show(label, method, path, body) {
  const { status, json } = await req(method, path, body)
  console.log(`\n### ${label}`)
  console.log(`${method} ${path} -> ${status}`)
  console.log(shape(json, 0, 3))
  if (status >= 400) console.log('cuerpo:', JSON.stringify(json).slice(0, 400))
  return json
}

/* ------------------------------------------------------------------ */
console.log('=== GH_CONTADORES_INSPECT_START ===')
const login = await show('login', 'POST', '/auth/login', { email: EMAIL, password: PASSWORD })
if (login?.accessToken) {
  token = login.accessToken
  console.log('TOKEN OK, permisos:', Array.isArray(login.permissions) ? login.permissions.length : 'n/d')
} else {
  console.log('NO SE PUDO INICIAR SESIÓN — se continúa en modo público')
}

await show('dashboard summary', 'GET', '/admin/dashboard/summary')
const clients = await show('clients', 'GET', '/admin/clients?page=1&pageSize=3')
if (clients?.items?.length) {
  console.log('NOMBRES DE CLIENTES REALES:', clients.items.map((c) => c.legalName ?? c.name ?? '?').join(' | '))
  console.log('CLAVES DEL CLIENTE:', Object.keys(clients.items[0]).join(', '))
}
await show('client detalle', 'GET', clients?.items?.[0]?.id ? `/admin/clients/${clients.items[0].id}` : '/admin/clients?page=1&pageSize=1')
await show('cases', 'GET', '/admin/cases?page=1&pageSize=3')
await show('case detalle', 'GET', '/admin/cases?page=1&pageSize=1')
await show('orders', 'GET', '/admin/orders?page=1&pageSize=3')
await show('payments', 'GET', '/admin/payments?page=1&pageSize=3')
await show('account-requests', 'GET', '/admin/account-requests?page=1&pageSize=3')
await show('quotes', 'GET', '/admin/quotes?page=1&pageSize=3')
await show('documents', 'GET', '/admin/documents?page=1&pageSize=3')
await show('catalog products', 'GET', '/admin/catalog/products?page=1&pageSize=3')
await show('catalog categories', 'GET', '/admin/catalog/categories')
await show('users', 'GET', '/admin/users?page=1&pageSize=5')
await show('roles', 'GET', '/admin/roles')
await show('permissions', 'GET', '/admin/permissions')
await show('settings', 'GET', '/admin/settings')
await show('audit', 'GET', '/admin/audit?page=1&pageSize=3')
await show('reports sales', 'GET', '/admin/reports/sales')
await show('reports cases', 'GET', '/admin/reports/cases')
await show('reports productivity', 'GET', '/admin/reports/productivity')
await show('notifications', 'GET', '/admin/notifications?page=1&pageSize=3')

console.log('\n=== GH_CONTADORES_INSPECT_END ===')
