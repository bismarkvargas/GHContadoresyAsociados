// Comprueba si el formulario de acceso lee lo que se escribe y si las cuentas
// de demostración funcionan (usan setValue, que no depende del ref).
import { chromium } from '@playwright/test'

const BASE = 'https://demostracion.es/ghcontadores/'
const browser = await chromium.launch()
const page = await browser.newPage()
page.on('response', async (r) => {
  if (r.url().includes('/api/')) {
    let b = ''
    try { b = (await r.text()).slice(0, 200) } catch { /* sin cuerpo */ }
    console.log(`← ${r.status()} ${r.request().method()} ${r.url().replace('https://demostracion.es', '')} ${b}`)
  }
})

await page.goto(BASE, { waitUntil: 'networkidle' })

console.log('--- 1) escritura manual ---')
await page.locator('input[type="email"]').first().fill('admin@ghcontadores.net')
await page.locator('input[type="password"]').first().fill('Gh.Admin2026')
console.log('valor del input de correo tras escribir:', await page.locator('input[type="email"]').first().inputValue())
await page.locator('button[type="submit"]').first().click()
await page.waitForTimeout(3000)
console.log('texto de error visible:', (await page.locator('body').innerText()).match(/(Required|obligatorio|inválidas|no válido)/gi)?.join(', ') ?? 'ninguno')
console.log('URL:', page.url())

console.log('\n--- 2) botón de cuenta de demostración (setValue) ---')
await page.goto(BASE, { waitUntil: 'networkidle' })
const boton = page.locator('button:has-text("SuperAdmin")').first()
console.log('botón de demo encontrado:', await boton.count())
await boton.click()
await page.waitForTimeout(500)
console.log('correo tras pulsar el botón:', await page.locator('input[type="email"]').first().inputValue())
console.log('contraseña tras pulsar el botón:', await page.locator('input[type="password"]').first().inputValue())
await page.locator('button[type="submit"]').first().click()
await page.waitForTimeout(6000)
console.log('URL tras enviar:', page.url())
const texto = await page.locator('body').innerText()
console.log('¿entró al panel?', !/Iniciar sesión/.test(texto.slice(0, 400)))
console.log('primeras líneas de la pantalla:\n' + texto.slice(0, 400))

await browser.close()
