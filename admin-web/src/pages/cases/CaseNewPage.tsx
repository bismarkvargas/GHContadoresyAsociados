import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { casesApi, clientsApi, usersApi } from '@/api/endpoints'
import { useApiMutation } from '@/hooks/useApi'
import { caseEntityList, caseMatterList, priorityList, caseMatterMeta, priorityMeta, labelOf } from '@/lib/labels'
import { Button, Card, Checkbox, Select, TextInput, Textarea } from '@/components/ui'
import { PageHeader } from '@/components/layout/AppShell'
import type { CaseFile } from '@/types'

const schema = z.object({
  clientId: z.string().min(1, 'Seleccione el cliente'),
  title: z.string().min(5, 'El título es obligatorio'),
  description: z.string().optional(),
  matter: z.enum(['Contable', 'Tributario', 'Legal', 'Municipal', 'Laboral', 'Otro']),
  entity: z.enum([
    'SUGEF',
    'ACAM',
    'ATV',
    'CCSS',
    'INS',
    'MEIC',
    'MAG',
    'ICT',
    'Municipalidad',
    'RTBF',
    'Otro',
  ]),
  referenceNumber: z.string().optional(),
  priority: z.enum(['Low', 'Normal', 'High', 'Urgent']),
  responsibleUserId: z.string().optional(),
  dueAt: z.string().optional(),
  agreedAmount: z.coerce.number().min(0).optional(),
  clientVisible: z.boolean().optional(),
})

type FormValues = z.infer<typeof schema>

export default function CaseNewPage() {
  const navigate = useNavigate()

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

  const create = useApiMutation<CaseFile, FormValues>(
    (values) =>
      casesApi.create({
        ...values,
        dueAt: values.dueAt ? new Date(values.dueAt).toISOString() : null,
        clientVisible: values.clientVisible ?? true,
      } as Partial<CaseFile>),
    {
      successMessage: 'Expediente creado con tareas iniciales',
      invalidate: [['cases'], ['dashboard']],
      onSuccess: (created) => navigate(`/expedientes/${created.id}`),
    },
  )

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      matter: 'Contable',
      entity: 'ATV',
      priority: 'Normal',
      clientVisible: true,
    },
  })

  return (
    <>
      <PageHeader
        title="Nuevo expediente"
        subtitle="El código se genera automáticamente con el correlativo anual GH-EXP-AAAA-0000"
        backTo="/expedientes"
      />

      <form className="space-y-5" onSubmit={handleSubmit((values) => create.mutate(values))} noValidate>
        <Card title="Cliente y objeto del expediente">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Cliente"
              required
              placeholder="Seleccione un cliente"
              options={(clients.data?.items ?? []).map((c) => ({
                value: c.id,
                label: `${c.code} · ${c.legalName}`,
              }))}
              error={errors.clientId?.message}
              {...register('clientId')}
            />
            <TextInput
              label="Título del expediente"
              required
              placeholder="Declaración D-103 mensual de IVA"
              error={errors.title?.message}
              {...register('title')}
            />
            <Select
              label="Materia"
              options={caseMatterList.map((m) => ({ value: m, label: labelOf(caseMatterMeta, m) }))}
              error={errors.matter?.message}
              {...register('matter')}
            />
            <Select
              label="Ente regulador"
              options={caseEntityList.map((e) => ({ value: e, label: e }))}
              error={errors.entity?.message}
              {...register('entity')}
            />
            <TextInput
              label="Número de referencia del ente"
              placeholder="REF-123456"
              hint="Opcional: número de trámite o expediente del ente."
              {...register('referenceNumber')}
            />
          </div>
          <Textarea
            label="Descripción / alcance"
            className="mt-4"
            placeholder="Detalle del trámite, documentos requeridos y observaciones…"
            {...register('description')}
          />
        </Card>

        <Card title="Gestión y seguimiento">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Select
              label="Prioridad"
              options={priorityList.map((p) => ({ value: p, label: labelOf(priorityMeta, p) }))}
              {...register('priority')}
            />
            <Select
              label="Responsable"
              placeholder="Sin asignar"
              options={(staff.data?.items ?? []).map((u) => ({ value: u.id, label: u.fullName }))}
              {...register('responsibleUserId')}
            />
            <TextInput label="Fecha de vencimiento" type="date" {...register('dueAt')} />
            <TextInput
              label="Monto pactado (USD)"
              type="number"
              step="0.01"
              placeholder="169.50"
              error={errors.agreedAmount?.message}
              {...register('agreedAmount')}
            />
          </div>
          <div className="mt-4">
            <Checkbox label="Visible para el cliente en el app" defaultChecked {...register('clientVisible')} />
          </div>
        </Card>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => navigate('/expedientes')}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" icon={<Save className="h-4 w-4" />} loading={create.isPending}>
            Crear expediente
          </Button>
        </div>
      </form>
    </>
  )
}
