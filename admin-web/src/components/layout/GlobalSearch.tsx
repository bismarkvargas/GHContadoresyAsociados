import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Briefcase, CornerDownLeft, FileStack, Search, Users } from 'lucide-react'
import { casesApi, clientsApi, documentsApi } from '@/api/endpoints'
import { useDebounced } from '@/hooks/useApi'
import { formatMoney } from '@/lib/format'
import { Modal, Badge } from '@/components/ui'
import { cx } from '@/lib/format'

interface Hit {
  id: string
  title: string
  subtitle: string
  to: string
  group: 'Clientes' | 'Expedientes' | 'Documentos'
  icon: typeof Users
}

const groupIcon = {
  Clientes: Users,
  Expedientes: Briefcase,
  Documentos: FileStack,
} as const

/** Buscador global: abre con Ctrl/⌘+K y consulta clientes, expedientes y documentos. */
export function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const debounced = useDebounced(term, 300)
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const enabled = open && debounced.trim().length >= 2

  const clients = useQuery({
    queryKey: ['search', 'clients', debounced],
    queryFn: () => clientsApi.list({ page: 1, pageSize: 5, search: debounced }),
    enabled,
  })
  const cases = useQuery({
    queryKey: ['search', 'cases', debounced],
    queryFn: () => casesApi.list({ page: 1, pageSize: 5, search: debounced }),
    enabled,
  })
  const documents = useQuery({
    queryKey: ['search', 'documents', debounced],
    queryFn: () => documentsApi.list({ page: 1, pageSize: 5, search: debounced }),
    enabled,
  })

  const hits = useMemo<Hit[]>(() => {
    const out: Hit[] = []
    for (const c of clients.data?.items ?? []) {
      out.push({
        id: `client-${c.id}`,
        title: c.legalName,
        subtitle: `${c.code} · ${c.email} · ${formatMoney(c.totalBilled ?? 0)}`,
        to: `/clientes/${c.id}`,
        group: 'Clientes',
        icon: groupIcon.Clientes,
      })
    }
    for (const c of cases.data?.items ?? []) {
      out.push({
        id: `case-${c.id}`,
        title: `${c.code} · ${c.title}`,
        subtitle: `${c.clientName ?? ''} · ${c.matter}`,
        to: `/expedientes/${c.id}`,
        group: 'Expedientes',
        icon: groupIcon.Expedientes,
      })
    }
    for (const d of documents.data?.items ?? []) {
      out.push({
        id: `doc-${d.id}`,
        title: d.originalName,
        subtitle: `${d.caseCode ?? 'Sin expediente'} · ${d.category}`,
        to: '/documentos',
        group: 'Documentos',
        icon: groupIcon.Documentos,
      })
    }
    return out
  }, [clients.data, cases.data, documents.data])

  const loading = clients.isFetching || cases.isFetching || documents.isFetching

  function go(to: string): void {
    setOpen(false)
    setTerm('')
    navigate(to)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-control border border-line bg-surface-2 px-3 text-left text-sm text-muted transition-colors hover:border-primary/40 hover:bg-card sm:max-w-[420px]"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden />
        <span className="truncate">Buscar clientes, expedientes, documentos…</span>
        <kbd className="ml-auto hidden rounded border border-line bg-card px-1.5 py-0.5 text-[10px] text-muted sm:block">
          Ctrl K
        </kbd>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={
          <span className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted" aria-hidden />
            Búsqueda global
          </span>
        }
        size="lg"
      >
        <input
          autoFocus
          className="gh-input"
          placeholder="Escriba al menos 2 caracteres…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        <div className="mt-3 min-h-[180px]">
          {!enabled ? (
            <p className="px-1 py-8 text-center text-sm text-muted">
              Busque por nombre, cédula, correo, código de expediente o nombre de documento.
            </p>
          ) : loading && !hits.length ? (
            <div className="space-y-2 py-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="gh-skeleton h-12 rounded-control" />
              ))}
            </div>
          ) : hits.length === 0 ? (
            <p className="px-1 py-8 text-center text-sm text-muted">
              Sin resultados para <strong className="text-ink">{debounced}</strong>.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--gh-border)]">
              {hits.map((hit) => (
                <li key={hit.id}>
                  <button
                    type="button"
                    onClick={() => go(hit.to)}
                    className={cx(
                      'flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left transition-colors hover:bg-surface-2',
                    )}
                  >
                    <hit.icon className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{hit.title}</span>
                      <span className="block truncate text-xs text-muted">{hit.subtitle}</span>
                    </span>
                    <Badge tone="neutral">{hit.group}</Badge>
                    <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>
    </>
  )
}
