import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, Package, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import { catalogApi } from '@/api/endpoints'
import { useApiMutation, useDebounced, useListQuery, useTableState } from '@/hooks/useApi'
import { usePermission } from '@/hooks/useAuth'
import { downloadCsv, formatMoney, formatNumber, slugify } from '@/lib/format'
import { deliveryModeList, deliveryModeMeta, labelOf, toneOf } from '@/lib/labels'
import {
  Badge,
  Button,
  Card,
  Checkbox,
  DataTable,
  EmptyState,
  Modal,
  Pagination,
  SearchInput,
  Select,
  TextInput,
  Textarea,
  type Column,
} from '@/components/ui'
import { PageHeader } from '@/components/layout/AppShell'
import type { Product, ProductCategory } from '@/types'

const emptyForm = {
  id: '',
  sku: '',
  slug: '',
  name: '',
  shortDescription: '',
  description: '',
  price: '0',
  categoryId: '',
  imageUrl: '',
  deliveryMode: 'Digital',
  estimatedDays: '',
  isActive: true,
  isFeatured: false,
  requiresCase: true,
}

export default function CatalogPage() {
  const { can } = usePermission()
  const table = useTableState({ pageSize: 20, sort: 'sortOrder', order: 'asc', filters: { categoryId: '' } })
  const search = useDebounced(table.search, 350)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const params = useMemo(() => ({ ...table.params, search: search || undefined }), [table.params, search])
  const query = useListQuery(['catalog', 'products'], catalogApi.products, params)

  const categories = useQuery({
    queryKey: ['catalog', 'categories'],
    queryFn: () => catalogApi.categories(),
    staleTime: 120000,
  })

  const save = useApiMutation(
    (values: typeof emptyForm) =>
      values.id
        ? catalogApi.updateProduct(values.id, {
            sku: values.sku,
            slug: values.slug || slugify(values.name),
            name: values.name,
            shortDescription: values.shortDescription,
            description: values.description,
            price: Number(values.price),
            categoryId: values.categoryId,
            imageUrl: values.imageUrl || null,
            deliveryMode: values.deliveryMode as Product['deliveryMode'],
            estimatedDays: values.estimatedDays ? Number(values.estimatedDays) : null,
            isActive: values.isActive,
            isFeatured: values.isFeatured,
            requiresCase: values.requiresCase,
          })
        : catalogApi.createProduct({
            sku: values.sku,
            slug: values.slug || slugify(values.name),
            name: values.name,
            shortDescription: values.shortDescription,
            description: values.description,
            price: Number(values.price),
            categoryId: values.categoryId,
            imageUrl: values.imageUrl || null,
            deliveryMode: values.deliveryMode as Product['deliveryMode'],
            estimatedDays: values.estimatedDays ? Number(values.estimatedDays) : null,
            isActive: values.isActive,
            isFeatured: values.isFeatured,
            requiresCase: values.requiresCase,
          }),
    {
      successMessage: 'Servicio guardado',
      invalidate: [['catalog']],
      onSuccess: () => setShowForm(false),
    },
  )

  const remove = useApiMutation((id: string) => catalogApi.removeProduct(id), {
    successMessage: 'Servicio desactivado y eliminado',
    invalidate: [['catalog']],
  })

  const toggleFeatured = useApiMutation(
    (vars: { product: Product }) =>
      catalogApi.updateProduct(vars.product.id, { isFeatured: !vars.product.isFeatured }),
    { invalidate: [['catalog']] },
  )

  const toggleActive = useApiMutation(
    (vars: { product: Product }) =>
      catalogApi.updateProduct(vars.product.id, { isActive: !vars.product.isActive }),
    { invalidate: [['catalog']] },
  )

  const columns: Column<Product>[] = [
    {
      key: 'imageUrl',
      header: '',
      render: (p) =>
        p.imageUrl ? (
          <img
            src={p.imageUrl}
            alt=""
            loading="lazy"
            className="h-10 w-10 rounded-control border border-line object-cover"
          />
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded-control bg-surface text-muted">
            <Package className="h-4 w-4" aria-hidden />
          </span>
        ),
    },
    {
      key: 'name',
      header: 'Servicio',
      sortable: true,
      render: (p) => (
        <div className="min-w-0">
          <button
            type="button"
            className="flex items-center gap-1.5 text-left font-medium text-ink hover:text-primary"
            onClick={() => {
              setForm({
                id: p.id,
                sku: p.sku,
                slug: p.slug,
                name: p.name,
                shortDescription: p.shortDescription,
                description: p.description,
                price: String(p.price),
                categoryId: p.categoryId,
                imageUrl: p.imageUrl ?? '',
                deliveryMode: p.deliveryMode,
                estimatedDays: p.estimatedDays ? String(p.estimatedDays) : '',
                isActive: p.isActive,
                isFeatured: p.isFeatured,
                requiresCase: p.requiresCase,
              })
              setShowForm(true)
            }}
          >
            {p.isFeatured ? <Star className="h-3.5 w-3.5 fill-[var(--gh-warning)] text-[var(--gh-warning)]" /> : null}
            <span className="truncate">{p.name}</span>
          </button>
          <span className="block truncate font-mono text-[11px] text-muted">{p.sku}</span>
        </div>
      ),
    },
    {
      key: 'categoryName',
      header: 'Categoría',
      sortable: true,
      render: (p) => <span className="text-xs text-ink-700">{p.categoryName}</span>,
    },
    {
      key: 'price',
      header: 'Precio',
      sortable: true,
      align: 'right',
      render: (p) => <span className="tabular-nums font-medium text-ink">{formatMoney(p.price, p.currency)}</span>,
    },
    {
      key: 'deliveryMode',
      header: 'Entrega',
      render: (p) => (
        <Badge tone={toneOf(deliveryModeMeta, p.deliveryMode)}>{labelOf(deliveryModeMeta, p.deliveryMode)}</Badge>
      ),
    },
    {
      key: 'estimatedDays',
      header: 'Días',
      align: 'center',
      render: (p) => <span className="text-xs tabular-nums text-muted">{p.estimatedDays ?? '—'}</span>,
    },
    {
      key: 'requiresCase',
      header: 'Expediente',
      align: 'center',
      render: (p) => (
        <Badge tone={p.requiresCase ? 'primary' : 'neutral'}>{p.requiresCase ? 'Sí' : 'No'}</Badge>
      ),
    },
    {
      key: 'isActive',
      header: 'Activo',
      align: 'center',
      render: (p) => (
        <button
          type="button"
          onClick={() => (can('catalog.edit') ? toggleActive.mutate({ product: p }) : undefined)}
          disabled={!can('catalog.edit')}
          className="disabled:cursor-not-allowed"
          title={can('catalog.edit') ? 'Cambiar disponibilidad' : 'Sin permiso'}
        >
          <Badge tone={p.isActive ? 'success' : 'neutral'}>{p.isActive ? 'Activo' : 'Inactivo'}</Badge>
        </button>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (p) => (
        <div className="flex justify-end gap-1">
          {can('catalog.edit') ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                title="Destacar"
                icon={<Star className={`h-3.5 w-3.5 ${p.isFeatured ? 'fill-current text-warning' : ''}`} />}
                onClick={() => toggleFeatured.mutate({ product: p })}
              />
              <Button
                size="sm"
                variant="ghost"
                title="Editar"
                icon={<Pencil className="h-3.5 w-3.5" />}
                onClick={() => {
                  setForm({
                    id: p.id,
                    sku: p.sku,
                    slug: p.slug,
                    name: p.name,
                    shortDescription: p.shortDescription,
                    description: p.description,
                    price: String(p.price),
                    categoryId: p.categoryId,
                    imageUrl: p.imageUrl ?? '',
                    deliveryMode: p.deliveryMode,
                    estimatedDays: p.estimatedDays ? String(p.estimatedDays) : '',
                    isActive: p.isActive,
                    isFeatured: p.isFeatured,
                    requiresCase: p.requiresCase,
                  })
                  setShowForm(true)
                }}
              />
            </>
          ) : null}
          {can('catalog.delete') ? (
            <Button
              size="sm"
              variant="ghost"
              title="Eliminar"
              icon={<Trash2 className="h-3.5 w-3.5" />}
              onClick={() => {
                if (window.confirm(`¿Eliminar el servicio "${p.name}"?`)) remove.mutate(p.id)
              }}
            />
          ) : null}
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Catálogo de servicios"
        subtitle={`${formatNumber(query.data?.total ?? 0)} servicios reales importados del sitio del cliente · precios en USD`}
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Download className="h-4 w-4" />}
              disabled={!query.data?.items.length}
              onClick={() =>
                downloadCsv(
                  `catalogo-gh-${new Date().toISOString().slice(0, 10)}.csv`,
                  (query.data?.items ?? []).map((p) => ({
                    SKU: p.sku,
                    Slug: p.slug,
                    Nombre: p.name,
                    Categoria: p.categoryName ?? '',
                    PrecioUSD: p.price,
                    Entrega: p.deliveryMode,
                    Dias: p.estimatedDays ?? '',
                    RequiereExpediente: p.requiresCase ? 'Si' : 'No',
                    Activo: p.isActive ? 'Si' : 'No',
                    Destacado: p.isFeatured ? 'Si' : 'No',
                    Origen: p.sourceUrl ?? '',
                  })),
                )
              }
            >
              Exportar CSV
            </Button>
            {can('catalog.create') ? (
              <Button
                variant="primary"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => {
                  setForm({ ...emptyForm, categoryId: categories.data?.[0]?.id ?? '' })
                  setShowForm(true)
                }}
              >
                Nuevo servicio
              </Button>
            ) : null}
          </>
        }
      />

      <Card padded={false}>
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-5">
          <SearchInput
            value={table.search}
            onChange={table.setSearch}
            placeholder="Buscar por nombre, SKU o descripción"
            className="lg:col-span-2"
          />
          <Select
            value={table.filters.categoryId ?? ''}
            onChange={(e) => table.setFilter('categoryId', e.target.value)}
            placeholder="Todas las categorías"
            options={(categories.data ?? []).map((c: ProductCategory) => ({
              value: c.id,
              label: `${c.name} (${c.productCount ?? 0})`,
            }))}
          />
          <Select
            value={table.filters.isActive ?? ''}
            onChange={(e) => table.setFilter('isActive', e.target.value)}
            placeholder="Activos e inactivos"
            options={[
              { value: 'true', label: 'Solo activos' },
              { value: 'false', label: 'Solo inactivos' },
            ]}
          />
          <Select
            value={table.filters.isFeatured ?? ''}
            onChange={(e) => table.setFilter('isFeatured', e.target.value)}
            placeholder="Destacados y normales"
            options={[
              { value: 'true', label: 'Solo destacados' },
              { value: 'false', label: 'No destacados' },
            ]}
          />
        </div>

        <DataTable
          columns={columns}
          rows={query.data?.items ?? []}
          rowKey={(p) => p.id}
          loading={query.isLoading}
          error={query.isError ? query.error : undefined}
          onRetry={() => void query.refetch()}
          sort={table.sort}
          order={table.order}
          onSort={table.setSort}
          empty={
            <EmptyState
              icon={<Package className="h-4 w-4" />}
              title="Sin servicios"
              description="El catálogo se carga la primera vez desde public/catalog.seed.json (62 servicios reales)."
            />
          }
        />

        {query.data && query.data.total > 0 ? (
          <Pagination
            page={query.data.page}
            pageSize={query.data.pageSize}
            total={query.data.total}
            totalPages={query.data.totalPages}
            onPage={table.setPage}
            onPageSize={table.setPageSize}
          />
        ) : null}
      </Card>

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={form.id ? `Editar: ${form.name}` : 'Nuevo servicio'}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button variant="primary" loading={save.isPending} onClick={() => save.mutate(form)}>
              Guardar servicio
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label="Nombre del servicio"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value, slug: slugify(e.target.value) }))}
              required
            />
            <TextInput label="SKU" value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} />
            <TextInput
              label="Slug (URL)"
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              hint="ASCII sin acentos, se usa en /servicios/{slug} del sitio."
            />
            <Select
              label="Categoría"
              value={form.categoryId}
              onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
              options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            />
            <TextInput
              label="Precio (USD)"
              type="number"
              step="0.01"
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
            />
            <Select
              label="Modalidad de entrega"
              value={form.deliveryMode}
              onChange={(e) => setForm((f) => ({ ...f, deliveryMode: e.target.value }))}
              options={deliveryModeList.map((d) => ({ value: d, label: labelOf(deliveryModeMeta, d) }))}
            />
            <TextInput
              label="Días estimados"
              type="number"
              value={form.estimatedDays}
              onChange={(e) => setForm((f) => ({ ...f, estimatedDays: e.target.value }))}
            />
            <TextInput
              label="URL de imagen"
              value={form.imageUrl}
              onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
              placeholder="https://static.wixstatic.com/media/..."
            />
          </div>

          <TextInput
            label="Descripción corta"
            value={form.shortDescription}
            onChange={(e) => setForm((f) => ({ ...f, shortDescription: e.target.value }))}
            placeholder="Aparece en el listado del catálogo del sitio."
          />
          <Textarea
            label="Descripción completa"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="min-h-[140px]"
            placeholder="Gestión integral del trámite: revisión documental, presentación y seguimiento…"
          />

          <div className="flex flex-wrap gap-5">
            <Checkbox
              label="Activo"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            <Checkbox
              label="Destacado en portada"
              checked={form.isFeatured}
              onChange={(e) => setForm((f) => ({ ...f, isFeatured: e.target.checked }))}
            />
            <Checkbox
              label="Requiere expediente al comprar"
              checked={form.requiresCase}
              onChange={(e) => setForm((f) => ({ ...f, requiresCase: e.target.checked }))}
            />
          </div>

          {form.imageUrl ? (
            <div className="rounded-card border border-line p-3">
              <p className="mb-2 text-xs uppercase tracking-wide text-muted">Vista previa de imagen</p>
              <img src={form.imageUrl} alt="" className="h-32 w-32 rounded-control border border-line object-cover" />
            </div>
          ) : null}
        </div>
      </Modal>
    </>
  )
}
