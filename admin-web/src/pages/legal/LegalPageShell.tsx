import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { ArrowLeft, Building2, Globe, Mail, MapPin, Moon, Phone, Sun } from 'lucide-react'
import { company } from '@/lib/constants'
import { useTheme } from '@/hooks/useUi'
import { cx } from '@/lib/format'
import { legalLinks } from './legalLinks'

/** Rutas legales públicas: las que se declaran en Play Console y muestra el índice. */
export const rutasLegales = legalLinks.map(({ path, label }) => ({ path, label }))

/** Entrada del índice de secciones que encabeza cada documento. */
export interface LegalSection {
  /** `id` del `<section>` al que apunta el enlace interno. */
  id: string
  /** Título exacto de la sección. */
  title: string
  /**
   * Subapartados que aparecen anidados bajo la sección en el índice.
   * Son secciones reales del documento (con su propio `id`), pero se listan
   * dentro de su sección principal para no alargar el índice.
   */
  children?: LegalSection[]
}

interface LegalPageProps {
  /** Título principal del documento (`<h1>`). */
  title: string
  /** Clase del documento; se muestra junto al título. */
  eyebrow: string
  /** Fecha de entrada en vigor, ya formateada en español. */
  effectiveDate: string
  /** Fecha de la última revisión, ya formateada en español. */
  updatedAt: string
  /** Párrafo introductorio que resume el documento. */
  intro: string
  /** Secciones del índice, en el mismo orden en que aparecen en el cuerpo. */
  sections: LegalSection[]
  /** Cuerpo del documento (`<section>` por cada entrada del índice). */
  children: ReactNode
}

/**
 * Marco común de las páginas legales públicas (`/privacidad` y `/terminos`).
 *
 * Deliberadamente **fuera** del `AppShell`: no hay menú lateral, ni campana, ni
 * breadcrumbs, ni comprobación de sesión. Se accede por URL directa desde Google
 * Play, desde la app móvil y desde el pie del panel. Reproduce los rasgos de
 * marca del panel (franja lima superior, azul marino, Montserrat, logotipo según
 * el tema) y limita el ancho de lectura a 760 px para que el texto largo se lea
 * cómodamente.
 */
export function LegalPageShell({
  title,
  eyebrow,
  effectiveDate,
  updatedAt,
  intro,
  sections,
  children,
}: LegalPageProps) {
  const { theme, toggle } = useTheme()

  return (
    <div className="min-h-screen bg-page">
      {/* Franja superior de marca (lima corporativo, 4 px pegada al borde de la ventana) */}
      <div className="gh-brand-strip" aria-hidden />

      <header className="sticky top-1 z-20 border-b border-line bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            to="/"
            className="flex items-center"
            aria-label={`Ir al inicio del panel de ${company.legalName}`}
          >
            <img
              // La ruta se arma en tiempo de ejecución para que el logotipo se sirva
              // desde el base del despliegue (`/ghcontadores/brand/...`) sin depender
              // de un logotipo duplicado dentro del cuerpo del documento.
              src={`${import.meta.env.BASE_URL}brand/${
                theme === 'dark' ? 'logo-horizontal-blanco.png' : 'logo-horizontal-azul.png'
              }`}
              alt={`Logotipo de ${company.legalName}`}
              className="h-8 w-auto sm:h-9"
              width={1122}
              height={204}
            />
          </Link>

          <nav className="ml-auto flex items-center gap-1" aria-label="Documentos legales">
            {rutasLegales.map((ruta) => (
              <NavLink
                key={ruta.path}
                to={ruta.path}
                className={({ isActive }) =>
                  cx(
                    'rounded-control px-2.5 py-1.5 text-xs font-medium transition-colors sm:text-sm',
                    isActive
                      ? 'bg-primary-50 text-primary'
                      : 'text-ink-700 hover:bg-surface hover:text-ink',
                  )
                }
              >
                {ruta.label}
              </NavLink>
            ))}
          </nav>

          <button
            type="button"
            onClick={toggle}
            className="rounded-control p-2 text-ink-700 transition-colors hover:bg-surface"
            aria-label={theme === 'light' ? 'Activar tema oscuro' : 'Activar tema claro'}
            title={theme === 'light' ? 'Tema oscuro' : 'Tema claro'}
          >
            {theme === 'light' ? (
              <Moon className="h-4 w-4" aria-hidden />
            ) : (
              <Sun className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1120px] px-4 py-8 sm:px-6 sm:py-10">
        {/* Columna de lectura: 760 px como máximo */}
        <article className="mx-auto max-w-[760px]">
          <p className="gh-legal-eyebrow">{eyebrow}</p>
          <h1 className="mt-2 text-2xl font-bold leading-tight text-ink sm:text-[32px] sm:leading-10">
            {title}
          </h1>

          {/* Fechas visibles: requisito de los verificadores de Google Play */}
          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
            <div className="flex items-center gap-1.5">
              <dt className="font-semibold uppercase tracking-wide">Entrada en vigor:</dt>
              <dd>
                <time dateTime={effectiveDate}>{effectiveDate}</time>
              </dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt className="font-semibold uppercase tracking-wide">Última actualización:</dt>
              <dd>
                <time dateTime={updatedAt}>{updatedAt}</time>
              </dd>
            </div>
          </dl>

          <p className="gh-legal-lead mt-6 text-ink-700">{intro}</p>

          {/* Índice de secciones con enlaces internos */}
          <nav
            className="mt-8 rounded-card border border-line bg-surface-2 p-4 sm:p-5"
            aria-labelledby="indice"
          >
            <h2 id="indice" className="gh-legal-toc-title">
              Índice de secciones
            </h2>
            <ol className="gh-legal-toc mt-3">
              {sections.map((section, i) => (
                <li key={section.id}>
                  <div className="flex items-baseline gap-2">
                    <span className="gh-legal-toc-num" aria-hidden>
                      {i + 1}
                    </span>
                    <a href={`#${section.id}`}>{section.title}</a>
                  </div>
                  {section.children?.length ? (
                    <ol className="mt-1.5 space-y-1.5 pl-8">
                      {section.children.map((hijo) => (
                        <li key={hijo.id}>
                          <a href={`#${hijo.id}`}>{hijo.title}</a>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </li>
              ))}
            </ol>
          </nav>

          {/* Cuerpo del documento */}
          <div className="gh-legal mt-10">{children}</div>

          <p className="mt-10 border-t border-line pt-6 text-sm text-muted">
            Si algo de este documento no le queda claro, escríbanos a{' '}
            <a className="gh-link" href={`mailto:${company.emailOrders}`}>
              {company.emailOrders}
            </a>{' '}
            o al teléfono {company.phones[0]} y un profesional de la firma le explicará cómo le
            afecta.
          </p>

          <p className="mt-6">
            <Link className="gh-link inline-flex items-center gap-1.5 text-sm" to="/">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Volver al inicio
            </Link>
          </p>
        </article>
      </main>

      <footer className="mt-6 border-t border-line bg-surface-2">
        <div className="mx-auto max-w-[1120px] px-4 py-8 sm:px-6">
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <p className="text-base font-semibold text-ink">{company.legalName}</p>
              <p className="gh-legal-eyebrow mt-1">{company.tagline}</p>
              <ul className="mt-4 space-y-2 text-sm text-ink-700">
                <li className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
                  {company.address}
                </li>
                <li className="flex items-center gap-2">
                  <Phone className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                  {company.phones.join(' · ')}
                </li>
                <li className="flex items-center gap-2">
                  <Mail className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                  <a className="gh-link break-all" href={`mailto:${company.emailManagement}`}>
                    {company.emailManagement}
                  </a>
                </li>
                <li className="flex items-center gap-2">
                  <Mail className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                  <a className="gh-link break-all" href={`mailto:${company.emailOrders}`}>
                    {company.emailOrders}
                  </a>
                </li>
                <li className="flex items-center gap-2">
                  <Globe className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                  <a className="gh-link break-all" href={company.site}>
                    {company.site}
                  </a>
                </li>
                <li className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                  Zona horaria de atención: {company.timeZone}
                </li>
              </ul>
            </div>

            <div className="md:text-right">
              <p className="gh-legal-eyebrow">Documentos legales</p>
              <ul className="mt-3 space-y-2 text-sm">
                {rutasLegales.map((ruta) => (
                  <li key={ruta.path}>
                    <Link className="gh-link" to={ruta.path}>
                      {ruta.path === '/privacidad'
                        ? 'Política de Privacidad'
                        : 'Términos y Condiciones'}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link className="gh-link" to="/">
                    Inicio del panel
                  </Link>
                </li>
              </ul>
              <p className="mt-4 text-xs leading-relaxed text-muted">
                Moneda de facturación: {company.currency}. Estos documentos rigen el uso de la
                aplicación móvil y del panel de administración de la firma.
              </p>
            </div>
          </div>

          <p className="mt-8 border-t border-line pt-4 text-xs text-muted">
            © {new Date().getFullYear()} {company.legalName} · Todos los derechos reservados.
          </p>
        </div>
      </footer>
    </div>
  )
}
