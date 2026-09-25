// Analiza la forma de un PNG con transparencia: caja envolvente del contenido,
// porcentaje de cobertura y colores reales (ignorando lo transparente).
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

const file = process.argv[2]
const buf = readFileSync(file)
let off = 8, width = 0, height = 0, bitDepth = 0, colorType = 0
const idat = []
while (off < buf.length) {
  const len = buf.readUInt32BE(off)
  const type = buf.toString('ascii', off + 4, off + 8)
  const data = buf.subarray(off + 8, off + 8 + len)
  if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9] }
  else if (type === 'IDAT') idat.push(data)
  else if (type === 'IEND') break
  off += 12 + len
}

const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType]
const raw = inflateSync(Buffer.concat(idat))
const bpp = channels, stride = width * bpp
const out = Buffer.alloc(height * stride)
let pos = 0
for (let y = 0; y < height; y++) {
  const f = raw[pos++]
  const line = raw.subarray(pos, pos + stride); pos += stride
  const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride)
  const cur = out.subarray(y * stride, (y + 1) * stride)
  for (let x = 0; x < stride; x++) {
    const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0
    let v = line[x]
    if (f === 1) v = (v + a) & 0xff
    else if (f === 2) v = (v + b) & 0xff
    else if (f === 3) v = (v + ((a + b) >> 1)) & 0xff
    else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff }
    cur[x] = v
  }
}

const tieneAlpha = bpp === 4
let minX = width, minY = height, maxX = -1, maxY = -1, opacos = 0
const colores = new Map()
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = y * stride + x * bpp
    const a = tieneAlpha ? out[i + 3] : 255
    if (a < 40) continue
    opacos++
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
    const key = `#${[out[i], out[i + 1], out[i + 2]].map((n) => n.toString(16).padStart(2, '0')).join('')}`
    colores.set(key, (colores.get(key) || 0) + 1)
  }
}

const pct = (n, d) => `${((n / d) * 100).toFixed(1)}%`
console.log(`Archivo: ${file}`)
console.log(`  Tamaño: ${width}x${height} · canales: ${bpp} (${tieneAlpha ? 'con alfa' : 'sin alfa'})`)
console.log(`  Píxeles opacos: ${opacos} (${pct(opacos, width * height)})`)
if (maxX >= 0) {
  console.log(`  Caja del contenido: x ${minX}-${maxX} (${maxX - minX + 1}px), y ${minY}-${maxY} (${maxY - minY + 1}px)`)
  console.log(`  Ocupa: ${pct(maxX - minX + 1, width)} del ancho · ${pct(maxY - minY + 1, height)} del alto`)
  console.log(`  Márgenes: izq ${minX} · der ${width - 1 - maxX} · arriba ${minY} · abajo ${height - 1 - maxY}`)
}
console.log('  Colores dominantes (de lo opaco):')
const total = [...colores.values()].reduce((a, b) => a + b, 0) || 1
for (const [c, n] of [...colores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
  console.log(`    ${c}  ${pct(n, total)}`)
}
