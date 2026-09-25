// Verifica en navegador real (modo mock) los tres fallos de la segunda ronda:
//  1) la campana usa el contrato real de notificaciones (summary + bandeja, sin /read)
//  2) las rutas de detalle con un id ausente no consultan ni navegan (404 del panel)
//  3) las etiquetas del cliente viajan como arreglo, se ven y se editan en la ficha
//
// En modo mock el adaptador resuelve todo en memoria, así que se usa el registro
// `window.__ghRequestLog` que el panel expone solo en desarrollo.
//
//   node tools/e2e-admin/verificar-ronda2.mjs [URL]
import { chromium } from '@playwright/test'

const BASE = (process.argv[2] ?? 'http://127.0.0.1:5173/ghcontadores/').replace(/\/?$/, '/')
const ADMIN = { email: 'admin@ghcontadores.net', password: 'Gh.Admin2026' }

let pass = 0
let fail = 0
const ok = (m) => { pass++; console.log(`  \x1b[32m✔\x1b[0m ${m}`) }
const ko = (m) => { fail++; console.log(`  \x1b[31m✘\x1b[0m ${m}`) }
const step = (m) => console.log(`\n\x1b[1;36m${m}\x1b[0m`)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'es-CR' })

await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.locator('input[type="email"]').first().fill(ADMIN.email)
await page.locator('input[type="password"]').first().fill(ADMIN.password)
await page.locator('button[type="submit"]').first().click()
await page.waitForTimeout(3500)

const leerLog = () => page.evaluate(() => window.__ghRequestLog ?? [])

/* 1 · Campana de notificaciones */
step('1 · Campana de notificaciones con el contrato real')
await page.locator('button[aria-label*="Notificaciones" i]').first().click()
await page.waitForTimeout(2500)

const log1 = await leerLog()
const notif = log1.filter((p) => p.url.includes('/notifications'))
const resumen = notif.find((p) => p.url.includes('/notifications/summary'))
const bandeja = notif.find((p) => /\/notifications\?/.test(p.url))
const acciones = notif.filter((p) => /\/(read|read-all)/.test(p.url))

if (resumen) ok(`la campana consulta el resumen (${resumen.method} ${resumen.url})`)
else ko('la campana no consulta /admin/notifications/summary')
if (bandeja) ok(`la campana lista la bandeja (${bandeja.url})`)
else ko('la campana no lista /admin/notifications')
if (acciones.length === 0) ok('no llama a /read ni /read-all (no existen en la API)')
else ko(`llama a endpoints inexistentes: ${acciones.map((a) => a.url).join(', ')}`)

const cuerpoCampana = await page.locator('body').innerText()
if (/sin leer|Todo al día/i.test(cuerpoCampana)) ok('la campana muestra el contador del resumen')
else ko('la campana no muestra el contador')

/* 2 · Identificadores ausentes */
step('2 · Rutas de detalle con identificador ausente')
await page.goto(`${BASE}clientes/undefined`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2000)
const texto404 = await page.locator('body').innerText()
if (/Cliente no encontrado/i.test(texto404)) ok('/clientes/undefined → aviso «Cliente no encontrado»')
else ko('/clientes/undefined no avisa del identificador inválido')

await page.goto(`${BASE}expedientes/undefined`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2000)
const texto404b = await page.locator('body').innerText()
if (/Expediente no encontrado/i.test(texto404b)) ok('/expedientes/undefined → aviso «Expediente no encontrado»')
else ko('/expedientes/undefined no avisa del identificador inválido')

const log2 = await leerLog()
const conUndefined = log2.filter((p) => /(undefined|null)/.test(p.url))
if (conUndefined.length === 0) ok('ninguna petición con identificadores indefinidos')
else ko(`peticiones inválidas: ${conUndefined.map((p) => p.url).join(' | ')}`)

/* 3 · Etiquetas como arreglo */
step('3 · Etiquetas del cliente como arreglo')
const marca = Date.now()
await page.goto(`${BASE}clientes/nuevo`, { waitUntil: 'domcontentloaded' })
await page.waitForLoadState('networkidle').catch(() => {})
await page.waitForTimeout(800)
await page.getByLabel(/Razón social|Nombre completo/i).first().fill(`Etiquetas ${marca}`)
await page.getByLabel(/Cédula jurídica|Cédula \/ pasaporte/i).first().fill('3-101-654321')
await page.getByLabel(/Correo electrónico/i).first().fill(`etiquetas.${marca}@ejemplo.cr`)
await page.getByLabel(/^Teléfono/i).first().fill('+506 8888 5555')
await page.getByLabel(/Etiquetas/i).first().fill('vip,hotelería')
await page.locator('button[type="submit"]').first().click()
await page.waitForTimeout(4000)

const log3 = await leerLog()
const altas = log3.filter((p) => p.method === 'POST' && /\/admin\/clients$/.test(p.url))
const cuerpo = altas[altas.length - 1]?.body ?? {}
if (Array.isArray(cuerpo.tags)) ok(`el alta envía tags como arreglo: ${JSON.stringify(cuerpo.tags)}`)
else ko(`tags no llega como arreglo: ${JSON.stringify(cuerpo.tags)}`)
if (!('tagsCsv' in cuerpo)) ok('no se envía tagsCsv a la API')
else ko('se sigue enviando tagsCsv')
const vacias = Object.entries(cuerpo).filter(([, v]) => v === '')
if (vacias.length === 0) ok('no se envían claves con cadena vacía')
else ko(`claves vacías enviadas: ${vacias.map(([k]) => k).join(', ')}`)

const ruta = new URL(page.url()).pathname
if (/\/clientes\/[A-Za-z0-9_-]{6,}$/.test(ruta)) ok(`navega a la ficha del cliente creado: ${ruta}`)
else ko(`ruta inesperada tras el alta: ${ruta}`)

const ficha = await page.locator('body').innerText()
if (/vip/.test(ficha) && /hoteler/i.test(ficha)) ok('la ficha muestra las etiquetas guardadas')
else ko('la ficha no muestra las etiquetas')

/* 4 · Edición de etiquetas */
step('4 · Etiquetas editables en la ficha')
await page.getByRole('button', { name: /^Editar/i }).first().click()
await page.waitForTimeout(1500)
const campoEtiquetas = page.getByLabel(/Etiquetas/i).first()
const valorActual = await campoEtiquetas.inputValue().catch(() => '')
if (/vip/.test(valorActual)) ok(`el formulario carga las etiquetas existentes («${valorActual}»)`)
else ko(`el formulario no carga las etiquetas («${valorActual}»)`)
await campoEtiquetas.fill('vip,extranjero,urgente')
await page.locator('button[type="submit"]:has-text("Guardar cambios")').first().click()
await page.waitForTimeout(3000)

const ficha2 = await page.locator('body').innerText()
if (/extranjero/.test(ficha2)) ok('las etiquetas actualizadas se ven en la ficha')
else ko('las etiquetas actualizadas no se ven')

const log4 = await leerLog()
const ediciones = log4.filter((p) => p.method === 'PUT' && /\/admin\/clients\//.test(p.url))
const cuerpoUpdate = ediciones[ediciones.length - 1]?.body ?? {}
if (Array.isArray(cuerpoUpdate.tags) && cuerpoUpdate.tags.includes('extranjero'))
  ok(`la edición envía tags como arreglo: ${JSON.stringify(cuerpoUpdate.tags)}`)
else ko(`la edición no envía tags como arreglo: ${JSON.stringify(cuerpoUpdate.tags)}`)

/* 5 · Pantalla de notificaciones enviadas */
step('5 · Pantalla de notificaciones enviadas')
await page.goto(`${BASE}notificaciones`, { waitUntil: 'domcontentloaded' })
await page.waitForLoadState('networkidle').catch(() => {})
await page.waitForTimeout(2500)
const pantalla = await page.locator('body').innerText()
if (/Notificaciones enviadas/i.test(pantalla)) ok('la pantalla carga')
else ko('la pantalla no carga')
if (/Últimos 30 días/i.test(pantalla)) ok('muestra los contadores del resumen')
else ko('no muestra los contadores del resumen')

/* 6 · Reenvío desde la bandeja */
step('6 · Reenvío de una notificación')
const logAntes = (await leerLog()).filter((p) => p.url.includes('/resend')).length
await page.locator('table tbody tr').first().click()
await page.waitForTimeout(1200)
const dialogo = page.locator('[role="dialog"]')
if (await dialogo.count()) ok('el detalle de la notificación se abre en un diálogo')
else ko('el detalle no se abrió')
const botonReenviar = dialogo.getByRole('button', { name: /Reenviar/i }).first()
if (await botonReenviar.count()) {
  await botonReenviar.click()
  await page.waitForTimeout(2500)
  const logDespues = (await leerLog()).filter((p) => p.url.includes('/resend')).length
  if (logDespues > logAntes) ok('el reenvío llama a POST /admin/notifications/{id}/resend')
  else ko('el reenvío no llamó al endpoint')
} else {
  ko('no se encontró el botón de reenvío en el detalle')
}

await browser.close()
console.log(`\n  Superadas: \x1b[32m${pass}\x1b[0m · Fallidas: \x1b[31m${fail}\x1b[0m\n`)
process.exit(fail === 0 ? 0 : 1)
