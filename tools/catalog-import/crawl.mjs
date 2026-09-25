// Crawler del catálogo real de https://www.ghcontadores.net (Wix)
// Extrae categorías, productos, precios, descripciones e imágenes.
// Salida: ../catalog-import/out/catalog.json
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, 'out')
mkdirSync(OUT, { recursive: true })

const BASE = 'https://www.ghcontadores.net'
const CATEGORIES = [
  { slug: 'servicios', name: 'Servicios', url: `${BASE}/category/servicios` },
  { slug: 'servicios-contables', name: 'Servicios Contables', url: `${BASE}/category/servicios-contables` },
  { slug: 'servicios-legales', name: 'Servicios Legales', url: `${BASE}/category/servicios-legales` },
  { slug: 'servicios-municipales', name: 'Servicios Municipales', url: `${BASE}/category/servicios-municipales` },
  { slug: 'servicios-tributarios', name: 'Servicios Tributarios', url: `${BASE}/category/servicios-tributarios` },
]

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'

async function get(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'es-ES,es;q=0.9' } })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return await r.text()
    } catch (e) {
      if (i === 2) { console.error('FAIL', url, e.message); return '' }
      await new Promise((r) => setTimeout(r, 800 * (i + 1)))
    }
  }
}

function decode(s) {
  return String(s ?? '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ')
    .replace(/&Aacute;/g, 'Á').replace(/&Eacute;/g, 'É').replace(/&Iacute;/g, 'Í')
    .replace(/&Oacute;/g, 'Ó').replace(/&Uacute;/g, 'Ú').replace(/&Ntilde;/g, 'Ñ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/\s+/g, ' ')
    .trim()
}

function stripTags(html) {
  return decode(String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/** Convierte slug de URL a nombre legible */
function slugToTitle(slug) {
  return decodeURIComponent(slug)
    .split('-')
    .map((w) => (w.length <= 2 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

/** Extrae URLs de producto (paginando) de una página de categoría */
async function productLinksFromCategory(cat) {
  const found = new Map()
  let url = cat.url
  for (let page = 1; page <= 6; page++) {
    const html = await get(url)
    if (!html) break
    for (const m of html.matchAll(/href="(?:https:\/\/www\.ghcontadores\.net)?(\/product-page\/[^"#?]+)"/g)) {
      const href = decodeURIComponent(m[1])
      found.set(href, `${BASE}${m[1]}`)
    }
    const next = html.match(/href="([^"]*\?page=\d+)"[^>]*>\s*(?:<[^>]+>\s*)*?(?:Next|Siguiente)/i)
      || html.match(/aria-label="Next page"[^>]*href="([^"]+)"/i)
    if (next) {
      const nextUrl = next[1].startsWith('http') ? next[1] : `${BASE}${next[1]}`
      if (nextUrl === url) break
      url = nextUrl
      continue
    }
    const pageNum = new RegExp(`page=${page + 1}`)
    if (pageNum.test(html)) { url = `${cat.url}?page=${page + 1}`; continue }
    break
  }
  return [...found.values()]
}

function parseProduct(html, url, category) {
  const slug = decodeURIComponent(url.split('/product-page/')[1] || '')
  const jsonLd = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => { try { return JSON.parse(m[1].trim()) } catch { return null } })
    .filter(Boolean)
  const flat = jsonLd.flatMap((j) => (Array.isArray(j) ? j : [j]))
  const product = flat.find((j) => j && (j['@type'] === 'Product' || j['@type'] === 'IndividualProduct'))
  const breadcrumb = flat.find((j) => j && j['@type'] === 'BreadcrumbList')

  let name = product?.name ? decode(product.name) : ''
  if (!name) {
    const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    name = t ? decode(t[1].replace(/\s*\|.*$/, '')) : slugToTitle(slug)
  }
  name = decode(name)

  const offers = Array.isArray(product?.offers) ? product.offers[0] : product?.offers
  let price = null, currency = 'DOP'
  if (offers?.price) { price = Number(String(offers.price).replace(/[^\d.]/g, '')) }
  if (offers?.priceCurrency) currency = offers.priceCurrency
  if (!price) {
    const p = html.match(/(?:RD\$|DOP|\$)\s?([\d,]+(?:\.\d{2})?)/)
    if (p) price = Number(p[1].replace(/,/g, ''))
  }
  if (!price && product?.offers?.lowPrice) price = Number(product.offers.lowPrice)

  const description = decode(product?.description || '')
  const image = product?.image
    ? (Array.isArray(product.image) ? product.image[0] : product.image)
    : (html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i)?.[1] || null)

  const catFromBreadcrumb = breadcrumb?.itemListElement
    ?.map((i) => decode(i.name))
    .filter((n) => n && !/^(home|inicio)$/i.test(n)) || []

  // Texto visible como respaldo de descripción
  let bodyText = ''
  if (!description) {
    const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0] || html
    bodyText = stripTags(main).slice(0, 1200)
  }

  return {
    slug,
    name,
    price,
    currency,
    categorySlug: category.slug,
    categoryName: category.name,
    breadcrumb: catFromBreadcrumb,
    description: description || null,
    bodyText: bodyText || null,
    image,
    sourceUrl: url,
  }
}

const catalog = { source: BASE, crawledAt: new Date().toISOString(), categories: [], products: [] }
const seen = new Set()

for (const cat of CATEGORIES) {
  process.stdout.write(`\n== CATEGORÍA ${cat.name} (${cat.url})\n`)
  const links = await productLinksFromCategory(cat)
  console.log(`   productos enlazados: ${links.length}`)
  let catProducts = 0
  for (const link of links) {
    if (seen.has(link)) { // ya visto en otra categoría: se añade la relación
      const p = catalog.products.find((x) => x.sourceUrl === link)
      if (p && !p.extraCategories.includes(cat.slug)) p.extraCategories.push(cat.slug)
      continue
    }
    seen.add(link)
    const html = await get(link)
    if (!html) continue
    const p = { ...parseProduct(html, link, cat), extraCategories: [] }
    catalog.products.push(p)
    catProducts++
    console.log(`   · ${p.name} -> ${p.price ?? 'sin precio'} ${p.currency}`)
    await new Promise((r) => setTimeout(r, 250))
  }
  catalog.categories.push({ slug: cat.slug, name: cat.name, url: cat.url, count: catProducts })
}

writeFileSync(resolve(OUT, 'catalog.json'), JSON.stringify(catalog, null, 2), 'utf8')
console.log(`\nTOTAL productos: ${catalog.products.length}`)
console.log(`Guardado en ${resolve(OUT, 'catalog.json')}`)
