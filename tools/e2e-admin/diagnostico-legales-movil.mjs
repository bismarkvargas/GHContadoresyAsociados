// Comprobación puntual: las páginas legales en móvil (390 px) no desbordan y siguen legibles.
import { chromium } from '@playwright/test'

const BASE = (process.argv[2] ?? 'https://demostracion.es/ghcontadores/').replace(/\/?$/, '/')
const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: 'es-CR',
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
})

for (const ruta of ['privacidad', 'terminos']) {
  const page = await context.newPage()
  await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(500)

  const medidas = await page.evaluate(() => ({
    docScroll: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    articulo: Math.round(document.querySelector('article')?.getBoundingClientRect().width ?? 0),
    h1: document.querySelector('h1')?.getBoundingClientRect().width,
    enlacesIndice: document.querySelectorAll('nav[aria-labelledby="indice"] a').length,
    logoVisible: !!document.querySelector('header img')?.getBoundingClientRect().width,
  }))

  const desborda = medidas.docScroll > medidas.viewport + 1
  console.log(
    `/${ruta} · viewport ${medidas.viewport}px · documento ${medidas.docScroll}px · artículo ${medidas.articulo}px · ` +
      `${desborda ? '\x1b[31mDESBORDA\x1b[0m' : '\x1b[32msin desbordamiento\x1b[0m'} · ` +
      `índice ${medidas.enlacesIndice} anclas · logotipo ${medidas.logoVisible ? 'visible' : 'OCULTO'}`,
  )

  await page.screenshot({ path: `legales-${ruta}-movil.png`, fullPage: false })
  await page.close()
}

await browser.close()
