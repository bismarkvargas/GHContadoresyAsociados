import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Briefcase,
  Building2,
  CalendarPlus,
  FileStack,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Plus,
  Trash2,
  UserCog,
} from 'lucide-react'
import { casesApi, clientsApi, documentsApi, messagesApi, ordersApi, usersApi } from '@/api/endpoints'
import { useApiMutation, useRouteId } from '@/hooks/useApi'
import { usePermission } from '@/hooks/useAuth'
import { formatBytes, formatDate, formatDateTime, formatMoney, formatRelative, isOverdue } from '@/lib/format'
import {
  caseStatusMeta,
  clientSourceMeta,
  clientStatusMeta,
  clientTypeMeta,
  documentCategoryMeta,
  interactionTypeList,
  interactionTypeMeta,
  labelOf,
  orderStatusMeta,
  priorityMeta,
  toneOf,
} from '@/lib/labels'
import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
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
import { PageHeader } from '@/components/layout/AppShell'
import { ClientForm } from './ClientForm'
import type { CaseFile, ClientInteraction, ClientStatus, DocumentItem, Order, User } from '@/types'

export default function ClientDetailPage() {
  const { id: rawId } = useParams()
  // Guarda: un identificador ausente o literal «undefined» nunca debe llegar a la API.
  const id = useRouteId(rawId) ?? ''
  const idValido = id !== ''
  const { can } = usePermission()
  const [tab, setTab] = useState('datos')
  const [showEdit, setShowEdit] = useState(false)
  const [showInteraction, setShowInteraction] = useState(false)
  const [showContact, setShowContact] = useState(false)
  const [showConvert, setShowConvert] = useState(false)
  const [messageBody, setMessageBody] = useState('')

  const client = useQuery({
    queryKey: ['client', id],
    queryFn: () => clientsApi.get(id),
    enabled: idValido,
  })

  const contacts = useQuery({
    queryKey: ['client', id, 'contacts'],
    queryFn: () => clientsApi.contacts(id),
    enabled: idValido && tab === 'contactos',
  })

  const interactions = useQuery({
    queryKey: ['client', id, 'interactions'],
    queryFn: () => clientsApi.interactions(id, { page: 1, pageSize: 50 }),
    enabled: idValido && tab === 'interacciones',
  })

  const timeline = useQuery({
    queryKey: ['client', id, 'timeline'],
    queryFn: () => clientsApi.timeline(id),
    enabled: idValido && tab === 'timeline',
  })

  const cases = useQuery({
    queryKey: ['cases', { clientId: id }],
    queryFn: () => casesApi.list({ page: 1, pageSize: 50, clientId: id, sort: 'openedAt', order: 'desc' }),
    enabled: idValido,
  })

  const documents = useQuery({
    queryKey: ['documents', { clientId: id }],
    queryFn: () => documentsApi.list({ page: 1, pageSize: 50, clientId: id }),
    enabled: idValido && tab === 'documentos',
  })

  const orders = useQuery({
    queryKey: ['orders', { clientId: id }],
    queryFn: () => ordersApi.list({ page: 1, pageSize: 50, clientId: id }),
    enabled: idValido && tab === 'pedidos',
  })

  const messages = useQuery({
    queryKey: ['messages', { clientId: id }],
    queryFn: () => messagesApi.list({ page: 1, pageSize: 50, clientId: id, sort: 'createdAt', order: 'asc' }),
    enabled: idValido && tab === 'mensajes',
  })

  const staff = useQuery({
    queryKey: ['users', 'staff-options'],
    queryFn: () => usersApi.list({ page: 1, pageSize: 100, isStaff: true, status: 'Active' }),
    staleTime: 120000,
  })

  const update = useApiMutation((values: Record<string, unknown>) => clientsApi.update(id, values), {
    successMessage: 'Cliente actualizado',
    invalidate: [['client', id], ['clients']],
    onSuccess: () => setShowEdit(false),
  })

  const assign = useApiMutation((userId: string) => clientsApi.update(id, { assignedToUserId: userId || null }), {
    successMessage: 'Responsable actualizado',
    invalidate: [['client', id], ['clients']],
  })

  const changeStatus = useApiMutation(
    (status: string) => clientsApi.update(id, { status: status as ClientStatus }),
    {
      successMessage: 'Estado del cliente actualizado',
      invalidate: [['client', id], ['clients'], ['dashboard']],
    },
  )

  const removeClient = useApiMutation(() => clientsApi.remove(id), {
    successMessage: 'Cliente eliminado (soft-delete)',
    invalidate: [['clients']],
    onSuccess: () => window.history.back(),
  })

  const addInteraction = useApiMutation(
    (values: Partial<ClientInteraction>) => clientsApi.addInteraction(id, values),
    {
      successMessage: 'Gestión registrada',
      invalidate: [['client', id, 'interactions'], ['client', id, 'timeline'], ['dashboard']],
      onSuccess: () => setShowInteraction(false),
    },
  )

  const completeInteraction = useApiMutation(
    (vars: { interactionId: string; isCompleted: boolean }) =>
      clientsApi.completeInteraction(id, vars.interactionId, vars.isCompleted),
    {
      successMessage: 'Recordatorio actualizado',
      invalidate: [['client', id, 'interactions']],
    },
  )

  const addContact = useApiMutation(
    (values: Record<string, unknown>) => clientsApi.addContact(id, values),
    {
      successMessage: 'Contacto agregado',
      invalidate: [['client', id, 'contacts']],
      onSuccess: () => setShowContact(false),
    },
  )

  const removeContact = useApiMutation((contactId: string) => clientsApi.removeContact(id, contactId), {
    successMessage: 'Contacto eliminado',
    invalidate: [['client', id, 'contacts']],
  })

  const convertToCase = useApiMutation(
    () =>
      casesApi.create({
        clientId: id,
        title: `Expediente de ${client.data?.legalName ?? 'cliente'}`,
        matter: 'Contable',
        entity: 'Otro',
        priority: 'Normal',
        responsibleUserId: client.data?.assignedToUserId ?? undefined,
        clientVisible: true,
      }),
    {
      successMessage: 'Expediente creado y asignado',
      invalidate: [['cases'], ['client', id], ['dashboard']],
      onSuccess: () => setShowConvert(false),
    },
  )

  const sendMessage = useApiMutation(
    (body: string) => messagesApi.send({ clientId: id, body }),
    {
      successMessage: 'Mensaje enviado al cliente',
      invalidate: [['messages', { clientId: id }], ['client', id, 'timeline']],
      onSuccess: () => setMessageBody(''),
    },
  )

  const caseColumns: Column<CaseFile>[] = useMemo(
    () => [
      {
        key: 'code',
        header: 'Código',
        render: (c) => (
          <Link to={`/expedientes/${c.id}`} className="font-mono text-xs text-primary hover:underline">
            {c.code}
          </Link>
        ),
      },
      { key: 'title', header: 'Título', render: (c) => <span className="text-ink">{c.title}</span> },
      {
        key: 'matter',
        header: 'Materia',
        render: (c) => <span className="text-xs text-muted">{c.matter}</span>,
      },
      {
        key: 'status',
        header: 'Estado',
        render: (c) => <Badge tone={toneOf(caseStatusMeta, c.status)}>{labelOf(caseStatusMeta, c.status)}</Badge>,
      },
      {
        key: 'priority',
        header: 'Prioridad',
        render: (c) => <Badge tone={toneOf(priorityMeta, c.priority)}>{labelOf(priorityMeta, c.priority)}</Badge>,
      },
      {
        key: 'dueAt',
        header: 'Vence',
        render: (c) => (
          <span className={isOverdue(c.dueAt) ? 'text-xs font-medium text-danger' : 'text-xs text-muted'}>
            {formatDate(c.dueAt)}
          </span>
        ),
      },
      {
        key: 'progressPercent',
        header: 'Avance',
        render: (c) => <ProgressBar value={c.progressPercent} />,
      },
    ],
    [],
  )

  // Un identificador ausente no se consulta: se informa en lugar de dejar la
  // pantalla en un esqueleto indefinido.
  if (!idValido) {
    return (
      <>
        <PageHeader title="Ficha de cliente" backTo="/clientes" />
        <ErrorState
          title="Cliente no encontrado"
          message={`La dirección solicitada no incluye un identificador de cliente válido${rawId ? ` («${rawId}»)` : ''}.`}
        />
      </>
    )
  }

  if (client.isLoading) {
    return (
      <>
        <PageHeader title="Ficha de cliente" backTo="/clientes" />
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="gh-card-pad space-y-3 lg:col-span-2">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-24 w-full" />
          </div>
          <div className="gh-card-pad space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
      </>
    )
  }

  if (client.isError || !client.data) {
    return (
      <>
        <PageHeader title="Ficha de cliente" backTo="/clientes" />
        <ErrorState
          title="No se encontró el cliente"
          message={(client.error as Error)?.message}
          onRetry={() => void client.refetch()}
        />
      </>
    )
  }

  const c = client.data
  const homePhone = c.phone
  const waLink = c.whatsapp ? `https://wa.me/${c.whatsapp.replace(/[^0-9]/g, '')}` : null

  return (
    <>
      <PageHeader
        title={c.legalName}
        subtitle={`${c.code} · ${labelOf(clientTypeMeta, c.clientType)} · ${c.idNumber}`}
        backTo="/clientes"
        actions={
          <>
            {can('clients.edit') ? (
              <Select
                className="w-auto py-1.5 text-xs"
                value={c.status}
                onChange={(e) => changeStatus.mutate(e.target.value)}
                options={[
                  { value: 'Lead', label: 'Prospecto' },
                  { value: 'Active', label: 'Activo' },
                  { value: 'Inactive', label: 'Inactivo' },
                  { value: 'Blocked', label: 'Bloqueado' },
                ]}
              />
            ) : null}
            {can('cases.create') ? (
              <Button variant="secondary" icon={<Briefcase className="h-4 w-4" />} onClick={() => setShowConvert(true)}>
                Convertir en expediente
              </Button>
            ) : null}
            {can('clients.edit') ? (
              <Button variant="primary" icon={<UserCog className="h-4 w-4" />} onClick={() => setShowEdit(true)}>
                Editar
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card padded={false}>
            <div className="flex flex-wrap items-start gap-4 p-5">
              <Avatar name={c.legalName} className="h-14 w-14 text-base" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-ink">{c.legalName}</h2>
                  <Badge tone={toneOf(clientStatusMeta, c.status)}>{labelOf(clientStatusMeta, c.status)}</Badge>
                  <Badge tone={toneOf(clientTypeMeta, c.clientType)}>{labelOf(clientTypeMeta, c.clientType)}</Badge>
                  <Badge tone="neutral">{labelOf(clientSourceMeta, c.source)}</Badge>
                </div>
                {c.tradeName ? <p className="mt-1 text-sm text-muted">Nombre comercial: {c.tradeName}</p> : null}
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-700">
                  <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 hover:text-primary">
                    <Mail className="h-3.5 w-3.5" aria-hidden />
                    {c.email}
                  </a>
                  <a href={`tel:${homePhone}`} className="flex items-center gap-1.5 hover:text-primary">
                    <Phone className="h-3.5 w-3.5" aria-hidden />
                    {homePhone}
                  </a>
                  {waLink ? (
                    <a href={waLink} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-primary">
                      <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                      WhatsApp {c.whatsapp}
                    </a>
                  ) : null}
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" aria-hidden />
                    {[c.district, c.canton, c.province].filter(Boolean).join(', ') || 'Sin dirección'}
                  </span>
                </div>
                {c.tagsCsv ? (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {c.tagsCsv.split(',').filter(Boolean).map((tag) => (
                      <span key={tag} className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] text-primary">
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <Tabs value={tab} onChange={setTab}>
              <Tab value="datos">Datos</Tab>
              <Tab value="contactos">Contactos</Tab>
              <Tab value="interacciones">Interacciones</Tab>
              <Tab value="expedientes">Expedientes ({cases.data?.total ?? 0})</Tab>
              <Tab value="documentos">Documentos</Tab>
              <Tab value="pedidos">Pedidos</Tab>
              <Tab value="mensajes">Mensajes</Tab>
              <Tab value="timeline">Timeline</Tab>
            </Tabs>

            <div className="p-5">
              {tab === 'datos' ? (
                <dl className="grid gap-4 sm:grid-cols-2">
                  {[
                    ['Código de cliente', c.code],
                    ['Cédula / NIT / pasaporte', c.idNumber],
                    ['Tipo', labelOf(clientTypeMeta, c.clientType)],
                    ['Estado', labelOf(clientStatusMeta, c.status)],
                    ['Origen', labelOf(clientSourceMeta, c.source)],
                    ['Responsable', c.assignedToUserId ? 'Asignado' : 'Sin asignar'],
                    ['Correo', c.email],
                    ['Teléfono', c.phone],
                    ['WhatsApp', c.whatsapp ?? '—'],
                    ['Dirección', c.address ?? '—'],
                    ['Provincia / cantón / distrito', [c.province, c.canton, c.district].filter(Boolean).join(' / ') || '—'],
                    ['País', c.country],
                    ['Alta', formatDateTime(c.createdAt)],
                    ['Última actualización', formatDateTime(c.updatedAt)],
                  ].map(([label, value]) => (
                    <div key={label as string}>
                      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
                      <dd className="mt-0.5 text-sm text-ink">{value}</dd>
                    </div>
                  ))}
                  <div className="sm:col-span-2">
                    <dt className="text-xs uppercase tracking-wide text-muted">Notas internas</dt>
                    <dd className="mt-0.5 whitespace-pre-line text-sm text-ink-700">{c.notes || '—'}</dd>
                  </div>
                </dl>
              ) : null}

              {tab === 'contactos' ? (
                <div>
                  <div className="mb-3 flex justify-end">
                    {can('clients.edit') ? (
                      <Button size="sm" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setShowContact(true)}>
                        Agregar contacto
                      </Button>
                    ) : null}
                  </div>
                  {contacts.isLoading ? (
                    <Skeleton className="h-24 w-full" />
                  ) : (contacts.data ?? []).length === 0 ? (
                    <EmptyState title="Sin contactos adicionales" description="Agregue representantes o encargados del cliente." />
                  ) : (
                    <ul className="divide-y divide-[var(--gh-border)]">
                      {(contacts.data ?? []).map((ct) => (
                        <li key={ct.id} className="flex flex-wrap items-center gap-3 py-3">
                          <Avatar name={ct.fullName} />
                          <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-2 text-sm font-medium text-ink">
                              {ct.fullName}
                              {ct.isPrimary ? <Badge tone="primary">Principal</Badge> : null}
                            </p>
                            <p className="text-xs text-muted">
                              {ct.position ? `${ct.position} · ` : ''}
                              {ct.email} {ct.phone ? `· ${ct.phone}` : ''}
                            </p>
                          </div>
                          {can('clients.edit') ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<Trash2 className="h-3.5 w-3.5" />}
                              onClick={() => removeContact.mutate(ct.id)}
                              aria-label="Eliminar contacto"
                            />
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}

              {tab === 'interacciones' ? (
                <div>
                  <div className="mb-3 flex justify-end">
                    {can('clients.edit') ? (
                      <Button size="sm" variant="primary" icon={<CalendarPlus className="h-3.5 w-3.5" />} onClick={() => setShowInteraction(true)}>
                        Registrar gestión
                      </Button>
                    ) : null}
                  </div>
                  {interactions.isLoading ? (
                    <Skeleton className="h-32 w-full" />
                  ) : (interactions.data?.items ?? []).length === 0 ? (
                    <EmptyState title="Sin gestiones registradas" description="Registre llamadas, reuniones, correos o notas." />
                  ) : (
                    <ul className="divide-y divide-[var(--gh-border)]">
                      {(interactions.data?.items ?? []).map((it) => (
                        <li key={it.id} className="flex flex-wrap items-start gap-3 py-3">
                          <Badge tone={toneOf(interactionTypeMeta, it.type)}>{labelOf(interactionTypeMeta, it.type)}</Badge>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-ink">{it.subject}</p>
                            {it.notes ? <p className="mt-0.5 text-xs text-muted">{it.notes}</p> : null}
                            <p className="mt-1 text-[11px] text-muted">
                              {formatDateTime(it.occurredAt)}
                              {it.reminderAt ? ` · recordatorio ${formatDateTime(it.reminderAt)}` : ''}
                            </p>
                          </div>
                          {can('clients.edit') ? (
                            <Checkbox
                              checked={it.isCompleted}
                              onChange={(e) =>
                                completeInteraction.mutate({ interactionId: it.id, isCompleted: e.target.checked })
                              }
                              label="Completada"
                            />
                          ) : (
                            <Badge tone={it.isCompleted ? 'success' : 'warning'}>
                              {it.isCompleted ? 'Completada' : 'Pendiente'}
                            </Badge>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}

              {tab === 'expedientes' ? (
                <DataTable
                  columns={caseColumns}
                  rows={cases.data?.items ?? []}
                  rowKey={(row) => row.id}
                  loading={cases.isLoading}
                  error={cases.isError ? cases.error : undefined}
                  onRetry={() => void cases.refetch()}
                  empty={<EmptyState title="Este cliente no tiene expedientes" description="Conviértalo en expediente para iniciar el trabajo." />}
                />
              ) : null}

              {tab === 'documentos' ? (
                <DataTable<DocumentItem>
                  columns={[
                    { key: 'originalName', header: 'Archivo', render: (d) => <span className="text-ink">{d.originalName}</span> },
                    {
                      key: 'category',
                      header: 'Categoría',
                      render: (d) => (
                        <Badge tone={toneOf(documentCategoryMeta, d.category)}>
                          {labelOf(documentCategoryMeta, d.category)}
                        </Badge>
                      ),
                    },
                    { key: 'sizeBytes', header: 'Tamaño', render: (d) => <span className="text-xs text-muted">{formatBytes(d.sizeBytes)}</span> },
                    { key: 'version', header: 'Versión', render: (d) => <span className="text-xs">v{d.version}</span> },
                    {
                      key: 'clientVisible',
                      header: 'Visible al cliente',
                      render: (d) => <Badge tone={d.clientVisible ? 'success' : 'neutral'}>{d.clientVisible ? 'Sí' : 'No'}</Badge>,
                    },
                    { key: 'uploadedAt', header: 'Subido', render: (d) => <span className="text-xs text-muted">{formatDateTime(d.uploadedAt)}</span> },
                  ]}
                  rows={documents.data?.items ?? []}
                  rowKey={(d) => d.id}
                  loading={documents.isLoading}
                  empty={<EmptyState title="Sin documentos" description="Los documentos del cliente aparecerán aquí." icon={<FileStack className="h-4 w-4" />} />}
                />
              ) : null}

              {tab === 'pedidos' ? (
                <DataTable<Order>
                  columns={[
                    {
                      key: 'number',
                      header: 'Pedido',
                      render: (o) => (
                        <Link to={`/pedidos/${o.id}`} className="font-mono text-xs text-primary hover:underline">
                          {o.number}
                        </Link>
                      ),
                    },
                    {
                      key: 'status',
                      header: 'Estado',
                      render: (o) => <Badge tone={toneOf(orderStatusMeta, o.status)}>{labelOf(orderStatusMeta, o.status)}</Badge>,
                    },
                    { key: 'items', header: 'Ítems', render: (o) => <span className="tabular-nums">{o.items.length}</span> },
                    { key: 'total', header: 'Total', align: 'right', render: (o) => <span className="tabular-nums">{formatMoney(o.total)}</span> },
                    { key: 'createdAt', header: 'Fecha', render: (o) => <span className="text-xs text-muted">{formatDate(o.createdAt)}</span> },
                  ]}
                  rows={orders.data?.items ?? []}
                  rowKey={(o) => o.id}
                  loading={orders.isLoading}
                  empty={<EmptyState title="Sin pedidos" description="Este cliente aún no ha comprado servicios." />}
                />
              ) : null}

              {tab === 'mensajes' ? (
                <div>
                  <div className="mb-4 max-h-[320px] space-y-3 overflow-y-auto pr-1">
                    {(messages.data?.items ?? []).length === 0 ? (
                      <EmptyState title="Sin mensajes" description="Inicie la conversación con el cliente." />
                    ) : (
                      (messages.data?.items ?? []).map((m) => (
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
                          <p className="mt-1 text-[11px] text-muted">{formatRelative(m.createdAt)}</p>
                        </div>
                      ))
                    )}
                  </div>
                  {can('messages.send') ? (
                    <div className="flex gap-2 border-t border-line pt-4">
                      <TextInput
                        className="flex-1"
                        placeholder="Escriba un mensaje para el cliente…"
                        value={messageBody}
                        onChange={(e) => setMessageBody(e.target.value)}
                      />
                      <Button
                        variant="primary"
                        disabled={!messageBody.trim()}
                        loading={sendMessage.isPending}
                        onClick={() => sendMessage.mutate(messageBody.trim())}
                      >
                        Enviar
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {tab === 'timeline' ? (
                timeline.isLoading ? (
                  <Skeleton className="h-40 w-full" />
                ) : (timeline.data ?? []).length === 0 ? (
                  <EmptyState title="Sin actividad" description="Aquí verá todo lo ocurrido con este cliente." />
                ) : (
                  <ol className="relative space-y-4 border-l border-line pl-4">
                    {(timeline.data ?? []).map((entry) => (
                      <li key={entry.id} className="relative">
                        <span
                          className={
                            entry.kind === 'case'
                              ? 'absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary'
                              : 'absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-info'
                          }
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-ink">{entry.title}</p>
                          {entry.caseCode ? (
                            <span className="font-mono text-[11px] text-muted">{entry.caseCode}</span>
                          ) : null}
                          {entry.interactionType ? (
                            <Badge tone={toneOf(interactionTypeMeta, entry.interactionType)}>
                              {labelOf(interactionTypeMeta, entry.interactionType)}
                            </Badge>
                          ) : null}
                          <span className="text-[11px] text-muted">{formatDateTime(entry.createdAt)}</span>
                        </div>
                        {entry.description ? <p className="mt-0.5 text-xs text-muted">{entry.description}</p> : null}
                        <p className="mt-0.5 text-[11px] text-muted">por {entry.actorName}</p>
                      </li>
                    ))}
                  </ol>
                )
              ) : null}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Resumen">
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted">Expedientes abiertos</dt>
                <dd className="font-semibold text-ink">{c.openCases ?? 0}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted">Expedientes totales</dt>
                <dd className="font-semibold text-ink">{c.totalCases ?? 0}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted">Facturado acumulado</dt>
                <dd className="font-semibold text-ink">{formatMoney(c.totalBilled ?? 0)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted">Cuenta del app</dt>
                <dd>{c.userId ? <Badge tone="success">Vinculada</Badge> : <Badge tone="neutral">Sin cuenta</Badge>}</dd>
              </div>
            </dl>
          </Card>

          <Card title="Responsable asignado">
            {can('clients.assign') ? (
              <Select
                value={c.assignedToUserId ?? ''}
                onChange={(e) => assign.mutate(e.target.value)}
                placeholder="Sin asignar"
                options={(staff.data?.items ?? []).map((u: User) => ({ value: u.id, label: u.fullName }))}
              />
            ) : (
              <p className="text-sm text-ink">{staff.data?.items.find((u) => u.id === c.assignedToUserId)?.fullName ?? 'Sin asignar'}</p>
            )}
          </Card>

          <Card title="Acciones rápidas">
            <div className="flex flex-col gap-2">
              {can('cases.create') ? (
                <Button variant="secondary" icon={<Briefcase className="h-4 w-4" />} onClick={() => setShowConvert(true)}>
                  Convertir en expediente
                </Button>
              ) : null}
              {can('clients.edit') ? (
                <Button variant="secondary" icon={<Building2 className="h-4 w-4" />} onClick={() => setShowEdit(true)}>
                  Editar datos
                </Button>
              ) : null}
              {can('documents.create') ? (
                <Link to="/documentos">
                  <Button variant="secondary" icon={<FileStack className="h-4 w-4" />} className="w-full">
                    Subir documentos
                  </Button>
                </Link>
              ) : null}
              {can('clients.delete') ? (
                <Button
                  variant="danger"
                  icon={<Trash2 className="h-4 w-4" />}
                  onClick={() => {
                    if (window.confirm(`¿Eliminar el cliente ${c.legalName}? Se aplica soft-delete.`)) {
                      removeClient.mutate(undefined)
                    }
                  }}
                  loading={removeClient.isPending}
                >
                  Eliminar cliente
                </Button>
              ) : null}
            </div>
          </Card>
        </div>
      </div>

      <Modal open={showEdit} onClose={() => setShowEdit(false)} title={`Editar ${c.legalName}`} size="lg">
        <ClientForm
          client={c}
          submitting={update.isPending}
          onCancel={() => setShowEdit(false)}
          onSaved={(values) => update.mutate(values as unknown as Record<string, unknown>)}
        />
      </Modal>

      <Modal open={showInteraction} onClose={() => setShowInteraction(false)} title="Registrar gestión" size="md">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            const form = new FormData(e.currentTarget)
            addInteraction.mutate({
              type: String(form.get('type')) as ClientInteraction['type'],
              subject: String(form.get('subject')),
              notes: String(form.get('notes')),
              occurredAt: new Date(String(form.get('occurredAt'))).toISOString(),
              reminderAt: form.get('reminderAt') ? new Date(String(form.get('reminderAt'))).toISOString() : null,
              isCompleted: false,
            })
          }}
        >
          <Select
            label="Tipo de gestión"
            name="type"
            required
            options={interactionTypeList
              .filter((t) => t !== 'System')
              .map((t) => ({ value: t, label: labelOf(interactionTypeMeta, t) }))}
          />
          <TextInput label="Asunto" name="subject" required placeholder="Llamada de seguimiento" />
          <Textarea label="Notas" name="notes" placeholder="Detalle de lo conversado, acuerdos y próximos pasos…" />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label="Fecha de la gestión"
              name="occurredAt"
              type="datetime-local"
              defaultValue={new Date().toISOString().slice(0, 16)}
            />
            <TextInput label="Recordatorio (opcional)" name="reminderAt" type="datetime-local" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowInteraction(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={addInteraction.isPending}>
              Guardar gestión
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={showContact} onClose={() => setShowContact(false)} title="Agregar contacto" size="md">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            const form = new FormData(e.currentTarget)
            addContact.mutate({
              fullName: String(form.get('fullName')),
              position: String(form.get('position')),
              email: String(form.get('email')),
              phone: String(form.get('phone')),
              isPrimary: form.get('isPrimary') === 'on',
            })
          }}
        >
          <TextInput label="Nombre completo" name="fullName" required />
          <TextInput label="Puesto" name="position" placeholder="Representante legal" />
          <TextInput label="Correo" name="email" type="email" required />
          <TextInput label="Teléfono" name="phone" />
          <Checkbox name="isPrimary" label="Marcar como contacto principal" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowContact(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={addContact.isPending}>
              Agregar
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={showConvert}
        title="Convertir en expediente"
        message={`Se creará un expediente contable para ${c.legalName}, asignado al responsable actual, con tareas iniciales.`}
        confirmLabel="Crear expediente"
        loading={convertToCase.isPending}
        onCancel={() => setShowConvert(false)}
        onConfirm={() => convertToCase.mutate(undefined)}
      >
        {!can('cases.create') ? (
          <p className="text-xs text-danger">Su rol no permite crear expedientes.</p>
        ) : null}
      </ConfirmDialog>
    </>
  )
}
