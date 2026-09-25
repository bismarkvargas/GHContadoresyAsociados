import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  AlertTriangle,
  ArrowUpRight,
  Briefcase,
  CalendarClock,
  CircleDollarSign,
  ClipboardList,
  Plus,
  UserCheck,
  Users,
} from 'lucide-react'
import { dashboardApi } from '@/api/endpoints'
import { useRealtime } from '@/hooks/useUi'
import { usePermission } from '@/hooks/useAuth'
import { formatMoney, formatMonth, formatNumber, formatRelative, isOverdue } from '@/lib/format'
import {
  caseStatusMeta,
  labelOf,
  orderStatusMeta,
  priorityMeta,
  toneOf,
} from '@/lib/labels'
import { Badge, Button, Card, CardsSkeleton, EmptyState, ErrorState, ProgressBar } from '@/components/ui'
import { PermissionGate, PageHeader } from '@/components/layout/AppShell'

const KPI_TONES = {
  primary: 'bg-primary-50 text-primary',
  info: 'bg-info/10 text-info',
  warning: 'bg-warning/10 text-warning',
  success: 'bg-success/10 text-success',
} as const

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  to,
}: {
  label: string
  value: string
  hint?: string
  icon: typeof Users
  tone: keyof typeof KPI_TONES
  to: string
}) {
  return (
    <Link to={to} className="gh-card-pad group block transition-shadow hover:shadow-pop">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
          <p className="mt-1.5 text-xl font-semibold tabular-nums text-ink">{value}</p>
          {hint ? <p className="mt-1 truncate text-xs text-muted">{hint}</p> : null}
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-control ${KPI_TONES[tone]}`}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      </div>
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
        Ver detalle <ArrowUpRight className="h-3 w-3" aria-hidden />
      </span>
    </Link>
  )
}

export default function DashboardPage() {
  const { can } = usePermission()
  const { lastEvent, status } = useRealtime()

  const query = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => dashboardApi.summary(),
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  })

  const data = query.data

  const tooltipStyle = useMemo(
    () => ({
      contentStyle: {
        borderRadius: 10,
        border: '1px solid var(--gh-border)',
        background: 'var(--gh-card)',
        color: 'var(--gh-ink)',
        fontSize: 12,
      },
      labelStyle: { color: 'var(--gh-muted)', fontSize: 11 },
    }),
    [],
  )

  const salesData = useMemo(
    () =>
      (data?.salesByMonth ?? []).map((row) => ({
        ...row,
        label: formatMonth(row.month),
      })),
    [data],
  )

  if (query.isLoading) {
    return (
      <>
        <PageHeader title="Dashboard" subtitle="Resumen operativo de la firma" />
        <CardsSkeleton count={4} />
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <div className="gh-card-pad lg:col-span-2">
            <div className="gh-skeleton h-[260px] rounded-control" />
          </div>
          <div className="gh-card-pad">
            <div className="gh-skeleton h-[260px] rounded-control" />
          </div>
        </div>
      </>
    )
  }

  if (query.isError) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <ErrorState message={(query.error as Error)?.message} onRetry={() => void query.refetch()} />
      </>
    )
  }

  if (!data) return null

  const k = data.kpis

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`Actualización en vivo · canal ${status === 'mock' ? 'mock' : 'SignalR'}${
          lastEvent ? ` · último evento: ${lastEvent.type}` : ''
        }`}
        actions={
          <>
            <Button variant="secondary" icon={<CalendarClock className="h-4 w-4" />} onClick={() => void query.refetch()}>
              Refrescar
            </Button>
            <PermissionGate permission="clients.create">
              <Link to="/clientes/nuevo">
                <Button variant="primary" icon={<Plus className="h-4 w-4" />}>
                  Nuevo cliente
                </Button>
              </Link>
            </PermissionGate>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Clientes activos"
          value={formatNumber(k.activeClients)}
          hint={`${formatNumber(k.newClientsThisMonth)} nuevos este mes`}
          icon={Users}
          tone="success"
          to="/clientes"
        />
        <KpiCard
          label="Expedientes abiertos"
          value={formatNumber(k.openCases)}
          hint={`${formatNumber(data.casesByStatus.reduce((s, c) => s + c.count, 0))} expedientes en total`}
          icon={Briefcase}
          tone="primary"
          to="/expedientes"
        />
        <KpiCard
          label="Tareas vencidas"
          value={formatNumber(k.overdueTasks)}
          hint={k.overdueTasks ? 'Requieren atención inmediata' : 'Sin vencimientos pendientes'}
          icon={AlertTriangle}
          tone="warning"
          to="/informes"
        />
        <KpiCard
          label="Ingresos del mes"
          value={formatMoney(k.monthRevenue)}
          hint={`${formatNumber(k.ordersThisMonth)} pedidos este mes`}
          icon={CircleDollarSign}
          tone="info"
          to="/informes"
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Ventas de los últimos 12 meses"
          subtitle="Pedidos no cancelados, en USD"
          actions={<Badge tone="info">USD</Badge>}
        >
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="ghSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--gh-primary)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--gh-primary)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--gh-border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--gh-muted)' }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--gh-muted)' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`}
                />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(value: number, name) => [name === 'total' ? formatMoney(value) : value, name === 'total' ? 'Venta' : 'Pedidos']}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="var(--gh-primary)"
                  strokeWidth={2}
                  fill="url(#ghSales)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Embudo de leads" subtitle="De la solicitud al cliente activo">
          <ul className="space-y-3">
            {data.leadsFunnel.map((stage) => {
              const max = Math.max(...data.leadsFunnel.map((s) => s.count), 1)
              return (
                <li key={stage.stage}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-ink-700">{stage.stage}</span>
                    <span className="font-semibold tabular-nums text-ink">{formatNumber(stage.count)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.round((stage.count / max) * 100)}%`, background: stage.color }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
          <div className="mt-5 space-y-2 border-t border-line pt-4 text-xs text-muted">
            <p className="flex items-center justify-between">
              <span>Solicitudes de cuenta pendientes</span>
              <Link to="/solicitudes" className="gh-link">
                {formatNumber(k.pendingAccountRequests)} por revisar
              </Link>
            </p>
            <p className="flex items-center justify-between">
              <span>Cotizaciones nuevas</span>
              <Link to="/cotizaciones" className="gh-link">
                {formatNumber(k.pendingQuotes)} en bandeja
              </Link>
            </p>
          </div>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card title="Pedidos por estado" subtitle="Distribución y monto acumulado">
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.ordersByStatus.map((o) => ({ ...o, label: labelOf(orderStatusMeta, o.status) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--gh-border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--gh-muted)' }} axisLine={false} tickLine={false} interval={0} angle={-12} height={40} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--gh-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip {...tooltipStyle} formatter={(value: number) => [value, 'Pedidos']} />
                <Bar dataKey="count" fill="var(--gh-primary)" radius={[6, 6, 0, 0]} maxBarSize={38} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-3 space-y-1.5 text-xs">
            {data.ordersByStatus.map((o) => (
              <li key={o.status} className="flex items-center justify-between">
                <Badge tone={toneOf(orderStatusMeta, o.status)}>{labelOf(orderStatusMeta, o.status)}</Badge>
                <span className="tabular-nums text-muted">{formatMoney(o.total)}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Expedientes por materia" subtitle="Carga de trabajo por área">
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.casesByMatter}
                  dataKey="count"
                  nameKey="matter"
                  innerRadius={48}
                  outerRadius={78}
                  paddingAngle={2}
                >
                  {data.casesByMatter.map((entry, index) => (
                    <Cell
                      key={entry.matter}
                      fill={
                        ['var(--gh-primary)', 'var(--gh-info)', 'var(--gh-warning)', 'var(--gh-success)', '#8B5CF6', 'var(--gh-muted)'][
                          index % 6
                        ]
                      }
                    />
                  ))}
                </Pie>
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  formatter={(value: string) => <span className="text-xs text-ink-700">{value}</span>}
                />
                <Tooltip {...tooltipStyle} formatter={(value: number) => [value, 'Expedientes']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card
          title="Solicitudes de cuenta pendientes"
          subtitle={`${formatNumber(k.pendingAccountRequests)} por revisar`}
          actions={
            <Link to="/solicitudes" className="text-xs gh-link">
              Ver bandeja
            </Link>
          }
        >
          {data.pendingAccountRequests.length === 0 ? (
            <EmptyState
              title="Sin solicitudes pendientes"
              description="Todas las solicitudes del app fueron revisadas."
              icon={<UserCheck className="h-4 w-4" />}
            />
          ) : (
            <ul className="divide-y divide-[var(--gh-border)]">
              {data.pendingAccountRequests.map((req) => (
                <li key={req.id} className="flex items-center gap-3 py-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-[11px] font-semibold text-primary">
                    {req.fullName.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{req.fullName}</p>
                    <p className="truncate text-xs text-muted">
                      {req.email} · {formatRelative(req.createdAt)}
                    </p>
                  </div>
                  <PermissionGate permission="accountrequests.approve">
                    <Link to="/solicitudes">
                      <Button size="sm" variant="secondary">
                        Revisar
                      </Button>
                    </Link>
                  </PermissionGate>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card
          title="Últimas gestiones"
          subtitle="Eventos de expediente en tiempo real"
          actions={<Badge tone="info">En vivo</Badge>}
        >
          {data.latestActivities.length === 0 ? (
            <EmptyState title="Sin actividad reciente" />
          ) : (
            <ol className="relative space-y-4 border-l border-line pl-4">
              {data.latestActivities.map((event) => (
                <li key={event.id} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" />
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-ink">{event.title}</p>
                    <span className="text-[11px] text-muted">{formatRelative(event.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted">{event.description}</p>
                  <p className="mt-0.5 text-[11px] text-muted">por {event.actorName}</p>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card
          title="Tareas vencidas"
          subtitle="Requieren acción del equipo"
          actions={
            can('reports.view') ? (
              <Link to="/informes" className="text-xs gh-link">
                Ver informe
              </Link>
            ) : null
          }
        >
          {data.overdueTasksList.length === 0 ? (
            <EmptyState
              title="Ninguna tarea vencida"
              description="El equipo está al día con los vencimientos."
              icon={<ClipboardList className="h-4 w-4" />}
            />
          ) : (
            <ul className="divide-y divide-[var(--gh-border)]">
              {data.overdueTasksList.map((task) => (
                <li key={task.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/expedientes/${task.caseFileId}`} className="text-sm font-medium text-ink hover:text-primary">
                      {task.title}
                    </Link>
                    <Badge tone={toneOf(priorityMeta, task.priority)}>{labelOf(priorityMeta, task.priority)}</Badge>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted">
                    <span>Responsable: {task.assignedToName}</span>
                    <span className={isOverdue(task.dueAt) ? 'font-medium text-danger' : ''}>
                      Vence {formatRelative(task.dueAt)}
                    </span>
                  </p>
                  <div className="mt-2">
                    <ProgressBar value={task.status === 'InProgress' ? 55 : 15} tone="warning" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {data.revenueByCategory.map((row) => (
          <div key={row.category} className="gh-card-pad">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">{row.category}</p>
            <p className="mt-1.5 text-lg font-semibold tabular-nums text-ink">{formatMoney(row.total)}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {data.casesByStatus.map((row) => (
          <Badge key={row.status} tone={toneOf(caseStatusMeta, row.status)}>
            {labelOf(caseStatusMeta, row.status)}: {formatNumber(row.count)}
          </Badge>
        ))}
      </div>
    </>
  )
}
