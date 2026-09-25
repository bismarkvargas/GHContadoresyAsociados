import { Navigate, useLocation } from 'react-router-dom'
import { Loader2, ShieldAlert } from 'lucide-react'
import { useAuth, usePermission } from '@/hooks/useAuth'
import { Button } from '@/components/ui'
import { Link } from 'react-router-dom'

export function FullPageLoader({ label = 'Cargando panel…' }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-page text-muted">
      <Loader2 className="h-7 w-7 animate-spin text-primary" aria-hidden />
      <p className="text-sm">{label}</p>
    </div>
  )
}

/** Exige sesión activa; con `permission` exige además el permiso `modulo.accion`. */
export function ProtectedRoute({
  children,
  permission,
}: {
  children: React.ReactNode
  permission?: string | string[]
}) {
  const { isAuthenticated, isBootstrapping } = useAuth()
  const { can } = usePermission()
  const location = useLocation()

  if (isBootstrapping) return <FullPageLoader label="Validando sesión…" />
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />

  if (permission) {
    const codes = Array.isArray(permission) ? permission : [permission]
    if (!codes.some((c) => can(c))) return <Forbidden required={codes} />
  }

  return <>{children}</>
}

export function Forbidden({ required }: { required: string[] }) {
  const { user, roles } = useAuth()
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-card bg-danger/10 text-danger">
        <ShieldAlert className="h-7 w-7" aria-hidden />
      </div>
      <h1 className="text-xl font-semibold text-ink">Acceso denegado</h1>
      <p className="mt-2 max-w-lg text-sm text-muted">
        Su usuario <strong className="text-ink">{user?.email}</strong> con el rol{' '}
        <strong className="text-ink">{roles.join(' · ') || 'sin rol'}</strong> no tiene el permiso
        necesario para ver esta pantalla.
      </p>
      <p className="mt-3 rounded-control border border-line bg-surface-2 px-3 py-2 font-mono text-xs text-ink-700">
        {required.join(' · ')}
      </p>
      <Link to="/" className="mt-5">
        <Button variant="primary">Volver al dashboard</Button>
      </Link>
    </div>
  )
}

export function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-2xl font-semibold text-primary">404</p>
      <h1 className="mt-1 text-xl font-semibold text-ink">Pantalla no encontrada</h1>
      <p className="mt-2 max-w-md text-sm text-muted">
        La ruta solicitada no existe en el panel de administración de GH Contadores y Asociados.
      </p>
      <Link to="/" className="mt-5">
        <Button variant="primary">Ir al dashboard</Button>
      </Link>
    </div>
  )
}
