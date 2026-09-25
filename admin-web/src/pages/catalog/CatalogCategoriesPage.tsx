import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Package, Pencil, Plus, Tags, Trash2 } from 'lucide-react'
import { catalogApi } from '@/api/endpoints'
import { useApiMutation } from '@/hooks/useApi'
import { usePermission } from '@/hooks/useAuth'
import { formatNumber, slugify } from '@/lib/format'
import { Badge, Button, Card, Checkbox, Modal, Skeleton, TextInput, Textarea } from '@/components/ui'
import { PageHeader } from '@/components/layout/AppShell'
import type { ProductCategory } from '@/types'

const emptyForm = {
  id: '',
  slug: '',
  name: '',
  description: '',
  iconName: 'package',
  sortOrder: '1',
  isActive: true,
}

export default function CatalogCategoriesPage() {
  const { can } = usePermission()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const query = useQuery({
    queryKey: ['catalog', 'categories'],
    queryFn: () => catalogApi.categories(),
  })

  const save = useApiMutation(
    (values: typeof emptyForm) =>
      values.id
        ? catalogApi.updateCategory(values.id, {
            slug: values.slug || slugify(values.name),
            name: values.name,
            description: values.description,
            iconName: values.iconName,
            sortOrder: Number(values.sortOrder),
            isActive: values.isActive,
          })
        : catalogApi.createCategory({
            slug: values.slug || slugify(values.name),
            name: values.name,
            description: values.description,
            iconName: values.iconName,
            sortOrder: Number(values.sortOrder),
            isActive: values.isActive,
          }),
    {
      successMessage: 'Categoría guardada',
      invalidate: [['catalog']],
      onSuccess: () => setShowForm(false),
    },
  )

  const remove = useApiMutation((id: string) => catalogApi.removeCategory(id), {
    successMessage: 'Categoría eliminada',
    invalidate: [['catalog']],
  })

  return (
    <>
      <PageHeader
        title="Categorías del catálogo"
        subtitle="4 categorías primarias normalizadas a partir del sitio original (raíz + 4 subcategorías)"
        backTo="/catalogo"
        actions={
          can('catalog.create') ? (
            <Button
              variant="primary"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => {
                setForm({ ...emptyForm, sortOrder: String((query.data?.length ?? 0) + 1) })
                setShowForm(true)
              }}
            >
              Nueva categoría
            </Button>
          ) : null
        }
      />

      {query.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="gh-card-pad space-y-3">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-16 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {(query.data ?? []).map((c: ProductCategory) => (
            <Card key={c.id} className="flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-control bg-primary-50 text-primary">
                    <Tags className="h-4 w-4" aria-hidden />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-ink">{c.name}</h3>
                    <p className="font-mono text-[11px] text-muted">{c.slug}</p>
                  </div>
                </div>
                <Badge tone={c.isActive ? 'success' : 'neutral'}>{c.isActive ? 'Activa' : 'Inactiva'}</Badge>
              </div>
              <p className="mt-3 line-clamp-3 flex-1 text-xs text-muted">{c.description}</p>
              <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                <Link to={`/catalogo?categoryId=${c.id}`} className="gh-link text-xs">
                  <span className="inline-flex items-center gap-1">
                    <Package className="h-3.5 w-3.5" aria-hidden />
                    {formatNumber(c.productCount ?? 0)} servicios
                  </span>
                </Link>
                <div className="flex gap-1">
                  {can('catalog.edit') ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Pencil className="h-3.5 w-3.5" />}
                      title="Editar"
                      onClick={() => {
                        setForm({
                          id: c.id,
                          slug: c.slug,
                          name: c.name,
                          description: c.description,
                          iconName: c.iconName,
                          sortOrder: String(c.sortOrder),
                          isActive: c.isActive,
                        })
                        setShowForm(true)
                      }}
                    />
                  ) : null}
                  {can('catalog.delete') ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 className="h-3.5 w-3.5" />}
                      title="Eliminar"
                      onClick={() => {
                        if (window.confirm(`¿Eliminar la categoría "${c.name}"?`)) remove.mutate(c.id)
                      }}
                    />
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={form.id ? `Editar: ${form.name}` : 'Nueva categoría'}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button variant="primary" loading={save.isPending} onClick={() => save.mutate(form)}>
              Guardar categoría
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <TextInput
            label="Nombre"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value, slug: slugify(e.target.value) }))}
            required
          />
          <TextInput
            label="Slug"
            value={form.slug}
            onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
            hint="Se usa en la URL del sitio: /servicios/{slug}"
          />
          <Textarea
            label="Descripción"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Contabilidad mensual, anual y trimestral, estados financieros…"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label="Icono (nombre lucide)"
              value={form.iconName}
              onChange={(e) => setForm((f) => ({ ...f, iconName: e.target.value }))}
              placeholder="calculator · scale · building · receipt"
            />
            <TextInput
              label="Orden"
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
            />
          </div>
          <Checkbox
            label="Categoría activa"
            checked={form.isActive}
            onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
          />
        </div>
      </Modal>
    </>
  )
}
