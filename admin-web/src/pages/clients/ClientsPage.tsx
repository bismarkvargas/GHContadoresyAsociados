import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Download, Plus, Users } from 'lucide-react'
import { clientsApi, usersApi } from '@/api/endpoints'
import { useDebounced, useListQuery, useTableState } from '@/hooks/useApi'
import { usePermission } from '@/hooks/useAuth'
import { downloadCsv, formatDate, formatMoney, formatNumber } from '@/lib/format'
import {
  clientSourceList,
  clientSourceMeta,
  clientStatusList,
  clientStatusMeta,
  clientTypeList,
  clientTypeMeta,
  labelOf,
  toneOf,
} from '@/lib/labels'
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Pagination,
  SearchInput,
  Select,
  type Column,
} from '@/components/ui'
import { PageHeader } from '@/components/layout/AppShell'
import type { Client } from '@/types'

export default function ClientsPage() {
  const navigate = useNavigate()
  const { can } = usePermission()
  const table = useTableState({ pageSize: 20, sort: 'createdAt', order: 'desc' })
  const search = useDebounced(table.search, 350)

  const params = useMemo(() => ({ ...table.params, search: search || undefined }), [table.params, search])

  const query = useListQuery(['clients'], clientsApi.list, params)
  const staff = useQuery({
    queryKey: ['users', 'staff-options'],
    queryFn: () => usersApi.list({ page: 1, pageSize: 100, isStaff: true, status: 'Active' }),
    staleTime: 120000,
  })

  const columns: Column<Client>[] = [
    {
      key: 'code',
      header: 'Código',
      sortable: true,
      render: (c) => <span className="font-mono text-xs text-muted">{c.code}</span>,
    },
    {
      key: 'legalName',
      header: 'Cliente',
      sortable: true,
      render: (c) => (
        <div className="min-w-0">
          <Link to={`/clientes/${c.id}`} className="block truncate font-medium text-ink hover:text-primary">
            {c.legalName}
          </Link>
          <span className="block truncate text-xs text-muted">
            {c.tradeName ? `${c.tradeName} · ` : ''}
            {c.idNumber}
          </span>
        </div>
      ),
    },
    {
      key: 'clientType',
      header: 'Tipo',
      sortable: true,
      render: (c) => <Badge tone={toneOf(clientTypeMeta, c.clientType)}>{labelOf(clientTypeMeta, c.clientType)}</Badge>,
    },
    {
      key: 'status',
      header: 'Estado',
      sortable: true,
      render: (c) => <Badge tone={toneOf(clientStatusMeta, c.status)}>{labelOf(clientStatusMeta, c.status)}</Badge>,
    },
    {
      key: 'contact',
      header: 'Contacto',
      render: (c) => (
        <div className="min-w-0">
          <span className="block truncate text-xs text-ink-700">{c.email}</span>
          <span className="block text-xs text-muted">{c.phone}</span>
        </div>
      ),
    },
    {
      key: 'source',
      header: 'Origen',
      sortable: true,
      render: (c) => <span className="text-xs text-muted">{labelOf(clientSourceMeta, c.source)}</span>,
    },
    {
      key: 'tagsCsv',
      header: 'Etiquetas',
      render: (c) =>
        c.tagsCsv ? (
          <div className="flex flex-wrap gap-1">
            {c.tagsCsv.split(',').filter(Boolean).slice(0, 3).map((tag) => (
              <span key={tag} className="rounded-full bg-surface px-2 py-0.5 text-[11px] text-ink-700">
                {tag}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted">—</span>
        ),
    },
    {
      key: 'openCases',
      header: 'Expedientes',
      sortable: true,
      align: 'center',
      render: (c) => (
        <span className="tabular-nums">
          <strong className="text-ink">{formatNumber(c.openCases ?? 0)}</strong>
          <span className="text-xs text-muted"> / {formatNumber(c.totalCases ?? 0)}</span>
        </span>
      ),
    },
    {
      key: 'totalBilled',
      header: 'Facturado',
      sortable: true,
      align: 'right',
      render: (c) => <span className="tabular-nums text-ink">{formatMoney(c.totalBilled ?? 0)}</span>,
    },
    {
      key: 'createdAt',
      header: 'Alta',
      sortable: true,
      render: (c) => <span className="text-xs text-muted">{formatDate(c.createdAt)}</span>,
    },
  ]

  function exportCsv(): void {
    const rows = (query.data?.items ?? []).map((c) => ({
      Codigo: c.code,
      Nombre: c.legalName,
      Tipo: labelOf(clientTypeMeta, c.clientType),
      Estado: labelOf(clientStatusMeta, c.status),
      Cedula: c.idNumber,
      Correo: c.email,
      Telefono: c.phone,
      Origen: labelOf(clientSourceMeta, c.source),
      Etiquetas: c.tagsCsv ?? '',
      ExpedientesAbiertos: c.openCases ?? 0,
      TotalFacturado: c.totalBilled ?? 0,
      Alta: c.createdAt,
    }))
    downloadCsv(`clientes-gh-${new Date().toISOString().slice(0, 10)}.csv`, rows)
  }

  const active = query.data?.items ?? []

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle={`CRM de la firma · ${formatNumber(query.data?.total ?? 0)} registros`}
        actions={
          <>
            <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportCsv} disabled={!active.length}>
              Exportar CSV
            </Button>
            {can('clients.create') ? (
              <Link to="/clientes/nuevo">
                <Button variant="primary" icon={<Plus className="h-4 w-4" />}>
                  Nuevo cliente
                </Button>
              </Link>
            ) : null}
          </>
        }
      />

      <Card padded={false}>
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-5">
          <SearchInput
            value={table.search}
            onChange={table.setSearch}
            placeholder="Buscar por nombre, cédula, correo o código"
            className="lg:col-span-2"
          />
          <Select
            value={table.filters.status ?? ''}
            onChange={(e) => table.setFilter('status', e.target.value)}
            placeholder="Todos los estados"
            options={clientStatusList.map((s) => ({ value: s, label: labelOf(clientStatusMeta, s) }))}
          />
          <Select
            value={table.filters.clientType ?? ''}
            onChange={(e) => table.setFilter('clientType', e.target.value)}
            placeholder="Todos los tipos"
            options={clientTypeList.map((s) => ({ value: s, label: labelOf(clientTypeMeta, s) }))}
          />
          <Select
            value={table.filters.source ?? ''}
            onChange={(e) => table.setFilter('source', e.target.value)}
            placeholder="Todo origen"
            options={clientSourceList.map((s) => ({ value: s, label: labelOf(clientSourceMeta, s) }))}
          />
          <Select
            value={table.filters.assignedToUserId ?? ''}
            onChange={(e) => table.setFilter('assignedToUserId', e.target.value)}
            placeholder="Todos los responsables"
            options={(staff.data?.items ?? []).map((u) => ({ value: u.id, label: u.fullName }))}
          />
          <Select
            value={table.filters.tags ?? ''}
            onChange={(e) => table.setFilter('tags', e.target.value)}
            placeholder="Todas las etiquetas"
            options={[
              'vip',
              'extranjero',
              'moroso',
              'recurrente',
              'hotelería',
              'construcción',
              'agro',
              'urgente',
              'referido',
              'zona-costera',
            ].map((t) => ({ value: t, label: t }))}
          />
          <div className="flex items-end">
            <Button variant="ghost" onClick={table.resetFilters} className="w-full">
              Limpiar filtros
            </Button>
          </div>
        </div>

        <DataTable
          columns={columns}
          rows={active}
          rowKey={(c) => c.id}
          loading={query.isLoading}
          error={query.isError ? query.error : undefined}
          onRetry={() => void query.refetch()}
          sort={table.sort}
          order={table.order}
          onSort={table.setSort}
          onRowClick={(c) => navigate(`/clientes/${c.id}`)}
          empty={
            <EmptyState
              icon={<Users className="h-4 w-4" />}
              title="No hay clientes con estos filtros"
              description="Pruebe con otro estado, tipo u origen, o cree el primer cliente."
              action={
                can('clients.create') ? (
                  <Link to="/clientes/nuevo">
                    <Button variant="primary" icon={<Plus className="h-4 w-4" />}>
                      Nuevo cliente
                    </Button>
                  </Link>
                ) : null
              }
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
    </>
  )
}
