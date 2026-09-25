import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { BarChart3, Download, TrendingUp } from 'lucide-react'
import { reportsApi } from '@/api/endpoints'
import { usePermission } from '@/hooks/useAuth'
import { downloadCsv, formatDate, formatMoney, formatMonth, formatNumber, isOverdue } from '@/lib/format'
import {
  caseEntityList,
  caseMatterMeta,
  caseStatusMeta,
  labelOf,
  priorityMeta,
  taskStatusMeta,
  toneOf,
} from '@/lib/labels'
import {
  Badge,
  Button,
  Card,
  CardsSkeleton,
  DataTable,
  EmptyState,
  ProgressBar,
  Skeleton,
  Tabs,
  Tab,
  type Column,
} from '@/components/ui'
import { PageHeader } from '@/components/layout/AppShell'
import type { CaseStatus, ReportProductivity } from '@/types'

const tooltipStyle = {
  contentStyle: {
    borderRadius: 10,
    border: '1px solid var(--gh-border)',
    background: 'var(--gh-card)',
    color: 'var(--gh-ink)',
    fontSize: 12,
  },
  labelStyle: { color: 'var(--gh-muted)', fontSize: 11 },
}

export default function ReportsPage() {
  const { can } = usePermission()
  const [tab, setTab] = useState('ventas')

  const sales = useQuery({ queryKey: ['reports', 'sales'], queryFn: () => reportsApi.sales() })
  const cases = useQuery({ queryKey: ['reports', 'cases'], queryFn: () => reportsApi.cases() })
  const productivity = useQuery({
    queryKey: ['reports', 'productivity'],
    queryFn: () => reportsApi.productivity(),
  })

  const productivityColumns: Column<ReportProductivity['rows'][number]>[] = [
    {
      key: 'fullName',
      header: 'Profesional',
      render: (r) => (
        <div>
          <p className="font-medium text-ink">{r.fullName}</p>
          <p className="text-xs text-muted">{r.role}</p>
        </div>
      ),
    },
    { key: 'openCases', header: 'Expedientes abiertos', align: 'center', sortable: true, render: (r) => r.openCases },
    { key: 'closedCases', header: 'Expedientes cerrados', align: 'center', render: (r) => r.closedCases },
    { key: 'tasksDone', header: 'Tareas completadas', align: 'center', render: (r) => r.tasksDone },
    {
      key: 'tasksOverdue',
      header: 'Tareas vencidas',
      align: 'center',
      render: (r) => (
        <span className={r.tasksOverdue > 0 ? 'font-medium text-danger' : 'text-muted'}>{r.tasksOverdue}</span>
      ),
    },
    { key: 'interactions', header: 'Gestiones registradas', align: 'center', render: (r) => r.interactions },
  ]

  return (
    <>
      <PageHeader
        title="Informes"
        subtitle="Ventas por mes, categoría y servicio · expedientes por estado y materia · productividad por profesional"
        actions={
          can('reports.export') ? (
            <Button
              variant="primary"
              icon={<Download className="h-4 w-4" />}
              onClick={() => {
                if (tab === 'ventas' && sales.data) {
                  downloadCsv(
                    'informe-ventas-por-servicio.csv',
                    sales.data.byService.map((s) => ({
                      Servicio: s.name,
                      Cantidad: s.quantity,
                      TotalUSD: s.total,
                    })),
                  )
                } else if (tab === 'expedientes' && cases.data) {
                  downloadCsv(
                    'informe-expedientes-vencidos.csv',
                    cases.data.overdue.map((o) => ({
                      Codigo: o.code,
                      Titulo: o.title,
                      Cliente: o.clientName,
                      Estado: o.status,
                      Vence: o.dueAt,
                    })),
                  )
                } else if (tab === 'productividad' && productivity.data) {
                  downloadCsv(
                    'informe-productividad.csv',
                    productivity.data.rows.map((r) => ({
                      Profesional: r.fullName,
                      Rol: r.role,
                      ExpedientesAbiertos: r.openCases,
                      ExpedientesCerrados: r.closedCases,
                      TareasCompletadas: r.tasksDone,
                      TareasVencidas: r.tasksOverdue,
                      Gestiones: r.interactions,
                    })),
                  )
                }
              }}
            >
              Exportar CSV
            </Button>
          ) : null
        }
      />

      {sales.isLoading ? (
        <CardsSkeleton count={4} />
      ) : sales.data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ['Ventas netas', formatMoney(sales.data.totals.subtotal)],
            ['IVA facturado', formatMoney(sales.data.totals.tax)],
            ['Total cobrado', formatMoney(sales.data.totals.total)],
            ['Pedidos pagados', formatNumber(sales.data.totals.orders)],
            ['Ticket promedio', formatMoney(sales.data.totals.averageTicket)],
          ].map(([label, value]) => (
            <div key={label} className="gh-card-pad">
              <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
              <p className="mt-1.5 text-lg font-semibold tabular-nums text-ink">{value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-5">
        <Card padded={false}>
          <Tabs value={tab} onChange={setTab}>
            <Tab value="ventas">Ventas</Tab>
            <Tab value="expedientes">Expedientes</Tab>
            <Tab value="productividad">Productividad</Tab>
          </Tabs>

          <div className="p-5">
            {tab === 'ventas' ? (
              sales.isLoading ? (
                <Skeleton className="h-72 w-full" />
              ) : sales.data ? (
                <div className="space-y-6">
                  <div>
                    <h3 className="gh-section-title mb-3">Ventas por mes (USD)</h3>
                    <div className="h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={sales.data.byMonth.map((m) => ({ ...m, label: formatMonth(m.month) }))}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--gh-border)" vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--gh-muted)' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 11, fill: 'var(--gh-muted)' }} axisLine={false} tickLine={false} />
                          <Tooltip {...tooltipStyle} formatter={(value: number) => formatMoney(value)} />
                          <Line
                            type="monotone"
                            dataKey="total"
                            stroke="var(--gh-primary)"
                            strokeWidth={2.5}
                            dot={{ r: 3 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="grid gap-6 lg:grid-cols-2">
                    <div>
                      <h3 className="gh-section-title mb-3">Ventas por categoría</h3>
                      <div className="h-[240px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={sales.data.byCategory}
                              dataKey="total"
                              nameKey="category"
                              innerRadius={44}
                              outerRadius={76}
                              paddingAngle={2}
                            >
                              {sales.data.byCategory.map((entry, i) => (
                                <Cell
                                  key={entry.category}
                                  fill={
                                    ['var(--gh-primary)', 'var(--gh-info)', 'var(--gh-warning)', 'var(--gh-success)'][i % 4]
                                  }
                                />
                              ))}
                            </Pie>
                            <Legend
                              verticalAlign="bottom"
                              formatter={(v: string) => <span className="text-xs text-ink-700">{v}</span>}
                            />
                            <Tooltip {...tooltipStyle} formatter={(value: number) => formatMoney(value)} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div>
                      <h3 className="gh-section-title mb-3">Top servicios por ingreso</h3>
                      <div className="h-[240px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            layout="vertical"
                            data={sales.data.byService.slice(0, 8).map((s) => ({
                              ...s,
                              label: s.name.length > 26 ? `${s.name.slice(0, 25)}…` : s.name,
                            }))}
                            margin={{ left: 8, right: 16 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--gh-border)" horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--gh-muted)' }} axisLine={false} tickLine={false} />
                            <YAxis
                              type="category"
                              dataKey="label"
                              width={150}
                              tick={{ fontSize: 10, fill: 'var(--gh-muted)' }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip {...tooltipStyle} formatter={(value: number) => formatMoney(value)} />
                            <Bar dataKey="total" fill="var(--gh-primary)" radius={[0, 6, 6, 0]} maxBarSize={18} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  <DataTable
                    columns={[
                      { key: 'name', header: 'Servicio', render: (s) => <span className="text-ink">{s.name}</span> },
                      { key: 'quantity', header: 'Unidades', align: 'center', render: (s) => s.quantity },
                      {
                        key: 'total',
                        header: 'Ingreso',
                        align: 'right',
                        render: (s) => <span className="tabular-nums">{formatMoney(s.total)}</span>,
                      },
                    ]}
                    rows={sales.data.byService}
                    rowKey={(s) => s.productId}
                    dense
                    empty={<EmptyState title="Sin ventas en el periodo" />}
                  />
                </div>
              ) : null
            ) : null}

            {tab === 'expedientes' ? (
              cases.isLoading ? (
                <Skeleton className="h-72 w-full" />
              ) : cases.data ? (
                <div className="space-y-6">
                  <div className="grid gap-6 lg:grid-cols-2">
                    <div>
                      <h3 className="gh-section-title mb-3">Expedientes por estado</h3>
                      <div className="h-[240px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={cases.data.byStatus.map((s) => ({
                              ...s,
                              label: labelOf(caseStatusMeta, s.status),
                            }))}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--gh-border)" vertical={false} />
                            <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--gh-muted)' }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 11, fill: 'var(--gh-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                            <Tooltip {...tooltipStyle} />
                            <Bar dataKey="count" fill="var(--gh-primary)" radius={[6, 6, 0, 0]} maxBarSize={40} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div>
                      <h3 className="gh-section-title mb-3">Expedientes por materia</h3>
                      <div className="h-[240px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={cases.data.byMatter.map((s) => ({
                              ...s,
                              label: labelOf(caseMatterMeta, s.matter),
                            }))}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--gh-border)" vertical={false} />
                            <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--gh-muted)' }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 11, fill: 'var(--gh-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                            <Tooltip {...tooltipStyle} />
                            <Bar dataKey="count" fill="var(--gh-info)" radius={[6, 6, 0, 0]} maxBarSize={40} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface-2 px-4 py-3">
                    <TrendingUp className="h-4 w-4 text-primary" aria-hidden />
                    <span className="text-sm text-ink-700">
                      Progreso promedio de los expedientes:{' '}
                      <strong className="text-ink">{cases.data.averageProgress}%</strong>
                    </span>
                    <span className="text-sm text-ink-700">
                      Vencidos: <strong className="text-danger">{formatNumber(cases.data.overdue.length)}</strong>
                    </span>
                  </div>

                  <div>
                    <h3 className="gh-section-title mb-3">Expedientes por ente regulador</h3>
                    <div className="flex flex-wrap gap-2">
                      {caseEntityList.map((entity) => {
                        const row = cases.data!.byEntity.find((e) => e.entity === entity)
                        if (!row) return null
                        return (
                          <Badge key={entity} tone="neutral">
                            {entity}: {formatNumber(row.count)}
                          </Badge>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    <h3 className="gh-section-title mb-3">Expedientes vencidos</h3>
                    <DataTable
                      columns={[
                        { key: 'code', header: 'Código', render: (o) => <span className="font-mono text-xs">{o.code}</span> },
                        { key: 'title', header: 'Expediente', render: (o) => <span className="text-ink">{o.title}</span> },
                        { key: 'clientName', header: 'Cliente', render: (o) => <span className="text-xs">{o.clientName}</span> },
                        {
                          key: 'status',
                          header: 'Estado',
                          render: (o) => (
                            <Badge tone={toneOf(caseStatusMeta, o.status as CaseStatus)}>
                              {labelOf(caseStatusMeta, o.status)}
                            </Badge>
                          ),
                        },
                        {
                          key: 'dueAt',
                          header: 'Vencimiento',
                          render: (o) => (
                            <span className={isOverdue(o.dueAt) ? 'text-xs font-medium text-danger' : 'text-xs'}>
                              {formatDate(o.dueAt)}
                            </span>
                          ),
                        },
                      ]}
                      rows={cases.data.overdue}
                      rowKey={(o) => o.id}
                      dense
                      empty={<EmptyState title="Sin expedientes vencidos" description="Todo al día. " />}
                    />
                  </div>
                </div>
              ) : null
            ) : null}

            {tab === 'productividad' ? (
              productivity.isLoading ? (
                <Skeleton className="h-72 w-full" />
              ) : productivity.data ? (
                <div className="space-y-6">
                  <DataTable
                    columns={productivityColumns}
                    rows={productivity.data.rows}
                    rowKey={(r) => r.userId}
                    empty={<EmptyState title="Sin profesionales activos" />}
                  />

                  <div>
                    <h3 className="gh-section-title mb-3">Tareas vencidas por responsable</h3>
                    <ul className="divide-y divide-[var(--gh-border)]">
                      {productivity.data.overdueTasks.length === 0 ? (
                        <li>
                          <EmptyState title="Sin tareas vencidas" />
                        </li>
                      ) : (
                        productivity.data.overdueTasks.slice(0, 15).map((t) => (
                          <li key={t.id} className="flex flex-wrap items-center gap-3 py-3">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-ink">{t.title}</p>
                              <p className="text-xs text-muted">
                                {t.caseCode} · {t.assignedToName}
                              </p>
                            </div>
                            <Badge tone={toneOf(priorityMeta, t.priority)}>{labelOf(priorityMeta, t.priority)}</Badge>
                            <Badge tone={toneOf(taskStatusMeta, t.status)}>{labelOf(taskStatusMeta, t.status)}</Badge>
                            <span className="text-xs font-medium text-danger">
                              Vencida {formatDate(t.dueAt)}
                            </span>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="gh-card-pad">
                      <p className="text-xs uppercase tracking-wide text-muted">Tareas completadas</p>
                      <p className="mt-1.5 text-lg font-semibold text-ink">
                        {formatNumber(productivity.data.rows.reduce((s, r) => s + r.tasksDone, 0))}
                      </p>
                    </div>
                    <div className="gh-card-pad">
                      <p className="text-xs uppercase tracking-wide text-muted">Expedientes activos</p>
                      <p className="mt-1.5 text-lg font-semibold text-ink">
                        {formatNumber(productivity.data.rows.reduce((s, r) => s + r.openCases, 0))}
                      </p>
                    </div>
                    <div className="gh-card-pad">
                      <p className="text-xs uppercase tracking-wide text-muted">Gestiones con clientes</p>
                      <p className="mt-1.5 text-lg font-semibold text-ink">
                        {formatNumber(productivity.data.rows.reduce((s, r) => s + r.interactions, 0))}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="gh-section-title">Carga por profesional</h3>
                    {productivity.data.rows.map((r) => {
                      const max = Math.max(...productivity.data!.rows.map((x) => x.openCases), 1)
                      return (
                        <div key={r.userId}>
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="text-ink-700">
                              {r.fullName} · <span className="text-muted">{r.role}</span>
                            </span>
                            <span className="text-muted">{r.openCases} expedientes abiertos</span>
                          </div>
                          <ProgressBar
                            value={Math.round((r.openCases / max) * 100)}
                            tone={r.tasksOverdue > 0 ? 'warning' : 'primary'}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <EmptyState icon={<BarChart3 className="h-4 w-4" />} title="Sin datos de productividad" />
              )
            ) : null}
          </div>
        </Card>
      </div>
    </>
  )
}
