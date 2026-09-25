/**
 * Comprueba, por hash SHA-256, que el código publicado en GitHub es exactamente el
 * que tengo en el árbol de trabajo local (evita depender de inspecciones de texto
 * minificado).
 *
 *   node tools/verificar-publicado.mjs
 */
import fs from 'node:fs'
import crypto from 'node:crypto'

const REPO = 'bismarkvargas/GHContadoresyAsociados'
const RAMA = 'main'

const archivos = [
  'admin-web/src/App.tsx',
  'admin-web/src/components/layout/NotificationBell.tsx',
  'admin-web/src/hooks/useApi.ts',
  'admin-web/src/lib/format.ts',
  'admin-web/src/pages/clients/ClientNewPage.tsx',
  'admin-web/src/pages/clients/ClientDetailPage.tsx',
  'admin-web/src/pages/cases/CaseDetailPage.tsx',
  'admin-web/src/pages/orders/OrderDetailPage.tsx',
  'admin-web/src/components/ui/index.tsx',
  'admin-web/src/lib/zod-es.ts',
  'admin-web/src/api/normalize.ts',
  'admin-web/src/pages/LoginPage.tsx',
]

const sha = (contenido) => crypto.createHash('sha256').update(contenido).digest('hex').slice(0, 12)

let iguales = 0
let distintos = 0

for (const archivo of archivos) {
  const local = fs.readFileSync(archivo)
  const url = `https://raw.githubusercontent.com/${REPO}/${RAMA}/${archivo}`
  let remoto = null
  try {
    const r = await fetch(url)
    remoto = r.ok ? Buffer.from(await r.arrayBuffer()) : null
  } catch {
    remoto = null
  }
  if (!remoto) {
    console.log(`??  ${archivo} (no se pudo leer de GitHub)`)
    continue
  }
  const a = sha(local)
  const b = sha(remoto)
  if (a === b) {
    iguales += 1
    console.log(`OK  ${archivo}  (${a})`)
  } else {
    distintos += 1
    console.log(`XX  ${archivo}  local ${a} ≠ github ${b}  (local ${local.length} B / github ${remoto.length} B)`)
  }
}

console.log(`\nidénticos: ${iguales} · distintos: ${distintos}`)
process.exit(distintos === 0 ? 0 : 1)
