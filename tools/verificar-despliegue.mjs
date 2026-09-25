/**
 * Compara el bundle servido en producción con el compilado localmente (SHA-256),
 * para demostrar que lo desplegado es exactamente este código.
 *
 *   node tools/verificar-despliegue.mjs
 */
import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'

const BASE = 'https://demostracion.es/ghcontadores/'
const dirLocal = 'admin-web/dist/assets'

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex')

const index = await (await fetch(BASE)).text()
const enIndex = [...index.matchAll(/assets\/([A-Za-z0-9._-]+\.(?:js|css))/g)].map((m) => m[1])
// Los chunks con carga diferida no aparecen en el index: se comparan todos los del dist.
const enDisco = fs.readdirSync(dirLocal).filter((f) => /\.(js|css)$/.test(f))
const chunks = [...new Set([...enIndex, ...enDisco])].sort()

let identicos = 0
let distintos = 0
let ausentes = 0

for (const chunk of chunks) {
  const localPath = path.join(dirLocal, chunk)
  if (!fs.existsSync(localPath)) {
    ausentes += 1
    console.log(`??  ${chunk} (no está en dist local)`)
    continue
  }
  const r = await fetch(`${BASE}assets/${chunk}`)
  const remoto = Buffer.from(await r.arrayBuffer())
  const local = fs.readFileSync(localPath)
  if (sha(remoto) === sha(local)) {
    identicos += 1
  } else {
    distintos += 1
    console.log(`XX  ${chunk}  local ${sha(local).slice(0, 12)} ≠ servidor ${sha(remoto).slice(0, 12)}`)
  }
}

console.log(`\nassets comparados: ${chunks.length} (referenciados en el index: ${enIndex.length})`)
console.log(`idénticos: ${identicos} · distintos: ${distintos} · no presentes en dist: ${ausentes}`)

const indiceLocal = fs.readFileSync('admin-web/dist/index.html', 'utf8')
const mismoIndex = indiceLocal.replace(/\s+/g, '') === index.replace(/\s+/g, '')
console.log(`index.html idéntico: ${mismoIndex ? 'SÍ' : 'NO'}`)

process.exit(distintos === 0 && ausentes === 0 ? 0 : 1)
