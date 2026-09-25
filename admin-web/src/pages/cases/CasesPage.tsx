import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Briefcase, Download, LayoutGrid, Plus } from 'lucide-react'
import { casesApi, clientsApi, usersApi } from '@/api/endpoints'
import { useDebounced, useListQuery, useTableState } from '@/hooks/useApi'
import { usePermission } from '@/hooks/useAuth'
import { downloadCsv, formatDate, formatMoney, formatNumber, isOverdue } from '@/lib/format'
import {
  caseEntityList,
  caseMatterList,
  caseMatterMeta,
  caseStatusList,
  caseStatusMeta,
  labelOf,
  priorityList,
  priorityMeta,
  toneOf,
} from '@/lib/labels'
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Pagination,
  ProgressBar,
  SearchInput,
  Select,
  Checkbox,
  type Column,
} from '@/components/ui'
import { PageHeader } from '@/components/layout/AppShell'
import type { CaseFile } from '@/types'

export default function CasesPage() {
  const navigate = useNavigate()
  const { can } = usePermission()
  const table = useTableState({ pageSize: 20, sort: 'openedAt', order: 'desc' })
  const search = useDebounced(table.search, 350)

  const params = useMemo(() => ({ ...table.params, search: search || undefined }), [table.params, search])
  const query = useListQuery(['cases'], casesApi.list, params)

  const clients = useQuery({
    queryKey: ['clients', 'select'],
    queryFn: () => clientsApi.list({ page: 1, pageSize: 200, sort: 'legalName', order: 'asc' }),
    staleTime: 120000,
  })
  const staff = useQuery({
    queryKey: ['users', 'staff-options'],
    queryFn: () => usersApi.list({ page: 1, pageSize: 100, isStaff: true, status: 'Active' }),
    staleTime: 120000,
  })

  const columns: Column<CaseFile>[] = [
    {
      key: 'code',
      header: 'Código',
      sortable: true,
      render: (c) => (
        <Link to={`/expedientes/${c.id}`} className="font-mono text-xs text-primary hover:underline">
          {c.code}
        </Link>
      ),
    },
    {
      key: 'title',
      header: 'Expediente',
      sortable: true,
      render: (c) => (
        <div className="min-w-0">
          <Link to={`/expedientes/${c.id}`} className="block truncate font-medium text-ink hover:text-primary">
            {c.title}
          </Link>
          <span className="block truncate text-xs text-muted">
            {c.clientName}
            {c.referenceNumber ? ` · Ref. ${c.referenceNumber}` : ''}
          </span>
        </div>
      ),
    },
    {
      key: 'matter',
      header: 'Materia',
      sortable: true,
      render: (c) => <Badge tone={toneOf(caseMatterMeta, c.matter)}>{labelOf(caseMatterMeta, c.matter)}</Badge>,
    },
    {
      key: 'entity',
      header: 'Ente',
      sortable: true,
      render: (c) => <span className="text-xs text-ink-700">{c.entity}</span>,
    },
    {
      key: 'status',
      header: 'Estado',
      sortable: true,
      render: (c) => <Badge tone={toneOf(caseStatusMeta, c.status)}>{labelOf(caseStatusMeta, c.status)}</Badge>,
    },
    {
      key: 'priority',
      header: 'Prioridad',
      sortable: true,
      render: (c) => <Badge tone={toneOf(priorityMeta, c.priority)}>{labelOf(priorityMeta, c.priority)}</Badge>,
    },
    {
      key: 'responsibleName',
      header: 'Responsable',
      sortable: true,
      render: (c) => <span className="truncate text-xs text-ink-700">{c.responsibleName ?? '—'}</span>,
    },
    {
      key: 'openTaskCount',
      header: 'Tareas',
      align: 'center',
      render: (c) => (
        <span className="tabular-nums text-xs">
          <strong className="text-ink">{formatNumber(c.openTaskCount ?? 0)}</strong>
          <span className="text-muted"> / {formatNumber(c.taskCount ?? 0)}</span>
        </span>
      ),
    },
    {
      key: 'dueAt',
      header: 'Vence',
      sortable: true,
      render: (c) => (
        <span className={isOverdue(c.dueAt) ? 'text-xs font-medium text-danger' : 'text-xs text-muted'}>
          {formatDate(c.dueAt)}
        </span>
      ),
    },
    {
      key: 'progressPercent',
      header: 'Avance',
      sortable: true,
      className: 'min-w-[140px]',
      render: (c) => <ProgressBar value={c.progressPercent} />,
    },
    {
      key: 'agreedAmount',
      header: 'Monto',
      sortable: true,
      align: 'right',
      render: (c) => <span className="tabular-nums text-xs">{formatMoney(c.agreedAmount ?? 0, c.currency)}</span>,
    },
  ]

  function exportCsv(): void {
    downloadCsv(
      `expedientes-gh-${new Date().toISOString().slice(0, 10)}.csv`,
      (query.data?.items ?? []).map((c) => ({
        Codigo: c.code,
        Titulo: c.title,
        Cliente: c.clientName ?? '',
        Materia: c.matter,
        Ente: c.entity,
        Referencia: c.referenceNumber ?? '',
        Estado: labelOf(caseStatusMeta, c.status),
        Prioridad: labelOf(priorityMeta, c.priority),
        Responsable: c.responsibleName ?? '',
        Apertura: c.openedAt,
        Vence: c.dueAt ?? '',
        Avance: c.progressPercent,
        MontoUSD: c.agreedAmount ?? 0,
      })),
    )
  }

  return (
    <>
      <PageHeader
        title="Expedientes y casos"
        subtitle={`${formatNumber(query.data?.total ?? 0)} expedientes · materia, ente, responsable y vencimiento`}
        actions={
          <>
            <Link to="/expedientes/tablero">
              <Button variant="secondary" icon={<LayoutGrid className="h-4 w-4" />}>
                Tablero kanban
              </Button>
            </Link>
            <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportCsv} disabled={!query.data?.items.length}>
              Exportar CSV
            </Button>
            {can('cases.create') ? (
              <Link to="/expedientes/nuevo">
                <Button variant="primary" icon={<Plus className="h-4 w-4" />}>
                  Nuevo expediente
                </Button>
              </Link>
            ) : null}
          </>
        }
      />

      <Card padded={false}>
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-4">
          <SearchInput
            value={table.search}
            onChange={table.setSearch}
            placeholder="Buscar por código, título, cliente o referencia"
            className="lg:col-span-2"
          />
          <Select
            value={table.filters.status ?? ''}
            onChange={(e) => table.setFilter('status', e.target.value)}
            placeholder="Todos los estados"
            options={caseStatusList.map((s) => ({ value: s, label: labelOf(caseStatusMeta, s) }))}
          />
          <Select
            value={table.filters.matter ?? ''}
            onChange={(e) => table.setFilter('matter', e.target.value)}
            placeholder="Todas las materias"
            options={caseMatterList.map((s) => ({ value: s, label: labelOf(caseMatterMeta, s) }))}
          />
          <Select
            value={table.filters.entity ?? ''}
            onChange={(e) => table.setFilter('entity', e.target.value)}
            placeholder="Todos los entes"
            options={caseEntityList.map((s) => ({ value: s, label: s }))}
          />
          <Select
            value={table.filters.responsibleUserId ?? ''}
            onChange={(e) => table.setFilter('responsibleUserId', e.target.value)}
            placeholder="Todos los responsables"
            options={(staff.data?.items ?? []).map((u) => ({ value: u.id, label: u.fullName }))}
          />
          <Select
            value={table.filters.priority ?? ''}
            onChange={(e) => table.setFilter('priority', e.target.value)}
            placeholder="Toda prioridad"
            options={priorityList.map((s) => ({ value: s, label: labelOf(priorityMeta, s) }))}
          />
          <Select
            value={table.filters.clientId ?? ''}
            onChange={(e) => table.setFilter('clientId', e.target.value)}
            placeholder="Todos los clientes"
            options={(clients.data?.items ?? []).map((c) => ({ value: c.id, label: `${c.code} · ${c.legalName}` }))}
          />
          <div className="flex items-center gap-3">
            <Checkbox
              label="Solo vencidos"
              checked={table.filters.overdue === 'true'}
              onChange={(e) => table.setFilter('overdue', e.target.checked ? 'true' : '')}
            />
            <Button variant="ghost" onClick={table.resetFilters}>
              Limpiar
            </Button>
          </div>
        </div>

        <DataTable
          columns={columns}
          rows={query.data?.items ?? []}
          rowKey={(c) => c.id}
          loading={query.isLoading}
          error={query.isError ? query.error : undefined}
          onRetry={() => void query.refetch()}
          sort={table.sort}
          order={table.order}
          onSort={table.setSort}
          onRowClick={(c) => navigate(`/expedientes/${c.id}`)}
          empty={
            <EmptyState
              icon={<Briefcase className="h-4 w-4" />}
              title="No hay expedientes con estos filtros"
              description="Ajuste los criterios o cree un expediente nuevo."
              action={
                can('cases.create') ? (
                  <Link to="/expedientes/nuevo">
                    <Button variant="primary" icon={<Plus className="h-4 w-4" />}>
                      Nuevo expediente
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
