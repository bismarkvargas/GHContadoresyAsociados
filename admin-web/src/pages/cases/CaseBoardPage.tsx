import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { GripVertical, LayoutGrid, Plus } from 'lucide-react'
import { casesApi, usersApi } from '@/api/endpoints'
import { usePermission } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useUi'
import { formatDate, formatMoney, isOverdue } from '@/lib/format'
import {
  caseMatterMeta,
  caseStatusBoardOrder,
  caseStatusMeta,
  labelOf,
  priorityMeta,
  toneOf,
} from '@/lib/labels'
import { Badge, Button, Card, EmptyState, Skeleton, Select } from '@/components/ui'
import { PageHeader } from '@/components/layout/AppShell'
import type { CaseFile, CaseStatus } from '@/types'

export default function CaseBoardPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { can } = usePermission()
  const [responsible, setResponsible] = useState('')
  const [dragging, setDragging] = useState<CaseFile | null>(null)
  const [overColumn, setOverColumn] = useState<CaseStatus | null>(null)

  const query = useQuery({
    queryKey: ['cases', 'board', responsible],
    queryFn: () =>
      casesApi.list({
        page: 1,
        pageSize: 300,
        responsibleUserId: responsible || undefined,
        sort: 'dueAt',
        order: 'asc',
      }),
    refetchInterval: 45000,
  })

  const staff = useQuery({
    queryKey: ['users', 'staff-options'],
    queryFn: () => usersApi.list({ page: 1, pageSize: 100, isStaff: true, status: 'Active' }),
    staleTime: 120000,
  })

  const columns = useMemo(() => {
    const map = new Map<CaseStatus, CaseFile[]>()
    for (const status of caseStatusBoardOrder) map.set(status, [])
    for (const c of query.data?.items ?? []) {
      const bucket = map.get(c.status)
      if (bucket) bucket.push(c)
    }
    return map
  }, [query.data])

  async function moveTo(status: CaseStatus): Promise<void> {
    if (!dragging) return
    const current = dragging
    setDragging(null)
    setOverColumn(null)
    if (current.status === status) return
    try {
      await casesApi.changeStatus(current.id, status, 'Movido desde el tablero kanban')
      toast.success(`Expediente ${current.code} movido a ${labelOf(caseStatusMeta, status)}`)
      void query.refetch()
    } catch (error) {
      toast.error('No se pudo cambiar el estado', (error as Error).message)
    }
  }

  return (
    <>
      <PageHeader
        title="Tablero kanban de expedientes"
        subtitle="Arrastre una tarjeta para cambiar el estado (dispara evento y notificación al cliente)"
        actions={
          <>
            <Select
              className="w-auto"
              value={responsible}
              onChange={(e) => setResponsible(e.target.value)}
              placeholder="Todos los responsables"
              options={(staff.data?.items ?? []).map((u) => ({ value: u.id, label: u.fullName }))}
            />
            <Link to="/expedientes">
              <Button variant="secondary" icon={<LayoutGrid className="h-4 w-4" />}>
                Vista de listado
              </Button>
            </Link>
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

      {query.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-6">
          {caseStatusBoardOrder.map((s) => (
            <div key={s} className="gh-card-pad space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-[1100px] gap-4">
            {caseStatusBoardOrder.map((status) => {
              const items = columns.get(status) ?? []
              const tone = toneOf(caseStatusMeta, status)
              return (
                <section
                  key={status}
                  className={`flex w-[260px] shrink-0 flex-col rounded-card border bg-surface-2 transition-colors ${
                    overColumn === status ? 'border-primary bg-primary-50/50' : 'border-line'
                  }`}
                  onDragOver={(e) => {
                    if (!can('cases.edit')) return
                    e.preventDefault()
                    setOverColumn(status)
                  }}
                  onDragLeave={() => setOverColumn((s) => (s === status ? null : s))}
                  onDrop={() => void moveTo(status)}
                >
                  <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Badge tone={tone}>{labelOf(caseStatusMeta, status)}</Badge>
                    </div>
                    <span className="text-xs font-semibold tabular-nums text-muted">{items.length}</span>
                  </header>

                  <div className="flex flex-1 flex-col gap-2 p-2.5">
                    {items.length === 0 ? (
                      <p className="rounded-control border border-dashed border-line px-3 py-6 text-center text-xs text-muted">
                        Sin expedientes
                      </p>
                    ) : (
                      items.slice(0, 40).map((c) => (
                        <article
                          key={c.id}
                          draggable={can('cases.edit')}
                          onDragStart={() => setDragging(c)}
                          onDragEnd={() => setDragging(null)}
                          onClick={() => navigate(`/expedientes/${c.id}`)}
                          className="group cursor-pointer rounded-control border border-line bg-card p-3 shadow-soft transition-shadow hover:shadow-pop"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-mono text-[11px] text-muted">{c.code}</span>
                            {can('cases.edit') ? (
                              <GripVertical className="h-3.5 w-3.5 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                            ) : null}
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm font-medium text-ink">{c.title}</p>
                          <p className="mt-0.5 truncate text-[11px] text-muted">{c.clientName}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <Badge tone={toneOf(caseMatterMeta, c.matter)}>{labelOf(caseMatterMeta, c.matter)}</Badge>
                            <Badge tone={toneOf(priorityMeta, c.priority)}>{labelOf(priorityMeta, c.priority)}</Badge>
                            <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] text-ink-700">{c.entity}</span>
                          </div>
                          <div className="mt-2.5 flex items-center justify-between text-[11px]">
                            <span className={isOverdue(c.dueAt) ? 'font-medium text-danger' : 'text-muted'}>
                              {c.dueAt ? `Vence ${formatDate(c.dueAt)}` : 'Sin vencimiento'}
                            </span>
                            <span className="tabular-nums text-muted">{formatMoney(c.agreedAmount ?? 0, c.currency)}</span>
                          </div>
                          {c.openTaskCount ? (
                            <p className="mt-1.5 text-[11px] text-muted">
                              {c.openTaskCount} tarea(s) abierta(s)
                            </p>
                          ) : null}
                        </article>
                      ))
                    )}
                  </div>
                </section>
              )
            })}
          </div>
        </div>
      )}

      {!query.isLoading && (query.data?.total ?? 0) === 0 ? (
        <Card className="mt-4">
          <EmptyState
            title="Sin expedientes en el tablero"
            description="Cree un expediente o cambie el filtro de responsable."
          />
        </Card>
      ) : null}
    </>
  )
}
