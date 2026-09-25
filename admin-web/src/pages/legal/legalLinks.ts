/**
 * Rutas de los documentos legales públicos y las URLs con las que se declaran.
 *
 * Los documentos se sirven como páginas públicas de la propia SPA (sin sesión), así que
 * la URL pública es el base del despliegue + la ruta. Aquí se centraliza para que el
 * router, el pie del panel, la tarjeta de Ajustes y el README no se desincronicen.
 */

/** Base pública del despliegue (coincide con `base` de vite.config.ts). */
export const PUBLIC_BASE = 'https://demostracion.es/ghcontadores'

export interface LegalLink {
  /** Ruta interna de la SPA (sin el base). */
  path: string
  /** Título del documento. */
  label: string
  /** URL pública completa, la que se pega en Play Console. */
  url: string
  /** Para qué la pide Google Play / la app. */
  purpose: string
}

export const legalLinks: LegalLink[] = [
  {
    path: '/privacidad',
    label: 'Política de Privacidad',
    url: `${PUBLIC_BASE}/privacidad`,
    purpose: 'URL de la Política de Privacidad que se declara en Play Console',
  },
  {
    path: '/terminos',
    label: 'Términos y Condiciones',
    url: `${PUBLIC_BASE}/terminos`,
    purpose: 'Términos y Condiciones de uso del servicio',
  },
]

/** URL pública de un documento a partir de su ruta interna. */
export function legalUrl(path: string): string {
  return `${PUBLIC_BASE}${path}`
}
