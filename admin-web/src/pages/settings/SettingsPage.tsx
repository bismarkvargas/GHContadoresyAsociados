import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Building2, Palette, Save, Settings as SettingsIcon } from 'lucide-react'
import { settingsApi } from '@/api/endpoints'
import { useApiMutation } from '@/hooks/useApi'
import { usePermission } from '@/hooks/useAuth'
import { settingGroups } from '@/lib/constants'
import { formatMoney, prettyJson } from '@/lib/format'
import { Badge, Button, Card, Select, Skeleton, TextInput, Textarea } from '@/components/ui'
import { PageHeader } from '@/components/layout/AppShell'
import { RegistrationSettings } from './RegistrationSettings'
import type { Setting } from '@/types'

const brandingDefaults = [
  { key: 'branding.primary', label: 'Rojo corporativo', cssVar: '--gh-primary' },
  { key: 'branding.primary600', label: 'Rojo hover / pressed', cssVar: '--gh-primary-600' },
  { key: 'branding.primary50', label: 'Rojo suave de fondo', cssVar: '--gh-primary-50' },
  { key: 'branding.ink', label: 'Tinta / estructura', cssVar: '--gh-ink' },
  { key: 'branding.danger', label: 'Rojo de acción', cssVar: '--gh-danger' },
  { key: 'branding.success', label: 'Éxito', cssVar: '--gh-success' },
  { key: 'branding.warning', label: 'Advertencia', cssVar: '--gh-warning' },
  { key: 'branding.info', label: 'Informativo', cssVar: '--gh-info' },
  { key: 'branding.surface', label: 'Superficie clara', cssVar: '--gh-surface' },
]

export default function SettingsPage() {
  const { can } = usePermission()
  const [group, setGroup] = useState('company')
  const [draft, setDraft] = useState<Record<string, string>>({})

  const query = useQuery({ queryKey: ['settings'], queryFn: () => settingsApi.list() })

  const values = useMemo(() => {
    const base: Record<string, string> = {}
    for (const s of query.data?.items ?? []) base[s.key] = s.value
    return { ...base, ...draft }
  }, [query.data, draft])

  const save = useApiMutation(
    (items: { key: string; value: string }[]) => settingsApi.update(items),
    {
      successMessage: 'Ajustes guardados',
      invalidate: [['settings']],
      onSuccess: () => setDraft({}),
    },
  )

  const rate = Number(values['currency.usdToCrc'] || 0)
  const items: Setting[] = (query.data?.items ?? []).filter((s) => s.group === group)
  const canEdit = can('settings.edit')

  function update(key: string, value: string): void {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  /**
   * Al guardar se reenvía la **clave real de la API** (`apiKey`): el panel puede
   * mostrar alias legibles (p. ej. `branding.primary` para `brand.primaryColor`)
   * sin romper la escritura.
   */
  function saveGroup(): void {
    const payload = items.map((s) => ({ key: s.apiKey ?? s.key, value: values[s.key] ?? s.value }))
    save.mutate(payload)
  }

  /** Guarda solo las claves indicadas (lo usa el switch de registro). */
  function saveKeys(keys: string[]): void {
    const payload = keys.map((key) => {
      const ajuste = query.data?.items.find((s) => s.key === key)
      return {
        key: ajuste?.apiKey ?? key,
        value: values[key] ?? ajuste?.value ?? '',
      }
    })
    save.mutate(payload)
  }

  const dirty = Object.keys(draft).length > 0

  return (
    <>
      <PageHeader
        title="Ajustes"
        subtitle="Datos de la empresa, marca, monedas y tipo de cambio, plantillas y pasarela simulada"
        actions={
          canEdit ? (
            <Button
              variant="primary"
              icon={<Save className="h-4 w-4" />}
              loading={save.isPending}
              disabled={!dirty}
              onClick={saveGroup}
            >
              Guardar grupo «{settingGroups.find((g) => g.key === group)?.label}»
            </Button>
          ) : (
            <Badge tone="neutral">Solo lectura</Badge>
          )
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {settingGroups.map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => setGroup(g.key)}
            className={`rounded-control border px-3.5 py-2 text-sm font-medium transition-colors ${
              group === g.key
                ? 'border-primary bg-primary-50 text-primary'
                : 'border-line bg-card text-ink-700 hover:bg-surface-2'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {group === 'registration' ? (
        <RegistrationSettings
          modo={values['registration.mode'] ?? 'approval'}
          mensaje={values['registration.message'] ?? ''}
          puedeEditar={canEdit}
          guardando={save.isPending}
          onCambiarModo={(nuevo) => {
            update('registration.mode', nuevo)
            // El switch guarda al instante: es una decisión operativa, no un borrador.
            save.mutate([{ key: 'registration.mode', value: nuevo }])
          }}
          onCambiarMensaje={(texto) => update('registration.message', texto)}
          onGuardarMensaje={() => saveKeys(['registration.message'])}
          original={query.data?.items.find((s) => s.key === 'registration.mode')?.value ?? 'approval'}
        />
      ) : query.isLoading ? (
        <Card>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card
            className="lg:col-span-2"
            title={settingGroups.find((g) => g.key === group)?.label}
            subtitle="Los cambios se guardan en la tabla Settings y se aplican al sitio, al panel y al app"
          >
            <div className="space-y-4">
              {items.map((s) => {
                const isLong = (values[s.key] ?? s.value).length > 90
                return isLong ? (
                  <Textarea
                    key={s.key}
                    label={s.description || s.key}
                    disabled={!canEdit}
                    value={values[s.key] ?? ''}
                    onChange={(e) => update(s.key, e.target.value)}
                  />
                ) : (
                  <TextInput
                    key={s.key}
                    label={s.description || s.key}
                    disabled={!canEdit}
                    value={values[s.key] ?? ''}
                    onChange={(e) => update(s.key, e.target.value)}
                    hint={`clave: ${s.key}`}
                  />
                )
              })}
              {items.length === 0 ? <p className="text-sm text-muted">Sin parámetros en este grupo.</p> : null}
            </div>
          </Card>

          <div className="space-y-5">
            {group === 'branding' ? (
              <Card title="Vista previa de marca" subtitle="Tokens del sitio en vivo (docs/01 §7)">
                <div className="space-y-2">
                  {brandingDefaults.map((b) => (
                    <div key={b.key} className="flex items-center gap-3">
                      <span
                        className="h-8 w-8 shrink-0 rounded-control border border-line"
                        style={{ background: values[b.key] ?? '#FFFFFF' }}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-ink">{b.label}</p>
                        <p className="font-mono text-[11px] text-muted">
                          {b.cssVar} · {values[b.key]}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ) : null}

            {group === 'currency' ? (
              <Card title="Conversión en vivo" subtitle="Moneda base USD (docs/01 §5)">
                <p className="text-sm text-muted">
                  Tipo de cambio configurado: <strong className="text-ink">₡{rate.toFixed(2)}</strong> por USD 1.
                </p>
                <ul className="mt-3 space-y-2 text-sm">
                  {[16.95, 169.5, 339, 960.5].map((usd) => (
                    <li key={usd} className="flex items-center justify-between">
                      <span className="text-muted">{formatMoney(usd)}</span>
                      <span className="text-ink">
                        {new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC' }).format(usd * rate)}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4">
                  <label className="gh-label">Moneda base del catálogo</label>
                  <Select
                    disabled={!canEdit}
                    value={values['currency.base'] ?? 'USD'}
                    onChange={(e) => update('currency.base', e.target.value)}
                    options={[
                      { value: 'USD', label: 'USD · dólar estadounidense (base)' },
                      { value: 'CRC', label: 'CRC · colón costarricense' },
                    ]}
                  />
                </div>
              </Card>
            ) : null}

            {group === 'payment' ? (
              <Card title="Pasarela simulada" subtitle="Proveedor GH-Simulated">
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center justify-between">
                    <span className="text-muted">Proveedor</span>
                    <span className="text-ink">{values['payment.provider']}</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-muted">Moneda de cobro</span>
                    <span className="text-ink">{values['payment.currency']}</span>
                  </li>
                </ul>
                <div className="mt-3 space-y-1.5 text-xs">
                  {[
                    ['Aprobada', values['payment.cardApproved']],
                    ['Rechazada', values['payment.cardDeclined']],
                    ['Pendiente', values['payment.cardPending']],
                  ].map(([label, card]) => (
                    <p key={label} className="flex items-center justify-between">
                      <span className="text-muted">{label}</span>
                      <code className="text-ink">{card}</code>
                    </p>
                  ))}
                </div>
                <div className="mt-4">
                  <p className="mb-1.5 text-xs uppercase tracking-wide text-muted">
                    Payload de ejemplo que enviaría la pasarela
                  </p>
                  <pre className="max-h-56 overflow-auto rounded-control border border-line bg-surface-2 p-3 text-[11px] text-ink-700">
                    {prettyJson(
                      JSON.stringify(
                        {
                          provider: values['payment.provider'],
                          webhookUrl: values['payment.webhookUrl'],
                          amount: 16950,
                          currency: values['payment.currency'],
                          method: 'Card',
                          card: { number: values['payment.cardApproved'], exp: '12/28', cvv: '***' },
                        },
                        null,
                        2,
                      ),
                    )}
                  </pre>
                </div>
              </Card>
            ) : null}

            {group === 'company' ? (
              <Card title="Datos oficiales de la firma" subtitle="Aparecen en el panel, los correos y el sitio">
                <dl className="space-y-2.5 text-sm">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted">Razón social</dt>
                    <dd className="text-ink">{values['company.legalName']}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted">Dirección</dt>
                    <dd className="text-ink">{values['company.address']}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted">Teléfonos</dt>
                    <dd className="text-ink">
                      {values['company.phone1']} · {values['company.phone2']}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted">Correos</dt>
                    <dd className="text-ink break-all">
                      {values['company.emailManagement']}
                      <br />
                      {values['company.emailOrders']}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted">Zona horaria</dt>
                    <dd className="text-ink">{values['company.timeZone']}</dd>
                  </div>
                </dl>
                <p className="mt-4 flex items-center gap-2 rounded-control border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
                  <Building2 className="h-3.5 w-3.5" aria-hidden />
                  Huacas, Santa Cruz, Guanacaste, Costa Rica
                </p>
              </Card>
            ) : null}

            <Card title="Información del panel">
              <ul className="space-y-2.5 text-sm text-ink-700">
                <li className="flex items-center gap-2">
                  <SettingsIcon className="h-3.5 w-3.5 text-muted" aria-hidden />
                  Moneda base: <strong className="text-ink">{values['currency.base'] ?? 'USD'}</strong>
                </li>
                <li className="flex items-center gap-2">
                  <Palette className="h-3.5 w-3.5 text-muted" aria-hidden />
                  Marca: <strong className="text-ink">{values['branding.primary']}</strong> /{' '}
                  <strong className="text-ink">{values['branding.ink']}</strong>
                </li>
                <li>
                  Grupos de ajustes: {settingGroups.length} · parámetros en el grupo actual:{' '}
                  {items.length}
                </li>
              </ul>
            </Card>
          </div>
        </div>
      )}
    </>
  )
}
