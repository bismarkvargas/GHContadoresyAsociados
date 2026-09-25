import { useEffect } from 'react'

/**
 * Metadatos del documento para una página pública (`<title>` y `<meta name="description">`).
 * Son páginas que Google Play y los verificadores abren fuera de la aplicación, así que
 * cada una lleva su propio título y su propia descripción.
 */
export interface DocumentMeta {
  /** Título de la pestaña. Se le añade el sufijo corporativo. */
  title: string
  /** Contenido de `<meta name="description">`. */
  description: string
}

const SUFIJO = 'GH Contadores y Asociados'

/**
 * Aplica `document.title` y la meta descripción al montar la página y restaura los
 * valores anteriores al desmontarla (el panel y las páginas legales conviven en la
 * misma SPA, así que no se puede dejar el título cambiado).
 */
export function useDocumentMeta({ title, description }: DocumentMeta): void {
  useEffect(() => {
    const tituloPrevio = document.title
    document.title = `${title} · ${SUFIJO}`

    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const descripcionPrevia = meta?.getAttribute('content') ?? null
    meta?.setAttribute('content', description)

    return () => {
      document.title = tituloPrevio
      if (meta && descripcionPrevia !== null) meta.setAttribute('content', descripcionPrevia)
    }
  }, [title, description])
}
