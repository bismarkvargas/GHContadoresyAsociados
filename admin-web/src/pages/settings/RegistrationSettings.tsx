import { Check, Info, ShieldCheck, UserPlus } from 'lucide-react'
import { REGISTRATION_MESSAGE_KEY, REGISTRATION_MODE_KEY, registrationModes } from '@/lib/constants'
import { Badge, Button, Card, Textarea } from '@/components/ui'
import { cx } from '@/lib/format'

/**
 * Sección «Registro de clientes» de Ajustes.
 *
 * Controla el ajuste `registration.mode` (automatic | approval) que decide si el
 * registro desde el app crea la cuenta activa al instante o la deja pendiente de
 * aprobación en la bandeja de Solicitudes de cuenta.
 */
export function RegistrationSettings({
  modo,
  mensaje,
  original,
  puedeEditar,
  guardando,
  onCambiarModo,
  onCambiarMensaje,
  onGuardarMensaje,
}: {
  modo: string
  mensaje: string
  original: string
  puedeEditar: boolean
  guardando: boolean
  onCambiarModo: (modo: string) => void
  onCambiarMensaje: (texto: string) => void
  onGuardarMensaje: () => void
}) {
  const activo = registrationModes.find((m) => m.value === modo) ?? registrationModes[1]
  const automatico = activo.value === 'automatic'

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card
        className="lg:col-span-2"
        title="Registro de clientes"
        subtitle="Decide si sus clientes se registran solos desde el app o con visto bueno de la firma"
        actions={<Badge tone={automatico ? 'accent' : 'primary'}>{activo.label}</Badge>}
      >
        <div className="space-y-4">
          {/* Switch de modo */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-line bg-surface-2 p-4">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                {automatico ? (
                  <UserPlus className="h-4 w-4 text-accent-600" aria-hidden />
                ) : (
                  <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
                )}
                {activo.label}
              </p>
              <p className="mt-1 max-w-lg text-xs text-muted">{activo.description}</p>
            </div>

            <div className="flex items-center gap-3">
              <span
                className={cx(
                  'text-xs font-medium',
                  automatico ? 'text-muted' : 'text-ink',
                )}
              >
                Requiere aprobación
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={automatico}
                aria-label="Registro automático de clientes"
                disabled={!puedeEditar || guardando}
                onClick={() => onCambiarModo(automatico ? 'approval' : 'automatic')}
                className={cx(
                  'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors',
                  automatico ? 'border-accent bg-accent' : 'border-line bg-surface',
                  (!puedeEditar || guardando) && 'cursor-not-allowed opacity-60',
                )}
              >
                <span
                  className={cx(
                    'inline-block h-5 w-5 transform rounded-full bg-white shadow-soft transition-transform',
                    automatico ? 'translate-x-5' : 'translate-x-0.5',
                  )}
                />
              </button>
              <span className={cx('text-xs font-medium', automatico ? 'text-ink' : 'text-muted')}>
                Registro automático
              </span>
            </div>
          </div>

          {/* Mensaje al solicitante */}
          <Textarea
            label="Mensaje que ve el solicitante"
            value={mensaje}
            disabled={!puedeEditar}
            onChange={(e) => onCambiarMensaje(e.target.value)}
            className="min-h-[110px]"
            placeholder="Su solicitud fue recibida. Le avisaremos cuando la cuenta esté activa."
            hint={`Clave: ${REGISTRATION_MESSAGE_KEY}`}
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted">
              Estado actual guardado:{' '}
              <strong className="text-ink">
                {registrationModes.find((m) => m.value === original)?.label ?? original}
              </strong>{' '}
              · clave <code className="font-mono">{REGISTRATION_MODE_KEY}</code>
            </p>
            {puedeEditar ? (
              <Button variant="secondary" loading={guardando} onClick={onGuardarMensaje}>
                Guardar mensaje
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      <div className="space-y-5">
        <Card title="Qué cambia en cada modo">
          <ul className="space-y-3 text-sm">
            {registrationModes.map((m) => (
              <li key={m.value} className="flex items-start gap-2.5">
                <span
                  className={cx(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                    m.value === activo.value ? 'bg-accent text-ink' : 'bg-surface text-muted',
                  )}
                  aria-hidden
                >
                  <Check className="h-3 w-3" />
                </span>
                <span>
                  <span className="font-medium text-ink">{m.label}</span>
                  <span className="mt-0.5 block text-xs text-muted">{m.description}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Dónde se ve">
          <ul className="space-y-2.5 text-sm text-ink-700">
            <li className="flex items-start gap-2">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
              Las solicitudes del app llegan a <strong>Solicitudes de cuenta</strong>.
            </li>
            <li className="flex items-start gap-2">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
              En modo automático se crean ya aprobadas y se marcan como «Automática».
            </li>
            <li className="flex items-start gap-2">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
              El cambio se aplica de inmediato: el app consulta el modo en cada solicitud.
            </li>
          </ul>
        </Card>
      </div>
    </div>
  )
}
