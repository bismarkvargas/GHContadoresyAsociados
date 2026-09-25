import { FileStack } from 'lucide-react'
import { formatBytes } from '@/lib/format'
import { Badge, Button, Modal } from '@/components/ui'
import { documentCategoryMeta, labelOf, toneOf } from '@/lib/labels'
import type { DocumentItem } from '@/types'

/** Modal de previsualización de documento (PDF/imagen) con metadatos y versiones. */
export function DocumentPreviewModal({
  document,
  versions = [],
  onClose,
  onDelete,
  canDelete,
}: {
  document: DocumentItem | null
  versions?: DocumentItem[]
  onClose: () => void
  onDelete?: (document: DocumentItem) => void
  canDelete?: boolean
}) {
  const isImage = document?.contentType?.startsWith('image/')
  const isPdf = document?.contentType === 'application/pdf'

  return (
    <Modal
      open={!!document}
      onClose={onClose}
      title={document?.originalName ?? 'Documento'}
      size="lg"
      footer={
        <>
          {canDelete && document && onDelete ? (
            <Button variant="danger" onClick={() => onDelete(document)}>
              Eliminar
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </>
      }
    >
      {document ? (
        <div className="space-y-4">
          {isPdf || isImage ? (
            <div className="flex h-[400px] flex-col items-center justify-center rounded-card border border-line bg-surface-2 text-center">
              <FileStack className="h-10 w-10 text-muted" aria-hidden />
              <p className="mt-3 text-sm font-medium text-ink">
                {isPdf ? 'Vista previa de PDF' : 'Vista previa de imagen'}
              </p>
              <p className="mt-1 max-w-md text-xs text-muted">
                Con la API real el archivo se sirve mediante URL firmada HMAC de 15 minutos
                (<code>/public/files/&#123;token&#125;</code>) y se incrusta aquí usando el visor nativo del
                navegador. En modo mock no hay archivo físico, por eso se muestra este marcador.
              </p>
              <p className="mt-3 font-mono text-[11px] text-muted">{document.downloadUrl}</p>
            </div>
          ) : (
            <div className="flex h-[220px] flex-col items-center justify-center rounded-card border border-line bg-surface-2">
              <FileStack className="h-10 w-10 text-muted" aria-hidden />
              <p className="mt-3 text-sm text-muted">
                Sin previsualización para este tipo de archivo. Use la descarga.
              </p>
            </div>
          )}

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase text-muted">Categoría</dt>
              <dd className="mt-0.5">
                <Badge tone={toneOf(documentCategoryMeta, document.category)}>
                  {labelOf(documentCategoryMeta, document.category)}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted">Visibilidad</dt>
              <dd className="mt-0.5">
                <Badge tone={document.clientVisible ? 'success' : 'neutral'}>
                  {document.clientVisible ? 'Visible al cliente' : 'Interno'}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted">Tamaño</dt>
              <dd className="text-ink">{formatBytes(document.sizeBytes)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted">Tipo MIME</dt>
              <dd className="truncate text-ink">{document.contentType}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted">Expediente</dt>
              <dd className="text-ink">{document.caseCode ?? 'Sin expediente'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted">Cliente</dt>
              <dd className="text-ink">{document.clientName ?? '—'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase text-muted">SHA-256</dt>
              <dd className="truncate font-mono text-xs text-ink">{document.sha256}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase text-muted">Ruta de almacenamiento</dt>
              <dd className="truncate font-mono text-xs text-ink">{document.storagePath}</dd>
            </div>
          </dl>

          {versions.length > 1 ? (
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-muted">Historial de versiones</p>
              <ul className="divide-y divide-[var(--gh-border)] rounded-control border border-line">
                {versions.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="text-ink">
                      v{v.version} · {v.originalName}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-muted">
                      {v.isCurrent ? <Badge tone="success">Actual</Badge> : <Badge tone="neutral">Histórica</Badge>}
                      {formatBytes(v.sizeBytes)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  )
}
