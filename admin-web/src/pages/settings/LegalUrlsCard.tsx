import { useState, type ReactNode } from 'react'
import { Check, Copy, ExternalLink, ShieldCheck } from 'lucide-react'
import { legalLinks } from '@/pages/legal/legalLinks'

/** Una URL con su botón de copiar: el administrador las pega en Play Console. */
function UrlCopiable({ url }: { url: string }): ReactNode {
  const [copiado, setCopiado] = useState(false)

  async function copiar(): Promise<void> {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Si el navegador bloquea el portapapeles la URL sigue visible para seleccionarla a mano.
      setCopiado(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        className="gh-input font-mono text-xs"
        value={url}
        readOnly
        onFocus={(e) => e.currentTarget.select()}
        aria-label={`URL pública: ${url}`}
      />
      <button
        type="button"
        onClick={copiar}
        className="shrink-0 rounded-control border border-line p-2 text-ink-700 transition-colors hover:bg-surface-2"
        aria-label={copiado ? 'URL copiada' : `Copiar ${url}`}
        title={copiado ? 'Copiada' : 'Copiar URL'}
      >
        {copiado ? (
          <Check className="h-4 w-4 text-success" aria-hidden />
        ) : (
          <Copy className="h-4 w-4" aria-hidden />
        )}
      </button>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="shrink-0 rounded-control border border-line p-2 text-ink-700 transition-colors hover:bg-surface-2"
        aria-label={`Abrir ${url} en una pestaña nueva`}
        title="Abrir en una pestaña nueva"
      >
        <ExternalLink className="h-4 w-4" aria-hidden />
      </a>
    </div>
  )
}

/**
 * URLs de las páginas legales públicas del panel (`/privacidad` y `/terminos`).
 *
 * Son las direcciones que se declaran en Google Play Console y las que abre la app
 * móvil. Están aquí para que el administrador pueda copiarlas cuando la tienda las
 * pida, junto al resto de la configuración de la firma.
 */
export function LegalUrlsCard() {
  return (
    <section className="gh-card">
      <header className="flex items-center gap-2 border-b border-line px-5 py-3.5">
        <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
        <div>
          <h2 className="text-base font-semibold text-ink">Páginas legales públicas</h2>
          <p className="mt-0.5 text-xs text-muted">
            No piden sesión: se declaran en Google Play Console y las abre la app móvil
          </p>
        </div>
      </header>
      <div className="space-y-4 p-5">
        {legalLinks.map((enlace) => (
          <div key={enlace.path}>
            <p className="text-xs font-semibold text-ink">{enlace.label}</p>
            <p className="mb-2 mt-0.5 text-[11px] leading-relaxed text-muted">{enlace.purpose}</p>
            <UrlCopiable url={enlace.url} />
          </div>
        ))}
        <p className="text-[11px] leading-relaxed text-muted">
          El contenido legal vive en <code>src/pages/legal/</code> (Privacidad y Términos). Al
          modificar un documento, actualice también su fecha de «Última actualización» y vuelva a
          desplegar el panel.
        </p>
      </div>
    </section>
  )
}
