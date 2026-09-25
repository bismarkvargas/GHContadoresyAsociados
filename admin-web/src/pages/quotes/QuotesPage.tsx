import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Download, MessageSquareQuote, UserPlus } from 'lucide-react'
import { catalogApi, quotesApi, usersApi } from '@/api/endpoints'
import { useApiMutation, useDebounced, useListQuery, useTableState } from '@/hooks/useApi'
import { usePermission } from '@/hooks/useAuth'
import { downloadCsv, formatDateTime, formatNumber } from '@/lib/format'
import { labelOf, quoteStatusList, quoteStatusMeta, toneOf } from '@/lib/labels'
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
  Tabs,
  Tab,
  TextInput,
  type Column,
} from '@/components/ui'
import { PageHeader } from '@/components/layout/AppShell'
import type { QuoteRequest } from '@/types'

export default function QuotesPage() {
  const { can } = usePermission()
  const [tab, setTab] = useState('New')
  const [selected, setSelected] = useState<QuoteRequest | null>(null)
  const [converting, setConverting] = useState<QuoteRequest | null>(null)
  const [idNumber, setIdNumber] = useState('')

  const table = useTableState({ pageSize: 20, sort: 'createdAt', order: 'desc' })
  const search = useDebounced(table.search, 350)

  const params = useMemo(
    () => ({
      ...table.params,
      status: tab === 'all' ? undefined : tab,
      search: search || undefined,
      serviceId: table.filters.serviceId || undefined,
    }),
    [table.params, table.filters, tab, search],
  )

  const query = useListQuery(['quotes'], quotesApi.list, params)
  const products = useQuery({
    queryKey: ['catalog', 'products', 'select'],
    queryFn: () => catalogApi.products({ page: 1, pageSize: 200, sort: 'name', order: 'asc' }),
    staleTime: 120000,
  })
  const staff = useQuery({
    queryKey: ['users', 'staff-options'],
    queryFn: () => usersApi.list({ page: 1, pageSize: 100, isStaff: true, status: 'Active' }),
    staleTime: 120000,
  })

  const update = useApiMutation(
    (vars: { id: string; body: Partial<QuoteRequest> }) => quotesApi.update(vars.id, vars.body),
    {
      successMessage: 'Cotización actualizada',
      invalidate: [['quotes'], ['dashboard']],
      onSuccess: () => setSelected(null),
    },
  )

  const convert = useApiMutation(
    (vars: { id: string; idNumber: string }) =>
      quotesApi.convert(vars.id, { idNumber: vars.idNumber || 'PENDIENTE' }),
    {
      successMessage: 'Cotización convertida en cliente (prospecto)',
      invalidate: [['quotes'], ['clients'], ['dashboard']],
      onSuccess: () => {
        setConverting(null)
        setIdNumber('')
      },
    },
  )

  const columns: Column<QuoteRequest>[] = [
    {
      key: 'fullName',
      header: 'Solicitante',
      sortable: true,
      render: (q) => (
        <div className="min-w-0">
          <button
            type="button"
            className="block max-w-full truncate text-left font-medium text-ink hover:text-primary"
            onClick={() => setSelected(q)}
          >
            {q.fullName}
          </button>
          {q.company ? <span className="block truncate text-xs text-muted">{q.company}</span> : null}
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Contacto',
      render: (q) => (
        <div className="min-w-0">
          <span className="block truncate text-xs text-ink-700">{q.email}</span>
          <span className="block text-xs text-muted">{q.phone}</span>
        </div>
      ),
    },
    {
      key: 'serviceName',
      header: 'Servicio consultado',
      render: (q) => <span className="line-clamp-1 text-xs text-ink-700">{q.serviceName ?? '—'}</span>,
    },
    {
      key: 'message',
      header: 'Consulta',
      render: (q) => <span className="line-clamp-2 text-xs text-muted">{q.message ?? '—'}</span>,
    },
    {
      key: 'status',
      header: 'Estado',
      sortable: true,
      render: (q) => <Badge tone={toneOf(quoteStatusMeta, q.status)}>{labelOf(quoteStatusMeta, q.status)}</Badge>,
    },
    {
      key: 'handledByName',
      header: 'Atendida por',
      render: (q) => <span className="text-xs text-muted">{q.handledByName ?? 'Sin asignar'}</span>,
    },
    {
      key: 'clientName',
      header: 'Cliente',
      render: (q) =>
        q.clientId ? (
          <Link to={`/clientes/${q.clientId}`} className="gh-link text-xs">
            Ver ficha
          </Link>
        ) : (
          <span className="text-xs text-muted">—</span>
        ),
    },
    {
      key: 'createdAt',
      header: 'Recibida',
      sortable: true,
      render: (q) => <span className="text-xs text-muted">{formatDateTime(q.createdAt)}</span>,
    },
  ]

  return (
    <>
      <PageHeader
        title="Cotizaciones"
        subtitle="Bandeja del formulario web de cotizaciones · entra al CRM como lead"
        actions={
          <Button
            variant="secondary"
            icon={<Download className="h-4 w-4" />}
            disabled={!query.data?.items.length}
            onClick={() =>
              downloadCsv(
                `cotizaciones-gh-${new Date().toISOString().slice(0, 10)}.csv`,
                (query.data?.items ?? []).map((q) => ({
                  Nombre: q.fullName,
                  Empresa: q.company ?? '',
                  Correo: q.email,
                  Telefono: q.phone,
                  Servicio: q.serviceName ?? '',
                  Consulta: q.message ?? '',
                  Estado: labelOf(quoteStatusMeta, q.status),
                  AtendidaPor: q.handledByName ?? '',
                  Recibida: q.createdAt,
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
          <Tab value="New">Nuevas ({formatNumber(query.data?.newCount ?? 0)})</Tab>
          <Tab value="Contacted">Contactadas</Tab>
          <Tab value="Quoted">Cotizadas</Tab>
          <Tab value="Converted">Convertidas</Tab>
          <Tab value="Discarded">Descartadas</Tab>
          <Tab value="all">Todas</Tab>
        </Tabs>

        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-4">
          <SearchInput
            value={table.search}
            onChange={table.setSearch}
            placeholder="Buscar por nombre, correo, empresa o consulta"
            className="lg:col-span-2"
          />
          <Select
            value={table.filters.serviceId ?? ''}
            onChange={(e) => table.setFilter('serviceId', e.target.value)}
            placeholder="Todos los servicios"
            options={(products.data?.items ?? []).map((p) => ({ value: p.id, label: p.name }))}
          />
          <div className="flex items-end">
            <Button variant="ghost" onClick={table.resetFilters} className="w-full">
              Limpiar filtros
            </Button>
          </div>
        </div>

        <DataTable
          columns={columns}
          rows={query.data?.items ?? []}
          rowKey={(q) => q.id}
          loading={query.isLoading}
          error={query.isError ? query.error : undefined}
          onRetry={() => void query.refetch()}
          sort={table.sort}
          order={table.order}
          onSort={table.setSort}
          onRowClick={(q) => setSelected(q)}
          empty={
            <EmptyState
              icon={<MessageSquareQuote className="h-4 w-4" />}
              title="Sin cotizaciones en esta bandeja"
              description="Las consultas del formulario web del sitio llegan aquí."
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

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `Cotización de ${selected.fullName}` : ''}
        size="md"
        footer={
          selected ? (
            <>
              {selected.status !== 'Converted' && can('quotes.edit') ? (
                <Button
                  variant="secondary"
                  icon={<UserPlus className="h-4 w-4" />}
                  onClick={() => {
                    setConverting(selected)
                    setSelected(null)
                  }}
                >
                  Convertir en cliente
                </Button>
              ) : null}
              <Button variant="secondary" onClick={() => setSelected(null)}>
                Cerrar
              </Button>
            </>
          ) : null
        }
      >
        {selected ? (
          <div className="space-y-4">
            <Badge tone={toneOf(quoteStatusMeta, selected.status)}>
              {labelOf(quoteStatusMeta, selected.status)}
            </Badge>

            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              {[
                ['Nombre', selected.fullName],
                ['Empresa', selected.company ?? '—'],
                ['Correo', selected.email],
                ['Teléfono', selected.phone],
                ['Servicio', selected.serviceName ?? '—'],
                ['Recibida', formatDateTime(selected.createdAt)],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
                  <dd className="mt-0.5 text-ink">{value}</dd>
                </div>
              ))}
            </dl>

            {selected.message ? (
              <div className="rounded-control border border-line bg-surface-2 px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-muted">Consulta del cliente</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink-700">{selected.message}</p>
              </div>
            ) : null}

            {can('quotes.edit') ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  label="Estado"
                  value={selected.status}
                  onChange={(e) =>
                    update.mutate({ id: selected.id, body: { status: e.target.value as QuoteRequest['status'] } })
                  }
                  options={quoteStatusList.map((s) => ({ value: s, label: labelOf(quoteStatusMeta, s) }))}
                />
                <Select
                  label="Atendida por"
                  placeholder="Sin asignar"
                  value={selected.handledByUserId ?? ''}
                  onChange={(e) => update.mutate({ id: selected.id, body: { handledByUserId: e.target.value } })}
                  options={(staff.data?.items ?? []).map((u) => ({ value: u.id, label: u.fullName }))}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!converting}
        onClose={() => setConverting(null)}
        title="Convertir cotización en cliente"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConverting(null)}>
              Cancelar
            </Button>
            <Button
              variant="success"
              loading={convert.isPending}
              onClick={() => converting && convert.mutate({ id: converting.id, idNumber })}
            >
              Crear cliente prospecto
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-700">
          Se creará un cliente en estado <strong>Prospecto</strong> con los datos de{' '}
          <strong>{converting?.fullName}</strong>, origen <strong>web</strong> y etiqueta{' '}
          <strong>cotización</strong>. La cotización pasará a <strong>Convertida</strong>.
        </p>
        <TextInput
          label="Cédula / NIT (opcional)"
          className="mt-3"
          value={idNumber}
          onChange={(e) => setIdNumber(e.target.value)}
          placeholder="3-101-123456"
          hint="Si no la tiene a mano, quedará como PENDIENTE."
        />
      </Modal>
    </>
  )
}
