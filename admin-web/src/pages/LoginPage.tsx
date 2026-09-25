import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AlertCircle, Building2, Eye, EyeOff, Lock, Mail, MapPin, Phone } from 'lucide-react'
import { company } from '@/lib/constants'
import { useAuth } from '@/hooks/useAuth'
import { apiErrorStatus } from '@/api/client'
import { Button, Checkbox, TextInput } from '@/components/ui'

const schema = z.object({
  email: z.string().min(1, 'El correo es obligatorio').email('Correo no válido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
  remember: z.boolean().default(true),
})

type FormValues = z.infer<typeof schema>

const demoAccounts = [
  {
    email: 'admin@ghcontadores.net',
    password: 'Gh.Admin2026',
    label: 'SuperAdmin',
    detail: 'Todos los permisos',
  },
  {
    email: 'gerencia@ghcontadores.net',
    password: 'Gh.Gerencia2026',
    label: 'Administración',
    detail: 'Operación completa del despacho',
  },
  {
    email: 'abogado@ghcontadores.net',
    password: 'Gh.Abogado2026',
    label: 'Abogado',
    detail: 'Sin usuarios, roles ni ajustes',
  },
  {
    email: 'contador@ghcontadores.net',
    password: 'Gh.Contador2026',
    label: 'Contador',
    detail: 'Expedientes y documentos',
  },
  {
    email: 'asistente@ghcontadores.net',
    password: 'Gh.Asistente2026',
    label: 'Asistente',
    detail: 'Clientes, documentos y pedidos',
  },
]

export default function LoginPage() {
  const { signIn, isAuthenticated, isBootstrapping } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [serverError, setServerError] = useState<{ message: string; status?: number } | null>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', remember: true },
  })

  if (!isBootstrapping && isAuthenticated) return <Navigate to={from} replace />

  async function onSubmit(values: FormValues): Promise<void> {
    setServerError(null)
    try {
      await signIn(values.email, values.password, values.remember)
      navigate(from, { replace: true })
    } catch (error) {
      const status = apiErrorStatus(error)
      setServerError({
        message:
          status === 401
            ? 'Credenciales inválidas. Revise el correo y la contraseña.'
            : status === 403
              ? 'Su cuenta no tiene acceso a la consola de administración (pendiente o suspendida).'
              : (error as Error).message,
        status,
      })
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Panel de marca */}
      <div className="relative hidden flex-col justify-between bg-[var(--gh-sidebar)] p-10 text-white lg:flex">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-control bg-primary text-base font-bold">
              GH
            </span>
            <div>
              <p className="text-base font-semibold leading-tight">{company.legalName}</p>
              <p className="text-xs text-white/55">Firma contable y bufete legal · Costa Rica</p>
            </div>
          </div>
          <h1 className="mt-14 max-w-md text-2xl font-semibold leading-snug">{company.tagline}</h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-white/70">
            Contabilidad mensual, trámites legales, municipales y tributarios con expediente digital,
            seguimiento en línea y avisos automáticos de vencimiento.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-white/80">
            {[
              'CRM de clientes con expediente digital',
              'Tareas, timeline y mensajería por caso',
              'Pedidos que generan expediente y asignación',
              'Informes de ventas, productividad y vencimientos',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2 text-xs text-white/55">
          <p className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            {company.address}
          </p>
          <p className="flex items-center gap-2">
            <Phone className="h-3.5 w-3.5" aria-hidden />
            {company.phones.join(' · ')}
          </p>
          <p className="flex items-center gap-2">
            <Mail className="h-3.5 w-3.5" aria-hidden />
            {company.emailManagement} · {company.emailOrders}
          </p>
          <p className="flex items-center gap-2">
            <Building2 className="h-3.5 w-3.5" aria-hidden />
            Moneda base USD (CRC con tipo de cambio configurable)
          </p>
        </div>
      </div>

      {/* Formulario */}
      <div className="flex flex-col justify-center bg-page px-6 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-control bg-primary text-sm font-bold text-white">
              GH
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">{company.legalName}</p>
              <p className="text-xs text-muted">Panel de administración</p>
            </div>
          </div>

          <h2 className="text-xl font-semibold text-ink">Iniciar sesión</h2>
          <p className="mt-1 text-sm text-muted">
            Acceso restringido al personal de la firma. Los clientes entran desde la app móvil.
          </p>

          {serverError ? (
            <div
              className="mt-5 flex items-start gap-2.5 rounded-control border border-danger/30 bg-danger/10 px-3.5 py-3 text-sm text-danger"
              role="alert"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div>
                <p>{serverError.message}</p>
                {serverError.status === 403 ? (
                  <p className="mt-1 text-xs text-danger/80">
                    Contacte al administrador del sistema para reactivar su acceso.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            <TextInput
              label="Correo corporativo"
              type="email"
              autoComplete="username"
              placeholder="usuario@ghcontadores.net"
              leading={<Mail className="h-4 w-4" />}
              error={errors.email?.message}
              {...register('email')}
            />

            <TextInput
              label="Contraseña"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              leading={<Lock className="h-4 w-4" />}
              trailing={
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="rounded p-1 text-muted hover:text-ink"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
              error={errors.password?.message}
              {...register('password')}
            />

            <div className="flex items-center justify-between">
              <Checkbox label="Recordar sesión en este equipo" {...register('remember')} />
              <Link to="/login" className="text-xs text-muted hover:text-ink">
                ¿Olvidó su contraseña?
              </Link>
            </div>

            <Button type="submit" variant="primary" className="w-full" loading={isSubmitting}>
              Entrar al panel
            </Button>
          </form>

          <div className="mt-8 rounded-card border border-line bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Cuentas de demostración
            </p>
            <div className="mt-3 space-y-2">
              {demoAccounts.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => {
                    setValue('email', acc.email, { shouldValidate: true, shouldDirty: true })
                    setValue('password', acc.password, { shouldValidate: true, shouldDirty: true })
                    setServerError(null)
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-control border border-line px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-surface-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-ink">{acc.email}</span>
                    <span className="block text-[11px] text-muted">{acc.detail}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary">
                    {acc.label}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted">
              Son las mismas credenciales sembradas por la API en producción, así que el modo demo y el
              modo real se comportan igual. SuperAdmin ve todo el menú; Abogado no ve Usuarios, Roles,
              Ajustes ni Auditoría.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
