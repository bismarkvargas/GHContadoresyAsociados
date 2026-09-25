import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, RefreshCw, Search, X } from 'lucide-react'
import { cx } from '@/lib/format'
import { toneClasses, type Tone } from '@/lib/labels'

/* ------------------------------------------------------------------ */
/* Botón                                                               */
/* ------------------------------------------------------------------ */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  loading?: boolean
  icon?: ReactNode
}

const variantClass: Record<ButtonVariant, string> = {
  primary: 'gh-btn-primary',
  secondary: 'gh-btn-secondary',
  ghost: 'gh-btn-ghost',
  danger: 'gh-btn-danger',
  success: 'gh-btn-success',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={cx(variantClass[variant], size === 'sm' && 'gh-btn-sm', className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Campos de formulario                                                */
/* ------------------------------------------------------------------ */

interface FieldProps {
  label?: string
  hint?: string
  error?: string
  required?: boolean
  children: ReactNode
  className?: string
  /** id del control para asociar el <label>. */
  htmlFor?: string
}

export function Field({ label, hint, error, required, children, className, htmlFor }: FieldProps) {
  return (
    <div className={className}>
      {label ? (
        <label className="gh-label" htmlFor={htmlFor}>
          {label}
          {required ? <span className="ml-0.5 text-danger">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="mt-1 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
  leading?: ReactNode
  trailing?: ReactNode
}

/**
 * IMPORTANTE: se usa `forwardRef` porque react-hook-form registra los campos con
 * `{...register(name)}`, que incluye un `ref`. Sin reenviarlo, RHF nunca enlaza el
 * input, el valor queda `undefined` y la validación falla con «Required».
 */
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { label, hint, error, leading, trailing, className, id: idProp, ...rest },
  ref,
) {
  const autoId = useId()
  const id = idProp ?? autoId
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <div className="relative">
        {leading ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
            {leading}
          </span>
        ) : null}
        <input
          id={id}
          ref={ref}
          className={cx('gh-input', leading ? 'pl-9' : '', trailing ? 'pr-9' : '', className)}
          {...rest}
        />
        {trailing ? (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted">{trailing}</span>
        ) : null}
      </div>
    </Field>
  )
})

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  hint?: string
  error?: string
  options: { value: string; label: string }[]
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, options, placeholder, className, id: idProp, ...rest },
  ref,
) {
  const autoId = useId()
  const id = idProp ?? autoId
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <select id={id} ref={ref} className={cx('gh-select', className)} {...rest}>
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  )
})

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?: string
  error?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className, id: idProp, ...rest },
  ref,
) {
  const autoId = useId()
  const id = idProp ?? autoId
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <textarea id={id} ref={ref} className={cx('gh-input min-h-[84px]', className)} {...rest} />
    </Field>
  )
})

export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label?: string }>(
  function Checkbox({ label, className, id: idProp, ...rest }, ref) {
    const autoId = useId()
    const id = idProp ?? autoId
    return (
      <label
        htmlFor={id}
        className={cx('inline-flex cursor-pointer items-center gap-2 text-sm text-ink', className)}
      >
        <input id={id} ref={ref} type="checkbox" className="gh-checkbox" {...rest} />
        {label}
      </label>
    )
  },
)

/* ------------------------------------------------------------------ */
/* Superficies y etiquetas                                             */
/* ------------------------------------------------------------------ */

export function Card({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
  padded = true,
}: {
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  padded?: boolean
}) {
  return (
    <section className={cx('gh-card', className)}>
      {title || actions ? (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-ink">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-xs text-muted">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cx(padded && 'p-5', bodyClassName)}>{children}</div>
    </section>
  )
}

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone
  children: ReactNode
  className?: string
}) {
  return <span className={cx('gh-chip', toneClasses[tone], className)}>{children}</span>
}

export function StatusDot({ tone = 'neutral' }: { tone?: Tone }) {
  const color: Record<Tone, string> = {
    neutral: 'bg-muted',
    primary: 'bg-primary',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    info: 'bg-info',
  }
  return <span className={cx('inline-block h-2 w-2 rounded-full', color[tone])} aria-hidden />
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
  return (
    <span
      className={cx(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary',
        className,
      )}
      aria-hidden
    >
      {letters || '?'}
    </span>
  )
}

export function ProgressBar({ value, tone = 'primary' }: { value: number; tone?: Tone }) {
  const safe = Math.max(0, Math.min(100, value))
  const color: Record<Tone, string> = {
    neutral: 'bg-muted',
    primary: 'bg-primary',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    info: 'bg-info',
  }
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
        <div className={cx('h-full rounded-full transition-all', color[tone])} style={{ width: `${safe}%` }} />
      </div>
      <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted">{safe}%</span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Estados: carga, vacío y error                                       */
/* ------------------------------------------------------------------ */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('gh-skeleton rounded-control', className)} />
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} className={cx('h-6 flex-1', c === 0 && 'max-w-[220px]')} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function CardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="gh-card-pad space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string
  description?: string
  action?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-card bg-surface text-muted">
        <svg viewBox="0 0 64 64" className="h-10 w-10" aria-hidden>
          <circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 5" />
          <path d="M20 40c3-6 8-9 12-9s9 3 12 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="32" cy="24" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        {icon ? <span className="absolute -bottom-1 -right-1 text-primary">{icon}</span> : null}
      </div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description ? <p className="mt-1 max-w-md text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function ErrorState({
  message,
  onRetry,
  title = 'No pudimos cargar la información',
}: {
  message?: string
  onRetry?: () => void
  title?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-card bg-danger/10 text-danger">
        <AlertTriangle className="h-6 w-6" aria-hidden />
      </div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {message ? <p className="mt-1 max-w-md text-sm text-muted">{message}</p> : null}
      {onRetry ? (
        <Button className="mt-4" variant="secondary" icon={<RefreshCw className="h-4 w-4" />} onClick={onRetry}>
          Reintentar
        </Button>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Tabla con orden y paginación                                        */
/* ------------------------------------------------------------------ */

export interface Column<T> {
  key: string
  header: ReactNode
  render: (row: T) => ReactNode
  sortable?: boolean
  className?: string
  align?: 'left' | 'right' | 'center'
}

interface TableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  loading?: boolean
  error?: unknown
  onRetry?: () => void
  onRowClick?: (row: T) => void
  empty?: ReactNode
  sort?: string
  order?: 'asc' | 'desc'
  onSort?: (field: string) => void
  footer?: ReactNode
  dense?: boolean
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRetry,
  onRowClick,
  empty,
  sort,
  order,
  onSort,
  footer,
  dense,
}: TableProps<T>) {
  if (loading) return <TableSkeleton cols={Math.min(columns.length, 6)} />
  if (error) return <ErrorState message={(error as Error)?.message} onRetry={onRetry} />
  if (!rows.length) return <>{empty ?? <EmptyState title="Sin resultados" description="Ajuste los filtros o la búsqueda." />}</>

  return (
    <div className="overflow-x-auto">
      <table className="gh-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={cx(
                  'gh-th',
                  c.align === 'right' && 'text-right',
                  c.align === 'center' && 'text-center',
                  c.sortable && onSort && 'cursor-pointer select-none hover:text-ink',
                )}
                onClick={c.sortable && onSort ? () => onSort(c.key) : undefined}
              >
                <span className="inline-flex items-center gap-1">
                  {c.header}
                  {c.sortable && sort === c.key ? (
                    <span className="text-primary">{order === 'asc' ? '▲' : '▼'}</span>
                  ) : null}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={cx('gh-tr-hover', onRowClick && 'cursor-pointer')}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cx(
                    'gh-td',
                    dense && 'py-2',
                    c.align === 'right' && 'text-right',
                    c.align === 'center' && 'text-center',
                    c.className,
                  )}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer ? <tfoot className="bg-surface-2 font-medium">{footer}</tfoot> : null}
      </table>
    </div>
  )
}

export function Pagination({
  page,
  pageSize,
  total,
  totalPages,
  onPage,
  onPageSize,
}: {
  page: number
  pageSize: number
  total: number
  totalPages: number
  onPage: (page: number) => void
  onPageSize?: (size: number) => void
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-xs text-muted">
      <span>
        Mostrando <strong className="text-ink">{from}</strong>–<strong className="text-ink">{to}</strong> de{' '}
        <strong className="text-ink">{total}</strong>
      </span>
      <div className="flex items-center gap-2">
        {onPageSize ? (
          <select
            className="gh-select py-1 text-xs"
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            aria-label="Filas por página"
          >
            {[10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n} / página
              </option>
            ))}
          </select>
        ) : null}
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="secondary"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            aria-label="Página anterior"
            icon={<ChevronLeft className="h-3.5 w-3.5" />}
          />
          <span className="px-2 tabular-nums">
            {page} / {Math.max(1, totalPages)}
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={page >= totalPages}
            onClick={() => onPage(page + 1)}
            aria-label="Página siguiente"
            icon={<ChevronRight className="h-3.5 w-3.5" />}
          />
        </div>
      </div>
    </div>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Buscar…',
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={cx('relative', className)}>
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        className="gh-input pl-9"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-label={placeholder}
      />
      {value ? (
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:bg-surface hover:text-ink"
          onClick={() => onChange('')}
          aria-label="Limpiar búsqueda"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Pestañas y modal                                                    */
/* ------------------------------------------------------------------ */

interface TabsContextValue {
  value: string
  setValue: (value: string) => void
}
const TabsContext = createContext<TabsContextValue | null>(null)

export function Tabs({
  value,
  onChange,
  children,
}: {
  value: string
  onChange: (value: string) => void
  children: ReactNode
}) {
  return (
    <TabsContext.Provider value={{ value, setValue: onChange }}>
      <div className="border-b border-line">
        <div className="gh-scroll-hidden flex gap-1 overflow-x-auto">{children}</div>
      </div>
    </TabsContext.Provider>
  )
}

export function Tab({ value, children }: { value: string; children: ReactNode }) {
  const ctx = useContext(TabsContext)
  const active = ctx?.value === value
  return (
    <button
      type="button"
      onClick={() => ctx?.setValue(value)}
      className={cx(
        '-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors',
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-muted hover:border-line hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  if (!open) return null

  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[var(--gh-overlay)] p-4 pt-10"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={ref}
        className={cx('animate-fade-in w-full rounded-card border border-line bg-card shadow-pop', widths[size])}
      >
        <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-3.5">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-control p-1.5 text-muted transition-colors hover:bg-surface hover:text-ink"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</footer>
        ) : null}
      </div>
    </div>
  )
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  variant = 'primary',
  loading,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean
  title: string
  message?: string
  confirmLabel?: string
  variant?: ButtonVariant
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
  children?: ReactNode
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant={variant} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {message ? <p className="text-sm text-ink-700">{message}</p> : null}
      {children ? <div className="mt-3">{children}</div> : null}
    </Modal>
  )
}
