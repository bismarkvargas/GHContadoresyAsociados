// Verificación de coherencia del módulo mock (se ejecuta con tsx-less tooling de Vite no disponible).
// Se usa para validar los datos exportados del catálogo y la correspondencia de credenciales.
import fs from 'node:fs'

const seedPath = 'public/catalog.seed.json'
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'))
const catSlugs = seed.categories.map((c) => c.slug)
const usedSlugs = new Set(seed.products.map((p) => p.categorySlug))
console.log('categorias:', catSlugs.length, catSlugs.join(','))
console.log('productos:', seed.products.length)
console.log('categorias sin productos:', catSlugs.filter((s) => !usedSlugs.has(s)))
const prices = seed.products.map((p) => p.price)
console.log('precio min/max:', Math.min(...prices), Math.max(...prices))
console.log('monedas distintas:', [...new Set(seed.products.map((p) => p.currency))])

const dbSrc = fs.readFileSync('src/api/mock/db.ts', 'utf8')
for (const email of [
  'admin@ghcontadores.net',
  'abogado@ghcontadores.net',
  'maria.rojas@ghcontadores.net',
  'contador@ghcontadores.net',
  'asistente@ghcontadores.net',
]) {
  console.log(email, dbSrc.includes(email) ? 'OK' : 'FALTA')
}
const adminPwd = /email: 'admin@ghcontadores\.net'[\s\S]{0,320}?password: '([^']+)'/.exec(dbSrc)
const lawyerPwd = /email: 'abogado@ghcontadores\.net'[\s\S]{0,320}?password: '([^']+)'/.exec(dbSrc)
console.log('password admin:', adminPwd?.[1])
console.log('password abogado:', lawyerPwd?.[1])
const loginSrc = fs.readFileSync('src/pages/LoginPage.tsx', 'utf8')
console.log('LoginPage usa Admin123!:', loginSrc.includes('Admin123!'))
console.log('LoginPage usa Abogado123!:', loginSrc.includes('Abogado123!'))
