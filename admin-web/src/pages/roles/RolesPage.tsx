import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Lock, Plus, ShieldCheck, Trash2, Users } from 'lucide-react'
import { rolesApi } from '@/api/endpoints'
import { useApiMutation } from '@/hooks/useApi'
import { usePermission } from '@/hooks/useAuth'
import { permissionActions, permissionModules } from '@/lib/constants'
import { formatDate, formatNumber } from '@/lib/format'
import { Badge, Button, Card, Checkbox, Modal, Skeleton, TextInput, Textarea } from '@/components/ui'
import { PageHeader, PermissionGate } from '@/components/layout/AppShell'
import type { Role } from '@/types'

export default function RolesPage() {
  const { can } = usePermission()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<string[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ id: '', name: '', description: '', isStaffRole: true })

  const roles = useQuery({ queryKey: ['roles'], queryFn: () => rolesApi.list() })

  const selected: Role | undefined = useMemo(
    () => (roles.data ?? []).find((r) => r.id === selectedId) ?? (roles.data ?? [])[0],
    [roles.data, selectedId],
  )

  const effectiveDraft = selectedId ? draft : (selected?.permissionCodes ?? [])

  const setPermissions = useApiMutation(
    (vars: { id: string; codes: string[] }) => rolesApi.setPermissions(vars.id, vars.codes),
    {
      successMessage: 'Permisos del rol actualizados',
      invalidate: [['roles']],
      onSuccess: () => setDraft([]),
    },
  )

  const saveRole = useApiMutation(
    (values: typeof form) =>
      values.id
        ? rolesApi.update(values.id, { name: values.name, description: values.description, isStaffRole: values.isStaffRole })
        : rolesApi.create({ name: values.name, description: values.description, isStaffRole: values.isStaffRole }),
    {
      successMessage: 'Rol guardado',
      invalidate: [['roles']],
      onSuccess: () => setShowForm(false),
    },
  )

  const removeRole = useApiMutation((id: string) => rolesApi.remove(id), {
    successMessage: 'Rol eliminado',
    invalidate: [['roles']],
  })

  function toggle(code: string): void {
    if (!selected) return
    const base = effectiveDraft
    const next = base.includes(code) ? base.filter((c) => c !== code) : [...base, code]
    setSelectedId(selected.id)
    setDraft(next)
  }

  function toggleModule(moduleKey: string, checked: boolean): void {
    if (!selected) return
    // Solo se alterna sobre códigos que existen realmente en el catálogo del rol.
    const codes = permissionActions
      .map((a) => `${moduleKey}.${a.key}`)
      .filter((code) => catalogCodes.has(code))
    const base = effectiveDraft
    const next = checked
      ? Array.from(new Set([...base, ...codes]))
      : base.filter((c) => !codes.includes(c))
    setSelectedId(selected.id)
    setDraft(next)
  }

  /** Códigos existentes en el catálogo global (unión de todos los roles). */
  const catalogCodes = useMemo(() => {
    const all = new Set<string>()
    for (const r of roles.data ?? []) for (const code of r.permissionCodes) all.add(code)
    return all
  }, [roles.data])

  return (
    <>
      <PageHeader
        title="Roles y permisos"
        subtitle="Matriz de permisos por módulo y acción · 6 roles semilla del sistema"
        actions={
          <PermissionGate permission="roles.create">
            <Button
              variant="primary"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => {
                setForm({ id: '', name: '', description: '', isStaffRole: true })
                setShowForm(true)
              }}
            >
              Nuevo rol
            </Button>
          </PermissionGate>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <Card title="Roles" bodyClassName="p-2">
          {roles.isLoading ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : (
            <ul className="space-y-1">
              {(roles.data ?? []).map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(r.id)
                      setDraft([])
                    }}
                    className={`w-full rounded-control px-3 py-2.5 text-left transition-colors ${
                      selected?.id === r.id ? 'bg-primary-50 ring-1 ring-primary/30' : 'hover:bg-surface-2'
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                        {r.isSystem ? <Lock className="h-3.5 w-3.5 text-muted" aria-hidden /> : null}
                        {r.name}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-muted">
                        <Users className="h-3 w-3" aria-hidden />
                        {formatNumber(r.userCount ?? 0)}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted">{r.description}</span>
                    <span className="mt-1 flex items-center gap-1.5">
                      <Badge tone={r.isStaffRole ? 'info' : 'neutral'}>
                        {r.isStaffRole ? 'Staff' : 'Cliente'}
                      </Badge>
                      <span className="text-[11px] text-muted">{r.permissionCodes.length} permisos</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title={selected ? `Permisos de ${selected.name}` : 'Permisos'}
          subtitle={selected?.description}
          actions={
            selected ? (
              <>
                <Badge tone={selected.isSystem ? 'warning' : 'neutral'}>
                  {selected.isSystem ? 'Rol del sistema' : 'Rol personalizado'}
                </Badge>
                {can('roles.edit') ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setForm({
                        id: selected.id,
                        name: selected.name,
                        description: selected.description,
                        isStaffRole: selected.isStaffRole,
                      })
                      setShowForm(true)
                    }}
                  >
                    Editar
                  </Button>
                ) : null}
                {can('roles.delete') && !selected.isSystem ? (
                  <Button
                    size="sm"
                    variant="danger"
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    onClick={() => {
                      if (window.confirm(`¿Eliminar el rol ${selected.name}?`)) removeRole.mutate(selected.id)
                    }}
                  >
                    Borrar
                  </Button>
                ) : null}
              </>
            ) : null
          }
        >
          {!selected ? (
            <p className="text-sm text-muted">Seleccione un rol para editar sus permisos.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="gh-table">
                  <thead>
                    <tr>
                      <th className="gh-th sticky left-0 z-10 bg-surface-2">Módulo</th>
                      {permissionActions.map((a) => (
                        <th key={a.key} className="gh-th text-center">
                          {a.label}
                        </th>
                      ))}
                      <th className="gh-th text-center">Todos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {permissionModules.map((m) => {
                      const codes = permissionActions.map((a) => `${m.key}.${a.key}`)
                      return (
                        <tr key={m.key}>
                          <td className="gh-td sticky left-0 z-10 bg-card font-medium text-ink">{m.label}</td>
                          {permissionActions.map((a) => {
                            const code = `${m.key}.${a.key}`
                            const enabled = effectiveDraft.includes(code)
                            return (
                              <td key={code} className="gh-td text-center">
                                <input
                                  type="checkbox"
                                  className="gh-checkbox"
                                  checked={enabled}
                                  disabled={!can('roles.edit')}
                                  onChange={() => toggle(code)}
                                  aria-label={code}
                                />
                              </td>
                            )
                          })}
                          <td className="gh-td text-center">
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={!can('roles.edit')}
                              onClick={() => toggleModule(m.key, !codes.every((c) => effectiveDraft.includes(c)))}
                            >
                              Alternar
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                <p className="text-xs text-muted">
                  {formatNumber(effectiveDraft.length)} permisos seleccionados de{' '}
                  {formatNumber(permissionModules.length * permissionActions.length)} posibles · rol creado el{' '}
                  {formatDate(selected.createdAt)}
                </p>
                <PermissionGate permission="roles.edit">
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => setDraft([])}>
                      Descartar cambios
                    </Button>
                    <Button
                      variant="primary"
                      icon={<ShieldCheck className="h-4 w-4" />}
                      loading={setPermissions.isPending}
                      onClick={() => setPermissions.mutate({ id: selected.id, codes: effectiveDraft })}
                    >
                      Guardar permisos
                    </Button>
                  </div>
                </PermissionGate>
              </div>

              {!can('roles.edit') ? (
                <p className="mt-3 text-xs text-muted">
                  Su rol permite consultar la matriz pero no modificarla.
                </p>
              ) : null}
            </>
          )}
        </Card>
      </div>

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={form.id ? `Editar rol: ${form.name}` : 'Nuevo rol'}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              loading={saveRole.isPending}
              disabled={!form.name.trim()}
              onClick={() => saveRole.mutate(form)}
            >
              Guardar rol
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <TextInput
            label="Nombre del rol"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
            disabled={!!form.id && selected?.isSystem}
            hint={form.id && selected?.isSystem ? 'Los roles del sistema no se pueden renombrar.' : undefined}
          />
          <Textarea
            label="Descripción"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Qué puede hacer este rol en la operación diaria."
          />
          <Checkbox
            label="Es un rol de personal de la firma (accede al panel)"
            checked={form.isStaffRole}
            onChange={(e) => setForm((f) => ({ ...f, isStaffRole: e.target.checked }))}
          />
        </div>
      </Modal>
    </>
  )
}
