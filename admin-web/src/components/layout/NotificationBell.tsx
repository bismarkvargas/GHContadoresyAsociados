import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, ExternalLink } from 'lucide-react'
import { notificationsApi } from '@/api/endpoints'
import { realtime } from '@/api/realtime'
import { apiErrorStatus } from '@/api/client'
import { usePermission } from '@/hooks/useAuth'
import { formatRelative } from '@/lib/format'
import { notificationTypeMeta, toneOf, labelOf } from '@/lib/labels'
import { Badge, EmptyState } from '@/components/ui'
import { cx } from '@/lib/format'

/** Notificación recibida en vivo por el canal de tiempo real. */
interface LiveNotification {
  id: string
  title: string
  body: string
  createdAt: string
  kind?: string
  deepLink?: string | null
  live: boolean
}

/** Fila renderizada en la bandeja (persistida en la API o recibida en vivo). */
interface BellItem {
  id: string
  title: string
  body: string
  createdAt: string
  kind?: string
  live: boolean
  read: boolean
  deepLink?: string | null
}

/**
 * Traduce el `deepLink` de la API (`/cases/{id}`, `/orders/{id}`…) a la ruta del
 * panel. Si no hay enlace utilizable devuelve `null` y no se navega a ciegas.
 */
function panelRoute(deepLink: string | null | undefined, kind?: string): string | null {
  const rutasPorTipo: Record<string, string> = {
    AccountApproved: '/solicitudes',
    AccountRejected: '/solicitudes',
    OrderPaid: '/pedidos',
    OrderStatusChanged: '/pedidos',
    PaymentFailed: '/pagos',
    TaskDueSoon: '/informes',
  }
  if (deepLink) {
    const partes = deepLink.split('/').filter(Boolean)
    const [recurso, id] = partes
    if (id) {
      const mapa: Record<string, string> = {
        cases: '/expedientes',
        clients: '/clientes',
        orders: '/pedidos',
        payments: '/pagos',
        documents: '/documentos',
        quotes: '/cotizaciones',
        'account-requests': '/solicitudes',
      }
      const base = mapa[recurso ?? '']
      if (base) return `${base}/${id}`
    }
    if (partes[0]?.startsWith('gh') === false && deepLink.startsWith('/')) return deepLink
  }
  return kind ? (rutasPorTipo[kind] ?? null) : null
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [live, setLive] = useState<LiveNotification[]>([])
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { can } = usePermission()

  /**
   * El histórico de notificaciones es opcional: si la API no lo expone (404) o el
   * rol no tiene `notifications.view`, la campana sigue funcionando con los eventos
   * de tiempo real y no se generan errores de consola.
   */
  const [historialDisponible, setHistorialDisponible] = useState(true)
  const puedeVerHistorial = can('notifications.view')

  /* Contadores de la campana: total y sin leer */
  const summary = useQuery({
    queryKey: ['notifications', 'summary'],
    queryFn: () => notificationsApi.summary(),
    enabled: historialDisponible && puedeVerHistorial,
    refetchInterval: 60000,
    retry: false,
  })

  const { data, error } = useQuery({
    queryKey: ['notifications', { page: 1, pageSize: 12 }],
    queryFn: () => notificationsApi.list({ page: 1, pageSize: 12, sort: 'createdAt', order: 'desc' }),
    enabled: historialDisponible && puedeVerHistorial,
    refetchInterval: 60000,
    retry: false,
  })

  useEffect(() => {
    const estado = apiErrorStatus(error)
    if (estado === 404 || estado === 403) setHistorialDisponible(false)
  }, [error])

  /* Eventos en vivo: cada notificación nueva entra a la campana sin recargar */
  useEffect(() => {
    const off = realtime.on('notification', (payload) => {
      if (payload.source === 'poll' && !payload.title) return
      const title = String(payload.title ?? 'Notificación')
      setLive((current) =>
        [
          {
            id: `live-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            title,
            body: String(payload.body ?? ''),
            createdAt: new Date().toISOString(),
            kind: payload.kind ? String(payload.kind) : undefined,
            deepLink: payload.deepLink ? String(payload.deepLink) : null,
            live: true,
          },
          ...current,
        ].slice(0, 10),
      )
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    })
    return off
  }, [queryClient, endpointAvailable])

  const persistidas = data?.items ?? []
  const sinLeerPersistidas = summary.data?.unread ?? persistidas.filter((n) => !n.isRead).length
  const sinLeer = sinLeerPersistidas + live.length

  const items = useMemo<BellItem[]>(() => {
    const persistidasItems: BellItem[] = persistidas.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      createdAt: n.createdAt,
      kind: n.type as string,
      live: false,
      read: !!n.isRead,
      deepLink: n.deepLink ?? null,
    }))
    const enVivo: BellItem[] = live.map((l) => ({ ...l, read: false }))
    return [...enVivo, ...persistidasItems].slice(0, 14)
  }, [persistidas, live])

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-control p-2 text-ink-700 transition-colors hover:bg-surface"
        aria-label={`Notificaciones${sinLeer ? ` (${sinLeer} sin leer)` : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" aria-hidden />
        {sinLeer > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-white">
            {sinLeer > 99 ? '99+' : sinLeer}
          </span>
        ) : null}
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
            className="absolute right-0 z-20 mt-2 w-[380px] max-w-[calc(100vw-24px)] animate-fade-in overflow-hidden rounded-card border border-line bg-card shadow-pop"
            role="menu"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-ink">Notificaciones</p>
                <p className="text-[11px] text-muted">
                  {sinLeer > 0 ? `${sinLeer} sin leer` : 'Todo al día'}
                  {historialDisponible ? ` · ${summary.data?.total ?? persistidas.length} en total` : ''}
                </p>
              </div>
              {puedeVerHistorial && historialDisponible ? (
                <Link
                  to="/notificaciones"
                  className="gh-link flex items-center gap-1 text-xs"
                  onClick={() => setOpen(false)}
                >
                  Ver todas
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </Link>
              ) : null}
            </div>

            <div className="max-h-[400px] overflow-y-auto">
              {!historialDisponible && items.length === 0 ? (
                <EmptyState
                  title="Sin histórico disponible"
                  description="Su rol no tiene acceso al histórico de notificaciones; aquí verá los avisos en vivo."
                />
              ) : items.length === 0 ? (
                <EmptyState title="Sin notificaciones" description="Aquí verá la actividad de la firma en vivo." />
              ) : (
                <ul className="divide-y divide-[var(--gh-border)]">
                  {items.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        className={cx(
                          'flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2',
                          !n.read && 'bg-primary-50/40',
                        )}
                        onClick={() => {
                          setOpen(false)
                          const destino = panelRoute(n.deepLink, n.kind)
                          navigate(destino ?? '/')
                        }}
                      >
                        <span className="mt-0.5 shrink-0">
                          <Badge tone={toneOf(notificationTypeMeta, n.kind)}>
                            {labelOf(notificationTypeMeta, n.kind)}
                          </Badge>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-medium text-ink">{n.title}</span>
                            {n.live ? (
                              <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-primary" />
                            ) : null}
                          </span>
                          <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{n.body}</span>
                          <span className="mt-1 block text-[11px] text-muted">{formatRelative(n.createdAt)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
