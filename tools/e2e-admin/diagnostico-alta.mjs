// Captura la respuesta cruda del alta de cliente y comprueba el identificador que
// usa el panel para navegar a la ficha (origen del 404 /clientes/undefined).
//
//   node tools/e2e-admin/diagnostico-alta.mjs
import { chromium } from '@playwright/test'

const BASE = 'https://demostracion.es/ghcontadores/'
const ADMIN = { email: 'admin@ghcontadores.net', password: 'Gh.Admin2026' }

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'es-CR' })

let respuestaCruda = null
page.on('response', async (r) => {
  const u = r.url()
  if (r.request().method() === 'POST' && /\/admin\/clients$/.test(u)) {
    try { respuestaCruda = { status: r.status(), cuerpo: await r.text() } } catch { /* sin cuerpo */ }
  }
  if (r.status() >= 400 || /undefined/.test(u)) {
    let c = ''
    try { c = (await r.text()).slice(0, 200) } catch { /* sin cuerpo */ }
    console.log(`FALLO ${r.status()} ${r.request().method()} ${u.replace('https://demostracion.es', '')} ${c.replace(/\s+/g, ' ')}`)
  }
})

await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.locator('input[type="email"]').first().fill(ADMIN.email)
await page.locator('input[type="password"]').first().fill(ADMIN.password)
await page.locator('button[type="submit"]').first().click()
await page.waitForTimeout(4500)

const marca = Date.now()
const nombre = `Diagnostico Alta ${marca}`
const correo = `diag.alta.${marca}@ejemplo.cr`

await page.goto(`${BASE}clientes/nuevo`, { waitUntil: 'domcontentloaded' })
await page.waitForLoadState('networkidle').catch(() => {})
await page.waitForTimeout(1200)

await page.getByLabel(/Razón social|Nombre completo/i).first().fill(nombre)
await page.getByLabel(/Cédula jurídica|Cédula \/ pasaporte/i).first().fill('3-101-888888')
await page.getByLabel(/Correo electrónico/i).first().fill(correo)
await page.getByLabel(/^Teléfono/i).first().fill('+506 8888 0000')
await page.locator('button[type="submit"]').first().click()
await page.waitForTimeout(5000)

console.log('\nURL final:', new URL(page.url()).pathname)
console.log('\n--- respuesta cruda del POST /admin/clients ---')
console.log(respuestaCruda ? JSON.stringify(respuestaCruda, null, 2).slice(0, 1500) : '(no se capturó)')

// Limpieza del cliente creado por el diagnóstico
if (respuestaCruda?.cuerpo) {
  try {
    const creado = JSON.parse(respuestaCruda.cuerpo)
    const id = creado.id ?? creado.Id ?? creado.client?.id ?? creado.data?.id
    console.log('id detectado:', id ?? 'NINGUNO')
    if (id) {
      await page.evaluate(async (clienteId) => {
        const token = localStorage.getItem('gh.accessToken') ?? sessionStorage.getItem('gh.accessToken')
        await fetch(`/ghcontadores/api/v1/admin/clients/${clienteId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        })
      }, id)
      console.log('cliente de diagnóstico eliminado')
    }
  } catch (e) {
    console.log('no se pudo limpiar:', String(e).slice(0, 120))
  }
}

await browser.close()
