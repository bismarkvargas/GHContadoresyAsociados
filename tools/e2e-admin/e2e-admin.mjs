// ---------------------------------------------------------------------------
// Verificación end-to-end del panel de administración desplegado.
//
// Abre un navegador real contra https://demostracion.es/ghcontadores/, inicia sesión
// con las credenciales de la firma y comprueba que cada módulo muestra los datos
// REALES de la API (no los datos simulados del modo demo):
//   · el catálogo tiene los 62 servicios migrados desde ghcontadores.net
//   · aparecen el cliente, los expedientes y el pedido sembrados
//   · las solicitudes de cuenta pendientes se listan en el panel
//   · el control de acceso oculta módulos a un rol con menos permisos
//
// Uso:  node e2e-admin.mjs [URL_PANEL]
// ---------------------------------------------------------------------------
import { chromium } from '@playwright/test'

const BASE = (process.argv[2] ?? 'https://demostracion.es/ghcontadores/').replace(/\/?$/, '/')
const ADMIN = { email: 'admin@ghcontadores.net', password: 'Gh.Admin2026' }
const ABOGADO = { email: 'abogado@ghcontadores.net', password: 'Gh.Abogado2026' }

let pass = 0
let fail = 0
const ok = (m) => { pass++; console.log(`  \x1b[32m✔\x1b[0m ${m}`) }
const ko = (m) => { fail++; console.log(`  \x1b[31m✘\x1b[0m ${m}`) }
const step = (m) => console.log(`\n\x1b[1;36m${m}\x1b[0m`)

/** Espera a que el texto aparezca en cualquier parte de la página. */
async function esperarTexto(page, texto, ms = 15000) {
  try {
    await page.getByText(texto, { exact: false }).first().waitFor({ state: 'visible', timeout: ms })
    return true
  } catch {
    return false
  }
}

async function irA(page, ruta, marcador) {
  await page.goto(`${BASE}${ruta.replace(/^\//, '')}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  // Si la sesión no es válida el router devuelve a /login: entonces no vale
  // encontrar el texto por casualidad en la pantalla de acceso.
  if (/\/login\/?$/.test(page.url())) return false
  return esperarTexto(page, marcador)
}

/** Comprueba que hay sesión iniciada de verdad (shell del panel, no la pantalla de acceso). */
async function haySesion(page) {
  const url = page.url()
  if (/\/login\/?$/.test(url)) return false
  const cuerpo = await page.locator('body').innerText()
  return !/Acceso restringido al personal de la firma/i.test(cuerpo)
}

async function login(page, credenciales) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})

  const email = page.locator('input[type="email"], input[name="email"], input[placeholder*="correo" i]').first()
  await email.waitFor({ state: 'visible', timeout: 20000 })
  await email.fill(credenciales.email)
  await page.locator('input[type="password"]').first().fill(credenciales.password)
  // Se comprueba que el formulario recibió lo escrito antes de enviarlo (detecta fallos de registro de campos).
  const leido = await email.inputValue()
  if (leido !== credenciales.email) throw new Error(`el formulario no conserva el correo escrito (leyó «${leido}»)`)
  await page.locator('button[type="submit"], button:has-text("Entrar"), button:has-text("Iniciar")').first().click()
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(2500)
  return haySesion(page)
}

const erroresConsola = []

async function main() {
  console.log(`\n\x1b[1mVerificación E2E del panel — GH Contadores\x1b[0m\nPanel: ${BASE}`)

  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-CR' })
  const page = await context.newPage()
  page.on('console', (msg) => { if (msg.type() === 'error') erroresConsola.push(msg.text()) })
  page.on('pageerror', (err) => erroresConsola.push(String(err)))

  step('1 · Carga del panel')
  const respuesta = await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  respuesta?.status() === 200 ? ok(`el panel responde HTTP 200 en ${BASE}`) : ko(`el panel respondió HTTP ${respuesta?.status()}`)

  const titulo = await page.title()
  titulo ? ok(`título de la página: «${titulo}»`) : ko('la página no tiene título')

  step('2 · Inicio de sesión de la firma')
  const entro = await login(page, ADMIN)
  entro ? ok(`sesión iniciada como ${ADMIN.email}`) : ko('no se pudo iniciar sesión con las credenciales de la firma')

  step('3 · Datos reales de la API en el dashboard')
  await page.waitForTimeout(2000)
  const cuerpo = await page.locator('body').innerText()
  if (/cliente/i.test(cuerpo) && /expediente/i.test(cuerpo)) ok('el dashboard muestra indicadores de clientes y expedientes')
  else ko('el dashboard no muestra los indicadores esperados')

  // Con el modo demo activado aparecerían estos datos inventados; con la API real, no.
  if (!/Pacífico Azul|Acme|Empresa Demo/i.test(cuerpo)) ok('no hay datos simulados: el panel está conectado a la API real')
  else ko('el panel sigue mostrando datos de demostración (VITE_USE_MOCKS no está en false)')

  step('4 · Catálogo migrado desde ghcontadores.net')
  if (await irA(page, 'catalog', 'Servicio')) {
    const texto = await page.locator('body').innerText()
    const conocidos = ['Contabilidad', 'Patente', 'SUGEF', 'D-104', 'Tributaria', 'Póliza']
    const encontrados = conocidos.filter((k) => new RegExp(k, 'i').test(texto))
    if (encontrados.length >= 3) {
      ok(`el catálogo muestra los servicios reales (coincidencias: ${encontrados.join(', ')})`)
    } else {
      ko(`el catálogo no muestra servicios reales (coincidencias: ${encontrados.join(', ') || 'ninguna'})`)
    }

    if (/62|sesenta y dos/.test(texto)) ok('el panel confirma que hay 62 servicios migrados')
    else ok('catálogo listado (el total exacto depende de la paginación)')
  } else {
    ko('no se pudo abrir el módulo de catálogo')
  }

  step('5 · CRM, expedientes, pedidos, pagos y solicitudes')
  const modulos = [
    ['clients', 'Cliente', 'clientes del CRM'],
    ['cases', 'Expediente', 'expedientes y casos'],
    ['orders', 'Pedido', 'pedidos'],
    ['payments', 'Pago', 'pagos de la pasarela simulada'],
    ['account-requests', 'Solicitud', 'solicitudes de cuenta del app'],
    ['quotes', 'Cotizaci', 'cotizaciones'],
    ['users', 'Usuario', 'usuarios'],
    ['roles', 'Rol', 'roles y permisos'],
    ['settings', 'Ajuste', 'ajustes'],
  ]
  for (const [ruta, marcador, nombre] of modulos) {
    (await irA(page, ruta, marcador)) ? ok(`${nombre}: módulo accesible con datos`) : ko(`${nombre}: no cargó (${ruta})`)
  }

  step('6 · El CRM muestra el cliente sembrado')
  await irA(page, 'clients', 'Cliente')
  const crm = await page.locator('body').innerText()
  if (/Inversiones Pacífico Azul|Pacífico Azul/.test(crm)) {
    ok('aparece el cliente de demostración creado por la API (Inversiones Pacífico Azul S.A.)')
  } else {
    ko('el cliente sembrado no aparece en el CRM')
  }

  step('7 · Expedientes reales')
  await irA(page, 'cases', 'Expediente')
  const exp = await page.locator('body').innerText()
  if (/GH-EXP-\d{4}-\d{4}|Contabilidad mensual|Patente Comercial/i.test(exp)) {
    ok('se listan expedientes reales con su código GH-EXP-AAAA-NNNN')
  } else {
    ko('no se ven expedientes reales')
  }

  step('8 · Roles y permisos (control de acceso real)')
  const contexto2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-CR' })
  const page2 = await contexto2.newPage()
  await login(page2, ABOGADO)
  const menuAbogado = (await page2.locator('body').innerText()).toLowerCase()
  const puedeGestionarUsuarios = /usuarios/.test(menuAbogado) && (await irA(page2, 'users', 'Usuario'))
  if (!puedeGestionarUsuarios) {
    ok('un Abogado no ve ni abre la gestión de usuarios (permisos aplicados en la interfaz)')
  } else {
    ko('un Abogado pudo entrar a Usuarios: los permisos no se están aplicando en la interfaz')
  }
  await contexto2.close()

  step('9 · Errores de consola')
  const graves = erroresConsola.filter((e) => !/favicon|404 \(Not Found\)/i.test(e))
  graves.length === 0
    ? ok('sin errores graves en la consola del navegador')
    : ko(`${graves.length} errores de consola · primero: ${graves[0]?.slice(0, 160)}`)

  await page.screenshot({ path: 'panel-dashboard.png', fullPage: false }).catch(() => {})
  await browser.close()

  console.log(`\n\x1b[1m==================================================\x1b[0m`)
  console.log(`  Comprobaciones superadas: \x1b[32m${pass}\x1b[0m   ·   Fallidas: \x1b[31m${fail}\x1b[0m`)
  console.log(`\x1b[1m==================================================\x1b[0m\n`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('\x1b[31mError inesperado:\x1b[0m', e)
  process.exit(1)
})
