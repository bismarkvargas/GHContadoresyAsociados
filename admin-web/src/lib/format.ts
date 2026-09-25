/** Utilidades de formato — moneda base USD (docs/01 §5). */

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
})

const crc = new Intl.NumberFormat('es-CR', {
  style: 'currency',
  currency: 'CRC',
  minimumFractionDigits: 2,
})

export function formatMoney(value: number | null | undefined, currency = 'USD'): string {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return currency === 'CRC' ? crc.format(n) : usd.format(n)
}

export function formatNumber(value: number | null | undefined, decimals = 0): string {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return new Intl.NumberFormat('es-CR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n)
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('es-CR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d)
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('es-CR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso).getTime()
  if (Number.isNaN(d)) return '—'
  const diff = Date.now() - d
  const min = Math.round(diff / 60000)
  if (Math.abs(min) < 1) return 'ahora'
  if (Math.abs(min) < 60) return min > 0 ? `hace ${min} min` : `en ${-min} min`
  const hours = Math.round(min / 60)
  if (Math.abs(hours) < 24) return hours > 0 ? `hace ${hours} h` : `en ${-hours} h`
  const days = Math.round(hours / 24)
  if (Math.abs(days) < 30) return days > 0 ? `hace ${days} d` : `en ${-days} d`
  return formatDate(iso)
}

export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null
  const target = new Date(iso)
  if (Number.isNaN(target.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const t = new Date(target)
  t.setHours(0, 0, 0, 0)
  return Math.round((t.getTime() - today.getTime()) / 86400000)
}

export function isOverdue(iso: string | null | undefined): boolean {
  const d = daysUntil(iso)
  return d !== null && d < 0
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function formatMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m) return ym
  const d = new Date(Date.UTC(y, m - 1, 1))
  return new Intl.DateTimeFormat('es-CR', { month: 'short', year: '2-digit' }).format(d)
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

/** Convierte filas a CSV y dispara la descarga. */
export function downloadCsv(
  filename: string,
  rows: Record<string, unknown>[],
  columns?: { key: string; header: string }[],
): void {
  const cols = columns ?? Object.keys(rows[0] ?? {}).map((k) => ({ key: k, header: k }))
  const escape = (v: unknown): string => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [
    cols.map((c) => escape(c.header)).join(';'),
    ...rows.map((r) => cols.map((c) => escape(r[c.key])).join(';')),
  ]
  // BOM para que Excel respete los acentos
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export function cx(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ')
}

export function truncate(value: string, max = 80): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

/**
 * Extrae un identificador de una respuesta de la API de forma tolerante.
 * Acepta `{id}`, `{Id}`, `{clientId}`, envoltorios (`{client:{id}}`, `{data:{id}}`)
 * y cadenas vacías o el literal «undefined». Devuelve `null` si no hay id válido,
 * para que la interfaz nunca construya rutas como `/clientes/undefined`.
 */
export function pickId(payload: unknown, ...keys: string[]): string | null {
  const claves = keys.length ? keys : ['id', 'Id', 'clientId', 'caseFileId', 'orderId', 'userId']
  const visitar = (valor: unknown, profundidad: number): string | null => {
    if (!valor || typeof valor !== 'object' || profundidad > 2) return null
    const registro = valor as Record<string, unknown>
    for (const clave of claves) {
      const candidato = registro[clave]
      if (isUsableId(candidato)) return String(candidato)
    }
    for (const envoltorio of ['client', 'data', 'item', 'result', 'order', 'caseFile']) {
      const anidado = registro[envoltorio]
      const encontrado = visitar(anidado, profundidad + 1)
      if (encontrado) return encontrado
    }
    return null
  }
  return visitar(payload, 0)
}

/** ¿Es un identificador utilizable (no vacío ni los literales «undefined»/«null»)? */
export function isUsableId(valor: unknown): boolean {
  if (typeof valor !== 'string' && typeof valor !== 'number') return false
  const texto = String(valor).trim()
  return texto !== '' && texto !== 'undefined' && texto !== 'null'
}

/** Escapa lo mínimo para un diff legible en HTML. */
export function prettyJson(value: string | null | undefined): string {
  if (!value) return '—'
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}
