import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CreditCard, Download } from 'lucide-react'
import { paymentsApi } from '@/api/endpoints'
import { useDebounced, useListQuery, useTableState } from '@/hooks/useApi'
import { usePermission } from '@/hooks/useAuth'
import { downloadCsv, formatDateTime, formatMoney, formatNumber, prettyJson } from '@/lib/format'
import {
  labelOf,
  paymentMethodMeta,
  paymentStatusList,
  paymentStatusMeta,
  toneOf,
} from '@/lib/labels'
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
  type Column,
} from '@/components/ui'
import { PageHeader } from '@/components/layout/AppShell'
import type { Payment } from '@/types'

export default function PaymentsPage() {
  const { can } = usePermission()
  const table = useTableState({ pageSize: 20, sort: 'createdAt', order: 'desc' })
  const search = useDebounced(table.search, 350)
  const [detailId, setDetailId] = useState<string | null>(null)

  const params = useMemo(() => ({ ...table.params, search: search || undefined }), [table.params, search])
  const query = useListQuery(['payments'], paymentsApi.list, params)
  const detail = useQuery({
    queryKey: ['payment', detailId],
    queryFn: () => paymentsApi.get(detailId!),
    enabled: !!detailId,
  })

  const columns: Column<Payment>[] = [
    {
      key: 'reference',
      header: 'Referencia',
      sortable: true,
      render: (p) => (
        <button
          type="button"
          className="font-mono text-xs text-primary hover:underline"
          onClick={() => setDetailId(p.id)}
        >
          {p.reference}
        </button>
      ),
    },
    {
      key: 'orderNumber',
      header: 'Pedido',
      render: (p) => <span className="font-mono text-xs text-muted">{p.orderNumber ?? '—'}</span>,
    },
    {
      key: 'method',
      header: 'Método',
      sortable: true,
      render: (p) => <Badge tone={toneOf(paymentMethodMeta, p.method)}>{labelOf(paymentMethodMeta, p.method)}</Badge>,
    },
    {
      key: 'status',
      header: 'Estado',
      sortable: true,
      render: (p) => <Badge tone={toneOf(paymentStatusMeta, p.status)}>{labelOf(paymentStatusMeta, p.status)}</Badge>,
    },
    {
      key: 'amount',
      header: 'Monto',
      sortable: true,
      align: 'right',
      render: (p) => <span className="font-medium tabular-nums text-ink">{formatMoney(p.amount, p.currency)}</span>,
    },
    {
      key: 'authorizationCode',
      header: 'Autorización',
      render: (p) => <span className="font-mono text-xs text-muted">{p.authorizationCode ?? '—'}</span>,
    },
    {
      key: 'card',
      header: 'Tarjeta',
      render: (p) =>
        p.cardLast4 ? (
          <span className="text-xs text-ink-700">
            {p.cardBrand} ···· {p.cardLast4}
          </span>
        ) : (
          <span className="text-xs text-muted">—</span>
        ),
    },
    {
      key: 'provider',
      header: 'Proveedor',
      render: (p) => <span className="text-xs text-muted">{p.provider}</span>,
    },
    {
      key: 'createdAt',
      header: 'Fecha',
      sortable: true,
      render: (p) => <span className="text-xs text-muted">{formatDateTime(p.createdAt)}</span>,
    },
  ]

  const totals = useMemo(() => {
    const items = query.data?.items ?? []
    const approved = items.filter((p) => p.status === 'Approved' || p.status === 'Refunded')
    return {
      approved: approved.length,
      amount: approved.reduce((s, p) => s + p.amount, 0),
      declined: items.filter((p) => p.status === 'Declined').length,
    }
  }, [query.data])

  return (
    <>
      <PageHeader
        title="Pagos"
        subtitle={`Transacciones de la pasarela simulada GH-Simulated · ${formatNumber(query.data?.total ?? 0)} registros`}
        actions={
          can('payments.export') ? (
            <Button
              variant="secondary"
              icon={<Download className="h-4 w-4" />}
              disabled={!query.data?.items.length}
              onClick={() =>
                downloadCsv(
                  `pagos-gh-${new Date().toISOString().slice(0, 10)}.csv`,
                  (query.data?.items ?? []).map((p) => ({
                    Referencia: p.reference,
                    Pedido: p.orderNumber ?? '',
                    Metodo: labelOf(paymentMethodMeta, p.method),
                    Estado: labelOf(paymentStatusMeta, p.status),
                    Monto: p.amount,
                    Moneda: p.currency,
                    Autorizacion: p.authorizationCode ?? '',
                    Marca: p.cardBrand ?? '',
                    Ultimos4: p.cardLast4 ?? '',
                    Titular: p.cardHolder ?? '',
                    Proveedor: p.provider,
                    Fecha: p.createdAt,
                  })),
                )
              }
            >
              Exportar CSV
            </Button>
          ) : null
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <div className="gh-card-pad">
          <p className="text-xs uppercase tracking-wide text-muted">Transacciones aprobadas (página)</p>
          <p className="mt-1.5 text-lg font-semibold text-ink">{formatNumber(totals.approved)}</p>
        </div>
        <div className="gh-card-pad">
          <p className="text-xs uppercase tracking-wide text-muted">Monto aprobado (página)</p>
          <p className="mt-1.5 text-lg font-semibold text-ink">{formatMoney(totals.amount)}</p>
        </div>
        <div className="gh-card-pad">
          <p className="text-xs uppercase tracking-wide text-muted">Rechazadas (página)</p>
          <p className="mt-1.5 text-lg font-semibold text-danger">{formatNumber(totals.declined)}</p>
        </div>
      </div>

      <Card padded={false}>
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-4">
          <SearchInput
            value={table.search}
            onChange={table.setSearch}
            placeholder="Buscar por referencia, autorización o últimos 4 dígitos"
            className="lg:col-span-2"
          />
          <Select
            value={table.filters.status ?? ''}
            onChange={(e) => table.setFilter('status', e.target.value)}
            placeholder="Todos los estados"
            options={paymentStatusList.map((s) => ({ value: s, label: labelOf(paymentStatusMeta, s) }))}
          />
          <Select
            value={table.filters.method ?? ''}
            onChange={(e) => table.setFilter('method', e.target.value)}
            placeholder="Todos los métodos"
            options={[
              { value: 'Card', label: 'Tarjeta' },
              { value: 'Sinpe', label: 'SINPE Móvil' },
              { value: 'Transfer', label: 'Transferencia' },
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
          rowKey={(p) => p.id}
          loading={query.isLoading}
          error={query.isError ? query.error : undefined}
          onRetry={() => void query.refetch()}
          sort={table.sort}
          order={table.order}
          onSort={table.setSort}
          onRowClick={(p) => setDetailId(p.id)}
          empty={<EmptyState icon={<CreditCard className="h-4 w-4" />} title="Sin transacciones" />}
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

      <div className="mt-3 rounded-card border border-line bg-card p-4 text-xs text-muted">
        <p className="font-medium text-ink-700">Tarjetas de prueba de la pasarela simulada</p>
        <ul className="mt-2 space-y-1">
          <li>
            <code>4242 4242 4242 4242</code> → aprobado
          </li>
          <li>
            <code>4000 0000 0000 0002</code> → rechazado
          </li>
          <li>
            <code>4000 0000 0000 9995</code> → pendiente
          </li>
        </ul>
      </div>

      <Modal
        open={!!detailId}
        onClose={() => setDetailId(null)}
        title={`Transacción ${detail.data?.reference ?? ''}`}
        size="lg"
        footer={
          <Button variant="secondary" onClick={() => setDetailId(null)}>
            Cerrar
          </Button>
        }
      >
        {detail.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : detail.data ? (
          <div className="space-y-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              {[
                ['Estado', labelOf(paymentStatusMeta, detail.data.status)],
                ['Método', labelOf(paymentMethodMeta, detail.data.method)],
                ['Monto', formatMoney(detail.data.amount, detail.data.currency)],
                ['Autorización', detail.data.authorizationCode ?? '—'],
                ['Tarjeta', detail.data.cardLast4 ? `${detail.data.cardBrand} ····${detail.data.cardLast4}` : '—'],
                ['Titular', detail.data.cardHolder ?? '—'],
                ['Pedido', detail.data.orderNumber ?? '—'],
                ['Proveedor', detail.data.provider],
                ['Procesado', formatDateTime(detail.data.processedAt)],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
                  <dd className="mt-0.5 text-ink">{value}</dd>
                </div>
              ))}
            </dl>

            {detail.data.failureReason ? (
              <p className="rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                {detail.data.failureReason}
              </p>
            ) : null}

            {detail.data.order ? (
              <div className="rounded-card border border-line p-3">
                <p className="text-xs uppercase tracking-wide text-muted">Pedido asociado</p>
                <p className="mt-1 font-mono text-sm text-ink">{detail.data.order.number}</p>
                <p className="mt-1 text-xs text-muted">
                  {detail.data.order.items.map((i) => i.nameSnapshot).join(', ')}
                </p>
              </div>
            ) : null}

            <div className="grid gap-3 lg:grid-cols-2">
              <div>
                <p className="mb-1.5 text-xs uppercase tracking-wide text-muted">Request crudo</p>
                <pre className="max-h-64 overflow-auto rounded-control border border-line bg-surface-2 p-3 text-[11px] text-ink-700">
                  {prettyJson(detail.data.rawRequestJson)}
                </pre>
              </div>
              <div>
                <p className="mb-1.5 text-xs uppercase tracking-wide text-muted">Response crudo</p>
                <pre className="max-h-64 overflow-auto rounded-control border border-line bg-surface-2 p-3 text-[11px] text-ink-700">
                  {prettyJson(detail.data.rawResponseJson)}
                </pre>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  )
}
