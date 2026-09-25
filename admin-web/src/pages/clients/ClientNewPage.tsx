import { useNavigate } from 'react-router-dom'
import { clientsApi, casesApi } from '@/api/endpoints'
import { useApiMutation } from '@/hooks/useApi'
import { useToast } from '@/hooks/useUi'
import { pickId } from '@/lib/format'
import { PageHeader } from '@/components/layout/AppShell'
import { ClientForm, type ClientFormValues } from './ClientForm'
import type { Client } from '@/types'

export default function ClientNewPage() {
  const navigate = useNavigate()
  const toast = useToast()

  const create = useApiMutation<{ cliente: Client | null; id: string | null }, ClientFormValues>(
    async (values) => {
      const respuesta = await clientsApi.create(values as Partial<Client>)
      // El identificador se extrae de forma tolerante: la respuesta puede venir
      // envuelta o con otra capitalización según la versión de la API.
      const id = pickId(respuesta)
      const cliente = id ? ({ ...(respuesta as Client), id } as Client) : null
      if (id && values.createCase) {
        await casesApi.create({
          clientId: id,
          title: 'Expediente inicial de asesoría',
          matter: 'Contable',
          entity: 'Otro',
          priority: 'Normal',
          clientVisible: true,
        })
      }
      return { cliente, id }
    },
    {
      successMessage: 'Cliente creado correctamente',
      invalidate: [['clients'], ['dashboard']],
      onSuccess: ({ id }) => {
        if (id) {
          navigate(`/clientes/${id}`)
          return
        }
        // Sin identificador válido nunca se navega a una ficha inexistente.
        toast.warning(
          'Cliente creado',
          'La API no devolvió el identificador; se muestra el listado actualizado.',
        )
        navigate('/clientes')
      },
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
        onSaved={(values) => create.mutate(values)}
      />
    </>
  )
}
