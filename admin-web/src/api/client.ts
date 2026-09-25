/**
 * Cliente axios del panel.
 * Con VITE_USE_MOCKS=true las peticiones se resuelven contra el adaptador mock;
 * con false, axios habla con la API real en VITE_API_URL.
 */

import axios, { AxiosError, type AxiosInstance, type AxiosRequestConfig } from 'axios'
import { handleMockRequest, MockHttpError } from './mock/router'
import { normalizeApiPayload } from './normalize'

/**
 * Limpia el cuerpo de una petición antes de enviarla:
 * - `''`, `null` y `undefined` se omiten para que un PUT/PATCH no borre datos
 *   existentes con cadenas vacías (la API los interpreta como «vaciar el campo»).
 * - `false`, `0` y los arreglos vacíos se conservan siempre (son valores legítimos).
 * - Los `File` y `Blob` pasan intactos; `FormData` no se toca.
 */
export function limpiarCuerpo(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map((item) => limpiarCuerpo(item))
  if (valor === null || valor === undefined) return valor
  if (typeof valor !== 'object') return valor
  if (typeof File !== 'undefined' && valor instanceof File) return valor
  if (typeof Blob !== 'undefined' && valor instanceof Blob) return valor

  const salida: Record<string, unknown> = {}
  for (const [clave, entrada] of Object.entries(valor as Record<string, unknown>)) {
    if (entrada === '' || entrada === null || entrada === undefined) continue
    salida[clave] = limpiarCuerpo(entrada)
  }
  return salida
}

/** ¿El cuerpo se puede limpiar como JSON? (no se toca multipart ni binarios). */
function cuerpoLimpiable(dato: unknown): boolean {
  if (dato === null || dato === undefined) return false
  if (typeof dato === 'string') return false
  if (typeof FormData !== 'undefined' && dato instanceof FormData) return false
  if (typeof Blob !== 'undefined' && dato instanceof Blob) return false
  if (typeof ArrayBuffer !== 'undefined' && dato instanceof ArrayBuffer) return false
  return typeof dato === 'object'
}

export const USE_MOCKS = String(import.meta.env.VITE_USE_MOCKS ?? 'true') !== 'false'

export const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? '/ghcontadores/api/v1'

const ACCESS_KEY = 'gh.accessToken'
const REFRESH_KEY = 'gh.refreshToken'
const REMEMBER_KEY = 'gh.remember'

/** Almacén de sesión: localStorage si "recordar sesión", sessionStorage si no. */
export const tokenStore = {
  get access(): string | null {
    return localStorage.getItem(ACCESS_KEY) ?? sessionStorage.getItem(ACCESS_KEY)
  },
  get refresh(): string | null {
    return localStorage.getItem(REFRESH_KEY) ?? sessionStorage.getItem(REFRESH_KEY)
  },
  get remember(): boolean {
    return localStorage.getItem(REMEMBER_KEY) === 'true'
  },
  save(accessToken: string, refreshToken: string, remember: boolean): void {
    const target = remember ? localStorage : sessionStorage
    const other = remember ? sessionStorage : localStorage
    target.setItem(ACCESS_KEY, accessToken)
    target.setItem(REFRESH_KEY, refreshToken)
    other.removeItem(ACCESS_KEY)
    other.removeItem(REFRESH_KEY)
    if (remember) localStorage.setItem(REMEMBER_KEY, 'true')
    else localStorage.removeItem(REMEMBER_KEY)
  },
  clear(): void {
    for (const store of [localStorage, sessionStorage]) {
      store.removeItem(ACCESS_KEY)
      store.removeItem(REFRESH_KEY)
    }
  },
  clearAll(): void {
    this.clear()
    localStorage.removeItem(REMEMBER_KEY)
  },
}

export const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = tokenStore.access
  if (token) {
    config.headers = config.headers ?? {}
    config.headers.Authorization = `Bearer ${token}`
  }

  // Se omiten los campos vacíos para no borrar datos existentes en PUT/PATCH.
  if (cuerpoLimpiable(config.data)) {
    config.data = limpiarCuerpo(config.data)
  }

  return config
})

/**
 * La API .NET en producción devuelve formas distintas a las del contrato de
 * referencia (nombres de campo, envoltorios, etiquetas traducidas, permisos `"*"`).
 * Se traducen aquí, en el borde, para que los componentes usen un único modelo.
 * En modo mock no se aplica: el adaptador ya devuelve el modelo interno.
 */
api.interceptors.response.use((response) => {
  if (!USE_MOCKS && response.data !== undefined) {
    response.data = normalizeApiPayload(response.config.url ?? '', response.data)
  }
  return response
})

/** Convierte un error del mock en un AxiosError con payload problem+json. */
function toAxiosError(error: MockHttpError, config: AxiosRequestConfig): AxiosError {
  const err = new AxiosError(
    error.message,
    String(error.status),
    config as never,
    undefined,
    {
      status: error.status,
      statusText: 'Mock',
      data: error.payload,
      headers: {},
      config: config as never,
    } as never,
  )
  return err
}

if (USE_MOCKS) {
  api.defaults.adapter = async (config) => {
    const method = (config.method ?? 'get').toUpperCase()
    let url = config.url ?? '/'
    const params = config.params as Record<string, unknown> | undefined
    if (params) {
      const search = new URLSearchParams()
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null || v === '') continue
        if (Array.isArray(v)) for (const item of v) search.append(k, String(item))
        else search.append(k, String(v))
      }
      const qs = search.toString()
      if (qs) url += `${url.includes('?') ? '&' : '?'}${qs}`
    }

    let body: unknown = config.data
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body)
      } catch {
        /* se deja tal cual */
      }
    }

    const headers: Record<string, string> = {}
    const raw = (config.headers ?? {}) as Record<string, unknown>
    for (const [k, v] of Object.entries(raw)) {
      if (v !== undefined && v !== null) headers[k.toLowerCase()] = String(v)
    }

    try {
      const response = await handleMockRequest({ method, url, body, headers })
      return {
        data: response.data,
        status: response.status,
        statusText: 'OK',
        headers: {},
        config,
      }
    } catch (error) {
      if (error instanceof MockHttpError) throw toAxiosError(error, config)
      throw error
    }
  }
}

/** Extrae un mensaje legible de cualquier error de la API. */
export function apiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { detail?: string; title?: string; errors?: Record<string, string[]> }
      | undefined
    if (data?.errors) {
      const first = Object.values(data.errors)[0]
      if (first?.length) return first[0]!
    }
    if (data?.detail) return data.detail
    if (data?.title) return data.title
    if (error.code === 'ECONNABORTED') return 'La operación tardó demasiado. Intente de nuevo.'
    if (!error.response) return 'No se pudo conectar con el servidor.'
    return error.message
  }
  if (error instanceof Error) return error.message
  return 'Ocurrió un error inesperado.'
}

export function apiErrorStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined
}

/* ------------------------------------------------------------------ */
/* Utilidades de respuesta                                             */
/* ------------------------------------------------------------------ */

export async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const { data } = await api.get<T>(url, { params })
  return data
}

export async function post<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await api.post<T>(url, body)
  return data
}

export async function put<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await api.put<T>(url, body)
  return data
}

export async function patch<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await api.patch<T>(url, body)
  return data
}

export async function del<T>(url: string): Promise<T> {
  const { data } = await api.delete<T>(url)
  return data
}

export { MockHttpError }
