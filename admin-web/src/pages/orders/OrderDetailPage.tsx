import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  BadgeCheck,
  Briefcase,
  CreditCard,
  FileText,
  RotateCcw,
  ShoppingCart,
  XCircle,
} from 'lucide-react'
import { ordersApi, usersApi } from '@/api/endpoints'
import { useApiMutation, useRouteId } from '@/hooks/useApi'
import { usePermission } from '@/hooks/useAuth'
import { formatDate, formatDateTime, formatMoney, prettyJson } from '@/lib/format'
import { labelOf, orderStatusList, orderStatusMeta, paymentMethodMeta, paymentStatusMeta, toneOf } from '@/lib/labels'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  ErrorState,
  Modal,
  Select,
  Skeleton,
  Tabs,
  Tab,
  Textarea,
} from '@/components/ui'
import { PageHeader, PermissionGate } from '@/components/layout/AppShell'
import type { InvoiceData, Order } from '@/types'

export default function OrderDetailPage() {
  const { id: rawId } = useParams()
  // Guarda: un identificador ausente o literal «undefined» nunca debe llegar a la API.
  const id = useRouteId(rawId) ?? ''
  const idValido = id !== ''
  const { can } = usePermission()
  const [tab, setTab] = useState('items')
  const [showRefund, setShowRefund] = useState(false)
  const [refundReason, setRefundReason] = useState('')
  const [showCreateCase, setShowCreateCase] = useState(false)

  const query = useQuery({
    queryKey: ['order', id],
    queryFn: () => ordersApi.get(id),
    enabled: idValido,
  })

  const staff = useQuery({
    queryKey: ['users', 'staff-options'],
    queryFn: () => usersApi.list({ page: 1, pageSize: 100, isStaff: true, status: 'Active' }),
    staleTime: 120000,
  })

  const changeStatus = useApiMutation((status: string) => ordersApi.changeStatus(id, status), {
    successMessage: 'Estado del pedido actualizado',
    invalidate: [['order', id], ['orders'], ['dashboard']],
  })

  const refund = useApiMutation((reason: string) => ordersApi.refund(id, reason), {
    successMessage: 'Pedido reembolsado',
    invalidate: [['order', id], ['orders'], ['payments'], ['dashboard']],
    onSuccess: () => {
      setShowRefund(false)
      setRefundReason('')
    },
  })

  const createCase = useApiMutation(() => ordersApi.createCase(id), {
    successMessage: 'Expediente(s) generado(s) desde el pedido',
    invalidate: [['order', id], ['orders'], ['cases'], ['dashboard']],
    onSuccess: () => setShowCreateCase(false),
  })

  if (query.isLoading) {
    return (
      <>
        <PageHeader title="Pedido" backTo="/pedidos" />
        <Card>
          <Skeleton className="h-6 w-56" />
          <Skeleton className="mt-3 h-4 w-40" />
          <Skeleton className="mt-4 h-32 w-full" />
        </Card>
      </>
    )
  }

  if (query.isError || !query.data) {
    return (
      <>
        <PageHeader title="Pedido" backTo="/pedidos" />
        <ErrorState
          title="No se encontró el pedido"
          message={(query.error as Error)?.message}
          onRetry={() => void query.refetch()}
        />
      </>
    )
  }

  const o: Order = query.data
  let invoice: InvoiceData | null = null
  if (o.invoiceDataJson) {
    try {
      invoice = JSON.parse(o.invoiceDataJson) as InvoiceData
    } catch {
      invoice = null
    }
  }
  const canRefund = ['Paid', 'InProcess', 'Completed'].includes(o.status)
  const casesAlreadyCreated = o.items.some((i) => i.caseFileId)

  return (
    <>
      <PageHeader
        title={`Pedido ${o.number}`}
        subtitle={`${o.clientName ?? o.customerName} · ${formatDateTime(o.createdAt)}`}
        backTo="/pedidos"
        actions={
          <>
            <PermissionGate permission="orders.edit">
              <Select
                className="w-auto"
                value={o.status}
                onChange={(e) => changeStatus.mutate(e.target.value)}
                options={orderStatusList.map((s) => ({ value: s, label: labelOf(orderStatusMeta, s) }))}
              />
              <Button
                variant="success"
                icon={<BadgeCheck className="h-4 w-4" />}
                onClick={() => changeStatus.mutate('Paid')}
                disabled={o.status === 'Paid'}
              >
                Marcar pagado
              </Button>
              {canRefund ? (
                <Button variant="danger" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setShowRefund(true)}>
                  Reembolsar
                </Button>
              ) : null}
            </PermissionGate>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2" padded={false}>
          <div className="grid gap-4 p-5 sm:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Estado</p>
              <div className="mt-1">
                <Badge tone={toneOf(orderStatusMeta, o.status)}>{labelOf(orderStatusMeta, o.status)}</Badge>
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Total</p>
              <p className="mt-1 text-sm font-semibold text-ink">{formatMoney(o.total, o.currency)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Pagado el</p>
              <p className="mt-1 text-sm text-ink">{formatDateTime(o.paidAt)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Completado el</p>
              <p className="mt-1 text-sm text-ink">{formatDateTime(o.completedAt)}</p>
            </div>
          </div>

          <Tabs value={tab} onChange={setTab}>
            <Tab value="items">Ítems ({o.items.length})</Tab>
            <Tab value="factura">Datos de facturación</Tab>
            <Tab value="pagos">Pagos ({o.payments?.length ?? 0})</Tab>
          </Tabs>

          <div className="p-5">
            {tab === 'items' ? (
              <div>
                <div className="mb-4 flex flex-wrap justify-end gap-2">
                  <PermissionGate permission="orders.edit">
                    <Button
                      variant="secondary"
                      icon={<Briefcase className="h-4 w-4" />}
                      onClick={() => setShowCreateCase(true)}
                      disabled={casesAlreadyCreated}
                    >
                      {casesAlreadyCreated ? 'Expediente ya generado' : 'Generar expediente'}
                    </Button>
                  </PermissionGate>
                </div>
                <div className="overflow-x-auto">
                  <table className="gh-table">
                    <thead>
                      <tr>
                        <th className="gh-th">Servicio</th>
                        <th className="gh-th text-right">Precio</th>
                        <th className="gh-th text-center">Cant.</th>
                        <th className="gh-th text-right">Total</th>
                        <th className="gh-th">Expediente</th>
                      </tr>
                    </thead>
                    <tbody>
                      {o.items.map((item) => (
                        <tr key={item.id}>
                          <td className="gh-td">{item.nameSnapshot}</td>
                          <td className="gh-td text-right tabular-nums">{formatMoney(item.unitPrice)}</td>
                          <td className="gh-td text-center tabular-nums">{item.quantity}</td>
                          <td className="gh-td text-right tabular-nums">{formatMoney(item.total)}</td>
                          <td className="gh-td">
                            {item.caseFileId ? (
                              <Link to={`/expedientes/${item.caseFileId}`} className="gh-link font-mono text-xs">
                                {item.caseCode}
                              </Link>
                            ) : (
                              <span className="text-xs text-muted">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-surface-2">
                      <tr>
                        <td className="gh-td font-medium" colSpan={3}>
                          Subtotal
                        </td>
                        <td className="gh-td text-right tabular-nums">{formatMoney(o.subtotal)}</td>
                        <td />
                      </tr>
                      <tr>
                        <td className="gh-td font-medium" colSpan={3}>
                          Descuento
                        </td>
                        <td className="gh-td text-right tabular-nums">−{formatMoney(o.discount)}</td>
                        <td />
                      </tr>
                      <tr>
                        <td className="gh-td font-medium" colSpan={3}>
                          IVA (13%)
                        </td>
                        <td className="gh-td text-right tabular-nums">{formatMoney(o.tax)}</td>
                        <td />
                      </tr>
                      <tr>
                        <td className="gh-td font-semibold" colSpan={3}>
                          Total
                        </td>
                        <td className="gh-td text-right font-semibold tabular-nums">
                          {formatMoney(o.total, o.currency)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {o.notes ? (
                  <p className="mt-4 rounded-control border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
                    <strong className="text-ink-700">Notas del cliente:</strong> {o.notes}
                  </p>
                ) : null}
              </div>
            ) : null}

            {tab === 'factura' ? (
              o.requiresInvoice && invoice ? (
                <dl className="grid gap-4 sm:grid-cols-2">
                  {[
                    ['Razón social', invoice.legalName],
                    ['Cédula / NIT', invoice.idNumber],
                    ['Correo', invoice.email],
                    ['Teléfono', invoice.phone ?? '—'],
                    ['Dirección', invoice.address ?? '—'],
                    ['Código de actividad', invoice.activityCode ?? '—'],
                  ].map(([label, value]) => (
                    <div key={label as string}>
                      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
                      <dd className="mt-0.5 text-sm text-ink">{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <div className="flex flex-col items-center py-10 text-center">
                  <FileText className="h-8 w-8 text-muted" aria-hidden />
                  <p className="mt-3 text-sm text-muted">El cliente no solicitó factura electrónica.</p>
                </div>
              )
            ) : null}

            {tab === 'pagos' ? (
              (o.payments?.length ?? 0) === 0 ? (
                <div className="flex flex-col items-center py-10 text-center">
                  <CreditCard className="h-8 w-8 text-muted" aria-hidden />
                  <p className="mt-3 text-sm text-muted">Sin intentos de pago registrados.</p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {(o.payments ?? []).map((p) => (
                    <li key={p.id} className="rounded-card border border-line p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={toneOf(paymentStatusMeta, p.status)}>
                            {labelOf(paymentStatusMeta, p.status)}
                          </Badge>
                          <Badge tone={toneOf(paymentMethodMeta, p.method)}>
                            {labelOf(paymentMethodMeta, p.method)}
                          </Badge>
                          <span className="font-mono text-xs text-muted">{p.reference}</span>
                        </div>
                        <Link to="/pagos" className="gh-link text-xs">
                          Ver en Pagos
                        </Link>
                      </div>
                      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
                        <div>
                          <dt className="text-xs uppercase text-muted">Monto</dt>
                          <dd className="text-ink">{formatMoney(p.amount, p.currency)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase text-muted">Autorización</dt>
                          <dd className="text-ink">{p.authorizationCode ?? '—'}</dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase text-muted">Tarjeta</dt>
                          <dd className="text-ink">
                            {p.cardBrand ? `${p.cardBrand} ····${p.cardLast4}` : '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase text-muted">Fecha</dt>
                          <dd className="text-ink">{formatDate(p.createdAt)}</dd>
                        </div>
                      </dl>
                      {p.failureReason ? (
                        <p className="mt-2 text-xs text-danger">{p.failureReason}</p>
                      ) : null}
                      {can('payments.view') ? (
                        <details className="mt-3">
                          <summary className="cursor-pointer text-xs text-muted hover:text-ink">
                            Ver request/response crudos
                          </summary>
                          <div className="mt-2 grid gap-2 lg:grid-cols-2">
                            <pre className="max-h-56 overflow-auto rounded-control border border-line bg-surface-2 p-3 text-[11px] text-ink-700">
                              {prettyJson(p.rawRequestJson)}
                            </pre>
                            <pre className="max-h-56 overflow-auto rounded-control border border-line bg-surface-2 p-3 text-[11px] text-ink-700">
                              {prettyJson(p.rawResponseJson)}
                            </pre>
                          </div>
                        </details>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </div>
        </Card>

        <div className="space-y-5">
          <Card title="Cliente">
            {o.clientId ? (
              <Link to={`/clientes/${o.clientId}`} className="block rounded-control p-2 hover:bg-surface-2">
                <p className="text-sm font-medium text-ink">{o.clientName}</p>
                <p className="text-xs text-muted">Ver ficha del cliente</p>
              </Link>
            ) : (
              <p className="text-sm text-muted">Pedido sin cliente asociado (compra sin registro).</p>
            )}
          </Card>

          <Card title="Resumen">
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Ítems</dt>
                <dd className="text-ink">{o.items.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Subtotal</dt>
                <dd className="text-ink">{formatMoney(o.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Impuestos</dt>
                <dd className="text-ink">{formatMoney(o.tax)}</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-2.5">
                <dt className="font-medium text-ink">Total</dt>
                <dd className="font-semibold text-ink">{formatMoney(o.total, o.currency)}</dd>
              </div>
            </dl>
          </Card>

          <Card title="Acciones">
            <div className="flex flex-col gap-2">
              <PermissionGate permission="orders.edit">
                <Button
                  variant="secondary"
                  icon={<ShoppingCart className="h-4 w-4" />}
                  onClick={() => changeStatus.mutate('InProcess')}
                  disabled={o.status === 'InProcess'}
                >
                  Pasar a en proceso
                </Button>
                <Button
                  variant="secondary"
                  icon={<BadgeCheck className="h-4 w-4" />}
                  onClick={() => changeStatus.mutate('Completed')}
                  disabled={o.status === 'Completed'}
                >
                  Marcar completado
                </Button>
                <Button
                  variant="ghost"
                  icon={<XCircle className="h-4 w-4" />}
                  onClick={() => changeStatus.mutate('Cancelled')}
                  disabled={o.status === 'Cancelled'}
                >
                  Cancelar pedido
                </Button>
              </PermissionGate>
              {!can('orders.edit') ? (
                <p className="text-xs text-muted">Su rol permite ver el pedido pero no modificarlo.</p>
              ) : null}
            </div>
          </Card>

          <Card title="Asignación sugerida">
            <p className="mb-2 text-xs text-muted">
              Al generar el expediente se asigna al profesional seleccionado y se crean las tareas iniciales.
            </p>
            <Select
              placeholder="Sin preferencia"
              options={(staff.data?.items ?? []).map((u) => ({ value: u.id, label: u.fullName }))}
              disabled
            />
          </Card>
        </div>
      </div>

      <Modal
        open={showRefund}
        onClose={() => setShowRefund(false)}
        title="Reembolsar pedido"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowRefund(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              loading={refund.isPending}
              disabled={!refundReason.trim()}
              onClick={() => refund.mutate(refundReason)}
            >
              Confirmar reembolso
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-700">
          Se marcará el pedido como <strong>Refunded</strong>, el pago aprobado pasará a{' '}
          <strong>Refunded</strong> y se registrará el motivo en la auditoría.
        </p>
        <Textarea
          label="Motivo del reembolso"
          className="mt-3"
          value={refundReason}
          onChange={(e) => setRefundReason(e.target.value)}
          placeholder="El cliente canceló el trámite antes de la presentación."
        />
      </Modal>

      <ConfirmDialog
        open={showCreateCase}
        title="Generar expediente desde el pedido"
        message="Se creará un expediente por cada ítem que requiera trámite, con tareas iniciales (revisión documental y contacto al cliente) asignadas al responsable seleccionado. El pedido pasará a En proceso."
        confirmLabel="Generar expedientes"
        loading={createCase.isPending}
        onCancel={() => setShowCreateCase(false)}
        onConfirm={() => createCase.mutate(undefined)}
      />
    </>
  )
}
