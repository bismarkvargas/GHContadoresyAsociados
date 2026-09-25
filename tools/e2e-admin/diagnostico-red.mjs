// Diagnóstico: registra TODAS las respuestas del panel contra producción para
// localizar peticiones fallidas (400/401/403/404/500).
//
//   node tools/e2e-admin/diagnostico-red.mjs
import { chromium } from '@playwright/test'

const BASE = 'https://demostracion.es/ghcontadores/'
const ADMIN = { email: 'admin@ghcontadores.net', password: 'Gh.Admin2026' }

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })

const fallos = []
const consola = []
page.on('response', async (r) => {
  const status = r.status()
  if (status >= 400) {
    let cuerpo = ''
    try { cuerpo = (await r.text()).slice(0, 300) } catch { /* sin cuerpo */ }
    fallos.push({ status, method: r.request().method(), url: r.url(), cuerpo })
  }
})
page.on('console', (m) => { if (m.type() === 'error') consola.push(m.text().slice(0, 300)) })
page.on('pageerror', (e) => consola.push('PAGEERROR: ' + String(e).slice(0, 300)))

await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.locator('input[type="email"]').first().fill(ADMIN.email)
await page.locator('input[type="password"]').first().fill(ADMIN.password)
await page.locator('button[type="submit"]').first().click()
await page.waitForTimeout(6000)
console.log('URL tras login:', page.url())

// Recorre los módulos reales (rutas canónicas en español y alias en inglés).
const rutas = [
  'pagos', 'payments', 'solicitudes', 'account-requests', 'cotizaciones', 'quotes',
  'catalogo', 'catalog', 'clientes', 'expedientes', 'pedidos', 'documentos',
  'usuarios', 'roles', 'ajustes', 'auditoria', 'informes',
]
for (const r of rutas) {
  await page.goto(`${BASE}${r}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
}
await page.waitForTimeout(3000)

console.log('\n=== RESPUESTAS CON ERROR ===')
if (fallos.length === 0) console.log('(ninguna)')
for (const f of fallos) {
  console.log(`\n${f.status} ${f.method} ${f.url.replace('https://demostracion.es', '')}`)
  if (f.cuerpo) console.log('   cuerpo:', f.cuerpo.replace(/\s+/g, ' ').slice(0, 240))
}

console.log('\n=== ERRORES DE CONSOLA ===')
if (consola.length === 0) console.log('(ninguno)')
for (const c of consola.slice(0, 12)) console.log('·', c.replace(/\s+/g, ' ').slice(0, 220))

await browser.close()
