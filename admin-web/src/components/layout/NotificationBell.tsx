import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck } from 'lucide-react'
import { notificationsApi } from '@/api/endpoints'
import { apiErrorStatus } from '@/api/client'
import { realtime } from '@/api/realtime'
import { formatRelative } from '@/lib/format'
import { notificationTypeMeta, toneOf, labelOf } from '@/lib/labels'
import { Badge, Button, EmptyState } from '@/components/ui'
import { useToast } from '@/hooks/useUi'
import { cx } from '@/lib/format'

interface LiveNotification {
  id: string
  title: string
  body: string
  createdAt: string
  kind?: string
  live: boolean
}

/** Elemento renderizado en la bandeja (persistido o en vivo). */
interface BellItem {
  id: string
  title: string
  body: string
  createdAt: string
  kind?: string
  live: boolean
  read: boolean
}

const deepLinkByType: Record<string, string> = {
  AccountApproved: '/solicitudes',
  AccountRejected: '/solicitudes',
  CaseCreated: '/expedientes',
  CaseStatusChanged: '/expedientes',
  TaskAssigned: '/expedientes',
  TaskDueSoon: '/informes',
  TaskCompleted: '/expedientes',
  DocumentAvailable: '/documentos',
  OrderPaid: '/pedidos',
  OrderStatusChanged: '/pedidos',
  PaymentFailed: '/pagos',
  MessageReceived: '/expedientes',
  System: '/',
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [live, setLive] = useState<LiveNotification[]>([])
  const queryClient = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const seenRef = useRef(0)

  /**
   * Si la API no expone la bandeja de administración (responde 404), se deja de
   * consultar: la campana sigue funcionando con los eventos de tiempo real y no
   * se generan errores de consola en bucle.
   */
  const [endpointAvailable, setEndpointAvailable] = useState(true)

  const { data, error } = useQuery({
    queryKey: ['notifications', { page: 1, pageSize: 12 }],
    queryFn: () => notificationsApi.list({ page: 1, pageSize: 12 }),
    refetchInterval: 60000,
    enabled: endpointAvailable,
    retry: false,
  })

  useEffect(() => {
    if (apiErrorStatus(error) === 404) setEndpointAvailable(false)
  }, [error])

  /* Eventos en vivo: cada notificación nueva entra a la campana sin recargar */
  useEffect(() => {
    const off = realtime.on('notification', (payload) => {
      if (payload.source === 'poll' && !payload.title) return
      const title = String(payload.title ?? 'Notificación')
      const body = String(payload.body ?? '')
      const kind = payload.kind ? String(payload.kind) : undefined
      seenRef.current += 1
      setLive((current) =>
        [
          {
            id: `live-${Date.now()}-${seenRef.current}`,
            title,
            body,
            createdAt: new Date().toISOString(),
            kind,
            live: true,
          },
          ...current,
        ].slice(0, 10),
      )
    })
    return off
  }, [])

  /* Refresca la bandeja cuando llega cualquier evento de negocio */
  useEffect(() => {
    if (!endpointAvailable) return
    const off = realtime.onAny(() => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    })
    return off
  }, [queryClient, endpointAvailable])

  const markAll = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      setLive([])
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
    onError: () => toast.error('No se pudieron marcar como leídas'),
  })

  const persisted = data?.items ?? []
  const unreadPersisted = persisted.filter((n) => !n.readAt).length
  const unread = unreadPersisted + live.length

  const items = useMemo<BellItem[]>(() => {
    const persistedItems: BellItem[] = persisted.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      createdAt: n.createdAt,
      kind: n.type as string,
      live: false,
      read: !!n.readAt,
    }))
    const liveItems: BellItem[] = live.map((l) => ({ ...l, read: false }))
    return [...liveItems, ...persistedItems].slice(0, 14)
  }, [persisted, live])

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-control p-2 text-ink-700 transition-colors hover:bg-surface"
        aria-label={`Notificaciones${unread ? ` (${unread} sin leer)` : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" aria-hidden />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
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
            className="absolute right-0 z-20 mt-2 w-[360px] max-w-[calc(100vw-24px)] animate-fade-in overflow-hidden rounded-card border border-line bg-card shadow-pop"
            role="menu"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-ink">Notificaciones</p>
                <p className="text-[11px] text-muted">
                  {unread > 0 ? `${unread} sin leer` : 'Todo al día'} · actualización en vivo
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                icon={<CheckCheck className="h-3.5 w-3.5" />}
                onClick={() => {
                  if (!endpointAvailable) {
                    setLive([])
                    toast.info('Bandeja local vaciada', 'La API no expone el histórico de notificaciones.')
                    return
                  }
                  markAll.mutate()
                }}
                loading={markAll.isPending}
              >
                Marcar leídas
              </Button>
            </div>

            <div className="max-h-[380px] overflow-y-auto">
              {items.length === 0 ? (
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
                          const link = n.kind ? deepLinkByType[n.kind] : undefined
                          navigate(link ?? '/')
                        }}
                      >
                        <span className="mt-0.5">
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
