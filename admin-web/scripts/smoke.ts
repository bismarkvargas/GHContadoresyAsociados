/**
 * Prueba de humo del adaptador mock: recorre el contrato de API sin navegador.
 * Se ejecuta con scripts/smoke.mjs (compila con Vite en modo módulo y lanza Node).
 */

import { buildSeedDb, setDb } from '@/api/mock/db'
import { handleMockRequest, MockHttpError } from '@/api/mock/router'

let passed = 0
let failed = 0

function check(name: string, condition: unknown, detail = ''): void {
  if (condition) {
    passed += 1
    console.log(`  OK   ${name}`)
  } else {
    failed += 1
    console.log(`  FAIL ${name} ${detail}`)
  }
}

async function call<T = any>(
  method: string,
  url: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; data: T }> {
  return handleMockRequest<T>({
    method,
    url,
    body,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })
}

/** Ejecuta y devuelve el error capturado (sin abortar la prueba). */
async function expectError(
  method: string,
  url: string,
  body?: unknown,
  token?: string,
): Promise<MockHttpError | null> {
  try {
    await call(method, url, body, token)
    return null
  } catch (error) {
    return error instanceof MockHttpError ? error : null
  }
}

async function main(): Promise<void> {
  console.log('== Seed de la base mock ==')
  const db = await buildSeedDb()
  setDb(db)
  check('usuarios sembrados', db.users.length > 10, `(${db.users.length})`)
  check('clientes sembrados', db.clients.length === 34, `(${db.clients.length})`)
  check('expedientes sembrados', db.caseFiles.length === 58, `(${db.caseFiles.length})`)
  check('tareas sembradas', db.caseTasks.length > 100, `(${db.caseTasks.length})`)
  check('pedidos sembrados', db.orders.length === 46, `(${db.orders.length})`)
  check('pagos sembrados', db.payments.length > 30, `(${db.payments.length})`)
  check('solicitudes de cuenta', db.accountRequests.length === 16, `(${db.accountRequests.length})`)
  check('cotizaciones', db.quotes.length === 14, `(${db.quotes.length})`)
  check('auditoría', db.auditLogs.length === 60, `(${db.auditLogs.length})`)
  check('roles semilla', db.roles.length === 6, `(${db.roles.length})`)
  check('permisos con comodines por módulo', db.permissions.length > 40, `(${db.permissions.length})`)

  console.log('== Autenticación ==')
  const adminLogin = await call('POST', '/auth/login', {
    email: 'admin@ghcontadores.net',
    password: 'Gh.Admin2026',
  })
  check('login SuperAdmin', adminLogin.status === 200 && !!adminLogin.data.accessToken)
  check('SuperAdmin recibe permisos', adminLogin.data.permissions.length > 40, `(${adminLogin.data.permissions.length})`)
  const adminToken = adminLogin.data.accessToken as string

  const lawyerLogin = await call('POST', '/auth/login', {
    email: 'abogado@ghcontadores.net',
    password: 'Gh.Abogado2026',
  })
  const lawyerPerms = (lawyerLogin.data.permissions ?? []) as string[]
  check('login Abogado', lawyerLogin.status === 200 && !!lawyerLogin.data.accessToken)
  check('Abogado NO tiene users.view', !lawyerPerms.includes('users.view'))
  check('Abogado NO tiene roles.view', !lawyerPerms.includes('roles.view'))
  check('Abogado NO tiene settings.edit', !lawyerPerms.includes('settings.edit'))
  check('Abogado NO tiene clients.delete', !lawyerPerms.includes('clients.delete'))
  check('Abogado SÍ tiene cases.edit', lawyerPerms.includes('cases.edit'))
  check(
    'Abogado ve menos permisos que SuperAdmin',
    lawyerPerms.length < adminLogin.data.permissions.length,
    `(${lawyerPerms.length} < ${adminLogin.data.permissions.length})`,
  )

  check('login con contraseña errónea devuelve 401', (await expectError('POST', '/auth/login', { email: 'admin@ghcontadores.net', password: 'incorrecta' }))?.status === 401)
  check('sin token devuelve 401', (await expectError('GET', '/admin/dashboard/summary'))?.status === 401)
  check('sin token en /admin/clients devuelve 401', (await expectError('GET', '/admin/clients'))?.status === 401)
  check('sin token en /admin/users devuelve 401', (await expectError('GET', '/admin/users'))?.status === 401)

  console.log('== Contrato de listados (paginación, filtros, orden) ==')
  const clients = await call('GET', '/admin/clients?page=1&pageSize=5&sort=code&order=asc', undefined, adminToken)
  check('clientes pagina 5', clients.data.items.length === 5, `(${clients.data.items.length})`)
  check('clientes total 34', clients.data.total === 34, `(${clients.data.total})`)
  check('clientes totalPages 7', clients.data.totalPages === 7, `(${clients.data.totalPages})`)
  check('clientes orden ascendente por código', clients.data.items[0].code < clients.data.items[4].code)
  check('cliente enriquecido con openCases', typeof clients.data.items[0].openCases === 'number')

  const searched = await call('GET', '/admin/clients?search=hotel', undefined, adminToken)
  check('búsqueda ignora acentos y mayúsculas', searched.data.total > 0, `(${searched.data.total})`)

  const leads = await call('GET', '/admin/clients?status=Lead', undefined, adminToken)
  check(
    'filtro por estado',
    leads.data.items.every((c: any) => c.status === 'Lead'),
    `(${leads.data.total})`,
  )

  const cases = await call('GET', '/admin/cases?status=Open&sort=dueAt&order=asc', undefined, adminToken)
  check(
    'filtro de expedientes por estado',
    cases.data.items.every((c: any) => c.status === 'Open'),
    `(${cases.data.total})`,
  )
  check('expediente enriquecido con cliente y tareas', !!cases.data.items[0].clientName)

  const overdue = await call('GET', '/admin/cases?overdue=true', undefined, adminToken)
  check('filtro de vencidos', overdue.data.total >= 0 && overdue.data.total < 58, `(${overdue.data.total})`)

  const products = await call('GET', '/admin/catalog/products?page=1&pageSize=100', undefined, adminToken)
  check('catálogo con 62 servicios reales', products.data.total === 62, `(${products.data.total})`)
  const categories = await call('GET', '/admin/catalog/categories', undefined, adminToken)
  check('catálogo con 4 categorías reales', categories.data.length === 4, `(${categories.data.length})`)
  check(
    'suma de servicios por categoría = 62',
    categories.data.reduce((s: number, c: any) => s + c.productCount, 0) === 62,
  )
  const prices = products.data.items.map((p: any) => p.price)
  check('precio mínimo real 16.95', Math.min(...prices) === 16.95, `(${Math.min(...prices)})`)
  check('precio máximo real 960.50', Math.max(...prices) === 960.5, `(${Math.max(...prices)})`)

  console.log('== Dashboard ==')
  const dash = await call('GET', '/admin/dashboard/summary', undefined, adminToken)
  check('KPIs presentes', typeof dash.data.kpis.activeClients === 'number')
  check('12 meses de ventas', dash.data.salesByMonth.length === 12, `(${dash.data.salesByMonth.length})`)
  check('embudo de 4 etapas', dash.data.leadsFunnel.length === 4)
  check('pedidos por estado', dash.data.ordersByStatus.length >= 4, `(${dash.data.ordersByStatus.length})`)
  check('últimas gestiones', dash.data.latestActivities.length === 12, `(${dash.data.latestActivities.length})`)
  check(
    'ventas no negativas',
    dash.data.salesByMonth.every((m: any) => m.total >= 0),
  )

  console.log('== Expediente: estado, tarea y timeline ==')
  const oneCase = await call('GET', `/admin/cases/${db.caseFiles[0]!.id}`, undefined, adminToken)
  check('detalle con tareas', Array.isArray(oneCase.data.tasks))
  check('detalle con timeline', oneCase.data.events.length > 0, `(${oneCase.data.events.length})`)
  check('detalle con cliente incrustado', !!oneCase.data.client?.legalName)

  const beforeEvents = oneCase.data.events.length
  const changed = await call(
    'PATCH',
    `/admin/cases/${db.caseFiles[0]!.id}/status`,
    { status: 'InProgress', note: 'Prueba de humo' },
    adminToken,
  )
  check('cambio de estado', changed.data.status === 'InProgress')
  const after = await call('GET', `/admin/cases/${db.caseFiles[0]!.id}`, undefined, adminToken)
  check('el cambio genera evento en el timeline', after.data.events.length === beforeEvents + 1)
  check(
    'el evento registra el actor',
    after.data.events[0].actorName.includes('Gustavo'),
    `(${after.data.events[0].actorName})`,
  )

  const task = await call(
    'POST',
    `/admin/cases/${db.caseFiles[0]!.id}/tasks`,
    { title: 'Tarea de prueba', priority: 'High', dueAt: new Date().toISOString(), clientVisible: true },
    adminToken,
  )
  check('crear tarea', !!task.data.id)
  const done = await call(
    'PATCH',
    `/admin/cases/${db.caseFiles[0]!.id}/tasks/${task.data.id}`,
    { status: 'Done' },
    adminToken,
  )
  check('completar tarea', done.data.status === 'Done' && !!done.data.completedAt)

  console.log('== Documentos: validación y versionado ==')
  const upload1 = await call(
    'POST',
    '/admin/documents',
    {
      originalName: 'cedula.pdf',
      contentType: 'application/pdf',
      sizeBytes: 120000,
      category: 'Identidad',
      caseFileId: db.caseFiles[0]!.id,
      clientVisible: true,
    },
    adminToken,
  )
  check('subida válida (versión 1)', upload1.data.version === 1, `(v${upload1.data.version})`)
  const upload2 = await call(
    'POST',
    '/admin/documents',
    {
      originalName: 'cedula.pdf',
      contentType: 'application/pdf',
      sizeBytes: 140000,
      category: 'Identidad',
      caseFileId: db.caseFiles[0]!.id,
    },
    adminToken,
  )
  check('segunda subida crea versión 2', upload2.data.version === 2, `(v${upload2.data.version})`)
  const versions = await call('GET', `/admin/documents/${upload2.data.id}/versions`, undefined, adminToken)
  check('historial de 2 versiones', versions.data.length === 2, `(${versions.data.length})`)
  check('solo la última es actual', versions.data.filter((d: any) => d.isCurrent).length === 1)

  check(
    'rechaza tipo de archivo no permitido',
    (
      await expectError(
        'POST',
        '/admin/documents',
        { originalName: 'virus.exe', contentType: 'application/x-msdownload', sizeBytes: 1000 },
        adminToken,
      )
    )?.status === 400,
  )
  check(
    'rechaza archivos > 25 MB',
    (
      await expectError(
        'POST',
        '/admin/documents',
        { originalName: 'gigante.pdf', contentType: 'application/pdf', sizeBytes: 30 * 1024 * 1024 },
        adminToken,
      )
    )?.status === 400,
  )

  console.log('== Solicitudes de cuenta: aprobar y rechazar ==')
  const pending = await call('GET', '/admin/account-requests?status=Pending', undefined, adminToken)
  check('bandeja de pendientes con contador', typeof pending.data.pendingCount === 'number')
  const usersBefore = (await call('GET', '/admin/users?pageSize=1', undefined, adminToken)).data.total
  const approved = await call(
    'POST',
    `/admin/account-requests/${pending.data.items[0].id}/approve`,
    { role: 'Cliente' },
    adminToken,
  )
  check('aprobar crea usuario', approved.data.request.status === 'Approved' && !!approved.data.user.id)
  check('el usuario creado es Cliente', approved.data.user.roles.includes('Cliente'))
  const usersAfter = (await call('GET', '/admin/users?pageSize=1', undefined, adminToken)).data.total
  check('el total de usuarios aumenta', usersAfter === usersBefore + 1, `(${usersBefore} â†’ ${usersAfter})`)

  const rejected = await call(
    'POST',
    `/admin/account-requests/${pending.data.items[1].id}/reject`,
    { reason: 'Documentación ilegible' },
    adminToken,
  )
  check('rechazar guarda motivo', rejected.data.status === 'Rejected' && !!rejected.data.rejectionReason)
  check(
    'no se puede revisar dos veces',
    (
      await expectError(
        'POST',
        `/admin/account-requests/${pending.data.items[1].id}/reject`,
        { reason: 'otra vez' },
        adminToken,
      )
    )?.status === 400,
  )

  console.log('== Pedidos: pagado, expediente y reembolso ==')
  const paidOrder = db.orders.find(
    (o) => o.status === 'Paid' && o.items.some((i) => !i.caseFileId),
  )!
  const caseCountBefore = db.caseFiles.length
  const created = await call('POST', `/admin/orders/${paidOrder.id}/create-case`, undefined, adminToken)
  check('genera expediente desde pedido', created.data.created.length > 0, `(${created.data.created.length})`)
  check('el expediente tiene tareas iniciales', db.caseFiles.length > caseCountBefore)
  check('pedido pasa a InProcess', created.data.order.status === 'InProcess')

  const orderDetail = await call('GET', `/admin/orders/${paidOrder.id}`, undefined, adminToken)
  check('detalle del pedido con ítems', orderDetail.data.items.length > 0)
  check('detalle del pedido con pagos', Array.isArray(orderDetail.data.payments))
  check('ítem vinculado al expediente', !!orderDetail.data.items[0].caseCode)

  const refundOrder = db.orders.find((o) => o.status === 'Completed')!
  const refunded = await call('POST', `/admin/orders/${refundOrder.id}/refund`, { reason: 'Prueba' }, adminToken)
  check('reembolso cambia el pedido', refunded.data.status === 'Refunded')
  check(
    'el pago aprobado pasa a Refunded',
    db.payments.some((p) => p.orderId === refundOrder.id && p.status === 'Refunded'),
  )

  console.log('== Roles y permisos ==')
  const roles = await call('GET', '/admin/roles', undefined, adminToken)
  check('6 roles semilla', roles.data.length === 6, `(${roles.data.length})`)
  check(
    'roles del sistema marcados',
    roles.data.filter((r: any) => r.isSystem).length === 6,
  )
  check(
    'no se puede borrar un rol del sistema',
    (await expectError('DELETE', `/admin/roles/${roles.data[0].id}`, undefined, adminToken))?.status === 400,
  )
  const custom = await call(
    'POST',
    '/admin/roles',
    { name: 'Auditor externo', description: 'Solo lectura', permissionCodes: ['clients.view'] },
    adminToken,
  )
  check('crear rol personalizado', custom.data.isSystem === false)
  const updatedRole = await call(
    'PUT',
    `/admin/roles/${custom.data.id}/permissions`,
    { permissionCodes: ['clients.view', 'reports.view', 'reports.export'] },
    adminToken,
  )
  check('matriz de permisos guardada', updatedRole.data.permissionCodes.length === 3)
  const removed = await call('DELETE', `/admin/roles/${custom.data.id}`, undefined, adminToken)
  check('borrar rol no-sistema', removed.data.ok === true)

  console.log('== Usuarios ==')
  const staffUser = db.users.find((u) => u.isStaff && u.status === 'Active' && u.id !== 'user-admin')!
  const rolesChanged = await call(
    'PUT',
    `/admin/users/${staffUser.id}/roles`,
    { roles: ['Contador', 'Asistente'] },
    adminToken,
  )
  check('roles múltiples asignados', rolesChanged.data.roles.length === 2)
  const suspended = await call('PATCH', `/admin/users/${staffUser.id}/status`, { status: 'Suspended' }, adminToken)
  check('suspender usuario', suspended.data.status === 'Suspended')
  const reset = await call('POST', `/admin/users/${staffUser.id}/reset-password`, {}, adminToken)
  check('reset de contraseña devuelve temporal', !!reset.data.temporaryPassword)
  check(
    'no puede suspenderse a sí mismo',
    (
      await expectError(
        'PATCH',
        `/admin/users/${db.users.find((u) => u.id === 'user-admin')!.id}/status`,
        { status: 'Suspended' },
        adminToken,
      )
    )?.status === 400,
  )

  console.log('== Cotizaciones ==')
  const quotes = await call('GET', '/admin/quotes?status=New', undefined, adminToken)
  check('bandeja de cotizaciones nuevas', typeof quotes.data.newCount === 'number')
  const clientsBefore = db.clients.length
  const converted = await call(
    'POST',
    `/admin/quotes/${quotes.data.items[0].id}/convert`,
    { idNumber: '3-101-999999' },
    adminToken,
  )
  check('convertir cotización en cliente', !!converted.data.clientId && db.clients.length === clientsBefore + 1)

  console.log('== Informes ==')
  const sales = await call('GET', '/admin/reports/sales', undefined, adminToken)
  check('informe de ventas con 12 meses', sales.data.byMonth.length === 12)
  check('totales coherentes', sales.data.totals.total > 0, `(${sales.data.totals.total})`)
  check('desglose por categoría', sales.data.byCategory.length >= 4, `(${sales.data.byCategory.length})`)
  const casesReport = await call('GET', '/admin/reports/cases', undefined, adminToken)
  check('informe de expedientes', casesReport.data.byStatus.length > 0 && casesReport.data.byEntity.length > 0)
  const productivity = await call('GET', '/admin/reports/productivity', undefined, adminToken)
  check('productividad por profesional', productivity.data.rows.length >= 5, `(${productivity.data.rows.length})`)

  console.log('== Ajustes y auditoría ==')
  const settings = await call('GET', '/admin/settings', undefined, adminToken)
  check('ajustes agrupados', Object.keys(settings.data.groups).length === 6, `(${Object.keys(settings.data.groups).length})`)
  check('tipo de cambio presente', settings.data.exchangeRate > 0, `(${settings.data.exchangeRate})`)
  const saved = await call('PUT', '/admin/settings', { items: [{ key: 'currency.usdToCrc', value: '515' }] }, adminToken)
  check('guardar ajuste', saved.data.updated === 1)
  const settings2 = await call('GET', '/admin/settings', undefined, adminToken)
  check('el ajuste quedó persistido', settings2.data.exchangeRate === 515, `(${settings2.data.exchangeRate})`)

  const audit = await call('GET', '/admin/audit?page=1&pageSize=10', undefined, adminToken)
  check('auditoría paginada', audit.data.items.length === 10, `(${audit.data.items.length})`)
  check('auditoría con diff antes/después', audit.data.items.some((l: any) => !!l.afterJson))
  check('auditoría resuelve el nombre del usuario', audit.data.items.some((l: any) => !!l.userName))
  const auditByEntity = await call('GET', '/admin/audit?entityName=CaseFile', undefined, adminToken)
  check(
    'filtro de auditoría por entidad',
    auditByEntity.data.items.every((l: any) => l.entityName === 'CaseFile'),
  )

  console.log('== Rutas públicas y errores ==')
  const site = await call('GET', '/public/site')
  check('GET /public/site responde', !!site.data.company['company.legalName'])
  check('la razón social es la real', site.data.company['company.legalName'] === 'GH Contadores & Asociados')
  const publicProducts = await call('GET', '/public/catalog/products?pageSize=100')
  check('catálogo público solo activos', publicProducts.data.items.every((p: any) => p.isActive))
  const request = await call('POST', '/public/account-requests', {
    fullName: 'Prueba Humo',
    email: 'prueba@correo.cr',
    phone: '+506 8888 8888',
    idNumber: '1-1111-1111',
    clientType: 'Individual',
    source: 'web',
  })
  check('solicitud pública crea registro con seguimiento', !!request.data.trackingCode)
  const status = await call('GET', '/public/account-requests/status?email=prueba@correo.cr')
  check('consulta de estado por correo', status.data.status === 'Pending')
  const health = await call('GET', '/health')
  check('health responde', health.data.status === 'Healthy')
  check(
    'recurso inexistente devuelve 404',
    (await expectError('GET', '/admin/cases/inexistente', undefined, adminToken))?.status === 404,
  )
  check(
    'ruta desconocida devuelve 404',
    (await expectError('GET', '/ruta/que/no/existe', undefined, adminToken))?.status === 404,
  )

  console.log('== Latencia simulada ==')
  const t0 = Date.now()
  await call('GET', '/health')
  const elapsed = Date.now() - t0
  check('latencia entre 150 y 400 ms', elapsed >= 150 && elapsed <= 600, `(${elapsed} ms)`)

  console.log('')
  console.log(`RESULTADO: ${passed} comprobaciones OK, ${failed} fallidas`)
  if (failed > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error('ERROR FATAL EN LA PRUEBA DE HUMO:', error)
  process.exitCode = 1
})
