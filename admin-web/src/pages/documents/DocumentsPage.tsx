import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CloudUpload, Download, FileStack, Trash2, UploadCloud } from 'lucide-react'
import { casesApi, clientsApi, documentsApi } from '@/api/endpoints'
import { useApiMutation, useDebounced, useListQuery, useTableState } from '@/hooks/useApi'
import { usePermission } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useUi'
import { downloadCsv, formatBytes, formatDateTime, formatNumber } from '@/lib/format'
import { documentCategoryList, documentCategoryMeta, labelOf, toneOf } from '@/lib/labels'
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
  type Column,
} from '@/components/ui'
import { PageHeader } from '@/components/layout/AppShell'
import { DocumentPreviewModal } from '@/components/documents/DocumentPreviewModal'
import type { DocumentItem } from '@/types'

const ALLOWED = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]
const MAX_SIZE = 25 * 1024 * 1024

export default function DocumentsPage() {
  const { can } = usePermission()
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [pending, setPending] = useState<File[]>([])
  const [showUpload, setShowUpload] = useState(false)
  const [uploadForm, setUploadForm] = useState({
    category: 'Expediente',
    caseFileId: '',
    clientId: '',
    clientVisible: true,
  })
  const [preview, setPreview] = useState<DocumentItem | null>(null)

  const table = useTableState({ pageSize: 20, sort: 'uploadedAt', order: 'desc' })
  const search = useDebounced(table.search, 350)
  const params = { ...table.params, search: search || undefined }

  const query = useListQuery(['documents'], documentsApi.list, params)

  const cases = useQuery({
    queryKey: ['cases', 'select'],
    queryFn: () => casesApi.list({ page: 1, pageSize: 200, sort: 'code', order: 'desc' }),
    staleTime: 120000,
  })
  const clients = useQuery({
    queryKey: ['clients', 'select'],
    queryFn: () => clientsApi.list({ page: 1, pageSize: 200, sort: 'legalName', order: 'asc' }),
    staleTime: 120000,
  })
  const versions = useQuery({
    queryKey: ['documents', preview?.id, 'versions'],
    queryFn: () => documentsApi.versions(preview!.id),
    enabled: !!preview,
  })

  const upload = useApiMutation(
    (files: File[]) =>
      documentsApi.upload(
        files.map((file) => ({
          file,
          category: uploadForm.category,
          caseFileId: uploadForm.caseFileId || null,
          clientId: uploadForm.clientId || null,
          clientVisible: uploadForm.clientVisible,
        })),
      ),
    {
      successMessage: 'Documentos subidos correctamente',
      invalidate: [['documents'], ['dashboard']],
      onSuccess: () => {
        setPending([])
        setShowUpload(false)
      },
    },
  )

  const remove = useApiMutation((id: string) => documentsApi.remove(id), {
    successMessage: 'Documento eliminado',
    invalidate: [['documents']],
    onSuccess: () => setPreview(null),
  })

  function acceptFiles(files: FileList | File[]): void {
    const list = Array.from(files)
    const valid: File[] = []
    for (const file of list) {
      if (!ALLOWED.includes(file.type)) {
        toast.warning(`Formato no permitido: ${file.name}`, 'Solo PDF, imágenes y documentos de Office.')
        continue
      }
      if (file.size > MAX_SIZE) {
        toast.warning(`Archivo demasiado grande: ${file.name}`, 'El máximo es 25 MB por archivo.')
        continue
      }
      valid.push(file)
    }
    if (valid.length) {
      setPending((current) => [...current, ...valid])
      setShowUpload(true)
    }
  }

  const columns: Column<DocumentItem>[] = [
    {
      key: 'originalName',
      header: 'Archivo',
      sortable: true,
      render: (d) => (
        <div className="min-w-0">
          <button
            type="button"
            className="block max-w-full truncate text-left font-medium text-ink hover:text-primary"
            onClick={() => setPreview(d)}
          >
            {d.originalName}
          </button>
          <span className="block truncate text-xs text-muted">
            {d.fileName} · v{d.version}
          </span>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Categoría',
      sortable: true,
      render: (d) => (
        <Badge tone={toneOf(documentCategoryMeta, d.category)}>{labelOf(documentCategoryMeta, d.category)}</Badge>
      ),
    },
    {
      key: 'caseCode',
      header: 'Expediente',
      render: (d) => <span className="font-mono text-xs text-muted">{d.caseCode ?? '—'}</span>,
    },
    {
      key: 'clientName',
      header: 'Cliente',
      render: (d) => <span className="truncate text-xs text-ink-700">{d.clientName ?? '—'}</span>,
    },
    {
      key: 'sizeBytes',
      header: 'Tamaño',
      sortable: true,
      align: 'right',
      render: (d) => <span className="text-xs tabular-nums text-muted">{formatBytes(d.sizeBytes)}</span>,
    },
    {
      key: 'clientVisible',
      header: 'Visibilidad',
      align: 'center',
      render: (d) => (
        <Badge tone={d.clientVisible ? 'success' : 'neutral'}>{d.clientVisible ? 'Cliente' : 'Interno'}</Badge>
      ),
    },
    {
      key: 'uploadedByName',
      header: 'Subido por',
      render: (d) => <span className="truncate text-xs text-muted">{d.uploadedByName}</span>,
    },
    {
      key: 'uploadedAt',
      header: 'Fecha',
      sortable: true,
      render: (d) => <span className="text-xs text-muted">{formatDateTime(d.uploadedAt)}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (d) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant="ghost"
            icon={<Download className="h-3.5 w-3.5" />}
            title="Descargar"
            onClick={() => toast.info('Descarga iniciada', `Se solicitaría la URL firmada de ${d.originalName}.`)}
          />
          {can('documents.delete') ? (
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 className="h-3.5 w-3.5" />}
              title="Eliminar"
              onClick={() => remove.mutate(d.id)}
            />
          ) : null}
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Documentos"
        subtitle="Subida múltiple con drag & drop · PDF, imagen y Office · máximo 25 MB por archivo"
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Download className="h-4 w-4" />}
              onClick={() =>
                downloadCsv(
                  `documentos-gh-${new Date().toISOString().slice(0, 10)}.csv`,
                  (query.data?.items ?? []).map((d) => ({
                    Archivo: d.originalName,
                    Categoria: d.category,
                    Expediente: d.caseCode ?? '',
                    Cliente: d.clientName ?? '',
                    Bytes: d.sizeBytes,
                    Version: d.version,
                    VisibleCliente: d.clientVisible ? 'Si' : 'No',
                    SubidoPor: d.uploadedByName ?? '',
                    Fecha: d.uploadedAt,
                  })),
                )
              }
              disabled={!query.data?.items.length}
            >
              Exportar CSV
            </Button>
            {can('documents.create') ? (
              <Button variant="primary" icon={<UploadCloud className="h-4 w-4" />} onClick={() => inputRef.current?.click()}>
                Subir documentos
              </Button>
            ) : null}
          </>
        }
      />

      {can('documents.create') ? (
        <div
          className={`mb-5 rounded-card border-2 border-dashed p-6 text-center transition-colors ${
            dragging ? 'border-primary bg-primary-50/60' : 'border-line bg-card'
          }`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            if (e.dataTransfer.files?.length) acceptFiles(e.dataTransfer.files)
          }}
        >
          <CloudUpload className={`mx-auto h-8 w-8 ${dragging ? 'text-primary' : 'text-muted'}`} aria-hidden />
          <p className="mt-2 text-sm font-medium text-ink">
            Arrastre los archivos aquí o{' '}
            <button type="button" className="gh-link" onClick={() => inputRef.current?.click()}>
              selecciónelos
            </button>
          </p>
          <p className="mt-1 text-xs text-muted">
            Formatos permitidos: PDF, PNG, JPG, DOC, DOCX, XLS, XLSX, PPTX · hasta 25 MB por archivo.
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.pptx"
            onChange={(e) => {
              if (e.target.files?.length) acceptFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
      ) : null}

      <Card padded={false}>
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-4">
          <SearchInput
            value={table.search}
            onChange={table.setSearch}
            placeholder="Buscar por nombre de archivo, expediente o cliente"
            className="lg:col-span-2"
          />
          <Select
            value={table.filters.category ?? ''}
            onChange={(e) => table.setFilter('category', e.target.value)}
            placeholder="Todas las categorías"
            options={documentCategoryList.map((c) => ({ value: c, label: labelOf(documentCategoryMeta, c) }))}
          />
          <Select
            value={table.filters.caseFileId ?? ''}
            onChange={(e) => table.setFilter('caseFileId', e.target.value)}
            placeholder="Todos los expedientes"
            options={(cases.data?.items ?? []).map((c) => ({ value: c.id, label: `${c.code} · ${c.title}` }))}
          />
          <Select
            value={table.filters.clientId ?? ''}
            onChange={(e) => table.setFilter('clientId', e.target.value)}
            placeholder="Todos los clientes"
            options={(clients.data?.items ?? []).map((c) => ({ value: c.id, label: c.legalName }))}
          />
          <Select
            value={table.filters.clientVisible ?? ''}
            onChange={(e) => table.setFilter('clientVisible', e.target.value)}
            placeholder="Toda visibilidad"
            options={[
              { value: 'true', label: 'Visible al cliente' },
              { value: 'false', label: 'Solo interno' },
            ]}
          />
          <div className="flex items-end">
            <Button variant="ghost" onClick={table.resetFilters} className="w-full">
              Limpiar filtros
            </Button>
          </div>
        </div>

        <DataTable
          columns={columns}
          rows={query.data?.items ?? []}
          rowKey={(d) => d.id}
          loading={query.isLoading}
          error={query.isError ? query.error : undefined}
          onRetry={() => void query.refetch()}
          sort={table.sort}
          order={table.order}
          onSort={table.setSort}
          empty={
            <EmptyState
              icon={<FileStack className="h-4 w-4" />}
              title="Sin documentos"
              description="Arrastre archivos a la zona de subida para comenzar el expediente digital."
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

      <p className="mt-3 text-xs text-muted">
        {formatNumber(query.data?.total ?? 0)} documentos · almacenamiento en{' '}
        <code>api/storage/documents/&#123;yyyy&#125;/&#123;MM&#125;/</code> servido por URL firmada HMAC de 15 minutos.
      </p>

      <Modal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        title={`Subir ${pending.length} archivo(s)`}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowUpload(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              loading={upload.isPending}
              disabled={!pending.length}
              onClick={() => upload.mutate(pending)}
            >
              Subir {pending.length} archivo(s)
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <ul className="max-h-40 space-y-1.5 overflow-y-auto rounded-control border border-line p-3">
            {pending.map((file, i) => (
              <li key={`${file.name}-${i}`} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-ink">{file.name}</span>
                <span className="shrink-0 text-xs text-muted">{formatBytes(file.size)}</span>
              </li>
            ))}
          </ul>

          <Select
            label="Categoría"
            value={uploadForm.category}
            onChange={(e) => setUploadForm((f) => ({ ...f, category: e.target.value }))}
            options={documentCategoryList.map((c) => ({ value: c, label: labelOf(documentCategoryMeta, c) }))}
          />
          <Select
            label="Vincular a expediente (opcional)"
            placeholder="Sin expediente"
            value={uploadForm.caseFileId}
            onChange={(e) => {
              const caseId = e.target.value
              const found = cases.data?.items.find((c) => c.id === caseId)
              setUploadForm((f) => ({
                ...f,
                caseFileId: caseId,
                clientId: found?.clientId ?? f.clientId,
              }))
            }}
            options={(cases.data?.items ?? []).map((c) => ({ value: c.id, label: `${c.code} · ${c.title}` }))}
          />
          <Select
            label="Cliente (opcional)"
            placeholder="Sin cliente"
            value={uploadForm.clientId}
            onChange={(e) => setUploadForm((f) => ({ ...f, clientId: e.target.value }))}
            options={(clients.data?.items ?? []).map((c) => ({ value: c.id, label: c.legalName }))}
          />
          <Checkbox
            label="Visible para el cliente en el app"
            checked={uploadForm.clientVisible}
            onChange={(e) => setUploadForm((f) => ({ ...f, clientVisible: e.target.checked }))}
          />
          <p className="rounded-control border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
            Si ya existe un documento con el mismo nombre en el mismo expediente, se crea automáticamente una
            nueva versión y la anterior queda como histórica.
          </p>
        </div>
      </Modal>

      <DocumentPreviewModal
        document={preview}
        versions={versions.data ?? []}
        onClose={() => setPreview(null)}
        onDelete={(d) => remove.mutate(d.id)}
        canDelete={can('documents.delete')}
      />
    </>
  )
}
