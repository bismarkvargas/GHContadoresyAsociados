// Comprueba en el navegador cómo responde la API a distintas formas de
// `POST /admin/clients`, para saber si el fallo está en el servidor.
//
//   node tools/e2e-admin/diagnostico-respuestas.mjs
import { chromium } from '@playwright/test'

const BASE = 'https://demostracion.es/ghcontadores/'
const ADMIN = { email: 'admin@ghcontadores.net', password: 'Gh.Admin2026' }

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'es-CR' })
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.locator('input[type="email"]').first().fill(ADMIN.email)
await page.locator('input[type="password"]').first().fill(ADMIN.password)
await page.locator('button[type="submit"]').first().click()
await page.waitForTimeout(4000)

const casos = await page.evaluate(async () => {
  const token = localStorage.getItem('gh.accessToken') ?? sessionStorage.getItem('gh.accessToken')
  const marca = Date.now()
  const base = {
    clientType: 'Company',
    legalName: `Diagnostico Campos ${marca}`,
    tradeName: '',
    idNumber: '3-101-555555',
    email: `diag.campos.${marca}@ejemplo.cr`,
    phone: '+506 8888 3333',
    whatsapp: '',
    address: '',
    province: 'Guanacaste',
    canton: 'Santa Cruz',
    district: 'Huacas',
    status: 'Lead',
    source: 'web',
    tagsCsv: '',
    notes: '',
  }
  // Variante que envía el formulario tal cual (incluye createCase y tipos del form)
  const formulario = { ...base, createCase: false, assignedToUserId: '' }

  const resultados = []
  for (const [etiqueta, cuerpo] of [
    ['payload mínimo', { clientType: 'Company', legalName: base.legalName, idNumber: base.idNumber, email: base.email, phone: base.phone, status: 'Lead', source: 'web' }],
    ['payload del formulario', formulario],
    ['payload con strings vacíos', { ...base, whatsapp: '', address: '', tagsCsv: '', notes: '', assignedToUserId: '' }],
  ]) {
    const r = await fetch('/ghcontadores/api/v1/admin/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(cuerpo),
    })
    const texto = await r.text()
    let json = null
    try { json = JSON.parse(texto) } catch { /* no json */ }
    resultados.push({
      etiqueta,
      status: r.status,
      id: json?.id ?? null,
      code: json?.code ?? null,
      error: json?.errors ? JSON.stringify(json.errors) : (json?.detail ?? null),
    })
    // Limpieza
    if (json?.id) {
      await fetch(`/ghcontadores/api/v1/admin/clients/${json.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    }
  }
  return resultados
})

console.log('\n=== POST /admin/clients con distintos payloads ===')
for (const c of casos) {
  console.log(`\n[${c.etiqueta}] status ${c.status} · id: ${c.id ?? 'NINGUNO'} · code: ${c.code ?? '—'}`)
  if (c.error) console.log('   error:', c.error.slice(0, 220))
}

await browser.close()
