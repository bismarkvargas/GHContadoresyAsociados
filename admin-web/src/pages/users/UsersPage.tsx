import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Download, KeyRound, Pencil, Plus, ShieldCheck, UserX } from 'lucide-react'
import { rolesApi, usersApi } from '@/api/endpoints'
import { useApiMutation, useDebounced, useListQuery, useTableState } from '@/hooks/useApi'
import { usePermission } from '@/hooks/useAuth'
import { downloadCsv, formatDateTime, formatNumber } from '@/lib/format'
import { labelOf, toneOf, userStatusMeta } from '@/lib/labels'
import {
  Avatar,
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
  type Column,
} from '@/components/ui'
import { PageHeader, PermissionGate } from '@/components/layout/AppShell'
import type { User, UserStatus } from '@/types'

const emptyForm = {
  id: '',
  fullName: '',
  email: '',
  phone: '',
  idNumber: '',
  status: 'Active' as UserStatus,
  isStaff: true,
  password: '',
  roles: ['Asistente'] as string[],
}

export default function UsersPage() {
  const { can } = usePermission()
  const table = useTableState({ pageSize: 20, sort: 'fullName', order: 'asc' })
  const search = useDebounced(table.search, 350)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [resetTarget, setResetTarget] = useState<User | null>(null)

  const params = useMemo(() => ({ ...table.params, search: search || undefined }), [table.params, search])
  const query = useListQuery(['users'], usersApi.list, params)

  const roles = useQuery({ queryKey: ['roles'], queryFn: () => rolesApi.list(), staleTime: 120000 })

  const save = useApiMutation(
    (values: typeof emptyForm) =>
      values.id
        ? usersApi.update(values.id, {
            fullName: values.fullName,
            email: values.email,
            phone: values.phone,
            idNumber: values.idNumber,
            isStaff: values.isStaff,
          })
        : usersApi.create({
            ...values,
            roles: values.roles,
            password: values.password || 'Demo123!',
          }),
    {
      successMessage: 'Usuario guardado',
      invalidate: [['users']],
      onSuccess: () => setShowForm(false),
    },
  )

  const setRoles = useApiMutation(
    (vars: { id: string; roles: string[] }) => usersApi.setRoles(vars.id, vars.roles),
    {
      successMessage: 'Roles actualizados',
      invalidate: [['users']],
    },
  )

  const changeStatus = useApiMutation(
    (vars: { id: string; status: UserStatus }) => usersApi.changeStatus(vars.id, vars.status),
    {
      successMessage: 'Estado del usuario actualizado',
      invalidate: [['users']],
    },
  )

  const resetPassword = useApiMutation((id: string) => usersApi.resetPassword(id), {
    successMessage: 'Contraseña restablecida',
    invalidate: [['users']],
    onSuccess: (data) => {
      window.alert(`Contraseña temporal: ${data.temporaryPassword}`)
      setResetTarget(null)
    },
  })

  const columns: Column<User>[] = [
    {
      key: 'fullName',
      header: 'Usuario',
      sortable: true,
      render: (u) => (
        <div className="flex items-center gap-3">
          <Avatar name={u.fullName} />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{u.fullName}</p>
            <p className="truncate text-xs text-muted">{u.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'roles',
      header: 'Roles',
      render: (u) => (
        <div className="flex flex-wrap gap-1">
          {u.roles.map((r) => (
            <Badge key={r} tone={r === 'SuperAdmin' ? 'primary' : 'neutral'}>
              {r}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'isStaff',
      header: 'Tipo',
      render: (u) => (
        <Badge tone={u.isStaff ? 'info' : 'neutral'}>{u.isStaff ? 'Personal de la firma' : 'Cliente app'}</Badge>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      sortable: true,
      render: (u) => <Badge tone={toneOf(userStatusMeta, u.status)}>{labelOf(userStatusMeta, u.status)}</Badge>,
    },
    {
      key: 'clientId',
      header: 'Cliente',
      render: (u) =>
        u.clientId ? (
          <Link to={`/clientes/${u.clientId}`} className="gh-link text-xs">
            Ver ficha
          </Link>
        ) : (
          <span className="text-xs text-muted">—</span>
        ),
    },
    {
      key: 'lastLoginAt',
      header: 'Último acceso',
      sortable: true,
      render: (u) => (
        <span className="text-xs text-muted">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Nunca'}</span>
      ),
    },
    {
      key: 'failedLoginCount',
      header: 'Fallos',
      align: 'center',
      render: (u) => (
        <span className={u.failedLoginCount >= 3 ? 'text-xs font-medium text-warning' : 'text-xs text-muted'}>
          {u.failedLoginCount}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (u) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <PermissionGate permission="users.edit">
            <Button
              size="sm"
              variant="ghost"
              title="Editar"
              icon={<Pencil className="h-3.5 w-3.5" />}
              onClick={() => {
                setForm({
                  id: u.id,
                  fullName: u.fullName,
                  email: u.email,
                  phone: u.phone ?? '',
                  idNumber: u.idNumber ?? '',
                  status: u.status,
                  isStaff: u.isStaff,
                  password: '',
                  roles: u.roles,
                })
                setShowForm(true)
              }}
            />
            <Button
              size="sm"
              variant="ghost"
              title="Restablecer contraseña"
              icon={<KeyRound className="h-3.5 w-3.5" />}
              onClick={() => setResetTarget(u)}
            />
            <Button
              size="sm"
              variant="ghost"
              title={u.status === 'Active' ? 'Suspender' : 'Activar'}
              icon={<UserX className="h-3.5 w-3.5" />}
              onClick={() => changeStatus.mutate({ id: u.id, status: u.status === 'Active' ? 'Suspended' : 'Active' })}
            />
          </PermissionGate>
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Usuarios"
        subtitle={`${formatNumber(query.data?.total ?? 0)} usuarios · personal de la firma y cuentas del app`}
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Download className="h-4 w-4" />}
              disabled={!query.data?.items.length}
              onClick={() =>
                downloadCsv(
                  `usuarios-gh-${new Date().toISOString().slice(0, 10)}.csv`,
                  (query.data?.items ?? []).map((u) => ({
                    Nombre: u.fullName,
                    Correo: u.email,
                    Cedula: u.idNumber ?? '',
                    Telefono: u.phone ?? '',
                    Roles: u.roles.join('|'),
                    Tipo: u.isStaff ? 'Staff' : 'Cliente',
                    Estado: labelOf(userStatusMeta, u.status),
                    UltimoAcceso: u.lastLoginAt ?? '',
                    Fallos: u.failedLoginCount,
                  })),
                )
              }
            >
              Exportar CSV
            </Button>
            {can('users.create') ? (
              <Button
                variant="primary"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => {
                  setForm(emptyForm)
                  setShowForm(true)
                }}
              >
                Nuevo usuario
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-4">
        {(['Active', 'Pending', 'Suspended', 'Rejected'] as UserStatus[]).map((s) => (
          <button
            key={s}
            type="button"
            className="gh-card-pad text-left transition-shadow hover:shadow-pop"
            onClick={() => table.setFilter('status', s)}
          >
            <p className="text-xs uppercase tracking-wide text-muted">{labelOf(userStatusMeta, s)}</p>
            <p className="mt-1.5 text-lg font-semibold text-ink">
              {formatNumber((query.data?.items ?? []).filter((u) => u.status === s).length)}
            </p>
            <span className="text-[11px] text-muted">en la página actual</span>
          </button>
        ))}
      </div>

      <Card padded={false}>
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-5">
          <SearchInput
            value={table.search}
            onChange={table.setSearch}
            placeholder="Buscar por nombre, correo, cédula o teléfono"
            className="lg:col-span-2"
          />
          <Select
            value={table.filters.status ?? ''}
            onChange={(e) => table.setFilter('status', e.target.value)}
            placeholder="Todos los estados"
            options={(['Pending', 'Active', 'Suspended', 'Rejected'] as UserStatus[]).map((s) => ({
              value: s,
              label: labelOf(userStatusMeta, s),
            }))}
          />
          <Select
            value={table.filters.isStaff ?? ''}
            onChange={(e) => table.setFilter('isStaff', e.target.value)}
            placeholder="Staff y clientes"
            options={[
              { value: 'true', label: 'Solo personal de la firma' },
              { value: 'false', label: 'Solo clientes del app' },
            ]}
          />
          <Select
            value={table.filters.role ?? ''}
            onChange={(e) => table.setFilter('role', e.target.value)}
            placeholder="Todos los roles"
            options={(roles.data ?? []).map((r) => ({ value: r.name, label: r.name }))}
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
          rowKey={(u) => u.id}
          loading={query.isLoading}
          error={query.isError ? query.error : undefined}
          onRetry={() => void query.refetch()}
          sort={table.sort}
          order={table.order}
          onSort={table.setSort}
          empty={<EmptyState icon={<ShieldCheck className="h-4 w-4" />} title="Sin usuarios" />}
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
        title={form.id ? `Editar: ${form.fullName}` : 'Nuevo usuario'}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button variant="primary" loading={save.isPending} onClick={() => save.mutate(form)}>
              Guardar usuario
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <TextInput
            label="Nombre completo"
            value={form.fullName}
            onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
            required
          />
          <TextInput
            label="Correo"
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            required
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="Teléfono" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            <TextInput
              label="Cédula"
              value={form.idNumber}
              onChange={(e) => setForm((f) => ({ ...f, idNumber: e.target.value }))}
            />
          </div>

          {form.id ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Estado"
                value={form.status}
                onChange={(e) => {
                  const status = e.target.value as UserStatus
                  setForm((f) => ({ ...f, status }))
                  changeStatus.mutate({ id: form.id, status })
                }}
                options={(['Pending', 'Active', 'Suspended', 'Rejected'] as UserStatus[]).map((s) => ({
                  value: s,
                  label: labelOf(userStatusMeta, s),
                }))}
              />
              <Select
                label="Asignación de rol principal"
                value={form.roles[0] ?? ''}
                onChange={(e) => {
                  const rolesNext = [e.target.value]
                  setForm((f) => ({ ...f, roles: rolesNext }))
                  setRoles.mutate({ id: form.id, roles: rolesNext })
                }}
                options={(roles.data ?? []).map((r) => ({ value: r.name, label: r.name }))}
              />
            </div>
          ) : (
            <>
              <TextInput
                label="Contraseña inicial"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Demo123!"
                hint="Si se deja vacío se usa Demo123! y se pedirá cambiarla al primer acceso."
              />
              <div>
                <p className="gh-label">Roles</p>
                <div className="flex flex-wrap gap-3">
                  {(roles.data ?? []).map((r) => (
                    <Checkbox
                      key={r.id}
                      label={r.name}
                      checked={form.roles.includes(r.name)}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          roles: e.target.checked
                            ? [...f.roles, r.name]
                            : f.roles.filter((x) => x !== r.name),
                        }))
                      }
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          <Checkbox
            label="Es personal de la firma (IsStaff)"
            checked={form.isStaff}
            onChange={(e) => setForm((f) => ({ ...f, isStaff: e.target.checked }))}
          />
        </div>
      </Modal>

      <Modal
        open={!!resetTarget}
        onClose={() => setResetTarget(null)}
        title="Restablecer contraseña"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              loading={resetPassword.isPending}
              onClick={() => resetTarget && resetPassword.mutate(resetTarget.id)}
            >
              Generar contraseña temporal
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-700">
          Se generará una contraseña temporal para <strong>{resetTarget?.fullName}</strong> y se invalidarán las
          sesiones activas. La acción queda registrada en auditoría.
        </p>
      </Modal>
    </>
  )
}
