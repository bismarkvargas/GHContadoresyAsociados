// Comprueba que el bundle recién construido contiene las correcciones y que NO
// incluye el comodín del modo demo cuando se compila para la API real.
//
//   node tools/e2e-admin/verificar-bundle.mjs
import fs from 'node:fs'
import path from 'node:path'

const dir = process.argv[2] ?? 'admin-web/dist/assets'
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'))
const contenido = files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n')

const marcas = {
  'guardas de identificador': 'no debe llegar a la API',
  'bandeja de notificaciones degradada': 'Bandeja local vaciada',
  'extractor tolerante de id (pickId)': 'clientId',
  'alias en inglés (account-requests)': 'account-requests',
  'credenciales reales de la firma': 'Gh.Admin2026',
  'URL base de la API real': '/ghcontadores/api/v1',
}

for (const [marca, aguja] of Object.entries(marcas)) {
  console.log(`${contenido.includes(aguja) ? 'SÍ ' : 'NO '} ${marca}`)
}

// El adaptador mock no debe quedar activo en el bundle de producción:
// Vite sustituye import.meta.env.VITE_USE_MOCKS por el literal compilado.
const usaMocksInactivo = !contenido.includes('const USE_MOCKS = true') && !/USE_MOCKS\s*=\s*true/.test(contenido)
console.log(`${usaMocksInactivo ? 'SÍ ' : 'NO '} modo mock desactivado en el bundle`)

console.log('chunks JS:', files.length)
