import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, Download, Eye } from 'lucide-react'
import { auditApi, usersApi } from '@/api/endpoints'
import { useDebounced, useListQuery, useTableState } from '@/hooks/useApi'
import { downloadCsv, formatDateTime, formatNumber, prettyJson } from '@/lib/format'
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
  type Column,
} from '@/components/ui'
import { PageHeader } from '@/components/layout/AppShell'
import type { AuditLog } from '@/types'

const actionTones: Record<string, 'success' | 'danger' | 'info' | 'warning' | 'primary' | 'neutral'> = {
  create: 'success',
  update: 'info',
  delete: 'danger',
  login: 'neutral',
  logout: 'neutral',
  approve: 'success',
  reject: 'danger',
  refund: 'warning',
  'status-change': 'primary',
  assign: 'info',
  'reset-password': 'warning',
  send: 'info',
  convert: 'success',
  'create-case': 'success',
}

const entityOptions = [
  'Client',
  'ClientContact',
  'ClientInteraction',
  'CaseFile',
  'CaseTask',
  'Document',
  'Product',
  'ProductCategory',
  'Order',
  'AccountRequest',
  'QuoteRequest',
  'User',
  'UserRole',
  'Role',
  'RolePermission',
  'Setting',
  'Message',
  'Notification',
]

export default function AuditPage() {
  const table = useTableState({ pageSize: 25, sort: 'createdAt', order: 'desc' })
  const search = useDebounced(table.search, 350)
  const [detail, setDetail] = useState<(AuditLog & { userName?: string }) | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const params = useMemo(
    () => ({
      ...table.params,
      search: search || undefined,
      userId: table.filters.userId || undefined,
      entityName: table.filters.entityName || undefined,
      action: table.filters.action || undefined,
      from: from || undefined,
      to: to || undefined,
    }),
    [table.params, table.filters, search, from, to],
  )

  const query = useListQuery(['audit'], auditApi.list, params)
  const staff = useQuery({
    queryKey: ['users', 'staff-options'],
    queryFn: () => usersApi.list({ page: 1, pageSize: 100, isStaff: true, status: 'Active' }),
    staleTime: 120000,
  })

  const columns: Column<AuditLog & { userName?: string }>[] = [
    {
      key: 'createdAt',
      header: 'Fecha',
      sortable: true,
      render: (l) => <span className="whitespace-nowrap text-xs text-muted">{formatDateTime(l.createdAt)}</span>,
    },
    {
      key: 'userName',
      header: 'Usuario',
      sortable: true,
      render: (l) => <span className="text-sm text-ink">{l.userName ?? 'Sistema'}</span>,
    },
    {
      key: 'action',
      header: 'Acción',
      sortable: true,
      render: (l) => <Badge tone={actionTones[l.action] ?? 'neutral'}>{l.action}</Badge>,
    },
    {
      key: 'entityName',
      header: 'Entidad',
      sortable: true,
      render: (l) => (
        <div className="min-w-0">
          <span className="block text-sm text-ink-700">{l.entityName}</span>
          <span className="block truncate font-mono text-[11px] text-muted">{l.entityId ?? '—'}</span>
        </div>
      ),
    },
    {
      key: 'ipAddress',
      header: 'IP',
      render: (l) => <span className="font-mono text-xs text-muted">{l.ipAddress ?? '—'}</span>,
    },
    {
      key: 'change',
      header: 'Cambio',
      render: (l) => (
        <span className="text-xs text-muted">
          {l.beforeJson ? 'antes → después' : 'sin estado previo'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (l) => (
        <Button
          size="sm"
          variant="ghost"
          icon={<Eye className="h-3.5 w-3.5" />}
          title="Ver diff"
          onClick={() => setDetail(l)}
        />
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Auditoría"
        subtitle={`${formatNumber(query.data?.total ?? 0)} acciones registradas · filtros por usuario, entidad y fecha`}
        actions={
          <Button
            variant="secondary"
            icon={<Download className="h-4 w-4" />}
            disabled={!query.data?.items.length}
            onClick={() =>
              downloadCsv(
                `auditoria-gh-${new Date().toISOString().slice(0, 10)}.csv`,
                (query.data?.items ?? []).map((l) => ({
                  Fecha: l.createdAt,
                  Usuario: l.userName ?? 'Sistema',
                  Accion: l.action,
                  Entidad: l.entityName,
                  EntidadId: l.entityId ?? '',
                  IP: l.ipAddress ?? '',
                  UserAgent: l.userAgent ?? '',
                  Antes: l.beforeJson ?? '',
                  Despues: l.afterJson ?? '',
                })),
              )
            }
          >
            Exportar CSV
          </Button>
        }
      />

      <Card padded={false}>
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-6">
          <SearchInput
            value={table.search}
            onChange={table.setSearch}
            placeholder="Buscar por acción, entidad o identificador"
            className="lg:col-span-2"
          />
          <Select
            value={table.filters.userId ?? ''}
            onChange={(e) => table.setFilter('userId', e.target.value)}
            placeholder="Todos los usuarios"
            options={(staff.data?.items ?? []).map((u) => ({ value: u.id, label: u.fullName }))}
          />
          <Select
            value={table.filters.entityName ?? ''}
            onChange={(e) => table.setFilter('entityName', e.target.value)}
            placeholder="Todas las entidades"
            options={entityOptions.map((e) => ({ value: e, label: e }))}
          />
          <div>
            <label className="gh-label">Desde</label>
            <input type="date" className="gh-input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="gh-label">Hasta</label>
            <input type="date" className="gh-input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex items-end gap-2 lg:col-span-2">
            <Button
              variant="ghost"
              onClick={() => {
                table.resetFilters()
                setFrom('')
                setTo('')
              }}
            >
              Limpiar filtros
            </Button>
          </div>
        </div>

        <DataTable
          columns={columns}
          rows={query.data?.items ?? []}
          rowKey={(l) => l.id}
          loading={query.isLoading}
          error={query.isError ? query.error : undefined}
          onRetry={() => void query.refetch()}
          sort={table.sort}
          order={table.order}
          onSort={table.setSort}
          onRowClick={(l) => setDetail(l)}
          dense
          empty={<EmptyState icon={<Activity className="h-4 w-4" />} title="Sin registros de auditoría" />}
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

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={`Detalle de la acción: ${detail?.action ?? ''}`}
        size="lg"
        footer={
          <Button variant="secondary" onClick={() => setDetail(null)}>
            Cerrar
          </Button>
        }
      >
        {detail ? (
          <div className="space-y-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              {[
                ['Fecha', formatDateTime(detail.createdAt)],
                ['Usuario', detail.userName ?? 'Sistema'],
                ['Acción', detail.action],
                ['Entidad', detail.entityName],
                ['Identificador', detail.entityId ?? '—'],
                ['IP', detail.ipAddress ?? '—'],
                ['User agent', detail.userAgent ?? '—'],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
                  <dd className="mt-0.5 break-all text-ink">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="grid gap-3 lg:grid-cols-2">
              <div>
                <p className="mb-1.5 text-xs uppercase tracking-wide text-muted">Antes</p>
                <pre className="max-h-72 overflow-auto rounded-control border border-line bg-surface-2 p-3 text-[11px] text-ink-700">
                  {prettyJson(detail.beforeJson)}
                </pre>
              </div>
              <div>
                <p className="mb-1.5 text-xs uppercase tracking-wide text-muted">Después</p>
                <pre className="max-h-72 overflow-auto rounded-control border border-line bg-surface-2 p-3 text-[11px] text-ink-700">
                  {prettyJson(detail.afterJson)}
                </pre>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  )
}
