// ---------------------------------------------------------------------------
// Genera el icono de la app y los recursos de marca a partir de los logotipos en
// ALTA RESOLUCIÓN (brand/alta/), con reducción por promedio de área.
//
// Por qué importa: el icono anterior se construyó desde una versión de 512 px del
// logotipo, cuya marca medía 455x249 px reales; al ampliarla a los tamaños de Android
// los bordes salían escalonados. La marca original tiene 1781x969 px (4x más), y el
// escalado se hace promediando el área de origen en lugar de muestrear píxeles, que es
// lo que produce bordes suaves y nítidos.
//
// Uso:  node tools/generar-iconos.mjs
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { inflateSync, deflateSync } from 'node:zlib'
import { dirname } from 'node:path'

const NAVY = [0x1e, 0x2b, 0x58]
const LIME = [0xc4, 0xd8, 0x2d]
const BLANCO = [0xff, 0xff, 0xff]

// ---------------------------------------------------------------- PNG
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
    rgba[i * 4 + 3] = canales === 4 ? plano[p + 3] : canales === 2 ? plano[p + 1] : 255
  }
  return { width, height, data: rgba }
}

const TABLA = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c } return t })()
const crc32 = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = TABLA[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0 }
const trozo = (tipo, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const t = Buffer.from(tipo); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t, data]))); return Buffer.concat([l, t, data, c]) }

function codificar({ width, height, data }, conAlfa = true) {
  const canales = conAlfa ? 4 : 3
  const stride = width * canales
  const crudo = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    const base = y * (stride + 1)
    crudo[base] = 0
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4
      const d = base + 1 + x * canales
      crudo[d] = data[s]; crudo[d + 1] = data[s + 1]; crudo[d + 2] = data[s + 2]
      if (conAlfa) crudo[d + 3] = data[s + 3]
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = conAlfa ? 6 : 2
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), trozo('IHDR', ihdr), trozo('IDAT', deflateSync(crudo, { level: 9 })), trozo('IEND', Buffer.alloc(0))])
}

// ---------------------------------------------------------------- imagen
const vacia = (w, h, color = [0, 0, 0, 0]) => {
  const data = Buffer.alloc(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = color[0]; data[i * 4 + 1] = color[1]; data[i * 4 + 2] = color[2]
    data[i * 4 + 3] = color.length > 3 ? color[3] : 255
  }
  return { width: w, height: h, data }
}

function cajaContenido(img) {
  let minX = img.width, minY = img.height, maxX = -1, maxY = -1
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] < 8) continue
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

/**
 * Reducción por PROMEDIO DE ÁREA con alfa premultiplicado.
 * Cada píxel destino es la media exacta de todos los píxeles de origen que cubre,
 * que es lo que evita el aliasing (bordes escalonados) al reducir resolución.
 */
function reducir(img, ancho, alto) {
  const out = vacia(ancho, alto)
  const escalaX = img.width / ancho
  const escalaY = img.height / alto
  for (let y = 0; y < alto; y++) {
    const y0 = Math.floor(y * escalaY), y1 = Math.min(img.height, Math.max(y0 + 1, Math.ceil((y + 1) * escalaY)))
    for (let x = 0; x < ancho; x++) {
      const x0 = Math.floor(x * escalaX), x1 = Math.min(img.width, Math.max(x0 + 1, Math.ceil((x + 1) * escalaX)))
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * img.width + sx) * 4
          const al = img.data[i + 3] / 255
          r += img.data[i] * al; g += img.data[i + 1] * al; b += img.data[i + 2] * al; a += al; n++
        }
      }
      const i = (y * ancho + x) * 4
      if (a > 0) { out.data[i] = Math.round(r / a); out.data[i + 1] = Math.round(g / a); out.data[i + 2] = Math.round(b / a) }
      out.data[i + 3] = Math.round((a / n) * 255)
    }
  }
  return out
}

function blanquear(img) {
  const out = { width: img.width, height: img.height, data: Buffer.from(img.data) }
  for (let i = 0; i < img.width * img.height; i++) {
    out.data[i * 4] = BLANCO[0]; out.data[i * 4 + 1] = BLANCO[1]; out.data[i * 4 + 2] = BLANCO[2]
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

function banda(img, desdeArriba, grosor) {
  for (let x = 0; x < img.width; x++) {
    for (let y = 0; y < grosor; y++) {
      const yy = desdeArriba ? y : img.height - 1 - y
      const i = (yy * img.width + x) * 4
      img.data[i] = LIME[0]; img.data[i + 1] = LIME[1]; img.data[i + 2] = LIME[2]; img.data[i + 3] = 255
    }
  }
  return img
}

/** Coloca la marca dentro del cuadrado, centrada y ocupando `fraccion` del lado mayor. */
function conMarca(tamano, marca, fraccion) {
  const img = vacia(tamano, tamano, [...NAVY, 255])
  banda(img, true, Math.max(2, Math.round(tamano * 0.055)))
  const objetivo = tamano * fraccion
  const factor = Math.min(objetivo / marca.width, objetivo / marca.height)
  const w = Math.max(1, Math.round(marca.width * factor))
  const h = Math.max(1, Math.round(marca.height * factor))
  const chica = reducir(marca, w, h)
  componer(img, chica, Math.round((tamano - w) / 2), Math.round((tamano - h) / 2 + tamano * 0.015))
  return img
}

const guardar = (ruta, img, conAlfa = true) => {
  mkdirSync(dirname(ruta), { recursive: true })
  writeFileSync(ruta, codificar(img, conAlfa))
  return ruta
}

// ---------------------------------------------------------------- ejecución
const marcaCruda = decodificar('brand/alta/marca.png')
const marca = recortar(marcaCruda, cajaContenido(marcaCruda))
const marcaBlanca = blanquear(marca)
console.log(`Marca de origen: ${marca.width}x${marca.height} px (antes se usaba una de 455x249)`)

const generados = []

// Iconos de Android (heredados y adaptativos)
const densidades = [['mdpi', 48, 108], ['hdpi', 72, 162], ['xhdpi', 96, 216], ['xxhdpi', 144, 324], ['xxxhdpi', 192, 432]]
for (const [densidad, icono, adaptativo] of densidades) {
  const dir = `app-movil/android/app/src/main/res/mipmap-${densidad}`
  generados.push(guardar(`${dir}/ic_launcher.png`, conMarca(icono, marcaBlanca, 0.66)))
  generados.push(guardar(`${dir}/ic_launcher_round.png`, conMarca(icono, marcaBlanca, 0.60)))

  // Capa frontal del icono adaptativo: la marca dentro de la zona segura (50 % del lienzo).
  const frente = vacia(adaptativo, adaptativo)
  const factor = Math.min((adaptativo * 0.5) / marcaBlanca.width, (adaptativo * 0.5) / marcaBlanca.height)
  const w = Math.round(marcaBlanca.width * factor), h = Math.round(marcaBlanca.height * factor)
  componer(frente, reducir(marcaBlanca, w, h), Math.round((adaptativo - w) / 2), Math.round((adaptativo - h) / 2))
  generados.push(guardar(`${dir}/ic_launcher_foreground.png`, frente))

  // Capa de fondo: azul marino con la franja lima superior.
  generados.push(guardar(`${dir}/ic_launcher_background.png`, banda(vacia(adaptativo, adaptativo, [...NAVY, 255]), true, Math.max(2, Math.round(adaptativo * 0.055)))))
}

// Recursos para Google Play
generados.push(guardar('brand/play-store/icono-512.png', conMarca(512, marcaBlanca, 0.66)))

// Gráfico destacado 1024x500 con el logotipo en alta resolución (PNG 24 bits sin alfa)
const logoCrudo = decodificar('brand/alta/logo-blanco.png')
const logo = recortar(logoCrudo, cajaContenido(logoCrudo))
const destacado = banda(banda(vacia(1024, 500, [...NAVY, 255]), true, 18), false, 18)
const lw = Math.round(1024 * 0.62)
const lh = Math.round((logo.height / logo.width) * lw)
componer(destacado, reducir(logo, lw, lh), Math.round((1024 - lw) / 2), Math.round((500 - lh) / 2) - 20)
generados.push(guardar('brand/play-store/grafico-destacado-1024x500.png', destacado, false))

// Favicons del panel y logotipos limpios
generados.push(guardar('admin-web/public/favicon-32.png', reducir(conMarca(512, marcaBlanca, 0.66), 32, 32)))
generados.push(guardar('admin-web/public/favicon-192.png', reducir(conMarca(512, marcaBlanca, 0.66), 192, 192)))
generados.push(guardar('admin-web/public/apple-touch-icon.png', reducir(conMarca(512, marcaBlanca, 0.66), 180, 180)))
generados.push(guardar('admin-web/public/favicon.ico.png', reducir(conMarca(512, marcaBlanca, 0.66), 48, 48)))
generados.push(guardar('admin-web/public/brand/logo-horizontal-blanco.png', logo))
generados.push(guardar('app-movil/assets/brand/logo-horizontal-blanco.png', logo))
generados.push(guardar('app-movil/assets/brand/icono-blanco.png', marcaBlanca))

// Icono de iOS (1024, sin transparencia) si el proyecto lo tiene preparado
if (existsSync('app-movil/ios/Runner/Assets.xcassets/AppIcon.appiconset')) {
  generados.push(guardar('app-movil/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-1024x1024@1x.png', conMarca(1024, marcaBlanca, 0.66), false))
}

console.log(`\nRecursos generados: ${generados.length}`)
for (const g of generados) console.log('  ' + g)
