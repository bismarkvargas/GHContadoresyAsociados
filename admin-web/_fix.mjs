import fs from 'node:fs'

const file = process.argv[2]
let src = fs.readFileSync(file, 'utf8')
const marker = "route('GET', '/admin/clients', (ctx) =>\n  list("
if (!src.includes(marker)) {
  console.error('no marker')
  process.exit(1)
}
src = src.replace(
  marker,
  "route('GET', '/admin/clients', (ctx): Paginated<Client> =>\n  list<Client>(",
)
fs.writeFileSync(file, src)
console.log('ok')
