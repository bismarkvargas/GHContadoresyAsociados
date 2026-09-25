import { useMemo, useState } from 'react'
import { Check, Download, UserCheck, X } from 'lucide-react'
import { accountRequestsApi, type AccountRequestPage } from '@/api/endpoints'
import { useApiMutation, useDebounced, useListQuery, useTableState } from '@/hooks/useApi'
import { usePermission } from '@/hooks/useAuth'
import { downloadCsv, formatDateTime, formatNumber } from '@/lib/format'
import {
  accountRequestStatusMeta,
  clientTypeList,
  clientTypeMeta,
  labelOf,
  toneOf,
} from '@/lib/labels'
import {
  Badge,
  Button,
  Card,
  Checkbox,
  DataTable,
  EmptyState,
  Modal,
  Pagination,
  SearchInput,
  Select,
  Tabs,
  Tab,
  Textarea,
  type Column,
} from '@/components/ui'
import { PageHeader } from '@/components/layout/AppShell'
import type { AccountRequest } from '@/types'

export default function AccountRequestsPage() {
  const { can } = usePermission()
  const [tab, setTab] = useState('Pending')
  const [selected, setSelected] = useState<AccountRequest | null>(null)
  const [rejecting, setRejecting] = useState<AccountRequest | null>(null)
  const [reason, setReason] = useState('')
  const [role, setRole] = useState('Cliente')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const table = useTableState({ pageSize: 20, sort: 'createdAt', order: 'desc' })
  const search = useDebounced(table.search, 350)

  const params = useMemo(
    () => ({
      ...table.params,
      status: tab === 'all' ? undefined : tab,
      search: search || undefined,
      clientType: table.filters.clientType || undefined,
      source: table.filters.source || undefined,
      from: from || undefined,
      to: to || undefined,
    }),
    [table.params, table.filters, tab, search, from, to],
  )

  const query = useListQuery<AccountRequest, AccountRequestPage>(
    ['account-requests'],
    accountRequestsApi.list,
    params,
  )

  const approve = useApiMutation((id: string) => accountRequestsApi.approve(id, role), {
    successMessage: 'Solicitud aprobada · usuario Cliente creado',
    invalidate: [['account-requests'], ['users'], ['clients'], ['dashboard']],
    onSuccess: () => setSelected(null),
  })
  const reject = useApiMutation((vars: { id: string; reason: string }) =>
    accountRequestsApi.reject(vars.id, vars.reason),
  {
    successMessage: 'Solicitud rechazada con motivo',
    invalidate: [['account-requests'], ['dashboard']],
    onSuccess: () => {
      setRejecting(null)
      setReason('')
    },
  })

  const columns: Column<AccountRequest>[] = [
    {
      key: 'fullName',
      header: 'Solicitante',
      sortable: true,
      render: (r) => (
        <div className="min-w-0">
          <button
            type="button"
            className="block max-w-full truncate text-left font-medium text-ink hover:text-primary"
            onClick={() => setSelected(r)}
          >
            {r.fullName}
          </button>
          {r.company ? <span className="block truncate text-xs text-muted">{r.company}</span> : null}
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Contacto',
      render: (r) => (
        <div className="min-w-0">
          <span className="block truncate text-xs text-ink-700">{r.email}</span>
          <span className="block text-xs text-muted">{r.phone}</span>
        </div>
      ),
    },
    {
      key: 'idNumber',
      header: 'Cédula',
      render: (r) => <span className="font-mono text-xs text-muted">{r.idNumber}</span>,
    },
    {
      key: 'clientType',
      header: 'Tipo',
      sortable: true,
      render: (r) => <Badge tone={toneOf(clientTypeMeta, r.clientType)}>{labelOf(clientTypeMeta, r.clientType)}</Badge>,
    },
    {
      key: 'source',
      header: 'Origen',
      render: (r) => <span className="text-xs text-muted">{r.source}</span>,
    },
    {
      key: 'status',
      header: 'Estado',
      sortable: true,
      render: (r) => (
        <Badge tone={toneOf(accountRequestStatusMeta, r.status)}>
          {labelOf(accountRequestStatusMeta, r.status)}
        </Badge>
      ),
    },
    {
      key: 'createdAt',
      header: 'Recibida',
      sortable: true,
      render: (r) => <span className="text-xs text-muted">{formatDateTime(r.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) =>
        r.status === 'Pending' && can('accountrequests.approve') ? (
          <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              variant="success"
              icon={<Check className="h-3.5 w-3.5" />}
              onClick={() => setSelected(r)}
            >
              Aprobar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<X className="h-3.5 w-3.5" />}
              onClick={() => setRejecting(r)}
            >
              Rechazar
            </Button>
          </div>
        ) : null,
    },
  ]

  const pendingCount = query.data?.pendingCount ?? 0

  return (
    <>
      <PageHeader
        title="Solicitudes de cuenta"
        subtitle="Onboarding desde el app móvil y el sitio web · al aprobar se crea el usuario Cliente"
        actions={
          <Button
            variant="secondary"
            icon={<Download className="h-4 w-4" />}
            disabled={!query.data?.items.length}
            onClick={() =>
              downloadCsv(
                `solicitudes-cuenta-gh-${new Date().toISOString().slice(0, 10)}.csv`,
                (query.data?.items ?? []).map((r) => ({
                  Nombre: r.fullName,
                  Empresa: r.company ?? '',
                  Correo: r.email,
                  Telefono: r.phone,
                  Cedula: r.idNumber,
                  Tipo: labelOf(clientTypeMeta, r.clientType),
                  Origen: r.source,
                  Estado: labelOf(accountRequestStatusMeta, r.status),
                  Seguimiento: r.trackingCode,
                  MotivoRechazo: r.rejectionReason ?? '',
                  Recibida: r.createdAt,
                })),
              )
            }
          >
            Exportar CSV
          </Button>
        }
      />

      <Card padded={false}>
        <Tabs value={tab} onChange={setTab}>
          <Tab value="Pending">Pendientes ({formatNumber(pendingCount)})</Tab>
          <Tab value="Approved">Aprobadas</Tab>
          <Tab value="Rejected">Rechazadas</Tab>
          <Tab value="Cancelled">Canceladas</Tab>
          <Tab value="all">Todas</Tab>
        </Tabs>

        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-5">
          <SearchInput
            value={table.search}
            onChange={table.setSearch}
            placeholder="Buscar por nombre, correo, cédula o empresa"
            className="lg:col-span-2"
          />
          <Select
            value={table.filters.clientType ?? ''}
            onChange={(e) => table.setFilter('clientType', e.target.value)}
            placeholder="Todos los tipos"
            options={clientTypeList.map((t) => ({ value: t, label: labelOf(clientTypeMeta, t) }))}
          />
          <div>
            <label className="gh-label">Desde</label>
            <input type="date" className="gh-input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="gh-label">Hasta</label>
            <input type="date" className="gh-input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex items-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                table.resetFilters()
                setFrom('')
                setTo('')
              }}
              className="w-full"
            >
              Limpiar filtros
            </Button>
          </div>
        </div>

        <DataTable
          columns={columns}
          rows={query.data?.items ?? []}
          rowKey={(r) => r.id}
          loading={query.isLoading}
          error={query.isError ? query.error : undefined}
          onRetry={() => void query.refetch()}
          sort={table.sort}
          order={table.order}
          onSort={table.setSort}
          onRowClick={(r) => setSelected(r)}
          empty={
            <EmptyState
              icon={<UserCheck className="h-4 w-4" />}
              title="Sin solicitudes en esta bandeja"
              description="Las solicitudes enviadas desde el app aparecen aquí automáticamente."
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

      {/* Detalle / aprobación */}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `Solicitud de ${selected.fullName}` : ''}
        size="md"
        footer={
          selected?.status === 'Pending' && can('accountrequests.approve') ? (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setRejecting(selected)
                  setSelected(null)
                }}
              >
                Rechazar
              </Button>
              <Button
                variant="success"
                loading={approve.isPending}
                onClick={() => approve.mutate(selected.id)}
              >
                Aprobar y crear usuario
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setSelected(null)}>
              Cerrar
            </Button>
          )
        }
      >
        {selected ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={toneOf(accountRequestStatusMeta, selected.status)}>
                {labelOf(accountRequestStatusMeta, selected.status)}
              </Badge>
              <Badge tone={toneOf(clientTypeMeta, selected.clientType)}>
                {labelOf(clientTypeMeta, selected.clientType)}
              </Badge>
              <span className="font-mono text-xs text-muted">{selected.trackingCode}</span>
            </div>

            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              {[
                ['Nombre completo', selected.fullName],
                ['Empresa', selected.company ?? '—'],
                ['Correo', selected.email],
                ['Teléfono', selected.phone],
                ['Cédula / pasaporte', selected.idNumber],
                ['Origen', selected.source],
                ['IP', selected.ipAddress ?? '—'],
                ['Recibida', formatDateTime(selected.createdAt)],
                ['Revisada', selected.reviewedAt ? formatDateTime(selected.reviewedAt) : 'Pendiente'],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
                  <dd className="mt-0.5 text-ink">{value}</dd>
                </div>
              ))}
            </dl>

            {selected.message ? (
              <div className="rounded-control border border-line bg-surface-2 px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-muted">Mensaje del solicitante</p>
                <p className="mt-1 whitespace-pre-line text-sm text-ink-700">{selected.message}</p>
              </div>
            ) : null}

            {selected.rejectionReason ? (
              <p className="rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                Motivo de rechazo: {selected.rejectionReason}
              </p>
            ) : null}

            {selected.status === 'Pending' && can('accountrequests.approve') ? (
              <div className="rounded-card border border-line p-3">
                <Select
                  label="Rol del usuario a crear"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  options={[
                    { value: 'Cliente', label: 'Cliente (acceso al app)' },
                    { value: 'Asistente', label: 'Asistente (staff)' },
                  ]}
                />
                <p className="mt-2 text-xs text-muted">
                  Al aprobar se crea el usuario (estado <strong>Active</strong>), se vincula al cliente nuevo
                  y se emite notificación in-app y push. La contraseña temporal es{' '}
                  <code>Cliente123!</code>.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      {/* Rechazo con motivo */}
      <Modal
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        title="Rechazar solicitud"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejecting(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={!reason.trim()}
              loading={reject.isPending}
              onClick={() => rejecting && reject.mutate({ id: rejecting.id, reason })}
            >
              Rechazar solicitud
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-700">
          El solicitante <strong>{rejecting?.fullName}</strong> será notificado con el motivo. No se crea usuario
          ni cliente.
        </p>
        <Textarea
          label="Motivo del rechazo"
          className="mt-3"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Documentación de identidad ilegible o incompleta."
        />
        <Checkbox className="mt-3" label="Enviar notificación por correo además de in-app" defaultChecked disabled />
      </Modal>
    </>
  )
}
