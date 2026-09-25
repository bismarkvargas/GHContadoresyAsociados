/**
 * Repara el mojibake de archivos UTF-8 reescritos por PowerShell 5.
 *
 *   node tools/_fixenc.mjs <archivo> [...]
 *
 * Estrategia: reinterpretar los puntos de código como bytes (latin1) y volver a
 * decodificar UTF-8. Se aplica por líneas y se conserva la original si la
 * conversión produce caracteres de reemplazo.
 */
import fs from 'node:fs'

function repararLinea(linea) {
  const convertida = Buffer.from(linea, 'latin1').toString('utf8')
  const antes = (linea.match(/[\u00C2\u00C3]/g) ?? []).length
  const despues = (convertida.match(/\uFFFD/g) ?? []).length
  if (antes > 0 && despues === 0) return convertida
  return linea
}

for (const file of process.argv.slice(2)) {
  const original = fs.readFileSync(file, 'utf8')
  const lineas = original.split('\n')
  const reparadas = lineas.map(repararLinea)
  const cambios = reparadas.filter((l, i) => l !== lineas[i]).length
  if (cambios === 0) {
    console.log(`SIN CAMBIOS: ${file}`)
    continue
  }
  fs.writeFileSync(file, reparadas.join('\n'), 'utf8')
  console.log(`REPARADO: ${file} (${cambios} líneas)`)
}
