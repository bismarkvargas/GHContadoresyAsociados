// Captura exacta de la petición y respuesta del alta de cliente.
import { chromium } from '@playwright/test'

const BASE = 'https://demostracion.es/ghcontadores/'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })

page.on('request', (r) => {
  if (r.url().includes('/api/v1/admin/clients') && r.method() === 'POST') {
    console.log('→ POST', r.url().replace('https://demostracion.es', ''))
    console.log('  payload:', r.postData()?.slice(0, 900))
  }
})
page.on('response', async (r) => {
  if (r.url().includes('/api/v1/admin/clients') && r.request().method() === 'POST') {
    let b = ''
    try { b = (await r.text()).slice(0, 700) } catch { /* sin cuerpo */ }
    console.log(`← ${r.status()}\n  ${b}`)
  }
})

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.locator('input[type="email"]').first().fill('admin@ghcontadores.net')
await page.locator('input[type="password"]').first().fill('Gh.Admin2026')
await page.locator('button[type="submit"]').first().click()
await page.waitForTimeout(4000)

await page.goto(`${BASE}clientes/nuevo`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)

const marca = Date.now()
await page.getByLabel(/Razón social|Nombre completo/i).first().fill(`Cliente Diagnostico ${marca}`)
await page.getByLabel(/Cédula jurídica|Cédula \/ pasaporte/i).first().fill('3-101-999999')
await page.getByLabel(/Correo electrónico/i).first().fill(`diag.${marca}@ejemplo.cr`)
await page.getByLabel(/^Teléfono/i).first().fill('+506 8888 0000')
await page.getByLabel(/Dirección/i).first().fill('Huacas, Santa Cruz')
await page.locator('button[type="submit"], button:has-text("Guardar"), button:has-text("Crear")').first().click()
await page.waitForTimeout(5000)

const texto = await page.locator('body').innerText()
console.log('\nURL:', page.url())
console.log('mensajes de validación:', texto.match(/obligatorio|inválid|no se pudo|error|Failed/gi)?.join(', ') ?? 'ninguno')
console.log('extracto:\n' + texto.slice(0, 800))

await browser.close()
