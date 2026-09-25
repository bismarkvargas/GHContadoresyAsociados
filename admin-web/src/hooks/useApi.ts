import { useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiErrorMessage } from '@/api/client'
import { useToast } from './useUi'
import type { ListParams, Paginated } from '@/types'

/** Debounce simple para buscadores. */
export function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export interface TableState {
  page: number
  pageSize: number
  sort?: string
  order: 'asc' | 'desc'
  search: string
  filters: Record<string, string>
  setPage: (page: number) => void
  setPageSize: (size: number) => void
  setSort: (field: string) => void
  setSearch: (value: string) => void
  setFilter: (key: string, value: string) => void
  resetFilters: () => void
  params: ListParams
}

/** Estado de tabla (paginación + orden + filtros + búsqueda) reutilizable. */
export function useTableState(
  initial: { pageSize?: number; sort?: string; order?: 'asc' | 'desc'; filters?: Record<string, string> } = {},
): TableState {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSizeState] = useState(initial.pageSize ?? 20)
  const [sort, setSortField] = useState<string | undefined>(initial.sort)
  const [order, setOrder] = useState<'asc' | 'desc'>(initial.order ?? 'desc')
  const [search, setSearchState] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>(initial.filters ?? {})

  const params = useMemo<ListParams>(
    () => ({
      page,
      pageSize,
      sort,
      order,
      search: search || undefined,
      ...filters,
    }),
    [page, pageSize, sort, order, search, filters],
  )

  return {
    page,
    pageSize,
    sort,
    order,
    search,
    filters,
    setPage,
    setPageSize: (size: number) => {
      setPageSizeState(size)
      setPage(1)
    },
    setSort: (field: string) => {
      if (sort === field) setOrder((o) => (o === 'asc' ? 'desc' : 'asc'))
      else {
        setSortField(field)
        setOrder('asc')
      }
      setPage(1)
    },
    setSearch: (value: string) => {
      setSearchState(value)
      setPage(1)
    },
    setFilter: (key: string, value: string) => {
      setFilters((f) => {
        const next = { ...f }
        if (!value) delete next[key]
        else next[key] = value
        return next
      })
      setPage(1)
    },
    resetFilters: () => {
      setFilters({})
      setSearchState('')
      setPage(1)
    },
    params,
  }
}

/**
 * Listado paginado con TanStack Query.
 * `TPage` permite tipar respuestas enriquecidas (p. ej. con contadores extra).
 */
export function useListQuery<T, TPage extends Paginated<T> = Paginated<T>>(
  key: unknown[],
  fetcher: (params: ListParams) => Promise<TPage>,
  params: ListParams,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: [...key, params],
    queryFn: () => fetcher(params),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  })
}

/** Detalle por id. */
export function useDetailQuery<T>(
  key: unknown[],
  fetcher: () => Promise<T>,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: key,
    queryFn: fetcher,
    enabled: options.enabled ?? true,
  })
}

interface MutationToast<TData, TVariables> {
  successMessage?: string
  errorMessage?: string
  invalidate?: unknown[][]
  onDone?: () => void
  onSuccess?: (data: TData, variables: TVariables) => void
  onError?: (error: unknown) => void
}

/** Mutación con toast e invalidación de caché automáticos. */
export function useApiMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options: MutationToast<TData, TVariables> = {},
) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const { successMessage, errorMessage, invalidate = [], onDone, onSuccess, onError } = options

  return useMutation<TData, unknown, TVariables>({
    mutationFn,
    onSuccess: (data, variables) => {
      for (const key of invalidate) void queryClient.invalidateQueries({ queryKey: key })
      if (successMessage) toast.success(successMessage)
      onSuccess?.(data, variables)
      onDone?.()
    },
    onError: (error) => {
      toast.error(errorMessage ?? 'No se pudo completar la operación', apiErrorMessage(error))
      onError?.(error)
    },
  })
}
