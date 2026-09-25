// Verifica en el navegador (modo mock) que el alta de cliente navega a la ficha con
// un identificador VÁLIDO — reproduce el fallo /clientes/undefined de producción.
//
//   node tools/e2e-admin/verificar-alta-cliente.mjs [URL]
import { chromium } from '@playwright/test'

const BASE = (process.argv[2] ?? 'http://127.0.0.1:5173/ghcontadores/').replace(/\/?$/, '/')
const ADMIN = { email: 'admin@ghcontadores.net', password: 'Gh.Admin2026' }

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'es-CR' })

const malas = []
page.on('request', (r) => {
  const u = r.url()
  if (/undefined|null/.test(u) && u.includes('/api/')) malas.push(`${r.method()} ${u}`)
})

await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.locator('input[type="email"]').first().fill(ADMIN.email)
await page.locator('input[type="password"]').first().fill(ADMIN.password)
await page.locator('button[type="submit"]').first().click()
await page.waitForTimeout(3500)

const marca = Date.now()
await page.goto(`${BASE}clientes/nuevo`, { waitUntil: 'domcontentloaded' })
await page.waitForLoadState('networkidle').catch(() => {})
await page.waitForTimeout(800)

await page.getByLabel(/Razón social|Nombre completo/i).first().fill(`Alta Local ${marca}`)
await page.getByLabel(/Cédula jurídica|Cédula \/ pasaporte/i).first().fill('3-101-123456')
await page.getByLabel(/Correo electrónico/i).first().fill(`alta.local.${marca}@ejemplo.cr`)
await page.getByLabel(/^Teléfono/i).first().fill('+506 8888 4444')
await page.locator('button[type="submit"]').first().click()
await page.waitForTimeout(4000)

const ruta = new URL(page.url()).pathname
const texto = (await page.locator('body').innerText()).slice(0, 600)

console.log('URL tras el alta:', ruta)
// Vale cualquier identificador real (UUID de la API o el del modo demo).
if (/\/clientes\/[A-Za-z0-9_-]{6,}$/.test(ruta)) console.log('✔ navega a la ficha con id válido')
else if (/\/clientes$/.test(ruta)) console.log('✔ navega al listado (sin id válido, gestionado sin error)')
else console.log('✘ ruta inesperada')

if (/undefined/.test(ruta)) console.log('✘ la URL contiene «undefined»')
else console.log('✔ la URL no contiene «undefined»')

console.log('peticiones con undefined/null:', malas.length ? malas.join(' | ') : 'ninguna')
console.log('\nprimeras líneas de la ficha:\n' + texto.replace(/\n{2,}/g, '\n').slice(0, 400))

await browser.close()
