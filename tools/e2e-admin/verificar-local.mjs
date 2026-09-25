// Verificación en navegador real contra un panel local (modo mock):
// comprueba que los formularios ENLAZAN los campos (bug de react-hook-form),
// que el login entra al panel y que las rutas en inglés redirigen.
//
//   node tools/e2e-admin/verificar-local.mjs [URL]
import { chromium } from '@playwright/test'

const BASE = (process.argv[2] ?? 'http://127.0.0.1:5173/ghcontadores/').replace(/\/?$/, '/')
const ADMIN = { email: 'admin@ghcontadores.net', password: 'Gh.Admin2026' }

let pass = 0
let fail = 0
const ok = (m) => { pass++; console.log(`  \x1b[32m✔\x1b[0m ${m}`) }
const ko = (m) => { fail++; console.log(`  \x1b[31m✘\x1b[0m ${m}`) }
const step = (m) => console.log(`\n\x1b[1;36m${m}\x1b[0m`)

const errores = []

async function main() {
  console.log(`\nVerificación local del panel (modo mock) — ${BASE}`)
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-CR' })
  const page = await context.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()) })
  page.on('pageerror', (e) => errores.push(String(e)))

  step('1 · Formulario de acceso enlaza los campos (react-hook-form + ref)')
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  const email = page.locator('input[type="email"]').first()
  await email.waitFor({ state: 'visible', timeout: 20000 })
  await email.fill(ADMIN.email)
  await page.locator('input[type="password"]').first().fill(ADMIN.password)

  // Si el ref no se reenvía, el checkbox «Recordar sesión» no forma parte del formulario.
  const recordar = page.locator('input[type="checkbox"]').first()
  const antes = await recordar.isChecked()
  await recordar.click()
  const despues = await recordar.isChecked()
  if (despues !== antes) ok('el checkbox «Recordar sesión» alterna (el ref llega al input)')
  else ko('el checkbox no alterna: el ref no se está reenviando')

  await page.locator('button[type="submit"]').first().click()
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(2500)

  const url = page.url()
  const cuerpo = await page.locator('body').innerText()
  if (!/\/login\/?$/.test(url)) ok(`login correcto, URL: ${url.replace(BASE, '/')}`)
  else ko(`no entró al panel (URL ${url})`)

  if (!/Required|Este campo es obligatorio/i.test(cuerpo.slice(0, 1200))) ok('sin errores de validación al enviar el formulario')
  else ko('siguen apareciendo errores de validación al enviar')

  step('2 · Dashboard con KPIs')
  await page.waitForTimeout(2500)
  const dash = (await page.locator('body').innerText()).toLowerCase()
  const kpis = ['clientes activos', 'expedientes abiertos', 'tareas vencidas', 'ingresos del mes'].filter((k) =>
    dash.includes(k),
  )
  if (kpis.length === 4) ok(`el dashboard muestra los 4 KPIs (${kpis.join(', ')})`)
  else ko(`el dashboard solo muestra: ${kpis.join(', ') || 'ninguno'}`)

  step('3 · Rutas en inglés redirigen a las canónicas')
  const rutas = [
    ['catalog', 'Servicios'],
    ['payments', 'Transacciones'],
    ['account-requests', 'Solicitudes de cuenta'],
    ['quotes', 'Cotizaciones'],
    ['clients', 'Clientes'],
    ['cases', 'Expedientes'],
    ['orders', 'Pedidos'],
    ['users', 'Usuarios'],
    ['roles', 'Permisos'],
    ['settings', 'Ajustes'],
  ]
  for (const [ruta, marcador] of rutas) {
    await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})
    const texto = await page.locator('body').innerText()
    const destino = new URL(page.url()).pathname
    if (texto.includes(marcador)) ok(`/${ruta} → ${destino} muestra «${marcador}»`)
    else ko(`/${ruta} → ${destino} no muestra «${marcador}»`)
  }

  step('4 · Formularios de alta enlazan los campos')
  await page.goto(`${BASE}clients/new`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(800)
  const razon = page.locator('input').nth(1)
  await razon.fill('Cliente de Prueba E2E S.A.')
  const leido = await razon.inputValue()
  if (leido === 'Cliente de Prueba E2E S.A.') ok('el campo «Razón social» conserva el valor escrito')
  else ko(`el campo no conserva el valor (leyó «${leido}»)`)

  // Al enviar con campos incompletos deben salir mensajes en español, no «Required».
  await page.locator('button[type="submit"]').first().click()
  await page.waitForTimeout(1500)
  const textoForm = await page.locator('body').innerText()
  const ingles = textoForm.match(/\bRequired\b/g)
  if (!ingles) ok('los mensajes de validación están en español')
  else ko(`aparece «Required» ${ingles.length} vez/veces`)

  step('5 · Errores de consola')
  const graves = errores.filter((e) => !/favicon|404 \(Not Found\)|Failed to load resource/i.test(e))
  if (graves.length === 0) ok('sin errores graves en consola')
  else ko(`${graves.length} errores · ${graves[0]?.slice(0, 140)}`)

  await browser.close()
  console.log(`\n  Superadas: \x1b[32m${pass}\x1b[0m · Fallidas: \x1b[31m${fail}\x1b[0m\n`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error('Error inesperado:', e); process.exit(1) })
