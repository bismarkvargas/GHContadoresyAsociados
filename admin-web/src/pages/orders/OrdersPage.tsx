import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ClipboardList, Download } from 'lucide-react'
import { clientsApi, ordersApi } from '@/api/endpoints'
import { useDebounced, useListQuery, useTableState } from '@/hooks/useApi'
import { downloadCsv, formatDate, formatMoney, formatNumber } from '@/lib/format'
import { labelOf, orderStatusList, orderStatusMeta, paymentStatusMeta, toneOf } from '@/lib/labels'
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
import type { Order } from '@/types'

export default function OrdersPage() {
  const navigate = useNavigate()
  const table = useTableState({ pageSize: 20, sort: 'createdAt', order: 'desc' })
  const search = useDebounced(table.search, 350)
  const params = useMemo(() => ({ ...table.params, search: search || undefined }), [table.params, search])

  const query = useListQuery(['orders'], ordersApi.list, params)
  const clients = useQuery({
    queryKey: ['clients', 'select'],
    queryFn: () => clientsApi.list({ page: 1, pageSize: 200, sort: 'legalName', order: 'asc' }),
    staleTime: 120000,
  })

  const columns: Column<Order>[] = [
    {
      key: 'number',
      header: 'Pedido',
      sortable: true,
      render: (o) => (
        <Link to={`/pedidos/${o.id}`} className="font-mono text-xs text-primary hover:underline">
          {o.number}
        </Link>
      ),
    },
    {
      key: 'clientName',
      header: 'Cliente',
      render: (o) => (
        <div className="min-w-0">
          <span className="block truncate text-sm text-ink">{o.clientName ?? o.customerName ?? '—'}</span>
          <span className="block truncate text-xs text-muted">{o.items.length} ítem(s)</span>
        </div>
      ),
    },
    {
      key: 'items',
      header: 'Servicios',
      render: (o) => (
        <span className="line-clamp-2 text-xs text-muted">
          {o.items.map((i) => (i.quantity > 1 ? `${i.quantity}× ${i.nameSnapshot}` : i.nameSnapshot)).join(', ')}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      sortable: true,
      render: (o) => <Badge tone={toneOf(orderStatusMeta, o.status)}>{labelOf(orderStatusMeta, o.status)}</Badge>,
    },
    {
      key: 'total',
      header: 'Total',
      sortable: true,
      align: 'right',
      render: (o) => <span className="font-medium tabular-nums text-ink">{formatMoney(o.total, o.currency)}</span>,
    },
    {
      key: 'requiresInvoice',
      header: 'Factura',
      align: 'center',
      render: (o) => (
        <Badge tone={o.requiresInvoice ? 'info' : 'neutral'}>{o.requiresInvoice ? 'Solicitada' : 'No'}</Badge>
      ),
    },
    {
      key: 'payments',
      header: 'Pago',
      render: (o) => {
        const payment = o.payments?.[0]
        if (!payment) return <span className="text-xs text-muted">Sin intento</span>
        return (
          <Badge tone={toneOf(paymentStatusMeta, payment.status)}>
            {labelOf(paymentStatusMeta, payment.status)}
          </Badge>
        )
      },
    },
    {
      key: 'createdAt',
      header: 'Fecha',
      sortable: true,
      render: (o) => <span className="text-xs text-muted">{formatDate(o.createdAt)}</span>,
    },
  ]

  return (
    <>
      <PageHeader
        title="Pedidos"
        subtitle={`${formatNumber(query.data?.total ?? 0)} pedidos de la tienda · numeración GH-ORD-AAAA-00000`}
        actions={
          <Button
            variant="secondary"
            icon={<Download className="h-4 w-4" />}
            disabled={!query.data?.items.length}
            onClick={() =>
              downloadCsv(
                `pedidos-gh-${new Date().toISOString().slice(0, 10)}.csv`,
                (query.data?.items ?? []).map((o) => ({
                  Numero: o.number,
                  Cliente: o.clientName ?? '',
                  Estado: labelOf(orderStatusMeta, o.status),
                  Subtotal: o.subtotal,
                  Descuento: o.discount,
                  Impuesto: o.tax,
                  Total: o.total,
                  Moneda: o.currency,
                  RequiereFactura: o.requiresInvoice ? 'Si' : 'No',
                  Creado: o.createdAt,
                  Pagado: o.paidAt ?? '',
                })),
              )
            }
          >
            Exportar CSV
          </Button>
        }
      />

      <Card padded={false}>
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-4">
          <SearchInput
            value={table.search}
            onChange={table.setSearch}
            placeholder="Buscar por número de pedido o cliente"
            className="lg:col-span-2"
          />
          <Select
            value={table.filters.status ?? ''}
            onChange={(e) => table.setFilter('status', e.target.value)}
            placeholder="Todos los estados"
            options={orderStatusList.map((s) => ({ value: s, label: labelOf(orderStatusMeta, s) }))}
          />
          <Select
            value={table.filters.clientId ?? ''}
            onChange={(e) => table.setFilter('clientId', e.target.value)}
            placeholder="Todos los clientes"
            options={(clients.data?.items ?? []).map((c) => ({ value: c.id, label: c.legalName }))}
          />
          <Select
            value={table.filters.paid ?? ''}
            onChange={(e) => table.setFilter('paid', e.target.value)}
            placeholder="Pagados y no pagados"
            options={[
              { value: 'true', label: 'Solo pagados' },
              { value: 'false', label: 'Solo pendientes/cancelados' },
            ]}
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
          rowKey={(o) => o.id}
          loading={query.isLoading}
          error={query.isError ? query.error : undefined}
          onRetry={() => void query.refetch()}
          sort={table.sort}
          order={table.order}
          onSort={table.setSort}
          onRowClick={(o) => navigate(`/pedidos/${o.id}`)}
          empty={
            <EmptyState
              icon={<ClipboardList className="h-4 w-4" />}
              title="Sin pedidos"
              description="Los pedidos creados desde el app aparecerán aquí."
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
