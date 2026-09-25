/**
 * Registro de peticiones del adaptador mock, visible solo en desarrollo.
 *
 * En modo mock las llamadas no pasan por la red (se resuelven en memoria), así que
 * las herramientas de verificación no pueden observarlas. Este registro las expone
 * en `window.__ghRequestLog` **únicamente cuando corre el servidor de desarrollo**
 * (`import.meta.env.DEV`), y no existe en el bundle de producción.
 */

export interface MockRequestEntry {
  method: string
  url: string
  body: unknown
}

const MAX_ENTRIES = 300
const registro: MockRequestEntry[] = []

type VentanaConRegistro = Window & { __ghRequestLog?: MockRequestEntry[] }

function exponer(): void {
  if (!import.meta.env.DEV) return
  if (typeof window === 'undefined') return
  ;(window as VentanaConRegistro).__ghRequestLog = registro
}

export function registrarPeticionMock(entrada: MockRequestEntry): void {
  registro.push(entrada)
  if (registro.length > MAX_ENTRIES) registro.shift()
  exponer()
}

exponer()
