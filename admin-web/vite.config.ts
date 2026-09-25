import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import type { Plugin } from 'vite'

// El panel se publica bajo https://demostracion.es/ghcontadores/
const BASE = '/ghcontadores/'

/**
 * Sustituye el marcador `__GH_BASE__` de los CSS por el `base` real.
 *
 * Los `url()` relativos de un CSS importado desde JS no reciben el `base` de Vite
 * (acababan pidiendo `/fonts/...` en lugar de `/ghcontadores/fonts/...`) y `define`
 * solo actúa sobre JavaScript. Se hace en dos momentos:
 *  - `transform`: sirve el CSS ya corregido en el servidor de desarrollo.
 *  - `generateBundle`: reescribe los `.css` emitidos en la compilación.
 */
function baseEnCss(): Plugin {
  const sustituir = (codigo: string) => codigo.split('__GH_BASE__').join(BASE)
  return {
    name: 'gh-base-en-css',
    enforce: 'post',
    transform(code, id) {
      if (!id.includes('.css') || !code.includes('__GH_BASE__')) return null
      return { code: sustituir(code), map: null }
    },
    generateBundle(_opciones, bundle) {
      for (const [nombre, salida] of Object.entries(bundle)) {
        if (nombre.endsWith('.css') && salida.type === 'asset') {
          const contenido = typeof salida.source === 'string' ? salida.source : salida.source.toString()
          if (contenido.includes('__GH_BASE__')) salida.source = sustituir(contenido)
        }
      }
    },
  }
}

export default defineConfig({
  base: BASE,
  plugins: [react(), baseEnCss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          query: ['@tanstack/react-query', 'axios'],
        },
      },
    },
  },
})
