import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BellRing, Download, Eye, MailPlus, RefreshCw, Send } from 'lucide-react'
import { notificationsApi, usersApi } from '@/api/endpoints'
import { useApiMutation, useDebounced, useListQuery, useTableState } from '@/hooks/useApi'
import { usePermission } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useUi'
import { downloadCsv, formatDateTime, formatNumber, prettyJson } from '@/lib/format'
import { labelOf, notificationTypeMeta, toneOf } from '@/lib/labels'
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Modal,
  Pagination,
  SearchInput,
  Select,
  Skeleton,
  TextInput,
  Textarea,
  type Column,
} from '@/components/ui'
import { PageHeader, PermissionGate } from '@/components/layout/AppShell'
import type { Notification } from '@/types'

/** Traduce el `deepLink` de la API a una ruta del panel. */
function rutaDelPanel(deepLink: string | null | undefined): string | null {
  if (!deepLink) return null
  const partes = deepLink.split('/').filter(Boolean)
  const mapa: Record<string, string> = {
    cases: '/expedientes',
    clients: '/clientes',
    orders: '/pedidos',
    payments: '/pagos',
    documents: '/documentos',
    quotes: '/cotizaciones',
    'account-requests': '/solicitudes',
  }
  const base = mapa[partes[0] ?? '']
  return base && partes[1] ? `${base}/${partes[1]}` : null
}

export default function NotificationsPage() {
  const { can } = usePermission()
  const toast = useToast()
  const table = useTableState({ pageSize: 20, sort: 'createdAt', order: 'desc' })
  const search = useDebounced(table.search, 350)
  const [detalle, setDetalle] = useState<Notification | null>(null)
  const [showSend, setShowSend] = useState(false)
  const [envio, setEnvio] = useState({ userId: '', title: '', body: '', type: 'System' })

  const params = useMemo(
    () => ({
      ...table.params,
      search: search || undefined,
      type: table.filters.type || undefined,
      unreadOnly: table.filters.unreadOnly === 'true' ? 'true' : undefined,
      channel: table.filters.channel || undefined,
      userId: table.filters.userId || undefined,
      from: table.filters.from || undefined,
      to: table.filters.to || undefined,
    }),
    [table.params, table.filters, search],
  )

  const query = useListQuery(['notifications', 'admin'], notificationsApi.list, params)
  const summary = useQuery({
    queryKey: ['notifications', 'summary'],
    queryFn: () => notificationsApi.summary(),
  })
  const destinatarios = useQuery({
    queryKey: ['users', 'staff-options'],
    queryFn: () => usersApi.list({ page: 1, pageSize: 100, isStaff: true, status: 'Active' }),
    staleTime: 120000,
  })

  const reenviar = useApiMutation((id: string) => notificationsApi.resend(id), {
    successMessage: 'Notificación reenviada',
    invalidate: [['notifications']],
    onSuccess: () => setDetalle(null),
  })

  const enviar = useApiMutation(
    (valores: typeof envio) =>
      notificationsApi.send({
        userId: valores.userId || undefined,
        title: valores.title,
        body: valores.body,
        type: valores.type,
      }),
    {
      successMessage: 'Notificación enviada',
      invalidate: [['notifications']],
      onSuccess: () => {
        setShowSend(false)
        setEnvio({ userId: '', title: '', body: '', type: 'System' })
      },
    },
  )

  const columnas: Column<Notification>[] = [
    {
      key: 'createdAt',
      header: 'Fecha',
      sortable: true,
      render: (n) => <span className="whitespace-nowrap text-xs text-muted">{formatDateTime(n.createdAt)}</span>,
    },
    {
      key: 'type',
      header: 'Tipo',
      sortable: true,
      render: (n) => <Badge tone={toneOf(notificationTypeMeta, n.type)}>{labelOf(notificationTypeMeta, n.type)}</Badge>,
    },
    {
      key: 'title',
      header: 'Notificación',
      sortable: true,
      render: (n) => (
        <div className="min-w-0">
          <button
            type="button"
            className="block max-w-full truncate text-left font-medium text-ink hover:text-primary"
            onClick={() => setDetalle(n)}
          >
            {n.title}
          </button>
          <span className="line-clamp-1 block text-xs text-muted">{n.body}</span>
        </div>
      ),
    },
    {
      key: 'userName',
      header: 'Destinatario',
      sortable: true,
      render: (n) => (
        <div className="min-w-0">
          <span className="block truncate text-sm text-ink-700">{n.userName ?? '—'}</span>
          <span className="block truncate text-xs text-muted">{n.userEmail ?? ''}</span>
        </div>
      ),
    },
    {
      key: 'channel',
      header: 'Canal',
      render: (n) => <span className="text-xs text-muted">{n.channel}</span>,
    },
    {
      key: 'status',
      header: 'Estado',
      render: (n) => (
        <Badge tone={n.isRead ? 'neutral' : 'primary'}>{n.isRead ? 'Leída' : 'Sin leer'}</Badge>
      ),
    },
    {
      key: 'deepLink',
      header: 'Enlace',
      render: (n) => {
        const ruta = rutaDelPanel(n.deepLink)
        if (!ruta) return <span className="text-xs text-muted">—</span>
        return (
          <Link to={ruta} className="gh-link text-xs">
            Abrir
          </Link>
        )
      },
    },
    {
      key: 'acciones',
      header: '',
      align: 'right',
      render: (n) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant="ghost"
            title="Ver detalle"
            icon={<Eye className="h-3.5 w-3.5" />}
            onClick={() => setDetalle(n)}
          />
          <PermissionGate permission="notifications.send">
            <Button
              size="sm"
              variant="ghost"
              title="Reenviar"
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={() => reenviar.mutate(n.id)}
            />
          </PermissionGate>
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Notificaciones enviadas"
        subtitle={`${formatNumber(summary.data?.total ?? query.data?.total ?? 0)} notificaciones · ${formatNumber(
          summary.data?.unread ?? 0,
        )} sin leer`}
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Download className="h-4 w-4" />}
              disabled={!query.data?.items.length}
              onClick={() =>
                downloadCsv(
                  `notificaciones-gh-${new Date().toISOString().slice(0, 10)}.csv`,
                  (query.data?.items ?? []).map((n) => ({
                    Fecha: n.createdAt,
                    Tipo: n.type,
                    Titulo: n.title,
                    Cuerpo: n.body,
                    Destinatario: n.userName ?? '',
                    Correo: n.userEmail ?? '',
                    Canal: n.channel,
                    Estado: n.status,
                    Leida: n.isRead ? 'Si' : 'No',
                    Enlace: n.deepLink ?? '',
                  })),
                )
              }
            >
              Exportar CSV
            </Button>
            <PermissionGate permission="notifications.send">
              <Button variant="primary" icon={<Send className="h-4 w-4" />} onClick={() => setShowSend(true)}>
                Enviar notificación
              </Button>
            </PermissionGate>
          </>
        }
      />

      {summary.isLoading ? (
        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="gh-card-pad space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-6 w-16" />
            </div>
          ))}
        </div>
      ) : summary.data ? (
        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="gh-card-pad">
            <p className="text-xs uppercase tracking-wide text-muted">Total</p>
            <p className="mt-1.5 text-lg font-semibold text-ink">{formatNumber(summary.data.total)}</p>
          </div>
          <div className="gh-card-pad">
            <p className="text-xs uppercase tracking-wide text-muted">Sin leer</p>
            <p className="mt-1.5 text-lg font-semibold text-primary">{formatNumber(summary.data.unread)}</p>
          </div>
          <div className="gh-card-pad">
            <p className="text-xs uppercase tracking-wide text-muted">Últimos 30 días</p>
            <p className="mt-1.5 text-lg font-semibold text-ink">{formatNumber(summary.data.last30Days)}</p>
          </div>
          <div className="gh-card-pad">
            <p className="text-xs uppercase tracking-wide text-muted">Tipos distintos</p>
            <p className="mt-1.5 text-lg font-semibold text-ink">{formatNumber(summary.data.byType.length)}</p>
          </div>
        </div>
      ) : null}

      {summary.data?.byType?.length ? (
        <div className="mb-5 flex flex-wrap gap-2">
          {summary.data.byType.map((t) => (
            <button
              key={t.type}
              type="button"
              onClick={() => table.setFilter('type', table.filters.type === t.type ? '' : t.type)}
              className={`rounded-control border px-3 py-1.5 text-xs font-medium transition-colors ${
                table.filters.type === t.type
                  ? 'border-primary bg-primary-50 text-primary'
                  : 'border-line bg-card text-ink-700 hover:bg-surface-2'
              }`}
            >
              {t.label} · {formatNumber(t.count)}
            </button>
          ))}
        </div>
      ) : null}

      <Card padded={false}>
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-5">
          <SearchInput
            value={table.search}
            onChange={table.setSearch}
            placeholder="Buscar por título, cuerpo o destinatario"
            className="lg:col-span-2"
          />
          <Select
            value={table.filters.type ?? ''}
            onChange={(e) => table.setFilter('type', e.target.value)}
            placeholder="Todos los tipos"
            options={Object.entries(notificationTypeMeta).map(([clave, meta]) => ({
              value: clave,
              label: meta.label,
            }))}
          />
          <Select
            value={table.filters.userId ?? ''}
            onChange={(e) => table.setFilter('userId', e.target.value)}
            placeholder="Todos los destinatarios"
            options={(destinatarios.data?.items ?? []).map((u) => ({ value: u.id, label: u.fullName }))}
          />
          <Select
            value={table.filters.unreadOnly ?? ''}
            onChange={(e) => table.setFilter('unreadOnly', e.target.value)}
            placeholder="Leídas y sin leer"
            options={[{ value: 'true', label: 'Solo sin leer' }]}
          />
          <div>
            <label className="gh-label">Desde</label>
            <input
              type="date"
              className="gh-input"
              value={table.filters.from ?? ''}
              onChange={(e) => table.setFilter('from', e.target.value)}
            />
          </div>
          <div>
            <label className="gh-label">Hasta</label>
            <input
              type="date"
              className="gh-input"
              value={table.filters.to ?? ''}
              onChange={(e) => table.setFilter('to', e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button variant="ghost" onClick={table.resetFilters} className="w-full">
              Limpiar filtros
            </Button>
          </div>
        </div>

        <DataTable
          columns={columnas}
          rows={query.data?.items ?? []}
          rowKey={(n) => n.id}
          loading={query.isLoading}
          error={query.isError ? query.error : undefined}
          onRetry={() => void query.refetch()}
          sort={table.sort}
          order={table.order}
          onSort={table.setSort}
          onRowClick={(n) => setDetalle(n)}
          dense
          empty={
            <EmptyState
              icon={<BellRing className="h-4 w-4" />}
              title="Sin notificaciones con estos filtros"
              description="Aquí se listan los avisos enviados a clientes y al personal de la firma."
            />
          }
        />

        {query.data && query.data.total > 0 ? (
          <Pagination
            page={query.data.page}
            pageSize={query.data.pageSize}
            total={query.data.total}
            totalPages={query.data.totalPages}
            onPage={table.setPage}
            onPageSize={table.setPageSize}
          />
        ) : null}
      </Card>

      {!can('notifications.send') ? (
        <p className="mt-3 text-xs text-muted">
          Su rol permite consultar la bandeja pero no reenviar ni enviar notificaciones.
        </p>
      ) : null}

      <Modal
        open={!!detalle}
        onClose={() => setDetalle(null)}
        title={detalle?.title ?? 'Notificación'}
        size="lg"
        footer={
          detalle ? (
            <>
              <PermissionGate permission="notifications.send">
                <Button
                  variant="primary"
                  icon={<RefreshCw className="h-4 w-4" />}
                  loading={reenviar.isPending}
                  onClick={() => reenviar.mutate(detalle.id)}
                >
                  Reenviar
                </Button>
              </PermissionGate>
              <Button variant="secondary" onClick={() => setDetalle(null)}>
                Cerrar
              </Button>
            </>
          ) : null
        }
      >
        {detalle ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={toneOf(notificationTypeMeta, detalle.type)}>
                {labelOf(notificationTypeMeta, detalle.type)}
              </Badge>
              <Badge tone={detalle.isRead ? 'neutral' : 'primary'}>{detalle.isRead ? 'Leída' : 'Sin leer'}</Badge>
              <Badge tone="neutral">{detalle.channel}</Badge>
              <span className="font-mono text-[11px] text-muted">{detalle.id}</span>
            </div>

            <p className="rounded-control border border-line bg-surface-2 px-3 py-2 text-sm text-ink-700">
              {detalle.body}
            </p>

            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              {[
                ['Destinatario', detalle.userName ?? '—'],
                ['Correo', detalle.userEmail ?? '—'],
                ['Enviada', formatDateTime(detalle.createdAt)],
                ['Enviada (sentAt)', formatDateTime(detalle.sentAt)],
                ['Estado técnico', detalle.status],
                ['Mensaje FCM', detalle.fcmMessageId ?? '—'],
              ].map(([etiqueta, valor]) => (
                <div key={etiqueta as string}>
                  <dt className="text-xs uppercase tracking-wide text-muted">{etiqueta}</dt>
                  <dd className="mt-0.5 break-all text-ink">{valor}</dd>
                </div>
              ))}
            </dl>

            {detalle.deepLink ? (
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Enlace profundo</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <code className="rounded bg-surface px-2 py-1 text-xs text-ink-700">{detalle.deepLink}</code>
                  {rutaDelPanel(detalle.deepLink) ? (
                    <Link to={rutaDelPanel(detalle.deepLink)!} className="gh-link text-xs">
                      Abrir en el panel
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}

            {detalle.dataJson ? (
              <div>
                <p className="mb-1 text-xs uppercase tracking-wide text-muted">Datos adjuntos</p>
                <pre className="max-h-56 overflow-auto rounded-control border border-line bg-surface-2 p-3 text-[11px] text-ink-700">
                  {prettyJson(detalle.dataJson)}
                </pre>
              </div>
            ) : null}

            {detalle.error ? (
              <p className="rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                Error de entrega: {detalle.error}
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={showSend}
        onClose={() => setShowSend(false)}
        title="Enviar notificación"
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowSend(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              icon={<MailPlus className="h-4 w-4" />}
              loading={enviar.isPending}
              disabled={!envio.title.trim() || !envio.body.trim()}
              onClick={() => {
                if (!envio.userId) {
                  toast.warning('Seleccione un destinatario', 'El envío manual requiere un usuario.')
                  return
                }
                enviar.mutate(envio)
              }}
            >
              Enviar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Destinatario"
            required
            placeholder="Seleccione un usuario"
            value={envio.userId}
            onChange={(e) => setEnvio((v) => ({ ...v, userId: e.target.value }))}
            options={(destinatarios.data?.items ?? []).map((u) => ({
              value: u.id,
              label: `${u.fullName} · ${u.email}`,
            }))}
          />
          <Select
            label="Tipo"
            value={envio.type}
            onChange={(e) => setEnvio((v) => ({ ...v, type: e.target.value }))}
            options={Object.entries(notificationTypeMeta).map(([clave, meta]) => ({
              value: clave,
              label: meta.label,
            }))}
          />
          <TextInput
            label="Título"
            required
            value={envio.title}
            onChange={(e) => setEnvio((v) => ({ ...v, title: e.target.value }))}
            placeholder="Recordatorio de vencimiento"
          />
          <Textarea
            label="Mensaje"
            required
            value={envio.body}
            onChange={(e) => setEnvio((v) => ({ ...v, body: e.target.value }))}
            placeholder="La declaración mensual vence el próximo día 15."
          />
          <p className="rounded-control border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
            La notificación se guarda como in-app y se entrega por el canal de tiempo real; con FCM
            configurado también se envía como push al app del cliente.
          </p>
        </div>
      </Modal>
    </>
  )
}
