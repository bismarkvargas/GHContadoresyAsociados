// Decodifica un PNG sin dependencias y reporta los colores dominantes (para fijar la paleta corporativa)
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

const file = process.argv[2]
const buf = readFileSync(file)
if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('no es PNG')

let off = 8
let width = 0, height = 0, bitDepth = 0, colorType = 0
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
if (bitDepth !== 8) throw new Error(`bitDepth ${bitDepth} no soportado`)
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
      case 0: break
      case 1: v = (v + a) & 0xff; break
      case 2: v = (v + b) & 0xff; break
      case 3: v = (v + ((a + b) >> 1)) & 0xff; break
      case 4: {
        const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff
        break
      }
      default: throw new Error('filtro ' + filter)
    }
    cur[x] = v
  }
}

const counts = new Map()
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = y * stride + x * bpp
    const r = out[i], g = out[i + 1], b = out[i + 2]
    const a = bpp === 4 ? out[i + 3] : 255
    if (a < 40) continue
    const key = `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`
    counts.set(key, (counts.get(key) || 0) + 1)
  }
}

console.log(`PNG ${width}x${height} colorType=${colorType} alpha=${bpp === 4}`)
const total = [...counts.values()].reduce((a, b) => a + b, 0) || 1
for (const [hex, n] of [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)) {
  console.log(`  ${hex}  ${((n / total) * 100).toFixed(1)}%  (${n}px)`)
}
