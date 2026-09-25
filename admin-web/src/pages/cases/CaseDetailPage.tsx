import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  CalendarClock,
  CheckCircle2,
  CircleDot,
  FileStack,
  Flag,
  MessageSquare,
  Pencil,
  Plus,
  Send,
  Trash2,
  User,
} from 'lucide-react'
import { casesApi, documentsApi, messagesApi, usersApi } from '@/api/endpoints'
import { useApiMutation } from '@/hooks/useApi'
import { usePermission } from '@/hooks/useAuth'
import { formatBytes, formatDate, formatDateTime, formatMoney, formatRelative, isOverdue } from '@/lib/format'
import {
  caseEntityList,
  caseEventTypeMeta,
  caseMatterList,
  caseMatterMeta,
  caseStatusList,
  caseStatusMeta,
  documentCategoryMeta,
  labelOf,
  priorityList,
  priorityMeta,
  taskStatusList,
  taskStatusMeta,
  toneOf,
} from '@/lib/labels'
import {
  Badge,
  Button,
  Card,
  Checkbox,
  DataTable,
  EmptyState,
  ErrorState,
  Modal,
  ProgressBar,
  Select,
  Skeleton,
  Tabs,
  Tab,
  TextInput,
  Textarea,
  type Column,
} from '@/components/ui'
import { PageHeader, PermissionGate } from '@/components/layout/AppShell'
import type { CaseTask, CaseTaskStatus, DocumentItem, Message } from '@/types'

const statusFlow: Record<string, string[]> = {
  Open: ['InProgress', 'WaitingClient', 'OnHold', 'Cancelled'],
  InProgress: ['WaitingClient', 'OnHold', 'Completed', 'Cancelled'],
  WaitingClient: ['InProgress', 'OnHold', 'Cancelled'],
  OnHold: ['InProgress', 'Cancelled'],
  Completed: ['Closed', 'InProgress'],
  Closed: ['InProgress'],
  Cancelled: ['Open'],
}

export default function CaseDetailPage() {
  const { id = '' } = useParams()
  const { can } = usePermission()
  const [tab, setTab] = useState('tareas')
  const [showTask, setShowTask] = useState(false)
  const [editingTask, setEditingTask] = useState<CaseTask | null>(null)
  const [showStatus, setShowStatus] = useState(false)
  const [nextStatus, setNextStatus] = useState('')
  const [statusNote, setStatusNote] = useState('')
  const [showEdit, setShowEdit] = useState(false)
  const [messageBody, setMessageBody] = useState('')
  const [preview, setPreview] = useState<DocumentItem | null>(null)

  const query = useQuery({
    queryKey: ['case', id],
    queryFn: () => casesApi.get(id),
    enabled: !!id,
  })

  const staff = useQuery({
    queryKey: ['users', 'staff-options'],
    queryFn: () => usersApi.list({ page: 1, pageSize: 100, isStaff: true, status: 'Active' }),
    staleTime: 120000,
  })

  const changeStatus = useApiMutation(
    (vars: { status: string; note?: string }) => casesApi.changeStatus(id, vars.status, vars.note),
    {
      successMessage: 'Estado actualizado · evento y notificación emitidos',
      invalidate: [['case', id], ['cases'], ['dashboard']],
      onSuccess: () => {
        setShowStatus(false)
        setStatusNote('')
      },
    },
  )

  const createTask = useApiMutation(
    (values: Partial<CaseTask>) => casesApi.createTask(id, values),
    {
      successMessage: 'Tarea creada',
      invalidate: [['case', id], ['cases'], ['dashboard']],
      onSuccess: () => {
        setShowTask(false)
        setEditingTask(null)
      },
    },
  )

  const updateTask = useApiMutation(
    (vars: { taskId: string; body: Partial<CaseTask> }) => casesApi.updateTask(id, vars.taskId, vars.body),
    {
      successMessage: 'Tarea actualizada',
      invalidate: [['case', id], ['cases']],
      onSuccess: () => {
        setShowTask(false)
        setEditingTask(null)
      },
    },
  )

  const removeTask = useApiMutation((taskId: string) => casesApi.removeTask(id, taskId), {
    successMessage: 'Tarea eliminada',
    invalidate: [['case', id], ['cases']],
  })

  const updateCase = useApiMutation((values: Record<string, unknown>) => casesApi.update(id, values), {
    successMessage: 'Expediente actualizado',
    invalidate: [['case', id], ['cases']],
    onSuccess: () => setShowEdit(false),
  })

  const sendMessage = useApiMutation(
    (body: string) => messagesApi.send({ caseFileId: id, clientId: query.data?.clientId ?? '', body }),
    {
      successMessage: 'Mensaje enviado',
      invalidate: [['case', id]],
      onSuccess: () => setMessageBody(''),
    },
  )

  const uploadDoc = useApiMutation(
    (file: File) =>
      documentsApi.upload([
        {
          file,
          category: 'Expediente',
          caseFileId: id,
          clientId: query.data?.clientId ?? null,
          clientVisible: true,
        },
      ]),
    {
      successMessage: 'Documento agregado al expediente',
      invalidate: [['case', id], ['documents']],
    },
  )

  const taskColumns: Column<CaseTask>[] = useMemo(
    () => [
      {
        key: 'title',
        header: 'Tarea',
        render: (t) => (
          <div className="min-w-0">
            <p className={`truncate font-medium ${t.status === 'Done' ? 'text-muted line-through' : 'text-ink'}`}>
              {t.title}
            </p>
            {t.description ? <p className="truncate text-xs text-muted">{t.description}</p> : null}
          </div>
        ),
      },
      {
        key: 'status',
        header: 'Estado',
        render: (t) => <Badge tone={toneOf(taskStatusMeta, t.status)}>{labelOf(taskStatusMeta, t.status)}</Badge>,
      },
      {
        key: 'priority',
        header: 'Prioridad',
        render: (t) => <Badge tone={toneOf(priorityMeta, t.priority)}>{labelOf(priorityMeta, t.priority)}</Badge>,
      },
      {
        key: 'assignedToName',
        header: 'Asignada a',
        render: (t) => <span className="text-xs text-ink-700">{t.assignedToName ?? '—'}</span>,
      },
      {
        key: 'dueAt',
        header: 'Vence',
        render: (t) => (
          <span className={isOverdue(t.dueAt) ? 'text-xs font-medium text-danger' : 'text-xs text-muted'}>
            {formatDate(t.dueAt)}
          </span>
        ),
      },
      {
        key: 'clientVisible',
        header: 'Cliente',
        align: 'center',
        render: (t) => (
          <Badge tone={t.clientVisible ? 'success' : 'neutral'}>{t.clientVisible ? 'Visible' : 'Interna'}</Badge>
        ),
      },
      {
        key: 'actions',
        header: '',
        align: 'right',
        render: (t) => (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <PermissionGate permission="cases.edit">
              {t.status !== 'Done' ? (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                  title="Marcar completada"
                  onClick={() => updateTask.mutate({ taskId: t.id, body: { status: 'Done' } })}
                />
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                icon={<Pencil className="h-3.5 w-3.5" />}
                title="Editar tarea"
                onClick={() => {
                  setEditingTask(t)
                  setShowTask(true)
                }}
              />
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 className="h-3.5 w-3.5" />}
                title="Eliminar tarea"
                onClick={() => removeTask.mutate(t.id)}
              />
            </PermissionGate>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  if (query.isLoading) {
    return (
      <>
        <PageHeader title="Expediente" backTo="/expedientes" />
        <Card>
          <Skeleton className="h-6 w-72" />
          <Skeleton className="mt-3 h-4 w-48" />
          <Skeleton className="mt-4 h-24 w-full" />
        </Card>
      </>
    )
  }

  if (query.isError || !query.data) {
    return (
      <>
        <PageHeader title="Expediente" backTo="/expedientes" />
        <ErrorState
          title="No se encontró el expediente"
          message={(query.error as Error)?.message}
          onRetry={() => void query.refetch()}
        />
      </>
    )
  }

  const c = query.data
  const messages = c.messages
  const doneTasks = c.tasks.filter((t) => t.status === 'Done').length

  return (
    <>
      <PageHeader
        title={`${c.code} · ${c.title}`}
        subtitle={`${c.clientName} · ${labelOf(caseMatterMeta, c.matter)} · ${c.entity}${
          c.referenceNumber ? ` · Ref. ${c.referenceNumber}` : ''
        }`}
        backTo="/expedientes"
        actions={
          <>
            <PermissionGate
              permission={['cases.edit', 'cases.assign']}
              fallback={<Badge tone="neutral">Solo lectura</Badge>}
            >
              <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setShowEdit(true)}>
                Editar
              </Button>
              <Button
                variant="primary"
                icon={<Flag className="h-4 w-4" />}
                onClick={() => {
                  setNextStatus(statusFlow[c.status]?.[0] ?? 'InProgress')
                  setShowStatus(true)
                }}
              >
                Cambiar estado
              </Button>
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
                <Badge tone={toneOf(caseStatusMeta, c.status)}>{labelOf(caseStatusMeta, c.status)}</Badge>
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Prioridad</p>
              <div className="mt-1">
                <Badge tone={toneOf(priorityMeta, c.priority)}>{labelOf(priorityMeta, c.priority)}</Badge>
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Responsable</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-ink">
                <User className="h-3.5 w-3.5 text-muted" aria-hidden />
                {c.responsibleName ?? 'Sin asignar'}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Vence</p>
              <p className={`mt-1 text-sm ${isOverdue(c.dueAt) ? 'font-medium text-danger' : 'text-ink'}`}>
                <CalendarClock className="mr-1 inline h-3.5 w-3.5 text-muted" aria-hidden />
                {formatDate(c.dueAt)}
              </p>
            </div>
            <div className="sm:col-span-4">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-muted">Avance del expediente</span>
                <span className="text-muted">
                  {doneTasks} de {c.tasks.length} tareas completadas
                </span>
              </div>
              <ProgressBar value={c.progressPercent} tone={c.progressPercent >= 100 ? 'success' : 'primary'} />
            </div>
          </div>

          <Tabs value={tab} onChange={setTab}>
            <Tab value="tareas">Tareas ({c.tasks.length})</Tab>
            <Tab value="timeline">Timeline / actuaciones ({c.events.length})</Tab>
            <Tab value="documentos">Documentos ({c.documents.length})</Tab>
            <Tab value="mensajes">Mensajes ({messages.length})</Tab>
            <Tab value="datos">Datos</Tab>
          </Tabs>

          <div className="p-5">
            {tab === 'tareas' ? (
              <div>
                <div className="mb-3 flex justify-end">
                  <PermissionGate permission="cases.edit">
                    <Button
                      size="sm"
                      variant="primary"
                      icon={<Plus className="h-3.5 w-3.5" />}
                      onClick={() => {
                        setEditingTask(null)
                        setShowTask(true)
                      }}
                    >
                      Nueva tarea
                    </Button>
                  </PermissionGate>
                </div>
                <DataTable
                  columns={taskColumns}
                  rows={c.tasks}
                  rowKey={(t) => t.id}
                  dense
                  empty={
                    <EmptyState
                      title="Sin tareas"
                      description="Agregue las tareas del trámite y asígnelas al equipo."
                      icon={<CircleDot className="h-4 w-4" />}
                    />
                  }
                />
              </div>
            ) : null}

            {tab === 'timeline' ? (
              c.events.length === 0 ? (
                <EmptyState title="Sin actuaciones registradas" />
              ) : (
                <ol className="relative space-y-4 border-l border-line pl-4">
                  {c.events.map((e) => (
                    <li key={e.id} className="relative">
                      <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" />
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={toneOf(caseEventTypeMeta, e.type)}>{labelOf(caseEventTypeMeta, e.type)}</Badge>
                        <p className="text-sm font-medium text-ink">{e.title}</p>
                        <span className="text-[11px] text-muted">{formatDateTime(e.createdAt)}</span>
                        {e.clientVisible ? <Badge tone="info">Visible al cliente</Badge> : null}
                      </div>
                      {e.description ? <p className="mt-1 text-xs text-muted">{e.description}</p> : null}
                      <p className="mt-0.5 text-[11px] text-muted">por {e.actorName}</p>
                    </li>
                  ))}
                </ol>
              )
            ) : null}

            {tab === 'documentos' ? (
              <div>
                <div className="mb-3 flex justify-end">
                  <PermissionGate permission="documents.create">
                    <label className="gh-btn gh-btn-secondary gh-btn-sm cursor-pointer">
                      <FileStack className="h-3.5 w-3.5" aria-hidden />
                      Subir al expediente
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) uploadDoc.mutate(file)
                          e.target.value = ''
                        }}
                      />
                    </label>
                  </PermissionGate>
                </div>
                {c.documents.length === 0 ? (
                  <EmptyState title="Sin documentos" description="Suba los documentos del trámite." />
                ) : (
                  <ul className="divide-y divide-[var(--gh-border)]">
                    {c.documents.map((d) => (
                      <li key={d.id} className="flex flex-wrap items-center gap-3 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">{d.originalName}</p>
                          <p className="text-xs text-muted">
                            {formatBytes(d.sizeBytes)} · v{d.version} · {formatDateTime(d.uploadedAt)}
                          </p>
                        </div>
                        <Badge tone={toneOf(documentCategoryMeta, d.category)}>
                          {labelOf(documentCategoryMeta, d.category)}
                        </Badge>
                        <Badge tone={d.clientVisible ? 'success' : 'neutral'}>
                          {d.clientVisible ? 'Visible' : 'Interno'}
                        </Badge>
                        <Button size="sm" variant="secondary" onClick={() => setPreview(d)}>
                          Ver
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            {tab === 'mensajes' ? (
              <div>
                <div className="mb-4 max-h-[340px] space-y-3 overflow-y-auto pr-1">
                  {messages.length === 0 ? (
                    <EmptyState title="Sin mensajes con el cliente" description="Escriba el primer mensaje." />
                  ) : (
                    messages.map((m: Message) => (
                      <div
                        key={m.id}
                        className={
                          m.isFromClient
                            ? 'max-w-[80%] rounded-card border border-line bg-surface-2 px-3.5 py-2.5'
                            : 'ml-auto max-w-[80%] rounded-card border border-primary/20 bg-primary-50 px-3.5 py-2.5'
                        }
                      >
                        <p className="text-xs font-medium text-ink">
                          {m.isFromClient ? 'Cliente' : (m.senderName ?? 'Firma')}
                        </p>
                        <p className="mt-1 whitespace-pre-line text-sm text-ink-700">{m.body}</p>
                        <p className="mt-1 text-[11px] text-muted">
                          {formatRelative(m.createdAt)}
                          {m.readByClientAt ? ' · leído por el cliente' : ''}
                        </p>
                      </div>
                    ))
                  )}
                </div>
                <PermissionGate permission="messages.send">
                  <div className="flex gap-2 border-t border-line pt-4">
                    <TextInput
                      className="flex-1"
                      placeholder="Escriba al cliente sobre este expediente…"
                      value={messageBody}
                      onChange={(e) => setMessageBody(e.target.value)}
                    />
                    <Button
                      variant="primary"
                      icon={<Send className="h-4 w-4" />}
                      disabled={!messageBody.trim()}
                      loading={sendMessage.isPending}
                      onClick={() => sendMessage.mutate(messageBody.trim())}
                    >
                      Enviar
                    </Button>
                  </div>
                </PermissionGate>
              </div>
            ) : null}

            {tab === 'datos' ? (
              <dl className="grid gap-4 sm:grid-cols-2">
                {[
                  ['Código', c.code],
                  ['Cliente', c.clientName ?? '—'],
                  ['Materia', labelOf(caseMatterMeta, c.matter)],
                  ['Ente regulador', c.entity],
                  ['Número de referencia', c.referenceNumber ?? '—'],
                  ['Prioridad', labelOf(priorityMeta, c.priority)],
                  ['Estado', labelOf(caseStatusMeta, c.status)],
                  ['Responsable', c.responsibleName ?? '—'],
                  ['Apertura', formatDateTime(c.openedAt)],
                  ['Vencimiento', formatDateTime(c.dueAt)],
                  ['Cierre', c.closedAt ? formatDateTime(c.closedAt) : '—'],
                  ['Monto pactado', formatMoney(c.agreedAmount ?? 0, c.currency)],
                  ['Visible al cliente', c.clientVisible ? 'Sí' : 'No'],
                  ['Origen comercial', c.orderItemId ? 'Pedido de la tienda' : 'Manual'],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
                    <dd className="mt-0.5 text-sm text-ink">{value}</dd>
                  </div>
                ))}
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase tracking-wide text-muted">Descripción</dt>
                  <dd className="mt-0.5 whitespace-pre-line text-sm text-ink-700">{c.description || '—'}</dd>
                </div>
              </dl>
            ) : null}
          </div>
        </Card>

        <div className="space-y-5">
          <Card title="Cliente">
            <Link to={`/clientes/${c.clientId}`} className="block rounded-control p-2 transition-colors hover:bg-surface-2">
              <p className="text-sm font-medium text-ink">{c.client.legalName}</p>
              <p className="text-xs text-muted">
                {c.client.code} · {c.client.email}
              </p>
              <p className="text-xs text-muted">{c.client.phone}</p>
            </Link>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge tone="neutral">{c.client.district ?? c.client.canton ?? 'Guanacaste'}</Badge>
              {c.client.tagsCsv
                ? c.client.tagsCsv
                    .split(',')
                    .filter(Boolean)
                    .slice(0, 3)
                    .map((t) => (
                      <span key={t} className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] text-primary">
                        {t}
                      </span>
                    ))
                : null}
            </div>
          </Card>

          <Card title="Próximas tareas">
            {c.tasks.filter((t) => t.status === 'Todo' || t.status === 'InProgress').length === 0 ? (
              <p className="text-sm text-muted">Sin tareas abiertas.</p>
            ) : (
              <ul className="space-y-2.5">
                {c.tasks
                  .filter((t) => t.status === 'Todo' || t.status === 'InProgress')
                  .slice(0, 6)
                  .map((t) => (
                    <li key={t.id} className="flex items-start gap-2">
                      <CircleDot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                      <div className="min-w-0">
                        <p className="truncate text-sm text-ink">{t.title}</p>
                        <p className={`text-[11px] ${isOverdue(t.dueAt) ? 'text-danger' : 'text-muted'}`}>
                          {t.assignedToName ?? 'Sin asignar'} · {formatDate(t.dueAt)}
                        </p>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </Card>

          <Card title="Acciones rápidas">
            <div className="flex flex-col gap-2">
              <PermissionGate permission="cases.edit">
                <Button
                  variant="secondary"
                  icon={<Flag className="h-4 w-4" />}
                  onClick={() => {
                    setNextStatus(statusFlow[c.status]?.[0] ?? 'InProgress')
                    setShowStatus(true)
                  }}
                >
                  Cambiar estado
                </Button>
              </PermissionGate>
              <Link to={`/clientes/${c.clientId}`}>
                <Button variant="secondary" icon={<User className="h-4 w-4" />} className="w-full">
                  Ver ficha del cliente
                </Button>
              </Link>
              <Link to="/documentos">
                <Button variant="secondary" icon={<FileStack className="h-4 w-4" />} className="w-full">
                  Bandeja de documentos
                </Button>
              </Link>
            </div>
          </Card>

          <Card title="Mensajes sin leer del cliente">
            <p className="flex items-center gap-2 text-sm text-ink">
              <MessageSquare className="h-4 w-4 text-muted" aria-hidden />
              {messages.filter((m) => m.isFromClient && !m.readByStaffAt).length} mensaje(s) sin atender
            </p>
          </Card>
        </div>
      </div>

      {/* Alta / edición de tarea */}
      <Modal
        open={showTask}
        onClose={() => {
          setShowTask(false)
          setEditingTask(null)
        }}
        title={editingTask ? 'Editar tarea' : 'Nueva tarea'}
        size="md"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            const form = new FormData(e.currentTarget)
            const body: Partial<CaseTask> = {
              title: String(form.get('title')),
              description: String(form.get('description')),
              status: String(form.get('status')) as CaseTaskStatus,
              priority: String(form.get('priority')) as CaseTask['priority'],
              dueAt: form.get('dueAt') ? new Date(String(form.get('dueAt'))).toISOString() : null,
              assignedToUserId: String(form.get('assignedToUserId')) || null,
              clientVisible: form.get('clientVisible') === 'on',
            }
            if (editingTask) updateTask.mutate({ taskId: editingTask.id, body })
            else createTask.mutate(body)
          }}
        >
          <TextInput
            label="Título"
            name="title"
            required
            defaultValue={editingTask?.title ?? ''}
            placeholder="Presentar formulario ante el ente"
          />
          <Textarea
            label="Descripción"
            name="description"
            defaultValue={editingTask?.description ?? ''}
            placeholder="Detalle de la tarea y criterios de cierre…"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Estado"
              name="status"
              defaultValue={editingTask?.status ?? 'Todo'}
              options={taskStatusList.map((s) => ({ value: s, label: labelOf(taskStatusMeta, s) }))}
            />
            <Select
              label="Prioridad"
              name="priority"
              defaultValue={editingTask?.priority ?? 'Normal'}
              options={priorityList.map((p) => ({ value: p, label: labelOf(priorityMeta, p) }))}
            />
            <TextInput
              label="Fecha límite"
              name="dueAt"
              type="date"
              defaultValue={editingTask?.dueAt ? editingTask.dueAt.slice(0, 10) : ''}
            />
            <Select
              label="Asignar a"
              name="assignedToUserId"
              placeholder="Sin asignar"
              defaultValue={editingTask?.assignedToUserId ?? ''}
              options={(staff.data?.items ?? []).map((u) => ({ value: u.id, label: u.fullName }))}
            />
          </div>
          <Checkbox
            name="clientVisible"
            label="Visible para el cliente en el app"
            defaultChecked={editingTask?.clientVisible ?? true}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setShowTask(false)
                setEditingTask(null)
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={createTask.isPending || updateTask.isPending}>
              {editingTask ? 'Guardar tarea' : 'Crear tarea'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Cambio de estado */}
      <Modal open={showStatus} onClose={() => setShowStatus(false)} title="Cambiar estado del expediente" size="sm">
        <div className="space-y-4">
          <Select
            label="Nuevo estado"
            value={nextStatus}
            onChange={(e) => setNextStatus(e.target.value)}
            options={(statusFlow[c.status] ?? caseStatusList).map((s) => ({
              value: s,
              label: labelOf(caseStatusMeta, s),
            }))}
          />
          <Textarea
            label="Nota del cambio (se incluye en el timeline)"
            value={statusNote}
            onChange={(e) => setStatusNote(e.target.value)}
            placeholder="Se presentó la documentación completa ante el ente."
          />
          <p className="rounded-control border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
            Al guardar se registra un evento inmutable en el timeline, se notifica al responsable y se envía
            notificación in-app/push al cliente si el expediente es visible.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowStatus(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              loading={changeStatus.isPending}
              onClick={() => changeStatus.mutate({ status: nextStatus, note: statusNote })}
            >
              Confirmar cambio
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edición del expediente */}
      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Editar expediente" size="lg">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            const form = new FormData(e.currentTarget)
            updateCase.mutate({
              title: String(form.get('title')),
              description: String(form.get('description')),
              matter: String(form.get('matter')),
              entity: String(form.get('entity')),
              referenceNumber: String(form.get('referenceNumber')),
              priority: String(form.get('priority')),
              responsibleUserId: String(form.get('responsibleUserId')) || null,
              dueAt: form.get('dueAt') ? new Date(String(form.get('dueAt'))).toISOString() : null,
              agreedAmount: Number(form.get('agreedAmount') ?? 0),
              progressPercent: Number(form.get('progressPercent') ?? 0),
              clientVisible: form.get('clientVisible') === 'on',
            })
          }}
        >
          <TextInput label="Título" name="title" required defaultValue={c.title} />
          <Textarea label="Descripción" name="description" defaultValue={c.description ?? ''} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Materia"
              name="matter"
              defaultValue={c.matter}
              options={caseMatterList.map((m) => ({ value: m, label: labelOf(caseMatterMeta, m) }))}
            />
            <Select
              label="Ente"
              name="entity"
              defaultValue={c.entity}
              options={caseEntityList.map((e) => ({ value: e, label: e }))}
            />
            <TextInput label="Número de referencia" name="referenceNumber" defaultValue={c.referenceNumber ?? ''} />
            <Select
              label="Prioridad"
              name="priority"
              defaultValue={c.priority}
              options={priorityList.map((p) => ({ value: p, label: labelOf(priorityMeta, p) }))}
            />
            <Select
              label="Responsable"
              name="responsibleUserId"
              placeholder="Sin asignar"
              defaultValue={c.responsibleUserId ?? ''}
              options={(staff.data?.items ?? []).map((u) => ({ value: u.id, label: u.fullName }))}
            />
            <TextInput label="Vencimiento" name="dueAt" type="date" defaultValue={c.dueAt ? c.dueAt.slice(0, 10) : ''} />
            <TextInput
              label="Monto pactado (USD)"
              name="agreedAmount"
              type="number"
              step="0.01"
              defaultValue={String(c.agreedAmount ?? '')}
            />
            <TextInput
              label="Progreso (%)"
              name="progressPercent"
              type="number"
              min={0}
              max={100}
              defaultValue={String(c.progressPercent)}
            />
          </div>
          <Checkbox name="clientVisible" label="Visible para el cliente" defaultChecked={c.clientVisible} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowEdit(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={updateCase.isPending}>
              Guardar cambios
            </Button>
          </div>
        </form>
      </Modal>

      {/* Previsualización de documento */}
      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview?.originalName ?? 'Documento'}
        size="lg"
        footer={
          <Button variant="secondary" onClick={() => setPreview(null)}>
            Cerrar
          </Button>
        }
      >
        {preview ? (
          <div className="space-y-3">
            {preview.contentType === 'application/pdf' ? (
              <div className="flex h-[420px] flex-col items-center justify-center rounded-card border border-line bg-surface-2 text-center">
                <FileStack className="h-10 w-10 text-muted" aria-hidden />
                <p className="mt-3 text-sm font-medium text-ink">Vista previa de PDF</p>
                <p className="mt-1 max-w-md text-xs text-muted">
                  En modo mock no hay archivo físico. Con la API real se sirve por URL firmada HMAC (15 min)
                  desde <code>/public/files/&#123;token&#125;</code> y se incrusta aquí con el visor nativo del
                  navegador.
                </p>
              </div>
            ) : (
              <div className="flex h-[240px] flex-col items-center justify-center rounded-card border border-line bg-surface-2">
                <FileStack className="h-10 w-10 text-muted" aria-hidden />
                <p className="mt-3 text-sm text-muted">Previsualización disponible solo para PDF e imágenes.</p>
              </div>
            )}
            <dl className="grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <dt className="text-xs uppercase text-muted">Tamaño</dt>
                <dd className="text-ink">{formatBytes(preview.sizeBytes)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted">Versión</dt>
                <dd className="text-ink">v{preview.version}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted">SHA-256</dt>
                <dd className="truncate font-mono text-xs text-ink">{preview.sha256}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted">Ruta de almacenamiento</dt>
                <dd className="truncate font-mono text-xs text-ink">{preview.storagePath}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </Modal>
    </>
  )
}
