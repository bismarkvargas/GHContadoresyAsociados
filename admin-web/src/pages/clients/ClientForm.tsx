import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { usersApi } from '@/api/endpoints'
import { useApiMutation } from '@/hooks/useApi'
import { usePermission } from '@/hooks/useAuth'
import { provinces } from '@/lib/labels'
import { Button, Card, Checkbox, Select, TextInput, Textarea } from '@/components/ui'
import type { Client } from '@/types'

const schema = z.object({
  clientType: z.enum(['Individual', 'Company', 'ForeignInvestor']),
  legalName: z.string().min(3, 'Nombre o razón social obligatorio'),
  tradeName: z.string().optional(),
  idNumber: z.string().min(5, 'Cédula / NIT / pasaporte obligatorio'),
  email: z.string().email('Correo no válido'),
  phone: z.string().min(8, 'Teléfono obligatorio'),
  whatsapp: z.string().optional(),
  address: z.string().optional(),
  province: z.string().optional(),
  canton: z.string().optional(),
  district: z.string().optional(),
  status: z.enum(['Lead', 'Active', 'Inactive', 'Blocked']),
  source: z.enum(['app', 'web', 'whatsapp', 'referral', 'walkin', 'campaign']),
  assignedToUserId: z.string().optional(),
  tagsCsv: z.string().optional(),
  notes: z.string().optional(),
  createCase: z.boolean().optional(),
})

export type ClientFormValues = z.infer<typeof schema>

const defaults: ClientFormValues = {
  clientType: 'Company',
  legalName: '',
  tradeName: '',
  idNumber: '',
  email: '',
  phone: '',
  whatsapp: '',
  address: '',
  province: 'Guanacaste',
  canton: 'Santa Cruz',
  district: 'Huacas',
  status: 'Lead',
  source: 'web',
  assignedToUserId: '',
  tagsCsv: '',
  notes: '',
  createCase: false,
}

export function ClientForm({
  client,
  onSaved,
  onCancel,
  submitting,
}: {
  client?: Client
  onSaved: (values: ClientFormValues) => void
  onCancel: () => void
  submitting?: boolean
}) {
  const { can } = usePermission()
  const staff = useQuery({
    queryKey: ['users', 'staff-options'],
    queryFn: () => usersApi.list({ page: 1, pageSize: 100, isStaff: true, status: 'Active' }),
    staleTime: 120000,
  })

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ClientFormValues>({
    resolver: zodResolver(schema),
    defaultValues: client
      ? {
          clientType: client.clientType,
          legalName: client.legalName,
          tradeName: client.tradeName ?? '',
          idNumber: client.idNumber,
          email: client.email,
          phone: client.phone,
          whatsapp: client.whatsapp ?? '',
          address: client.address ?? '',
          province: client.province ?? 'Guanacaste',
          canton: client.canton ?? '',
          district: client.district ?? '',
          status: client.status,
          source: client.source,
          assignedToUserId: client.assignedToUserId ?? '',
          tagsCsv: client.tagsCsv ?? '',
          notes: client.notes ?? '',
          createCase: false,
        }
      : defaults,
  })

  const isCompany = watch('clientType') === 'Company'
  const isNew = !client

  return (
    <form className="space-y-5" onSubmit={handleSubmit((values) => onSaved(values))} noValidate>
      <Card title="Identificación" subtitle="Datos fiscales y de contacto principales">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Tipo de cliente"
            required
            options={[
              { value: 'Company', label: 'Persona jurídica' },
              { value: 'Individual', label: 'Persona física' },
              { value: 'ForeignInvestor', label: 'Inversionista extranjero' },
            ]}
            error={errors.clientType?.message}
            {...register('clientType')}
          />
          <TextInput
            label={isCompany ? 'Razón social' : 'Nombre completo'}
            required
            placeholder={isCompany ? 'Inversiones Bahía Salinas S.A.' : 'Marco Vinicio Alfaro Chacón'}
            error={errors.legalName?.message}
            {...register('legalName')}
          />
          <TextInput
            label="Nombre comercial"
            placeholder="Bahía Salinas"
            error={errors.tradeName?.message}
            {...register('tradeName')}
          />
          <TextInput
            label={isCompany ? 'Cédula jurídica' : 'Cédula / pasaporte'}
            required
            placeholder={isCompany ? '3-101-400137' : '1-1234-567'}
            error={errors.idNumber?.message}
            {...register('idNumber')}
          />
          <TextInput
            label="Correo electrónico"
            required
            type="email"
            placeholder="contacto@empresa.cr"
            error={errors.email?.message}
            {...register('email')}
          />
          <TextInput
            label="Teléfono"
            required
            placeholder="+506 2653 6634"
            error={errors.phone?.message}
            {...register('phone')}
          />
          <TextInput label="WhatsApp" placeholder="+506 8846 9454" {...register('whatsapp')} />
          <TextInput label="Etiquetas (separadas por coma)" placeholder="vip,hotelería" {...register('tagsCsv')} />
        </div>
      </Card>

      <Card title="Ubicación">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TextInput label="Dirección" className="lg:col-span-2" placeholder="300 m norte de la iglesia" {...register('address')} />
          <Select
            label="Provincia"
            options={provinces.map((p) => ({ value: p, label: p }))}
            placeholder="—"
            {...register('province')}
          />
          <TextInput label="Cantón" placeholder="Santa Cruz" {...register('canton')} />
          <TextInput label="Distrito" placeholder="Huacas" {...register('district')} />
          <TextInput label="País" value="Costa Rica (CR)" disabled />
        </div>
      </Card>

      <Card title="Gestión comercial" subtitle="Estado, origen y responsable asignado">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Select
            label="Estado"
            options={[
              { value: 'Lead', label: 'Prospecto' },
              { value: 'Active', label: 'Activo' },
              { value: 'Inactive', label: 'Inactivo' },
              { value: 'Blocked', label: 'Bloqueado' },
            ]}
            {...register('status')}
          />
          <Select
            label="Origen"
            options={[
              { value: 'web', label: 'Sitio web' },
              { value: 'app', label: 'App móvil' },
              { value: 'whatsapp', label: 'WhatsApp' },
              { value: 'referral', label: 'Referido' },
              { value: 'walkin', label: 'Presencial' },
              { value: 'campaign', label: 'Campaña' },
            ]}
            {...register('source')}
          />
          <Select
            label="Responsable"
            placeholder="Sin asignar"
            disabled={!can('clients.assign')}
            hint={can('clients.assign') ? undefined : 'Su rol no permite asignar responsables.'}
            options={(staff.data?.items ?? []).map((u) => ({ value: u.id, label: u.fullName }))}
            {...register('assignedToUserId')}
          />
        </div>
        <Textarea label="Notas internas" className="mt-4" placeholder="Acuerdos, contexto comercial, observaciones…" {...register('notes')} />

        {isNew ? (
          <div className="mt-4">
            <Checkbox label="Crear también un expediente inicial" {...register('createCase')} />
          </div>
        ) : null}
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" icon={<Save className="h-4 w-4" />} loading={submitting}>
          {client ? 'Guardar cambios' : 'Crear cliente'}
        </Button>
      </div>
    </form>
  )
}

export { defaults as clientFormDefaults }
