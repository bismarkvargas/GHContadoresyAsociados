import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { company } from '@/lib/constants'
import { navGroups, navItems } from '@/config/routes'
import { useAuth, usePermission } from '@/hooks/useAuth'
import { useRealtime, useTheme, useToast } from '@/hooks/useUi'
import { apiErrorMessage } from '@/api/client'
import { Avatar, Badge } from '@/components/ui'
import { cx } from '@/lib/format'
import { NotificationBell } from './NotificationBell'
import { GlobalSearch } from './GlobalSearch'

const SIDEBAR_KEY = 'gh.sidebar.collapsed'

/* ------------------------------------------------------------------ */
/* Sidebar                                                             */
/* ------------------------------------------------------------------ */

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { can } = usePermission()
  const visible = navItems.filter((item) => !item.permission || can(item.permission))

  return (
    <aside
      className={cx(
        'flex h-full shrink-0 flex-col border-r border-black/10 bg-[var(--gh-sidebar)] text-white transition-[width] duration-200',
        collapsed ? 'w-[68px]' : 'w-[248px]',
      )}
    >
      <div className="flex h-16 items-center gap-2.5 border-b border-white/10 px-3.5">
        <Link
          to="/"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-primary text-sm font-bold text-white"
          title={company.shortName}
        >
          GH
        </Link>
        {!collapsed ? (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight">{company.shortName}</p>
            <p className="truncate text-[11px] text-white/55">& Asociados · Admin</p>
          </div>
        ) : null}
      </div>

      <nav className="gh-scroll-hidden flex-1 overflow-y-auto px-2 py-3" aria-label="Menú principal">
        {navGroups.map((group) => {
          const items = visible.filter((i) => i.group === group)
          if (!items.length) return null
          return (
            <div key={group} className="mb-4">
              {!collapsed ? (
                <p className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                  {group}
                </p>
              ) : null}
              <ul className="space-y-0.5">
                {items.map((item) => (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      end={item.path === '/' || item.path === '/catalogos'}
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        cx(
                          'flex items-center gap-2.5 rounded-control px-2.5 py-2 text-sm transition-colors',
                          isActive
                            ? 'bg-primary text-white'
                            : 'text-white/75 hover:bg-[var(--gh-sidebar-hover)] hover:text-white',
                          collapsed && 'justify-center px-2',
                        )
                      }
                    >
                      <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                      {!collapsed ? <span className="truncate">{item.label}</span> : null}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </nav>

      <div className="border-t border-white/10 p-2.5">
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center gap-2 rounded-control px-2.5 py-2 text-xs text-white/70 transition-colors hover:bg-[var(--gh-sidebar-hover)] hover:text-white"
          aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          {!collapsed ? 'Colapsar' : null}
        </button>
        {!collapsed ? (
          <p className="px-2.5 pt-1 text-[10px] leading-tight text-white/35">
            Huacas, Santa Cruz · Guanacaste
          </p>
        ) : null}
      </div>
    </aside>
  )
}

/* ------------------------------------------------------------------ */
/* Topbar                                                              */
/* ------------------------------------------------------------------ */

function UserMenu() {
  const { user, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const toast = useToast()

  if (!user) return null

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-control p-1 pr-2 transition-colors hover:bg-surface"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Avatar name={user.fullName} />
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-xs font-semibold text-ink">{user.fullName}</span>
          <span className="block text-[11px] text-muted">{user.email}</span>
        </span>
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
            aria-hidden
            tabIndex={-1}
          />
          <div
            className="absolute right-0 z-20 mt-2 w-60 animate-fade-in rounded-card border border-line bg-card py-1.5 shadow-pop"
            role="menu"
          >
            <div className="border-b border-line px-3.5 py-2.5">
              <p className="text-sm font-semibold text-ink">{user.fullName}</p>
              <p className="truncate text-xs text-muted">{user.email}</p>
            </div>
            <Link
              to="/ajustes"
              onClick={() => setOpen(false)}
              className="block px-3.5 py-2 text-sm text-ink-700 hover:bg-surface-2"
              role="menuitem"
            >
              Ajustes del sistema
            </Link>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-sm text-danger hover:bg-surface-2"
              onClick={async () => {
                setOpen(false)
                try {
                  await signOut()
                  toast.info('Sesión cerrada')
                  navigate('/login', { replace: true })
                } catch (error) {
                  toast.error('No se pudo cerrar la sesión', apiErrorMessage(error))
                }
              }}
              role="menuitem"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Cerrar sesión
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}

function Topbar({ onOpenMobile }: { onOpenMobile: () => void }) {
  const { status } = useRealtime()
  const { theme, toggle } = useTheme()
  const { roles } = useAuth()

  const statusMeta: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'info' }> = {
    connected: { label: 'En vivo', tone: 'success' },
    mock: { label: 'En vivo (mock)', tone: 'info' },
    connecting: { label: 'Conectando…', tone: 'warning' },
    reconnecting: { label: 'Reconectando…', tone: 'warning' },
    disconnected: { label: 'Sin conexión', tone: 'danger' },
  }
  const meta = statusMeta[status] ?? statusMeta.disconnected!

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-card/95 px-3 backdrop-blur sm:px-5">
      <button
        type="button"
        className="rounded-control p-2 text-ink-700 hover:bg-surface lg:hidden"
        onClick={onOpenMobile}
        aria-label="Abrir menú"
      >
        <Menu className="h-5 w-5" />
      </button>

      <GlobalSearch />

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2.5">
        <Badge tone={meta.tone} className="hidden md:inline-flex">
          {status === 'disconnected' ? (
            <WifiOff className="h-3 w-3" aria-hidden />
          ) : (
            <Wifi className="h-3 w-3" aria-hidden />
          )}
          {meta.label}
        </Badge>
        <Badge tone="neutral" className="hidden xl:inline-flex">
          {roles.join(' · ') || 'Sin rol'}
        </Badge>

        <button
          type="button"
          onClick={toggle}
          className="rounded-control p-2 text-ink-700 transition-colors hover:bg-surface"
          aria-label={theme === 'light' ? 'Activar tema oscuro' : 'Activar tema claro'}
          title={theme === 'light' ? 'Tema oscuro' : 'Tema claro'}
        >
          {theme === 'light' ? (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          )}
        </button>

        <NotificationBell />
        <div className="mx-1 hidden h-8 w-px bg-line sm:block" />
        <UserMenu />
      </div>
    </header>
  )
}

/* ------------------------------------------------------------------ */
/* Breadcrumbs                                                         */
/* ------------------------------------------------------------------ */

const sectionLabels: Record<string, string> = {
  clientes: 'Clientes',
  expedientes: 'Expedientes',
  documentos: 'Documentos',
  catalogo: 'Catálogo',
  categorias: 'Categorías',
  pedidos: 'Pedidos',
  pagos: 'Pagos',
  cotizaciones: 'Cotizaciones',
  solicitudes: 'Solicitudes de cuenta',
  informes: 'Informes',
  usuarios: 'Usuarios',
  roles: 'Roles y permisos',
  ajustes: 'Ajustes',
  auditoria: 'Auditoría',
  tablero: 'Tablero kanban',
  nuevo: 'Nuevo',
}

function Breadcrumbs() {
  const { pathname } = useLocation()
  const parts = pathname.split('/').filter(Boolean)
  if (!parts.length) return <span className="text-xs text-muted">Panel de administración</span>

  return (
    <nav aria-label="Ruta de navegación" className="flex items-center gap-1.5 text-xs text-muted">
      <Link to="/" className="hover:text-ink">
        Inicio
      </Link>
      {parts.map((part, i) => {
        const to = `/${parts.slice(0, i + 1).join('/')}`
        const label = sectionLabels[part] ?? (part.length > 12 ? `${part.slice(0, 8)}…` : part)
        const last = i === parts.length - 1
        return (
          <span key={to} className="flex items-center gap-1.5">
            <ChevronRight className="h-3 w-3" aria-hidden />
            {last ? (
              <span className="font-medium text-ink">{label}</span>
            ) : (
              <Link to={to} className="hover:text-ink">
                {label}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

export function AppShell() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_KEY) === 'true')
  const [mobileOpen, setMobileOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, String(collapsed))
  }, [collapsed])

  useEffect(() => {
    setMobileOpen(false)
    window.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <div className="flex min-h-screen bg-page">
      <div className="hidden lg:block">
        <div className="sticky top-0 h-screen">
          <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
        </div>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-[var(--gh-overlay)]"
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar menú"
          />
          <div className="relative h-full w-[248px] animate-slide-in">
            <Sidebar collapsed={false} onToggle={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMobile={() => setMobileOpen(true)} />
        <div className="border-b border-line bg-surface-2 px-4 py-2 sm:px-6">
          <Breadcrumbs />
        </div>
        <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6">
          <Outlet />
        </main>
        <footer className="border-t border-line px-4 py-4 text-xs text-muted sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong className="text-ink-700">{company.legalName}</strong> · {company.address}
            </span>
            <span>
              {company.phones.join(' · ')} · {company.emailOrders}
            </span>
          </div>
        </footer>
      </div>
    </div>
  )
}

/** Barra de acciones reutilizable para las cabeceras de página. */
export function PageHeader({
  title,
  subtitle,
  actions,
  backTo,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
  backTo?: string
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {backTo ? (
            <Link
              to={backTo}
              className="rounded-control p-1.5 text-muted transition-colors hover:bg-surface hover:text-ink"
              aria-label="Volver"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
          ) : null}
          <h1 className="truncate text-xl font-semibold text-ink">{title}</h1>
        </div>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

/** Envuelve una acción y la oculta si el usuario no tiene el permiso. */
export function PermissionGate({
  permission,
  children,
  fallback = null,
}: {
  permission: string | string[]
  children: ReactNode
  fallback?: ReactNode
}) {
  const { can } = usePermission()
  const codes = Array.isArray(permission) ? permission : [permission]
  const allowed = codes.some((c) => can(c))
  return <>{allowed ? children : fallback}</>
}

export { Sidebar }
