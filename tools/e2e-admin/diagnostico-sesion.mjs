// Aísla la pérdida de sesión: registra el ciclo de vida del token y las respuestas
// de /auth/me mientras se navega por los módulos.
//
//   node tools/e2e-admin/diagnostico-sesion.mjs
import { chromium } from '@playwright/test'

const BASE = 'https://demostracion.es/ghcontadores/'
const ADMIN = { email: 'admin@ghcontadores.net', password: 'Gh.Admin2026' }

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'es-CR' })

page.on('response', async (r) => {
  const u = r.url()
  if (!u.includes('/api/')) return
  let cuerpo = ''
  try { cuerpo = (await r.text()).slice(0, 160) } catch { /* sin cuerpo */ }
  console.log(`← ${r.status()} ${r.request().method()} ${u.replace('https://demostracion.es', '')} ${cuerpo.replace(/\s+/g, ' ')}`)
})

async function token() {
  return page.evaluate(() => ({
    ls: localStorage.getItem('gh.accessToken'),
    ss: sessionStorage.getItem('gh.accessToken'),
    perfil: localStorage.getItem('gh.profile') ?? sessionStorage.getItem('gh.profile'),
  }))
}

await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.locator('input[type="email"]').first().fill(ADMIN.email)
await page.locator('input[type="password"]').first().fill(ADMIN.password)
await page.locator('button[type="submit"]').first().click()
await page.waitForTimeout(5000)
console.log('\n--- tras login ---')
console.log('URL:', page.url())
let t = await token()
console.log('token en localStorage:', t.ls ? `${t.ls.slice(0, 22)}…` : 'NO')
console.log('perfil guardado:', t.perfil ? 'SÍ' : 'NO')

const rutas = ['catalogo', 'clientes', 'expedientes', 'pedidos', 'pagos', 'solicitudes', 'cotizaciones', 'informes']
for (const r of rutas) {
  console.log(`\n--- navegando a /${r} ---`)
  await page.goto(`${BASE}${r}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  console.log('URL final:', new URL(page.url()).pathname)
  t = await token()
  console.log('token:', t.ls ? 'presente' : 'AUSENTE')
}
await page.waitForTimeout(2000)
await browser.close()
