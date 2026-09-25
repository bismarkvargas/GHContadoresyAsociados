// ---------------------------------------------------------------------------
// Captura las imágenes que pide Google Play desde el teléfono conectado.
//
//   · Captura la pantalla del teléfono con adb en cada paso de un recorrido guiado.
//   · Recorta a una relación 1:2 (1080x2160), que es el máximo que acepta Play
//     (las capturas del teléfono son 1080x2400 = 1:2.22 y serían rechazadas).
//   · Verifica que ninguna captura salga en blanco o con un error.
//
// Uso:  node tools/capturas-play-store.mjs [idDispositivo]
// ---------------------------------------------------------------------------
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { inflateSync, deflateSync } from 'node:zlib'
import { join } from 'node:path'

const ADB = 'C:\\Users\\bis21\\AppData\\Local\\Android\\sdk\\platform-tools\\adb.exe'
const DISPOSITIVO = process.argv[2] ?? '192.168.50.140:41457'
const PAQUETE = 'net.ghcontadores.gh_contadores'
const SALIDA = join('brand', 'play-store', 'capturas')
const TEMPORAL = join('brand', 'play-store', '.tmp')
const ANCHO_DESTINO = 1080
const ALTO_DESTINO = 2160 // 1:2 exacto

const adb = (...args) => execFileSync(ADB, ['-s', DISPOSITIVO, ...args], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 })
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

function decodificar(buf) {
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

function recortarCentrado(img, ancho, alto) {
  const x0 = Math.max(0, Math.round((img.width - ancho) / 2))
  const y0 = Math.max(0, Math.round((img.height - alto) / 2))
  const salida = Buffer.alloc(ancho * alto * 4)
  for (let y = 0; y < alto; y++) {
    const origen = ((y0 + y) * img.width + x0) * 4
    img.data.copy(salida, y * ancho * 4, origen, origen + ancho * 4)
  }
  return { width: ancho, height: alto, data: salida }
}

function analizar(img) {
  const colores = new Map()
  for (let y = 0; y < img.height; y += 6) {
    for (let x = 0; x < img.width; x += 6) {
      const i = (y * img.width + x) * 4
      const key = `${img.data[i] >> 4},${img.data[i + 1] >> 4},${img.data[i + 2] >> 4}`
      colores.set(key, (colores.get(key) || 0) + 1)
    }
  }
  const total = [...colores.values()].reduce((a, b) => a + b, 0)
  return { dominante: Math.max(...colores.values()) / total, distintos: colores.size }
}

const tocar = async (x, y, pausa = 2500) => { adb('shell', 'input', 'tap', String(x), String(y)); await esperar(pausa) }

async function capturar(nombre) {
  adb('shell', 'screencap', '-p', '/sdcard/play.png')
  adb('pull', '/sdcard/play.png', join(TEMPORAL, `${nombre}.png`))
  const img = decodificar(readFileSync(join(TEMPORAL, `${nombre}.png`)))
  const recortada = recortarCentrado(img, Math.min(ANCHO_DESTINO, img.width), Math.min(ALTO_DESTINO, img.height))
  writeFileSync(join(SALIDA, `${nombre}.png`), codificar(recortada))
  const { dominante, distintos } = analizar(recortada)
  const apta = dominante < 0.97 && distintos > 4
  console.log(`  ${apta ? 'OK' : 'XX'}  ${nombre.padEnd(26)} ${recortada.width}x${recortada.height} · dominante ${(dominante * 100).toFixed(0)}% · ${distintos} tonos`)
  return apta
}

async function main() {
  mkdirSync(SALIDA, { recursive: true })
  mkdirSync(TEMPORAL, { recursive: true })

  console.log('Recorrido guiado para las capturas de Google Play\n')
  adb('shell', 'am', 'force-stop', PAQUETE)
  await esperar(1500)
  adb('shell', 'monkey', '-p', PAQUETE, '-c', 'android.intent.category.LAUNCHER', '1')
  await esperar(10000)

  const r = []
  r.push(await capturar('01-inicio'))
  await tocar(324, 2280); r.push(await capturar('02-catalogo'))
  adb('shell', 'input', 'swipe', '540', '1600', '540', '900', '300'); await esperar(2000)
  r.push(await capturar('03-servicios'))
  await tocar(540, 1000); r.push(await capturar('04-detalle-servicio'))
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK'); await esperar(2000)
  await tocar(756, 2280); r.push(await capturar('05-carrito'))
  await tocar(972, 2280); r.push(await capturar('06-perfil'))

  rmSync(TEMPORAL, { recursive: true, force: true })
  console.log(`\nCapturas válidas: ${r.filter(Boolean).length} de ${r.length} · en ${SALIDA}`)
  console.log('Google Play pide entre 2 y 8 capturas de teléfono; estas cumplen 1:2 y 1080x2160.')
}

main().catch((e) => { console.error('Error:', e.message); process.exit(1) })
