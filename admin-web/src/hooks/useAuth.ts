import { useCallback, useContext } from 'react'
import { AuthContext, type AuthContextValue } from '@/contexts/AuthContext'

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}

/**
 * RBAC en la UI: comprueba el permiso `modulo.accion` contra los permisos efectivos
 * devueltos por el login (/auth/me). SuperAdmin pasa siempre.
 */
export function usePermission(): {
  can: (code: string) => boolean
  canAny: (codes: string[]) => boolean
  canAll: (codes: string[]) => boolean
  permissions: string[]
  roles: string[]
  isSuperAdmin: boolean
} {
  const { permissions, roles } = useAuth()
  const isSuperAdmin = roles.includes('SuperAdmin')

  const can = useCallback(
    (code: string) => {
      if (isSuperAdmin) return true
      if (permissions.includes(code)) return true
      // Comodín por módulo: `cases.*`
      const [moduleKey] = code.split('.')
      return permissions.includes(`${moduleKey}.*`)
    },
    [permissions, isSuperAdmin],
  )

  const canAny = useCallback((codes: string[]) => codes.some((c) => can(c)), [can])
  const canAll = useCallback((codes: string[]) => codes.every((c) => can(c)), [can])

  return { can, canAny, canAll, permissions, roles, isSuperAdmin }
}

/** Alias corto usado en los componentes: const can = usePermission().can */
export function useCan(): (code: string) => boolean {
  return usePermission().can
}
