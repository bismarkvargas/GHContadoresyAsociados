// ---------------------------------------------------------------------------
// Generador de recursos de marca de GH Contadores y Asociados.
//
// A partir de los logotipos originales produce, de forma reproducible:
//   · los logotipos limpios (azul para fondos claros, blanco para fondos oscuros)
//   · el icono de la app en todos los tamaños de Android (incluido el icono adaptativo)
//   · el favicon del panel (32/180/192)
//   · los recursos que pide Google Play (icono 512 y gráfico destacado 1024x500)
//
// No depende de librerías de imagen: decodifica, compone, escala y codifica PNG.
//
// Uso:  node tools/brand-assets.mjs
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { deflateSync, inflateSync } from 'node:zlib'
import { dirname, join } from 'node:path'

// ------------------------------------------------------------------ paleta
const NAVY = [0x1e, 0x2b, 0x58]
const LIME = [0xc4, 0xd8, 0x2d]
const WHITE = [0xff, 0xff, 0xff]

// ------------------------------------------------------------------ PNG: decodificar
function decodePng(file) {
  const buf = readFileSync(file)
  let off = 8, width = 0, height = 0, colorType = 0, bitDepth = 0
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
  if (bitDepth !== 8) throw new Error(`bitDepth ${bitDepth} no soportado en ${file}`)

  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType]
  if (!channels) throw new Error(`colorType ${colorType} no soportado`)
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const plano = Buffer.alloc(height * stride)

  let pos = 0
  for (let y = 0; y < height; y++) {
    const f = raw[pos++]
    const line = raw.subarray(pos, pos + stride); pos += stride
    const prev = y > 0 ? plano.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride)
    const cur = plano.subarray(y * stride, (y + 1) * stride)
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0
      const b = prev[x]
      const c = x >= channels ? prev[x - channels] : 0
      let v = line[x]
      if (f === 1) v = (v + a) & 0xff
      else if (f === 2) v = (v + b) & 0xff
      else if (f === 3) v = (v + ((a + b) >> 1)) & 0xff
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff
      }
      cur[x] = v
    }
  }

  // Se normaliza a RGBA
  const rgba = Buffer.alloc(width * height * 4)
  for (let i = 0, p = 0; i < width * height; i++, p += channels) {
    rgba[i * 4] = plano[p]
    rgba[i * 4 + 1] = channels >= 3 ? plano[p + 1] : plano[p]
    rgba[i * 4 + 2] = channels >= 3 ? plano[p + 2] : plano[p]
    rgba[i * 4 + 3] = channels === 4 ? plano[p + 3] : channels === 2 ? plano[p + 1] : 255
  }
  return { width, height, data: rgba }
}

// ------------------------------------------------------------------ PNG: codificar
const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const tipo = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([tipo, data])))
  return Buffer.concat([len, tipo, data, crc])
}

function encodePng({ width, height, data }) {
  const stride = width * 4
  const crudo = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    crudo[y * (stride + 1)] = 0 // filtro "none": el compresor hace el trabajo
    data.copy(crudo, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(crudo, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ------------------------------------------------------------------ utilidades
const vacia = (w, h, color = [0, 0, 0, 0]) => {
  const data = Buffer.alloc(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = color[0]; data[i * 4 + 1] = color[1]; data[i * 4 + 2] = color[2]
    data[i * 4 + 3] = color.length > 3 ? color[3] : 255
  }
  return { width: w, height: h, data }
}

/** Caja envolvente del contenido opaco (alpha ≥ 40). */
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
  if (maxX < 0) return { x: 0, y: 0, width: img.width, height: img.height }
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

function recortar(img, caja) {
  const out = vacia(caja.width, caja.height)
  for (let y = 0; y < caja.height; y++) {
    const origen = ((caja.y + y) * img.width + caja.x) * 4
    img.data.copy(out.data, y * caja.width * 4, origen, origen + caja.width * 4)
  }
  return out
}

/** Recolorea el contenido conservando el alfa (para obtener la versión blanca). */
function recolorear(img, color) {
  const out = vacia(img.width, img.height)
  for (let i = 0; i < img.width * img.height; i++) {
    const a = img.data[i * 4 + 3]
    out.data[i * 4] = color[0]; out.data[i * 4 + 1] = color[1]; out.data[i * 4 + 2] = color[2]
    out.data[i * 4 + 3] = a
  }
  return out
}

/** Escalado bilineal con alfa premultiplicado (evita halos en los bordes). */
function escalar(img, ancho, alto) {
  const out = vacia(ancho, alto)
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
        r += img.data[i] * alpha * w
        g += img.data[i + 1] * alpha * w
        b += img.data[i + 2] * alpha * w
        a += alpha * w
      }
      const i = (y * ancho + x) * 4
      if (a > 0) {
        out.data[i] = Math.round(r / a); out.data[i + 1] = Math.round(g / a); out.data[i + 2] = Math.round(b / a)
      }
      out.data[i + 3] = Math.round(a * 255)
    }
  }
  return out
}

/** Compone `capa` sobre `fondo`, en la posición indicada, con alfa. */
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
      for (let k = 0; k < 3; k++) {
        fondo.data[d + k] = Math.round(capa.data[s + k] * sa + fondo.data[d + k] * (1 - sa))
      }
      fondo.data[d + 3] = Math.max(fondo.data[d + 3], capa.data[s + 3])
    }
  }
  return fondo
}

function guardar(ruta, img) {
  mkdirSync(dirname(ruta), { recursive: true })
  writeFileSync(ruta, encodePng(img))
  return ruta
}

/** Icono cuadrado de la marca: fondo azul marino, franja lima y marca en blanco. */
function iconoMarca(marca, tamano) {
  const img = vacia(tamano, tamano, [...NAVY, 255])
  const franja = Math.max(3, Math.round(tamano * 0.055))
  for (let y = 0; y < franja; y++) {
    for (let x = 0; x < tamano; x++) {
      const i = (y * tamano + x) * 4
      img.data[i] = LIME[0]; img.data[i + 1] = LIME[1]; img.data[i + 2] = LIME[2]; img.data[i + 3] = 255
    }
  }
  // Reserva: dentro del cuadrado queda un área útil del 66 % como exige el icono adaptativo.
  const util = tamano * 0.66
  const escala = Math.min(util / marca.width, util / marca.height)
  const w = Math.max(1, Math.round(marca.width * escala))
  const h = Math.max(1, Math.round(marca.height * escala))
  const chica = escalar(marca, w, h)
  const x = Math.round((tamano - w) / 2)
  const y = Math.round((tamano - h) / 2 + tamano * 0.02)
  return componer(img, chica, x, y)
}

// ------------------------------------------------------------------ ejecución
const RAIZ = '.'
const ORIGEN = join(RAIZ, 'brand', 'originales')

const logoAzulOriginal = decodePng(join(ORIGEN, 'logo-horizontal-azul.png'))
const logoBlancoOriginal = decodePng(join(ORIGEN, 'logo-horizontal.png'))
const marcaOriginal = decodePng(join(ORIGEN, 'favicon-512.png'))

const logoAzul = recortar(logoAzulOriginal, cajaContenido(logoAzulOriginal))
const logoBlanco = recortar(logoBlancoOriginal, cajaContenido(logoBlancoOriginal))
// La marca (icono) se recolorea a blanco para usarla sobre el azul marino corporativo.
const marcaBlanca = recolorear(recortar(marcaOriginal, cajaContenido(marcaOriginal)), WHITE)
const marcaAzul = recortar(marcaOriginal, cajaContenido(marcaOriginal))

const generados = []

// 1) Logotipos para el panel y el app
generados.push(guardar(join(RAIZ, 'admin-web', 'public', 'brand', 'logo-horizontal-azul.png'), logoAzul))
generados.push(guardar(join(RAIZ, 'admin-web', 'public', 'brand', 'logo-horizontal-blanco.png'), logoBlanco))
generados.push(guardar(join(RAIZ, 'admin-web', 'public', 'brand', 'icono-azul.png'), marcaAzul))
generados.push(guardar(join(RAIZ, 'app-movil', 'assets', 'brand', 'logo-horizontal-azul.png'), logoAzul))
generados.push(guardar(join(RAIZ, 'app-movil', 'assets', 'brand', 'logo-horizontal-blanco.png'), logoBlanco))
generados.push(guardar(join(RAIZ, 'app-movil', 'assets', 'brand', 'icono-blanco.png'), marcaBlanca))

// 2) Favicon del panel (el que indicó el cliente, en sus tres tamaños)
generados.push(guardar(join(RAIZ, 'admin-web', 'public', 'favicon-32.png'), escalar(iconoMarca(marcaBlanca, 512), 32, 32)))
generados.push(guardar(join(RAIZ, 'admin-web', 'public', 'favicon-192.png'), escalar(iconoMarca(marcaBlanca, 512), 192, 192)))
generados.push(guardar(join(RAIZ, 'admin-web', 'public', 'apple-touch-icon.png'), escalar(iconoMarca(marcaBlanca, 512), 180, 180)))
generados.push(guardar(join(RAIZ, 'admin-web', 'public', 'favicon.ico.png'), escalar(iconoMarca(marcaBlanca, 512), 48, 48)))

// 3) Iconos de Android (heredados + adaptativos)
const densidades = [
  ['mdpi', 48, 108], ['hdpi', 72, 162], ['xhdpi', 96, 216], ['xxhdpi', 144, 324], ['xxxhdpi', 192, 432],
]
for (const [densidad, tamIcono, tamAdaptativo] of densidades) {
  const dir = join(RAIZ, 'app-movil', 'android', 'app', 'src', 'main', 'res', `mipmap-${densidad}`)
  generados.push(guardar(join(dir, 'ic_launcher.png'), iconoMarca(marcaBlanca, tamIcono)))
  generados.push(guardar(join(dir, 'ic_launcher_round.png'), iconoMarca(marcaBlanca, tamIcono)))
  // Capa frontal del icono adaptativo: fondo transparente y la marca dentro de la zona segura.
  const frente = vacia(tamAdaptativo, tamAdaptativo)
  const escala = Math.min((tamAdaptativo * 0.5) / marcaBlanca.width, (tamAdaptativo * 0.5) / marcaBlanca.height)
  const w = Math.max(1, Math.round(marcaBlanca.width * escala))
  const h = Math.max(1, Math.round(marcaBlanca.height * escala))
  componer(frente, escalar(marcaBlanca, w, h), Math.round((tamAdaptativo - w) / 2), Math.round((tamAdaptativo - h) / 2))
  generados.push(guardar(join(dir, 'ic_launcher_foreground.png'), frente))
  const fondoAdaptativo = vacia(tamAdaptativo, tamAdaptativo, [...NAVY, 255])
  const franja = Math.max(2, Math.round(tamAdaptativo * 0.055))
  for (let y = 0; y < franja; y++) {
    for (let x = 0; x < tamAdaptativo; x++) {
      const i = (y * tamAdaptativo + x) * 4
      fondoAdaptativo.data[i] = LIME[0]; fondoAdaptativo.data[i + 1] = LIME[1]; fondoAdaptativo.data[i + 2] = LIME[2]
    }
  }
  generados.push(guardar(join(dir, 'ic_launcher_background.png'), fondoAdaptativo))
}

// 4) Recursos para Google Play
const play = join(RAIZ, 'brand', 'play-store')
generados.push(guardar(join(play, 'icono-512.png'), iconoMarca(marcaBlanca, 512)))

// Gráfico destacado 1024x500: azul marino, franja lima arriba y abajo, logotipo blanco.
const destacado = vacia(1024, 500, [...NAVY, 255])
for (let x = 0; x < 1024; x++) {
  for (let y = 0; y < 18; y++) {
    let i = (y * 1024 + x) * 4
    destacado.data[i] = LIME[0]; destacado.data[i + 1] = LIME[1]; destacado.data[i + 2] = LIME[2]
    i = ((500 - 1 - y) * 1024 + x) * 4
    destacado.data[i] = LIME[0]; destacado.data[i + 1] = LIME[1]; destacado.data[i + 2] = LIME[2]
  }
}
const anchoLogo = Math.round(1024 * 0.62)
const altoLogo = Math.round((logoBlanco.height / logoBlanco.width) * anchoLogo)
componer(destacado, escalar(logoBlanco, anchoLogo, altoLogo),
  Math.round((1024 - anchoLogo) / 2), Math.round((500 - altoLogo) / 2) - 20)
generados.push(guardar(join(play, 'grafico-destacado-1024x500.png'), destacado))

console.log(`Recursos generados: ${generados.length}`)
for (const g of generados) console.log('  ' + g)
