// Diagnóstico del inicio de sesión del panel desplegado.
// Muestra el texto de la pantalla, las peticiones de red y los errores de consola.
import { chromium } from '@playwright/test'

const BASE = process.argv[2] ?? 'https://demostracion.es/ghcontadores/'
const EMAIL = process.argv[3] ?? 'admin@ghcontadores.net'
const PASS = process.argv[4] ?? 'Gh.Admin2026'

const browser = await chromium.launch()
const page = await browser.newPage()

page.on('console', (m) => console.log(`[consola:${m.type()}] ${m.text().slice(0, 200)}`))
page.on('pageerror', (e) => console.log(`[error] ${String(e).slice(0, 200)}`))
page.on('request', (r) => {
  if (r.url().includes('/api/')) console.log(`→ ${r.method()} ${r.url()}`)
})
page.on('response', async (r) => {
  if (r.url().includes('/api/')) {
    let body = ''
    try { body = (await r.text()).slice(0, 300) } catch { /* sin cuerpo */ }
    console.log(`← ${r.status()} ${r.url()} ${body}`)
  }
})
page.on('requestfailed', (r) => console.log(`✘ fallo: ${r.method()} ${r.url()} · ${r.failure()?.errorText}`))

await page.goto(BASE, { waitUntil: 'networkidle' })
console.log('\n--- pantalla inicial ---')
console.log((await page.locator('body').innerText()).slice(0, 700))

const email = page.locator('input[type="email"], input[name="email"], input[placeholder*="correo" i]').first()
const hay = await email.count()
console.log(`\ncampos de correo encontrados: ${hay}`)
if (hay) {
  await email.fill(EMAIL)
  await page.locator('input[type="password"]').first().fill(PASS)
  await page.locator('button[type="submit"], button:has-text("Entrar"), button:has-text("Iniciar")').first().click()
  await page.waitForTimeout(6000)
  console.log('\n--- pantalla tras enviar el formulario ---')
  console.log(`URL: ${page.url()}`)
  console.log((await page.locator('body').innerText()).slice(0, 900))
}

await browser.close()
