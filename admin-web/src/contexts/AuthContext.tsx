import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as authApi from '@/api/auth'
import { tokenStore } from '@/api/client'
import type { AuthUser } from '@/types'

export interface AuthState {
  user: AuthUser | null
  roles: string[]
  permissions: string[]
  isAuthenticated: boolean
  isBootstrapping: boolean
  error: string | null
}

export interface AuthActions {
  signIn: (email: string, password: string, remember: boolean) => Promise<void>
  signOut: () => Promise<void>
  clearError: () => void
}

export type AuthContextValue = AuthState & AuthActions

export const AuthContext = createContext<AuthContextValue | null>(null)

const PROFILE_KEY = 'gh.profile'

interface StoredProfile {
  user: AuthUser
  roles: string[]
  permissions: string[]
}

function readProfile(): StoredProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY) ?? sessionStorage.getItem(PROFILE_KEY)
    return raw ? (JSON.parse(raw) as StoredProfile) : null
  } catch {
    return null
  }
}

function writeProfile(profile: StoredProfile | null, remember: boolean): void {
  if (!profile) {
    localStorage.removeItem(PROFILE_KEY)
    sessionStorage.removeItem(PROFILE_KEY)
    return
  }
  const target = remember ? localStorage : sessionStorage
  const other = remember ? sessionStorage : localStorage
  target.setItem(PROFILE_KEY, JSON.stringify(profile))
  other.removeItem(PROFILE_KEY)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    const profile = readProfile()
    return {
      user: profile?.user ?? null,
      roles: profile?.roles ?? [],
      permissions: profile?.permissions ?? [],
      isAuthenticated: false,
      isBootstrapping: true,
      error: null,
    }
  })

  /* Rehidratación de sesión: si hay token, se valida contra /auth/me */
  useEffect(() => {
    let cancelled = false
    async function bootstrap(): Promise<void> {
      if (!tokenStore.access) {
        if (!cancelled) setState((s) => ({ ...s, isBootstrapping: false, isAuthenticated: false }))
        return
      }
      try {
        const data = await authApi.me()
        if (cancelled) return
        writeProfile({ user: data.user, roles: data.roles, permissions: data.permissions }, tokenStore.remember)
        setState({
          user: data.user,
          roles: data.roles,
          permissions: data.permissions,
          isAuthenticated: true,
          isBootstrapping: false,
          error: null,
        })
      } catch {
        // Token muerto o usuario no staff: se limpia la sesión sin ruido.
        tokenStore.clearAll()
        writeProfile(null, false)
        if (!cancelled) {
          setState({
            user: null,
            roles: [],
            permissions: [],
            isAuthenticated: false,
            isBootstrapping: false,
            error: null,
          })
        }
      }
    }
    void bootstrap()
    return () => {
      cancelled = true
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string, remember: boolean) => {
    setState((s) => ({ ...s, error: null }))
    try {
      const data = await authApi.login(email, password, remember)
      writeProfile({ user: data.user, roles: data.roles, permissions: data.permissions }, remember)
      setState({
        user: data.user,
        roles: data.roles,
        permissions: data.permissions,
        isAuthenticated: true,
        isBootstrapping: false,
        error: null,
      })
    } catch (error) {
      const message =
        (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        (error instanceof Error ? error.message : 'No se pudo iniciar sesión.')
      setState((s) => ({ ...s, error: message, isAuthenticated: false }))
      throw new Error(message)
    }
  }, [])

  const signOut = useCallback(async () => {
    await authApi.logout()
    writeProfile(null, false)
    setState({
      user: null,
      roles: [],
      permissions: [],
      isAuthenticated: false,
      isBootstrapping: false,
      error: null,
    })
  }, [])

  const clearError = useCallback(() => setState((s) => ({ ...s, error: null })), [])

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, signIn, signOut, clearError }),
    [state, signIn, signOut, clearError],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
