// ---------------------------------------------------------------------------
// Verificación de las PÁGINAS LEGALES PÚBLICAS del panel
//   · /privacidad  → Política de Privacidad
//   · /terminos    → Términos y Condiciones
//
// Comprueba lo que exige Google Play para declarar la URL de privacidad:
//   1. cargan SIN SESIÓN (no redirigen al login y no piden permisos);
//   2. muestran el contenido completo, con su índice de secciones y sus anclas;
//   3. cada una tiene su propio <title> y su <meta name="description">;
//   4. se ven bien en tema CLARO y OSCURO, con el logotipo correcto en cada uno;
//   5. la columna de lectura no pasa de 760 px (legibilidad).
//
// Uso:
//   node verificar-legales.mjs [URL_BASE]      (por defecto el panel en producción)
// ---------------------------------------------------------------------------
import { chromium } from '@playwright/test'

const BASE = (process.argv[2] ?? 'https://demostracion.es/ghcontadores/').replace(/\/?$/, '/')
const ANCHO_MAXIMO_LECTURA = 760

let pass = 0
let fail = 0
const ok = (m) => { pass++; console.log(`  \x1b[32m✔\x1b[0m ${m}`) }
const ko = (m) => { fail++; console.log(`  \x1b[31m✘\x1b[0m ${m}`) }
const step = (m) => console.log(`\n\x1b[1;36m${m}\x1b[0m`)

/** Secciones mínimas que debe contener cada documento (título visible). */
const DOCUMENTOS = [
  {
    ruta: 'privacidad',
    titulo: 'Política de Privacidad',
    tituloPestana: /Política de Privacidad/i,
    descripcion: /privacidad|datos personales/i,
    secciones: [
      'Quién trata sus datos',
      'Qué datos recogemos',
      'Para qué usamos los datos',
      'Base legal y tiempo de conservación',
      'Con quién se comparten',
      'Cómo protegemos la información',
      'Sus derechos y cómo ejercerlos',
      'Eliminación de la cuenta y de los datos',
      'Menores de edad',
      'Cambios en esta política',
      'Cómo contactarnos',
    ],
    textos: [
      /documentos que sube a su expediente/i,
      /tokens de notificación/i,
      /SUGEF/,
      /No se venden datos personales/i,
      /enlaces firmados con caducidad/i,
      /Eliminar mi cuenta/i,
      /gustavo\.ghcontadores@outlook\.com/,
      /pedidos@ghcontadores\.net/,
      /\+506 2653 6634/,
    ],
  },
  {
    ruta: 'terminos',
    titulo: 'Términos y Condiciones',
    tituloPestana: /Términos y Condiciones/i,
    descripcion: /términos|condiciones/i,
    secciones: [
      'Qué regulan estos términos',
      'Descripción del servicio',
      'Contratación de servicios y pagos',
      'Precios, impuestos y facturación',
      'Formas de pago',
      'Obligaciones del cliente',
      'Trámites ante terceros y plazos',
      'Cancelación y reembolsos',
      'Propiedad de los documentos',
      'Limitación de responsabilidad',
      'Ley aplicable y resolución de conflictos',
    ],
    textos: [
      /dólares de los Estados Unidos de América \(USD\)/i,
      /la decisión la toma el ente/i,
      /documentos legítimos y vigentes/i,
      /reembolso proporcional/i,
      /leyes de la República de Costa Rica/i,
    ],
  },
]

/** Fija el tema antes de que arranque la aplicación (el provider lo lee de localStorage). */
async function contexto(page, tema) {
  await page.addInitScript((t) => {
    try { localStorage.setItem('gh.theme', t) } catch { /* almacenamiento no disponible */ }
  }, tema)
}

async function abrir(page, ruta) {
  const respuesta = await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(600)
  return respuesta
}

/** ¿La página es el panel (login/shell) en lugar del documento legal? */
async function esPanel(page) {
  if (/\/login\/?$/.test(page.url())) return true
  const texto = await page.locator('body').innerText()
  return /Acceso restringido al personal de la firma/i.test(texto)
}

async function main() {
  console.log(`\n\x1b[1mVerificación de las páginas legales públicas — GH Contadores\x1b[0m\nBase: ${BASE}`)

  const browser = await chromium.launch()
  const erroresConsola = []
  const respuestasConError = []

  for (const doc of DOCUMENTOS) {
    step(`Página /${doc.ruta} — carga pública, contenido y anclas`)

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-CR' })
    const page = await context.newPage()
    page.on('console', (m) => { if (m.type() === 'error') erroresConsola.push(`/${doc.ruta}: ${m.text()}`) })
    page.on('pageerror', (e) => erroresConsola.push(`/${doc.ruta}: ${String(e)}`))
    page.on('response', (r) => {
      if (r.status() >= 400) respuestasConError.push(`${r.status()} ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`)
    })

    // --- 1. Carga sin sesión ------------------------------------------------
    const respuesta = await abrir(page, doc.ruta)
    respuesta?.status() === 200
      ? ok(`responde HTTP 200 en /${doc.ruta}`)
      : ko(`respondió HTTP ${respuesta?.status()} en /${doc.ruta}`)

    const panel = await esPanel(page)
    !panel
      ? ok('sin sesión no redirige al login ni muestra el panel (ruta pública)')
      : ko(`la ruta /${doc.ruta} cayó en el panel o en el login: ${page.url()}`)

    const texto = await page.locator('body').innerText()

    // --- 2. Título y jerarquía ---------------------------------------------
    const h1 = (await page.locator('h1').first().innerText().catch(() => '')).trim()
    h1 === doc.titulo
      ? ok(`el <h1> es «${h1}»`)
      : ko(`el <h1> es «${h1}» en lugar de «${doc.titulo}»`)

    const titulo = await page.title()
    doc.tituloPestana.test(titulo)
      ? ok(`<title> propio: «${titulo}»`)
      : ko(`<title> inesperado: «${titulo}»`)

    const meta = await page.getAttribute('meta[name="description"]', 'content')
    meta && doc.descripcion.test(meta)
      ? ok(`<meta name="description"> propio (${meta.length} caracteres)`)
      : ko(`<meta name="description"> ausente o incorrecta: ${meta ? `«${meta.slice(0, 80)}…»` : 'no encontrada'}`)

    if (/Entrada en vigor/i.test(texto) && /Última actualización/i.test(texto)) {
      ok('muestra «Entrada en vigor» y «Última actualización»')
    } else {
      ko('no muestra las fechas de entrada en vigor / última actualización')
    }

    // --- 3. Índice de secciones + anclas internas ---------------------------
    const indice = await page.locator('nav[aria-labelledby="indice"] a').count()
    indice >= doc.secciones.length
      ? ok(`índice de secciones con ${indice} enlaces internos`)
      : ko(`el índice solo tiene ${indice} enlaces (se esperaban al menos ${doc.secciones.length})`)

    const faltantes = doc.secciones.filter((s) => !new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(texto))
    faltantes.length === 0
      ? ok(`las ${doc.secciones.length} secciones esperadas están en el documento`)
      : ko(`faltan secciones: ${faltantes.join(' · ')}`)

    // Las anclas del índice deben apuntar a secciones existentes.
    const anclas = await page.$$eval('nav[aria-labelledby="indice"] a', (as) => as.map((a) => a.getAttribute('href')))
    const rotas = []
    for (const href of anclas) {
      if (!href?.startsWith('#')) { rotas.push(String(href)); continue }
      const existe = await page.locator(`[id="${href.slice(1)}"]`).count()
      if (!existe) rotas.push(href)
    }
    rotas.length === 0
      ? ok(`las ${anclas.length} anclas del índice apuntan a secciones existentes`)
      : ko(`anclas rotas: ${rotas.join(', ')}`)

    // --- 4. Contenido exigido por el documento ------------------------------
    const sinTexto = doc.textos.filter((re) => !re.test(texto))
    sinTexto.length === 0
      ? ok(`${doc.textos.length} contenidos obligatorios presentes (datos, contactos, derechos…)`)
      : ko(`faltan contenidos obligatorios: ${sinTexto.map(String).join(' · ')}`)

    // --- 5. Marca y contacto ------------------------------------------------
    const logo = page.locator('header img').first()
    const logoVisible = await logo.isVisible().catch(() => false)
    const logoSrc = (await logo.getAttribute('src')) ?? ''
    logoVisible && /\/ghcontadores\/brand\/logo-horizontal-(azul|blanco)\.png$/.test(logoSrc)
      ? ok(`logotipo de marca presente (${logoSrc.replace(/^https?:\/\/[^/]+/, '')})`)
      : ko(`logotipo ausente o con ruta inesperada: «${logoSrc}»`)

    const franja = await page.$eval('.gh-brand-strip', (el) => getComputedStyle(el).backgroundColor).catch(() => '')
    franja.replace(/\s/g, '') === 'rgb(196,216,45)'
      ? ok(`franja superior lima de marca presente (${franja})`)
      : ko(`la franja de marca no tiene el lima corporativo: ${franja || 'no encontrada'}`)

    const fuente = await page.$eval('body', (el) => getComputedStyle(el).fontFamily)
    const esMontserrat = new RegExp('Montserrat', 'i').test(fuente)
    esMontserrat
      ? ok(`tipografía corporativa aplicada (${fuente.split(',')[0]})`)
      : ko(`la tipografía no es Montserrat: ${fuente}`)

    if (/Ruta Nacional Secundaria 155, Huacas, Santa Cruz, Guanacaste, Costa Rica/.test(texto)) {
      ok('el pie muestra la dirección real de la firma')
    } else {
      ko('el pie no muestra la dirección de la firma')
    }

    const volver = await page.getByRole('link', { name: /Volver al inicio/i }).count()
    volver > 0 ? ok('enlace «Volver al inicio» presente') : ko('falta el enlace «Volver al inicio»')

    // --- 6. Columna de lectura cómoda (≤ 760 px) ----------------------------
    const ancho = await page.locator('article').first().evaluate((el) => el.getBoundingClientRect().width)
    ancho <= ANCHO_MAXIMO_LECTURA + 1
      ? ok(`columna de lectura de ${Math.round(ancho)} px (máx. ${ANCHO_MAXIMO_LECTURA} px)`)
      : ko(`la columna de lectura mide ${Math.round(ancho)} px, más de ${ANCHO_MAXIMO_LECTURA} px`)

    await context.close()
  }

  // -------------------------------------------------------------------------
  step('Tema claro y oscuro en las dos páginas')
  // -------------------------------------------------------------------------
  for (const tema of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-CR' })
    const page = await context.newPage()

    for (const doc of DOCUMENTOS) {
      const pagina = await context.newPage()
      await contexto(pagina, tema)
      await abrir(pagina, doc.ruta)

      const temaAplicado = await pagina.evaluate(() => document.documentElement.dataset.theme)
      const fondo = await pagina.$eval('body', (el) => getComputedStyle(el).backgroundColor)
      const colorTexto = await pagina.$eval('body', (el) => getComputedStyle(el).color)
      const contrasteOk = fondo !== colorTexto
      const logoSrc = (await pagina.locator('header img').first().getAttribute('src')) ?? ''
      const logoEsperado = tema === 'dark' ? 'logo-horizontal-blanco.png' : 'logo-horizontal-azul.png'

      if (temaAplicado === tema && contrasteOk && logoSrc.endsWith(logoEsperado)) {
        ok(`/${doc.ruta} en tema ${tema}: fondo ${fondo}, texto ${colorTexto}, logotipo ${logoEsperado}`)
      } else {
        ko(`/${doc.ruta} en tema ${tema}: tema=${temaAplicado}, fondo=${fondo}, texto=${colorTexto}, logo=${logoSrc.split('/').pop()}`)
      }

      await pagina.screenshot({
        path: `legales-${doc.ruta}-${tema}.png`,
        fullPage: false,
      }).catch(() => {})

      await pagina.close()
    }

    await page.close()
    await context.close()
  }

  // -------------------------------------------------------------------------
  step('Enlaces hacia las páginas legales desde el panel (con sesión)')
  // -------------------------------------------------------------------------
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-CR' })
  const page = await context.newPage()
  await abrir(page, '')

  const email = page.locator('input[type="email"]').first()
  const hayLogin = await email.count()
  if (!hayLogin) {
    ko(`la pantalla de acceso no apareció (URL: ${page.url()})`)
  } else {
    await email.fill('admin@ghcontadores.net')
    await page.locator('input[type="password"]').first().fill('Gh.Admin2026')
    await page.locator('button[type="submit"]').first().click()
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(2500)

    const urlTrasLogin = page.url()
    const enlaces = await page
      .locator('footer a[href$="/privacidad"], footer a[href$="/terminos"]')
      .count()
    enlaces >= 2
      ? ok(`el pie del panel enlaza Privacidad y Términos (${enlaces} enlaces) · ${urlTrasLogin.replace(/^https?:\/\/[^/]+/, '')}`)
      : ko(`el pie del panel no enlaza las páginas legales (encontrados: ${enlaces})`)
  }
  await context.close()

  const gravesConsola = erroresConsola.filter((e) => !/favicon/i.test(e))
  gravesConsola.length === 0
    ? ok('sin errores en la consola del navegador')
    : ko(`${gravesConsola.length} errores de consola · primero: ${gravesConsola[0]?.slice(0, 200)}`)

  const gravesRed = [...new Set(respuestasConError)]
  gravesRed.length === 0
    ? ok('ninguna petición terminó con error (4xx/5xx)')
    : ko(`${gravesRed.length} respuestas con error:\n      ${gravesRed.join('\n      ')}`)

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
