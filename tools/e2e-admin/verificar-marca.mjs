// Verifica la identidad corporativa y el switch de registro en un navegador real
// (modo mock, que se ve igual que producción porque los tokens son los mismos).
//
//   node tools/e2e-admin/verificar-marca.mjs [URL]
import { chromium } from '@playwright/test'

const BASE = (process.argv[2] ?? 'http://127.0.0.1:5173/ghcontadores/').replace(/\/?$/, '/')
const ADMIN = { email: 'admin@ghcontadores.net', password: 'Gh.Admin2026' }

let pass = 0
let fail = 0
const ok = (m) => { pass++; console.log(`  \x1b[32m✔\x1b[0m ${m}`) }
const ko = (m) => { fail++; console.log(`  \x1b[31m✘\x1b[0m ${m}`) }
const step = (m) => console.log(`\n\x1b[1;36m${m}\x1b[0m`)

const AZUL = 'rgb(30, 43, 88)'
const LIMA = 'rgb(196, 216, 45)'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'es-CR' })

const fallos404 = []
page.on('response', (r) => {
  if (r.status() >= 400) fallos404.push(`${r.status()} ${r.url()}`)
})

/* 1 · Login: logotipo, franja lima y Montserrat */
step('1 · Login con la identidad corporativa')
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForLoadState('networkidle').catch(() => {})
await page.waitForTimeout(1200)

const logoLogin = page.locator('img[src*="logo-horizontal-blanco"]')
if (await logoLogin.count()) {
  const caja = await logoLogin.first().boundingBox()
  const natural = await logoLogin.first().evaluate((el) => ({ w: el.naturalWidth, h: el.naturalHeight, alt: el.alt }))
  if (caja && caja.width > 100 && natural.w > 0) {
    ok(`el logotipo horizontal del login carga (${Math.round(caja.width)}×${Math.round(caja.height)} px, natural ${natural.w}×${natural.h})`)
  } else {
    ko('el logotipo del login no carga (¿404?)')
  }
  natural.alt?.toLowerCase().includes('gh') ? ok(`el logotipo tiene alt descriptivo: «${natural.alt}»`) : ko(`alt poco descriptivo: «${natural.alt}»`)
} else {
  ko('no se encontró el logotipo horizontal blanco en el login')
}

const franjaLogin = await page.locator('.gh-brand-strip').first().evaluate((el) => {
  const s = getComputedStyle(el)
  return { alto: s.height, color: s.backgroundColor, posicion: s.position }
}).catch(() => null)
if (franjaLogin && franjaLogin.alto === '4px' && franjaLogin.color === LIMA) {
  ok(`franja superior lima de 4 px en el login (${franjaLogin.color})`)
} else {
  ko(`franja del login incorrecta: ${JSON.stringify(franjaLogin)}`)
}

const fuenteLogin = await page.evaluate(() => getComputedStyle(document.body).fontFamily)
if (/Montserrat/i.test(fuenteLogin)) ok(`Montserrat aplicada en el login: ${fuenteLogin.split(',')[0]}`)
else ko(`la fuente del cuerpo no es Montserrat: ${fuenteLogin}`)

const cargada = await page.evaluate(async () => {
  await document.fonts.ready
  return {
    montserrat: document.fonts.check('600 16px Montserrat'),
    fuentes: [...document.fonts].filter((f) => f.family.includes('Montserrat')).map((f) => `${f.family} ${f.weight}`),
  }
})
if (cargada.montserrat) ok(`la fuente Montserrat está cargada (${cargada.fuentes.length} pesos declarados)`)
else ko('Montserrat no está disponible en el navegador')

const meta = await page.locator('meta[name="theme-color"]').getAttribute('content').catch(() => null)
if (meta?.toUpperCase() === '#1E2B58') ok(`meta theme-color = ${meta}`)
else ko(`meta theme-color inesperado: ${meta}`)

/* 2 · Shell: azul marino + franja lima + logotipo */
step('2 · Shell autenticado')
await page.locator('input[type="email"]').first().fill(ADMIN.email)
await page.locator('input[type="password"]').first().fill(ADMIN.password)
await page.locator('button[type="submit"]').first().click()
await page.waitForTimeout(4000)

const franjaShell = await page.locator('.gh-brand-strip').first().evaluate((el) => {
  const s = getComputedStyle(el)
  return { alto: s.height, color: s.backgroundColor }
}).catch(() => null)
if (franjaShell && franjaShell.alto === '4px' && franjaShell.color === LIMA) {
  ok(`franja superior lima en el shell (${franjaShell.color})`)
} else {
  ko(`franja del shell incorrecta: ${JSON.stringify(franjaShell)}`)
}

const sidebar = await page.locator('aside').first().evaluate((el) => getComputedStyle(el).backgroundColor)
if (sidebar === AZUL) ok(`sidebar en azul marino (${sidebar})`)
else ko(`sidebar con color inesperado: ${sidebar}`)

const logoShell = page.locator('aside img[src*="logo-horizontal-blanco"], aside img[src*="icono-azul"]')
if (await logoShell.count()) {
  const natural = await logoShell.first().evaluate((el) => ({ w: el.naturalWidth, alt: el.alt }))
  natural.w > 0 ? ok(`logotipo del sidebar carga (natural ${natural.w}px)`) : ko('el logotipo del sidebar no carga')
} else {
  ko('no hay logotipo en el sidebar')
}

const indicador = await page.locator('aside a[aria-current="page"] span.bg-accent').first().count()
indicador > 0 ? ok('la sección activa del menú tiene el indicador lima') : ko('no se ve el indicador lima de la sección activa')

const botonPrimario = await page.locator('a[href$="/clientes/nuevo"] button').first().evaluate((el) => {
  const s = getComputedStyle(el)
  return { fondo: s.backgroundColor, texto: s.color }
}).catch(() => null)
if (botonPrimario) {
  botonPrimario.fondo === AZUL && /255, 255, 255/.test(botonPrimario.texto)
    ? ok('los botones primarios son azul marino con texto blanco')
    : ko(`botón primario con colores inesperados: ${JSON.stringify(botonPrimario)}`)
}

const variables = await page.evaluate(() => {
  const s = getComputedStyle(document.documentElement)
  const leer = (n) => s.getPropertyValue(n).trim()
  return {
    primary: leer('--gh-primary'),
    accent: leer('--gh-accent'),
    danger: leer('--gh-danger'),
    ink: leer('--gh-ink'),
  }
})
variables.primary.toUpperCase() === '#1E2B58' && variables.accent.toUpperCase() === '#C4D82D' && variables.danger.toUpperCase() === '#C0392B'
  ? ok(`tokens correctos: primary ${variables.primary}, accent ${variables.accent}, danger ${variables.danger}`)
  : ko(`tokens inesperados: ${JSON.stringify(variables)}`)

/* 3 · Switch de registro */
step('3 · Switch de modo de registro en Ajustes')
await page.goto(`${BASE}ajustes`, { waitUntil: 'domcontentloaded' })
await page.waitForLoadState('networkidle').catch(() => {})
await page.waitForTimeout(1500)

await page.getByRole('button', { name: /Registro de clientes/i }).first().click()
await page.waitForTimeout(1200)

const interruptor = page.getByRole('switch', { name: /Registro automático de clientes/i }).first()
if (await interruptor.count()) {
  const antes = await interruptor.getAttribute('aria-checked')
  ok(`el switch existe (estado inicial: ${antes === 'true' ? 'automático' : 'requiere aprobación'})`)
  await interruptor.click()
  await page.waitForTimeout(2500)
  const despues = await interruptor.getAttribute('aria-checked')
  despues !== antes ? ok(`el switch cambió a ${despues === 'true' ? 'automático' : 'requiere aprobación'}`) : ko('el switch no cambió de estado')

  // Persistencia: se recarga la página y se comprueba el valor guardado.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await page.getByRole('button', { name: /Registro de clientes/i }).first().click()
  await page.waitForTimeout(1500)
  const persistido = await page.getByRole('switch', { name: /Registro automático de clientes/i }).first().getAttribute('aria-checked')
  persistido === despues ? ok('el valor del switch persiste tras recargar (se guardó en la API)') : ko(`el valor no persistió (${despues} → ${persistido})`)

  const aviso = await page.locator('body').innerText()
  if (/Registro automático|Requiere aprobación/i.test(aviso)) ok('la pantalla explica el modo activo')
  else ko('no se explica el modo activo')

  // Se restaura el modo de aprobación.
  if (persistido === 'true') {
    await page.getByRole('switch', { name: /Registro automático de clientes/i }).first().click()
    await page.waitForTimeout(2000)
    ok('modo restaurado a «Requiere aprobación»')
  }
} else {
  ko('no se encontró el switch de registro')
}

/* 4 · Modo oscuro */
step('4 · Tema oscuro')
await page.getByRole('button', { name: /tema oscuro/i }).first().click()
await page.waitForTimeout(1200)
const oscuro = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--gh-accent').trim())
oscuro ? ok(`el tema oscuro define el acento lima (${oscuro})`) : ko('el tema oscuro no define el acento')
const franjaOscura = await page.locator('.gh-brand-strip').first().evaluate((el) => getComputedStyle(el).backgroundColor)
franjaOscura === LIMA ? ok('la franja lima se mantiene en tema oscuro') : ko(`franja en tema oscuro: ${franjaOscura}`)
await page.getByRole('button', { name: /tema claro/i }).first().click()
await page.waitForTimeout(800)

/* 5 · Recursos */
step('5 · Recursos de marca')
const graves = fallos404.filter((f) => !/favicon\.ico/.test(f))
graves.length === 0 ? ok('sin recursos 404 (fuentes y logotipos OK)') : ko(`recursos con error: ${graves.slice(0, 4).join(' | ')}`)

await browser.close()
console.log(`\n  Superadas: \x1b[32m${pass}\x1b[0m · Fallidas: \x1b[31m${fail}\x1b[0m\n`)
process.exit(fail === 0 ? 0 : 1)
