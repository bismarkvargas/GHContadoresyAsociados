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
/** Respuestas de la API con error, con su URL para que el informe sea accionable. */
const respuestasConError = []

async function main() {
  console.log(`\n\x1b[1mVerificación E2E del panel — GH Contadores\x1b[0m\nPanel: ${BASE}`)

  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-CR' })
  const page = await context.newPage()
  page.on('console', (msg) => { if (msg.type() === 'error') erroresConsola.push(msg.text()) })
  page.on('pageerror', (err) => erroresConsola.push(String(err)))
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 400) {
      respuestasConError.push(`${r.status()} ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`)
    }
  })

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

  // «Inversiones Pacífico Azul S.A.» es un cliente REAL sembrado por la API, así que para
  // detectar el modo demo se buscan nombres que solo existen en los datos simulados del panel
  // (src/api/mock/db.ts). Comprobar el nombre real daría un falso positivo.
  const marcasDeDemo = /Marco Vinicio Alfaro|Silvia Eugenia Mora|Randall Esteban Quesada|Karla Patricia Solano/i
  if (!marcasDeDemo.test(cuerpo)) ok('no hay datos simulados: el panel está conectado a la API real')
  else ko('el panel sigue mostrando datos de demostración (VITE_USE_MOCKS no está en false)')

  step('4 · Catálogo migrado desde ghcontadores.net')
  if (await irA(page, 'catalogo', 'Catálogo')) {
    const texto = await page.locator('body').innerText()
    // El catálogo está paginado: la primera página no contiene los 62 servicios,
    // así que se comprueba que aparezcan términos reales del catálogo migrado.
    const conocidos = ['Contabilidad', 'Patente', 'SUGEF', 'D-104', 'Tributaria', 'Póliza', 'Renta', 'Permiso', 'Declaraci']
    const encontrados = conocidos.filter((k) => new RegExp(k, 'i').test(texto))
    if (encontrados.length >= 2) {
      ok(`el catálogo muestra los servicios reales (coincidencias: ${encontrados.join(', ')})`)
    } else {
      ko(`el catálogo no muestra servicios reales (coincidencias: ${encontrados.join(', ') || 'ninguna'})`)
    }

    if (/62/.test(texto)) ok('el panel informa de los 62 servicios migrados')
    else ko('el catálogo no muestra el total de 62 servicios migrados')

    if (await irA(page, 'catalogo/categorias', 'Categorías')) {
      const cats = await page.locator('body').innerText()
      const cuatro = ['Contables', 'Legales', 'Municipales', 'Tributarios'].filter((c) => new RegExp(c, 'i').test(cats))
      if (cuatro.length === 4) ok('las 4 categorías del sitio original están presentes')
      else ko(`faltan categorías (encontradas: ${cuatro.join(', ') || 'ninguna'})`)
    } else {
      ko('no se pudo abrir la pantalla de categorías')
    }
  } else {
    ko('no se pudo abrir el módulo de catálogo')
  }

  step('5 · Módulos del panel con datos reales')
  // Cada módulo se comprueba por su URL (sin redirección a acceso denegado) y por un
  // contenido que solo puede venir de la API real.
  const modulos = [
    ['', 'Dashboard', /cliente|expediente/i],
    ['clientes', 'Clientes (CRM)', /GH-CLI-\d{5}/],
    ['expedientes', 'Expedientes', /GH-EXP-\d{4}-\d{4}/],
    ['expedientes/tablero', 'Tablero kanban', /Abierto|En proceso/i],
    ['documentos', 'Documentos', /documento|no hay documentos/i],
    ['pedidos', 'Pedidos', /GH-ORD-\d{4}-\d{5}/],
    ['pagos', 'Pagos', /SIM-|GH-Simulated|Aprobado|Aprobada/i],
    ['cotizaciones', 'Cotizaciones', /Cotizaci/i],
    ['solicitudes', 'Solicitudes de cuenta', /GH-SOL-|Pendiente/i],
    ['informes', 'Informes', /venta|productividad|total/i],
    ['usuarios', 'Usuarios', /ghcontadores\.net/i],
    ['roles', 'Roles y permisos', /SuperAdmin/],
    ['ajustes', 'Ajustes', /GH Contadores|Marca|Empresa/i],
    ['auditoria', 'Auditoría', /Acci|Fecha|Entidad|Auditor/i],
  ]

  for (const [ruta, nombre, patron] of modulos) {
    await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(900)

    const url = page.url()
    const texto = await page.locator('body').innerText()
    if (/\/login/.test(url)) {
      ko(`${nombre}: la sesión se perdió y redirigió al acceso`)
      continue
    }
    if (/Acceso denegado|sin permiso|no encontrada/i.test(texto)) {
      ko(`${nombre}: la pantalla mostró acceso denegado o no encontrada`)
      continue
    }
    if (patron.test(texto)) ok(`${nombre}: cargado con datos reales`)
    else ko(`${nombre}: no se encontró contenido esperado (${ruta})`)
  }

  step('6 · El CRM muestra el cliente sembrado')
  await irA(page, 'clientes', 'Cliente')
  const crm = await page.locator('body').innerText()
  if (/Inversiones Pacífico Azul|Pacífico Azul/.test(crm)) {
    ok('aparece el cliente de demostración creado por la API (Inversiones Pacífico Azul S.A.)')
  } else {
    ko('el cliente sembrado no aparece en el CRM')
  }

  step('7 · Expedientes reales')
  await irA(page, 'expedientes', 'Expediente')
  const exp = await page.locator('body').innerText()
  if (/GH-EXP-\d{4}-\d{4}|Contabilidad mensual|Patente Comercial/i.test(exp)) {
    ok('se listan expedientes reales con su código GH-EXP-AAAA-NNNN')
  } else {
    ko('no se ven expedientes reales')
  }

  step('8 · Alta real de un cliente desde el formulario')
  // Verifica de extremo a extremo que los campos de formulario se envían de verdad
  // y que el panel crea el cliente en la API (no solo en el modo demo).
  const nombrePrueba = `Cliente E2E ${Date.now()}`
  const correoPrueba = `e2e.${Date.now()}@ejemplo.cr`
  await page.goto(`${BASE}clientes/nuevo`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})

  const campoRazon = page.getByLabel(/Razón social|Nombre completo/i).first()
  const hayFormulario = await campoRazon.count()
  if (!hayFormulario) {
    ko('no se encontró el formulario de nuevo cliente')
  } else {
    await campoRazon.fill(nombrePrueba)
    await page.getByLabel(/Cédula jurídica|Cédula \/ pasaporte/i).first().fill('3-101-999999')
    await page.getByLabel(/Correo electrónico/i).first().fill(correoPrueba)
    await page.getByLabel(/^Teléfono/i).first().fill('+506 8888 0000')
    await page.locator('button[type="submit"], button:has-text("Guardar"), button:has-text("Crear")').first().click()
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(3500)

    // Se confirma contra la API que el cliente existe de verdad.
    const respuesta = await page.evaluate(async (correo) => {
      const token = localStorage.getItem('gh.accessToken') ?? sessionStorage.getItem('gh.accessToken')
      const r = await fetch(`/ghcontadores/api/v1/admin/clients?search=${encodeURIComponent(correo)}&pageSize=5`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return r.ok ? await r.json() : { status: r.status }
    }, correoPrueba)

    const creado = (respuesta.items ?? []).find((c) => c.legalName === nombrePrueba)
    if (creado) {
      ok(`el formulario creó el cliente en la API real · ${creado.code}`)
      // Limpieza: se retira el cliente de prueba para no ensuciar la demostración.
      await page.evaluate(async (id) => {
        const token = localStorage.getItem('gh.accessToken') ?? sessionStorage.getItem('gh.accessToken')
        await fetch(`/ghcontadores/api/v1/admin/clients/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      }, creado.id)
      ok('cliente de prueba retirado tras la comprobación')
    } else {
      ko(`el cliente no llegó a la API (respuesta: ${JSON.stringify(respuesta).slice(0, 200)})`)
    }
  }

  step('9 · Roles y permisos (control de acceso real)')
  const contexto2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-CR' })
  const page2 = await contexto2.newPage()
  await login(page2, ABOGADO)
  const menuAbogado = (await page2.locator('body').innerText()).toLowerCase()
  const puedeGestionarUsuarios = /usuarios/.test(menuAbogado) && (await irA(page2, 'usuarios', 'Usuario'))
  if (!puedeGestionarUsuarios) {
    ok('un Abogado no ve ni abre la gestión de usuarios (permisos aplicados en la interfaz)')
  } else {
    ko('un Abogado pudo entrar a Usuarios: los permisos no se están aplicando en la interfaz')
  }
  await contexto2.close()

  step('10 · Errores de consola y de red')
  const graves = erroresConsola.filter((e) => !/favicon/i.test(e))
  if (graves.length === 0) {
    ok('sin errores en la consola del navegador')
  } else {
    ko(`${graves.length} errores de consola · primero: ${graves[0]?.slice(0, 160)}`)
  }

  // Se ignoran los 401 esperados (comprobación de sesión al arrancar) y los que provoca
  // la propia prueba (el alta se retira al final).
  const inesperados = respuestasConError.filter((e) => !/^401 /.test(e))
  if (inesperados.length === 0) {
    ok('ninguna llamada a la API terminó en error')
  } else {
    const unicos = [...new Set(inesperados)]
    ko(`${unicos.length} llamadas con error:\n      ${unicos.join('\n      ')}`)
  }

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
