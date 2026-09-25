// Comprueba que la identidad corporativa nueva está en la API (ajustes de marca) y
// en la semilla del modo demo, con las claves reales de cada uno.
//
//   node tools/verificar-modo-demo.mjs
import fs from 'node:fs'

const BASE = 'https://demostracion.es/ghcontadores/api/v1'
const login = await (
  await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@ghcontadores.net', password: 'Gh.Admin2026' }),
  })
).json()
const cab = { Authorization: `Bearer ${login.accessToken}` }

const ajustes = await (await fetch(`${BASE}/admin/settings`, { headers: cab })).json()
const lista = Array.isArray(ajustes) ? ajustes : ajustes.items

/* La API nombra los ajustes de marca como brand.* */
const esperadosApi = {
  'brand.primaryColor': '#1E2B58',
  'brand.accentColor': '#C4D82D',
  'brand.inkColor': '#1E2B58',
}
console.log('=== Ajustes de marca en la API real ===')
for (const s of lista.filter((x) => x.key.startsWith('brand.'))) console.log(` · ${s.key} = ${s.value}`)

console.log('\n=== ¿coinciden con la identidad nueva? ===')
let ok = 0
for (const [clave, valor] of Object.entries(esperadosApi)) {
  const real = lista.find((s) => s.key === clave)?.value
  const coincide = (real ?? '').toUpperCase() === valor
  if (coincide) ok += 1
  console.log(`${coincide ? 'OK ' : 'XX '} ${clave}: API=${real ?? '—'} · esperado=${valor}`)
}

/* Semilla del modo demo (los alias que usa el panel) */
const semilla = fs.readFileSync('admin-web/src/lib/constants.ts', 'utf8')
const esperadosSemilla = {
  'branding.primary': '#1E2B58',
  'branding.accent': '#C4D82D',
  'branding.accent600': '#A8BC1F',
  'branding.danger': '#C0392B',
  'registration.mode': 'approval',
}
console.log('\n=== Semilla del modo demo (constants.ts) ===')
let okSemilla = 0
for (const [clave, valor] of Object.entries(esperadosSemilla)) {
  const re = new RegExp(`key: '${clave.replace('.', '\\.')}'[^}]*value: '([^']+)'`)
  const real = re.exec(semilla)?.[1]
  const coincide = real === valor
  if (coincide) okSemilla += 1
  console.log(`${coincide ? 'OK ' : 'XX '} ${clave} = ${real ?? 'NO ENCONTRADO'}`)
}

console.log('\n=== Modo de registro en la API ===')
for (const s of lista.filter((x) => x.key.startsWith('registration.'))) {
  console.log(` · ${s.key} = ${s.value}`)
}

const total = Object.keys(esperadosApi).length + Object.keys(esperadosSemilla).length
console.log(`\nmarca en la API: ${ok}/${Object.keys(esperadosApi).length} · semilla del demo: ${okSemilla}/${Object.keys(esperadosSemilla).length}`)
process.exit(ok + okSemilla === total ? 0 : 1)
