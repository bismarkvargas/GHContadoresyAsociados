import { useNavigate } from 'react-router-dom'
import { clientsApi, casesApi } from '@/api/endpoints'
import { useApiMutation } from '@/hooks/useApi'
import { PageHeader } from '@/components/layout/AppShell'
import { ClientForm, type ClientFormValues } from './ClientForm'
import type { Client } from '@/types'

export default function ClientNewPage() {
  const navigate = useNavigate()

  const create = useApiMutation<Client, ClientFormValues>(
    async (values) => {
      const client = await clientsApi.create(values as Partial<Client>)
      if (values.createCase) {
        await casesApi.create({
          clientId: client.id,
          title: 'Expediente inicial de asesoría',
          matter: 'Contable',
          entity: 'Otro',
          priority: 'Normal',
          clientVisible: true,
        })
      }
      return client
    },
    {
      successMessage: 'Cliente creado correctamente',
      invalidate: [['clients'], ['dashboard']],
      onSuccess: (client) => navigate(`/clientes/${client.id}`),
    },
  )

  return (
    <>
      <PageHeader
        title="Nuevo cliente"
        subtitle="Alta en el CRM de la firma · código correlativo GH-CLI-00000"
        backTo="/clientes"
      />
      <ClientForm
        submitting={create.isPending}
        onCancel={() => navigate('/clientes')}
        onSaved={(values) => create.mutate(values as ClientFormValues)}
      />
    </>
  )
}
