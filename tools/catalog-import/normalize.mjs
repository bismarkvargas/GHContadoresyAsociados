// Normaliza el catálogo crudo de Wix -> catálogo listo para seed
// Entrada: out/catalog.json   Salida: out/catalog.normalized.json  (+ resumen por consola)
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, 'out')
const raw = JSON.parse(readFileSync(resolve(OUT, 'catalog.json'), 'utf8'))

const SUBCATS = ['servicios-contables', 'servicios-legales', 'servicios-municipales', 'servicios-tributarios']

// Heurística de clasificación en español (Costa Rica) cuando el producto no aparece en subcategoría
const RULES = [
  { cat: 'servicios-tributarios', re: /tributar|declaraci|impuesto|d-1\d\d|d-10\d|renta|iva|valor agregado|dividendos|multa|rtbf|socios|perdidas|ganancias|capital|cierre fiscal|solidario|atv|criptogr/i },
  { cat: 'servicios-municipales', re: /municipal|patente|licores|estado de cuenta|pago de impuesto/i },
  { cat: 'servicios-legales', re: /legal|poder|poa|sugef|acam|suspensi|contrato|accionari|hechos convenidos|llave|póliza|poliza|ins\b|salud|meic|mag|ict|bancario|libros legales|notari|escritur|constituci/i },
  { cat: 'servicios-contables', re: /contab|estados financieros|factura|flujo|libros contables|flujo prospectivo|revisi[oó]n contable|liquidaci[oó]n laboral|cci?ss|planilla|estados de cuenta/i },
]

function classify(name) {
  for (const r of RULES) if (r.re.test(name)) return r.cat
  return 'servicios-contables'
}

// Imagen: quedarse con URL canónica (sin el sufijo duplicado del transform de Wix)
function canonicalImage(image) {
  let url = typeof image === 'string' ? image : image?.contentUrl
  if (!url) return null
  const m = url.match(/(https:\/\/static\.wixstatic\.com\/media\/[^/]+)/)
  return m ? `${m[1]}/v1/fit/w_1200,h_1200,q_85/file.webp` : url.replace(/\/v1\/.*$/, '')
}

function slugify(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

const categoryMeta = {
  'servicios-contables': { name: 'Servicios Contables', icon: 'calculator', order: 1, description: 'Contabilidad mensual, anual y trimestral, estados financieros, facturación electrónica y liquidaciones laborales.' },
  'servicios-legales': { name: 'Servicios Legales', icon: 'scale', order: 2, description: 'Poderes, contratos, composición accionaria, trámites ante SUGEF, ACAM, MEIC, MAG, ICT y Ministerio de Salud.' },
  'servicios-municipales': { name: 'Servicios Municipales', icon: 'building', order: 3, description: 'Patentes comerciales, licencias de licores y trámites municipales de principio a fin.' },
  'servicios-tributarios': { name: 'Servicios Tributarios', icon: 'receipt', order: 4, description: 'Declaraciones D-101, D-103, D-104, D-115, D-140, RTBF, impuestos y constancias ante la Administración Tributaria Virtual.' },
}

const products = raw.products.map((p) => {
  const pools = [p.categorySlug, ...(p.extraCategories || [])]
  const sub = pools.find((c) => SUBCATS.includes(c))
  const categorySlug = sub || classify(p.name)
  const description = (p.description || '').trim()
  const fallback = `${p.name}. Servicio profesional de GH Contadores y Asociados: gestión integral del trámite ante el ente correspondiente, revisión documental, presentación y seguimiento hasta la resolución. Incluye asesoría de un profesional asignado y acceso al expediente en línea.`
  return {
    slug: slugify(p.name),
    sku: `GH-${slugify(p.name).slice(0, 18).toUpperCase().replace(/-/g, '')}`,
    name: p.name.replace(/\s+/g, ' ').trim(),
    price: p.price,
    currency: p.currency || 'USD',
    categorySlug,
    categoryName: categoryMeta[categorySlug].name,
    shortDescription: (description || fallback).slice(0, 180),
    description: description || fallback,
    imageUrl: canonicalImage(p.image),
    isFeatured: /contabilidad mensual|patente comercial$|inscripci[oó]n tributaria|contabilidad anual|declaraci[oó]n impuestos/i.test(p.name),
    requiresCase: true,
    estimatedDays: null,
    sourceUrl: p.sourceUrl,
    oldCategorySlug: p.categorySlug,
    extraCategories: (p.extraCategories || []).filter(Boolean),
  }
})

// Deduplicar por slug (seguridad)
const bySlug = new Map()
for (const p of products) if (!bySlug.has(p.slug)) bySlug.set(p.slug, p)
const finalProducts = [...bySlug.values()]

const counts = {}
for (const p of finalProducts) counts[p.categorySlug] = (counts[p.categorySlug] || 0) + 1

const out = {
  source: raw.source,
  crawledAt: raw.crawledAt,
  baseCurrency: 'USD',
  categories: Object.entries(categoryMeta).map(([slug, m]) => ({
    slug, ...m, productCount: counts[slug] || 0,
  })).sort((a, b) => a.order - b.order),
  products: finalProducts,
}

writeFileSync(resolve(OUT, 'catalog.normalized.json'), JSON.stringify(out, null, 2), 'utf8')

console.log(`Productos normalizados: ${finalProducts.length}`)
for (const c of out.categories) console.log(`  ${c.slug.padEnd(24)} ${String(c.productCount).padStart(3)}  ${c.name}`)
console.log(`Destacados: ${finalProducts.filter((p) => p.isFeatured).length}`)
console.log(`Sin imagen: ${finalProducts.filter((p) => !p.imageUrl).length}`)
console.log(`Precio mín/máx: ${Math.min(...finalProducts.map((p) => p.price))} / ${Math.max(...finalProducts.map((p) => p.price))} USD`)
console.log(`-> ${resolve(OUT, 'catalog.normalized.json')}`)
