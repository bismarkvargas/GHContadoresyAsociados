/**
 * Compila scripts/smoke.ts con la API de Vite (resuelve los alias @/ y el import.meta.env)
 * y lo ejecuta en Node con un shim mínimo de localStorage/fetch.
 *
 *   node scripts/smoke.mjs
 */

import { build } from 'vite'
import path from 'node:path'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const root = path.resolve(import.meta.dirname, '..')
const outDir = path.join(root, 'node_modules', '.smoke')

/* Shim de navegador mínimo antes de cargar el bundle */
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
  key: (i) => [...store.keys()][i] ?? null,
  get length() {
    return store.size
  },
}
globalThis.sessionStorage = globalThis.localStorage
globalThis.window = globalThis

const seedPath = path.join(root, 'public', 'catalog.seed.json')
const seedJson = fs.readFileSync(seedPath, 'utf8')
globalThis.fetch = async (url) => {
  if (String(url).includes('catalog.seed.json')) {
    return { ok: true, status: 200, json: async () => JSON.parse(seedJson) }
  }
  return { ok: false, status: 404, json: async () => ({}) }
}

const entry = path.join(outDir, 'smoke-entry.mjs')

await build({
  root,
  configFile: false,
  logLevel: 'warn',
  resolve: { alias: { '@': path.join(root, 'src') } },
  define: {
    'import.meta.env.BASE_URL': JSON.stringify('/'),
    'import.meta.env.VITE_USE_MOCKS': JSON.stringify('true'),
    'import.meta.env.VITE_API_URL': JSON.stringify('/ghcontadores/api/v1'),
    'import.meta.env.VITE_HUB_URL': JSON.stringify('/ghcontadores/hubs/realtime'),
  },
  build: {
    ssr: true,
    target: 'node20',
    outDir,
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      input: path.join(root, 'scripts', 'smoke.ts'),
      output: { entryFileNames: 'smoke-entry.mjs', manualChunks: undefined },
    },
  },
})

await import(pathToFileURL(entry).href)
