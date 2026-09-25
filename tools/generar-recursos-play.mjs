// ---------------------------------------------------------------------------
// Genera los dos recursos gráficos que pide Google Play a partir de los logotipos
// ya versionados en el proyecto (no necesita descargar nada):
//
//   · icono-512.png                  → azul marino + franja lima + marca en blanco
//   · grafico-destacado-1024x500.png → azul marino, franjas lima arriba y abajo,
//                                      y el logotipo horizontal en blanco centrado
//
// Uso:  node tools/generar-recursos-play.mjs
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { inflateSync, deflateSync } from 'node:zlib'

const NAVY = [0x1e, 0x2b, 0x58]
const LIME = [0xc4, 0xd8, 0x2d]

function decodificar(file) {
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
  const rgba = Buffer.alloc(width * height * 4)
  for (let i = 0, p = 0; i < width * height; i++, p += canales) {
    rgba[i * 4] = plano[p]
    rgba[i * 4 + 1] = canales >= 3 ? plano[p + 1] : plano[p]
    rgba[i * 4 + 2] = canales >= 3 ? plano[p + 2] : plano[p]
    rgba[i * 4 + 3] = canales === 4 ? plano[p + 3] : 255
  }
  return { width, height, data: rgba }
}

const TABLA = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c } return t })()
const crc32 = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = TABLA[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0 }
const trozo = (tipo, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const t = Buffer.from(tipo); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t, data]))); return Buffer.concat([l, t, data, c]) }

function codificar({ width, height, data }) {
  const stride = width * 4
  const crudo = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) { crudo[y * (stride + 1)] = 0; data.copy(crudo, y * (stride + 1) + 1, y * stride, (y + 1) * stride) }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), trozo('IHDR', ihdr), trozo('IDAT', deflateSync(crudo, { level: 9 })), trozo('IEND', Buffer.alloc(0))])
}

const vacia = (w, h, color) => {
  const data = Buffer.alloc(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = color[0]; data[i * 4 + 1] = color[1]; data[i * 4 + 2] = color[2]; data[i * 4 + 3] = 255
  }
  return { width: w, height: h, data }
}

function cajaContenido(img) {
  let minX = img.width, minY = img.height, maxX = -1, maxY = -1
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] < 40) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  return maxX < 0 ? { x: 0, y: 0, width: img.width, height: img.height } : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

function recortar(img, caja) {
  const out = { width: caja.width, height: caja.height, data: Buffer.alloc(caja.width * caja.height * 4) }
  for (let y = 0; y < caja.height; y++) {
    const origen = ((caja.y + y) * img.width + caja.x) * 4
    img.data.copy(out.data, y * caja.width * 4, origen, origen + caja.width * 4)
  }
  return out
}

function escalar(img, ancho, alto) {
  const out = { width: ancho, height: alto, data: Buffer.alloc(ancho * alto * 4) }
  const sx = img.width / ancho, sy = img.height / alto
  for (let y = 0; y < alto; y++) {
    const fy = Math.min(img.height - 1, Math.max(0, (y + 0.5) * sy - 0.5))
    const y0 = Math.floor(fy), y1 = Math.min(img.height - 1, y0 + 1), wy = fy - y0
    for (let x = 0; x < ancho; x++) {
      const fx = Math.min(img.width - 1, Math.max(0, (x + 0.5) * sx - 0.5))
      const x0 = Math.floor(fx), x1 = Math.min(img.width - 1, x0 + 1), wx = fx - x0
      let r = 0, g = 0, b = 0, a = 0
      for (const [px, py, w] of [[x0, y0, (1 - wx) * (1 - wy)], [x1, y0, wx * (1 - wy)], [x0, y1, (1 - wx) * wy], [x1, y1, wx * wy]]) {
        if (w === 0) continue
        const i = (py * img.width + px) * 4
        const alpha = img.data[i + 3] / 255
        r += img.data[i] * alpha * w; g += img.data[i + 1] * alpha * w; b += img.data[i + 2] * alpha * w; a += alpha * w
      }
      const i = (y * ancho + x) * 4
      if (a > 0) { out.data[i] = Math.round(r / a); out.data[i + 1] = Math.round(g / a); out.data[i + 2] = Math.round(b / a) }
      out.data[i + 3] = Math.round(a * 255)
    }
  }
  return out
}

function componer(fondo, capa, x, y) {
  for (let cy = 0; cy < capa.height; cy++) {
    const ty = y + cy
    if (ty < 0 || ty >= fondo.height) continue
    for (let cx = 0; cx < capa.width; cx++) {
      const tx = x + cx
      if (tx < 0 || tx >= fondo.width) continue
      const s = (cy * capa.width + cx) * 4
      const d = (ty * fondo.width + tx) * 4
      const sa = capa.data[s + 3] / 255
      if (sa === 0) continue
      for (let k = 0; k < 3; k++) fondo.data[d + k] = Math.round(capa.data[s + k] * sa + fondo.data[d + k] * (1 - sa))
      fondo.data[d + 3] = 255
    }
  }
  return fondo
}

function franja(img, altura) {
  for (let x = 0; x < img.width; x++) {
    for (let y = 0; y < altura; y++) {
      let i = (y * img.width + x) * 4
      img.data[i] = LIME[0]; img.data[i + 1] = LIME[1]; img.data[i + 2] = LIME[2]; img.data[i + 3] = 255
      i = ((img.height - 1 - y) * img.width + x) * 4
      img.data[i] = LIME[0]; img.data[i + 1] = LIME[1]; img.data[i + 2] = LIME[2]; img.data[i + 3] = 255
    }
  }
  return img
}

const marca = recortar(decodificar('app-movil/assets/brand/icono-blanco.png'), cajaContenido(decodificar('app-movil/assets/brand/icono-blanco.png')))
const marcaBlanca = { width: marca.width, height: marca.height, data: Buffer.from(marca.data) }
// La marca se fuerza a blanco puro para que contraste sobre el azul marino.
for (let i = 0; i < marcaBlanca.width * marcaBlanca.height; i++) {
  marcaBlanca.data[i * 4] = 255; marcaBlanca.data[i * 4 + 1] = 255; marcaBlanca.data[i * 4 + 2] = 255
}
const logo = decodificar('app-movil/assets/brand/logo-horizontal-blanco.png')
const logoBlanco = recortar(logo, cajaContenido(logo))

mkdirSync('brand/play-store', { recursive: true })

// Icono 512: azul marino, franja lima arriba, marca centrada al 66 % (zona segura).
const icono = vacia(512, 512, NAVY)
for (let x = 0; x < 512; x++) {
  for (let y = 0; y < Math.round(512 * 0.055); y++) {
    const i = (y * 512 + x) * 4
    icono.data[i] = LIME[0]; icono.data[i + 1] = LIME[1]; icono.data[i + 2] = LIME[2]; icono.data[i + 3] = 255
  }
}
const util = 512 * 0.66
const em = Math.min(util / marcaBlanca.width, util / marcaBlanca.height)
const mw = Math.round(marcaBlanca.width * em), mh = Math.round(marcaBlanca.height * em)
componer(icono, escalar(marcaBlanca, mw, mh), Math.round((512 - mw) / 2), Math.round((512 - mh) / 2 + 512 * 0.02))
writeFileSync('brand/play-store/icono-512.png', codificar(icono))

// Gráfico destacado 1024x500: azul marino, franjas lima arriba y abajo, logotipo blanco.
const destacado = franja(vacia(1024, 500, NAVY), 18)
const lw = Math.round(1024 * 0.62)
const lh = Math.round((logoBlanco.height / logoBlanco.width) * lw)
componer(destacado, escalar(logoBlanco, lw, lh), Math.round((1024 - lw) / 2), Math.round((500 - lh) / 2) - 20)
writeFileSync('brand/play-store/grafico-destacado-1024x500.png', codificar(destacado))

console.log('Recursos de Play generados:')
console.log('  brand/play-store/icono-512.png')
console.log('  brand/play-store/grafico-destacado-1024x500.png')
