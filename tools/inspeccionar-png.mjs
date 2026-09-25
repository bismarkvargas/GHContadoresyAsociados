// Inspecciona un PNG: dimensiones, caja del contenido opaco y colores dominantes.
// Uso: node tools/inspeccionar-png.mjs <archivo.png>
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

const file = process.argv[2]
const buf = readFileSync(file)
let off = 8, width = 0, height = 0, colorType = 0
const idat = []
while (off < buf.length) {
  const len = buf.readUInt32BE(off)
  const type = buf.toString('ascii', off + 4, off + 8)
  const data = buf.subarray(off + 8, off + 8 + len)
  if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); colorType = data[9] }
  else if (type === 'IDAT') idat.push(data)
  else if (type === 'IEND') break
  off += 12 + len
}
const canales = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType]
const raw = inflateSync(Buffer.concat(idat))
const stride = width * canales
const plano = Buffer.alloc(height * stride)
let pos = 0
for (let y = 0; y < height; y++) {
  const f = raw[pos++]
  const linea = raw.subarray(pos, pos + stride); pos += stride
  const prev = y > 0 ? plano.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride)
  const cur = plano.subarray(y * stride, (y + 1) * stride)
  for (let x = 0; x < stride; x++) {
    const a = x >= canales ? cur[x - canales] : 0, b = prev[x], c = x >= canales ? prev[x - canales] : 0
    let v = linea[x]
    if (f === 1) v = (v + a) & 0xff
    else if (f === 2) v = (v + b) & 0xff
    else if (f === 3) v = (v + ((a + b) >> 1)) & 0xff
    else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff }
    cur[x] = v
  }
}

let minX = width, minY = height, maxX = -1, maxY = -1, opacos = 0
const colores = new Map()
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * canales
    const a = canales === 4 ? plano[i + 3] : canales === 2 ? plano[i + 1] : 255
    if (a < 40) continue
    opacos++
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
    const r = plano[i], g = canales >= 3 ? plano[i + 1] : plano[i], b = canales >= 3 ? plano[i + 2] : plano[i]
    const key = `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`
    colores.set(key, (colores.get(key) || 0) + 1)
  }
}
const pct = (n, d) => ((n / d) * 100).toFixed(1) + '%'
console.log(`${file}`)
console.log(`  tamaño ${width}x${height} · canales ${canales} · opacos ${opacos} (${pct(opacos, width * height)})`)
if (maxX >= 0) {
  console.log(`  contenido: ${maxX - minX + 1}x${maxY - minY + 1} px (x ${minX}-${maxX}, y ${minY}-${maxY})`)
  console.log(`  ocupacion: ${pct(maxX - minX + 1, width)} del ancho · ${pct(maxY - minY + 1, height)} del alto`)
}
const total = [...colores.values()].reduce((a, b) => a + b, 0) || 1
console.log('  colores:')
for (const [c, n] of [...colores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)) console.log(`    ${c} ${pct(n, total)}`)
