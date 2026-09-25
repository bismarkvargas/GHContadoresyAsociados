// Analiza una captura de pantalla: colores dominantes globales y por franjas,
// para saber qué está mostrando la app cuando no se puede ver la imagen.
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

const file = process.argv[2]
const gridRows = Number(process.argv[3] ?? 6)
const buf = readFileSync(file)

let off = 8, width = 0, height = 0, bitDepth = 0, colorType = 0
const idat = []
while (off < buf.length) {
  const len = buf.readUInt32BE(off)
  const type = buf.toString('ascii', off + 4, off + 8)
  const data = buf.subarray(off + 8, off + 8 + len)
  if (type === 'IHDR') {
    width = data.readUInt32BE(0); height = data.readUInt32BE(4)
    bitDepth = data[8]; colorType = data[9]
  } else if (type === 'IDAT') idat.push(data)
  else if (type === 'IEND') break
  off += 12 + len
}

const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType]
const raw = inflateSync(Buffer.concat(idat))
const bpp = channels
const stride = width * bpp
const out = Buffer.alloc(height * stride)

let pos = 0
for (let y = 0; y < height; y++) {
  const filter = raw[pos++]
  const line = raw.subarray(pos, pos + stride); pos += stride
  const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride)
  const cur = out.subarray(y * stride, (y + 1) * stride)
  for (let x = 0; x < stride; x++) {
    const a = x >= bpp ? cur[x - bpp] : 0
    const b = prev[x]
    const c = x >= bpp ? prev[x - bpp] : 0
    let v = line[x]
    switch (filter) {
      case 1: v = (v + a) & 0xff; break
      case 2: v = (v + b) & 0xff; break
      case 3: v = (v + ((a + b) >> 1)) & 0xff; break
      case 4: {
        const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff
        break
      }
      case 0: break
      default: throw new Error('filtro ' + filter)
    }
    cur[x] = v
  }
}

const hex = (r, g, b) => `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`

function dominantes(x0, y0, x1, y1, top = 3) {
  const counts = new Map()
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = y * stride + x * bpp
      const key = hex(out[i], out[i + 1], out[i + 2])
      counts.set(key, (counts.get(key) || 0) + 1)
    }
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0) || 1
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, top)
    .map(([c, n]) => `${c} ${((n / total) * 100).toFixed(0)}%`)
}

console.log(`Captura ${width}x${height}`)
console.log('\nTodos los colores dominantes:')
for (const c of dominantes(0, 0, width, height, 8)) console.log('  ' + c)

console.log(`\nFranjas horizontales (${gridRows}):`)
const alto = Math.floor(height / gridRows)
for (let r = 0; r < gridRows; r++) {
  const y0 = r * alto, y1 = y0 + alto
  console.log(`  fila ${r + 1} (y ${y0}-${y1}): ${dominantes(0, y0, width, y1, 3).join('  |  ')}`)
}

// Presencia de los colores de marca de GH Contadores.
const marca = { 'rojo corporativo #df3131': [0xdf, 0x31, 0x31], 'tinta #212121': [0x21, 0x21, 0x21], 'blanco': [0xff, 0xff, 0xff] }
const counts = new Map()
for (let y = 0; y < height; y += 3) {
  for (let x = 0; x < width; x += 3) {
    const i = y * stride + x * bpp
    const key = hex(out[i], out[i + 1], out[i + 2])
    counts.set(key, (counts.get(key) || 0) + 1)
  }
}
for (const [nombre, [r, g, b]] of Object.entries(marca)) {
  let n = 0
  for (const [c, v] of counts) {
    const [cr, cg, cb] = [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]
    if (Math.abs(cr - r) < 24 && Math.abs(cg - g) < 24 && Math.abs(cb - b) < 24) n += v
  }
  console.log(`\nPíxeles cercanos a ${nombre}: ${n}`)
}
