# Rutas del panel — GH Contadores y Asociados

Base de despliegue: **`/ghcontadores/`** (por eso las URLs reales son
`https://demostracion.es/ghcontadores/…`). El router usa `BrowserRouter` con `basename` tomado de
`import.meta.env.BASE_URL`, y todas las rutas internas exigen sesión de **personal de la firma**
(`IsStaff = true`).

La columna **Permiso de vista** es el permiso que la guarda `ProtectedRoute` exige para entrar a la
pantalla; **Permisos de acción** son los que habilitan los botones dentro de ella. Los permisos se
toman del arreglo `permissions[]` que devuelve `POST /auth/login` y se consumen con
`usePermission()` / `useCan()`; `SuperAdmin` pasa siempre. El menú lateral se construye con la misma
tabla (`src/config/routes.ts`), por lo que un rol sin permiso **no ve la entrada** y, si escribe la
URL a mano, recibe la pantalla *Acceso denegado* con el permiso que le falta.

---

## 1. Rutas públicas

| Ruta | Pantalla | Permiso de vista | Permisos de acción | Archivo |
|---|---|---|---|---|
| `/login` | Inicio de sesión a pantalla completa (marca + formulario, recordar sesión, errores 401/403, cuentas demo) | — (pública) | — | `src/pages/LoginPage.tsx` |

Si ya hay sesión válida, `/login` redirige a la ruta solicitada o al dashboard.

## 2. Rutas autenticadas (shell con sidebar + topbar)

Todas cuelgan de `AppShell` (`src/components/layout/AppShell.tsx`): sidebar oscuro colapsable con
iconos lucide, topbar con buscador global (`Ctrl`/`⌘ + K`), campana de notificaciones en vivo, menú
de usuario, breadcrumbs, selector de tema claro/oscuro y estado del canal de tiempo real.

| Ruta | Pantalla | Permiso de vista | Permisos de acción | Archivo |
|---|---|---|---|---|
| `/` | **Dashboard**: KPIs (clientes activos, expedientes abiertos, tareas vencidas, ingresos del mes, pedidos por estado), ventas 12 meses, embudo de leads, últimas gestiones y solicitudes pendientes con actualización en vivo | `reports.view` | `clients.create` (botón «Nuevo cliente») | `src/pages/DashboardPage.tsx` |
| `/clientes` | **Clientes (CRM)**: listado con filtros por estado, tipo, responsable, etiquetas y origen; búsqueda, orden, paginación y exportación CSV | `clients.view` | `clients.create` | `src/pages/clients/ClientsPage.tsx` |
| `/clientes/nuevo` | **Alta de cliente** (con opción de crear expediente inicial) | `clients.view` | `clients.create` | `src/pages/clients/ClientNewPage.tsx` |
| `/clientes/:id` | **Ficha de cliente** con pestañas: Datos, Contactos, Interacciones (llamada/reunión/nota con recordatorio), Expedientes, Documentos, Pedidos, Mensajes y Timeline; asignación de responsable, cambio de estado, etiquetas y «convertir en expediente» | `clients.view` | `clients.edit`, `clients.assign`, `cases.create`, `documents.create`, `messages.send`, `clients.delete` | `src/pages/clients/ClientDetailPage.tsx` |
| `/expedientes` | **Expedientes y casos**: listado por estado, materia, ente, responsable, prioridad y vencimiento (incluye filtro «solo vencidos») | `cases.view` | `cases.create` | `src/pages/cases/CasesPage.tsx` |
| `/expedientes/nuevo` | **Alta de expediente** (código automático `GH-EXP-AAAA-0000`) | `cases.view` | `cases.create` | `src/pages/cases/CaseNewPage.tsx` |
| `/expedientes/tablero` | **Tablero kanban** por estado con arrastrar y soltar: al mover una tarjeta se cambia el estado, se registra el evento y se notifica | `cases.view` | `cases.edit` (arrastre habilitado solo con permiso) | `src/pages/cases/CaseBoardPage.tsx` |
| `/expedientes/:id` | **Detalle de expediente**: cabecera (código, cliente, materia, ente SUGEF/ACAM/ATV/CCSS/INS/MEIC/MAG/ICT/Municipalidad, nº de referencia, prioridad, progreso %) y pestañas **Tareas** (CRUD, asignar, fechas, completar, visibles al cliente), **Timeline/actuaciones**, **Documentos** y **Mensajes con el cliente**; cambio de estado con nota que dispara evento + notificación | `cases.view` | `cases.edit`, `cases.assign`, `documents.create`, `messages.send` | `src/pages/cases/CaseDetailPage.tsx` |
| `/documentos` | **Documentos**: subida múltiple con drag & drop (PDF/imagen/Office, máx. 25 MB), categorías, visibilidad al cliente, versionado, previsualización en modal y descarga | `documents.view` | `documents.create`, `documents.delete` | `src/pages/documents/DocumentsPage.tsx` |
| `/catalogo` | **Catálogo**: los 62 servicios reales del sitio (4 categorías) con CRUD, precios USD, destacados, activo/inactivo, requiere expediente, imagen y editor de descripción | `catalog.view` | `catalog.create`, `catalog.edit`, `catalog.delete` | `src/pages/catalog/CatalogPage.tsx` |
| `/catalogo/categorias` | **Categorías del catálogo** (servicios contables, legales, municipales y tributarios) con CRUD | `catalog.view` | `catalog.create`, `catalog.edit`, `catalog.delete` | `src/pages/catalog/CatalogCategoriesPage.tsx` |
| `/pedidos` | **Pedidos**: listado con filtros por estado, cliente y pagados/pendientes; exportación CSV | `orders.view` | — | `src/pages/orders/OrdersPage.tsx` |
| `/pedidos/:id` | **Detalle de pedido**: ítems con expediente generado, datos de facturación, pagos asociados con request/response crudos y acciones *marcar pagado*, *generar expediente desde el pedido*, *cambiar estado* y *reembolsar* | `orders.view` | `orders.edit` | `src/pages/orders/OrderDetailPage.tsx` |
| `/pagos` | **Pagos**: transacciones de la pasarela simulada (método, estado, referencia, autorización, últimos 4 dígitos) + detalle con request/response crudos y datos del pedido | `payments.view` | `payments.export` | `src/pages/payments/PaymentsPage.tsx` |
| `/cotizaciones` | **Cotizaciones**: bandeja del formulario web con estados nueva/contactada/cotizada/convertida/descartada y conversión en cliente | `quotes.view` | `quotes.edit`, `quotes.approve` | `src/pages/quotes/QuotesPage.tsx` |
| `/solicitudes` | **Solicitudes de cuenta**: bandeja con contador, detalle del solicitante, filtros por estado y fecha y **aprobar / rechazar con motivo** (al aprobar se crea el usuario Cliente) | `accountrequests.view` | `accountrequests.approve` | `src/pages/accountRequests/AccountRequestsPage.tsx` |
| `/usuarios` | **Usuarios**: CRUD, roles múltiples, cambio de estado (activar/suspender/rechazar), restablecimiento de contraseña y últimos accesos | `users.view` | `users.create`, `users.edit`, `users.delete` | `src/pages/users/UsersPage.tsx` |
| `/roles` | **Roles y permisos**: matriz de permisos por módulo/acción con checkboxes, crear/editar/borrar roles no-sistema y los 6 roles semilla (SuperAdmin, Admin, Abogado, Contador, Asistente, Cliente) | `roles.view` | `roles.create`, `roles.edit`, `roles.delete` | `src/pages/roles/RolesPage.tsx` |
| `/informes` | **Informes**: ventas por mes/categoría/servicio, expedientes por estado/materia/ente, productividad por profesional y tareas vencidas, con exportación CSV por pestaña | `reports.view` | `reports.export` | `src/pages/reports/ReportsPage.tsx` |
| `/ajustes` | **Ajustes**: datos de la empresa, marca (colores con vista previa), monedas y tipo de cambio USD→CRC, plantillas de notificación, plantillas de mensajes y parámetros de la pasarela simulada | `settings.view` | `settings.edit` | `src/pages/settings/SettingsPage.tsx` |
| `/auditoria` | **Auditoría**: log de acciones con filtros por usuario, entidad y rango de fechas, y diff antes/después en modal | `settings.view` | — | `src/pages/audit/AuditPage.tsx` |
| `/sin-permiso` | Pantalla de **Acceso denegado** (muestra el permiso faltante) | — | — | `src/components/layout/guards.tsx` |
| `*` | Pantalla **404** (ruta inexistente) | — | — | `src/components/layout/guards.tsx` |

## 3. Rutas de API consumidas por el panel

El panel habla con `VITE_API_URL` (por defecto `/ghcontadores/api/v1`) y en modo mock con el
adaptador de `src/api/mock/router.ts`, que implementa exactamente las rutas de
`docs/03-contrato-api.md §4`. Además del panel de administración, el adaptador cubre también las
rutas públicas y de cliente que necesitan las pantallas auxiliares:

| Grupo | Rutas |
|---|---|
| Autenticación | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/forgot-password`, `POST /auth/reset-password`, `POST /auth/change-password`, `GET /auth/me` |
| Público | `GET /public/site`, `GET /public/catalog/categories`, `GET /public/catalog/products`, `GET /public/catalog/products/{slug}`, `POST /public/account-requests`, `GET /public/account-requests/status`, `POST /public/quotes`, `GET /health` |
| Dashboard | `GET /admin/dashboard/summary` |
| Clientes | `GET/POST /admin/clients`, `GET/PUT/DELETE /admin/clients/{id}`, `GET/POST /admin/clients/{id}/contacts`, `DELETE …/contacts/{contactId}`, `GET/POST …/interactions`, `PATCH …/interactions/{interactionId}`, `GET /admin/clients/{id}/timeline` |
| Expedientes | `GET/POST /admin/cases`, `GET/PUT /admin/cases/{id}`, `PATCH /admin/cases/{id}/status`, `GET/POST /admin/cases/{id}/tasks`, `PATCH/DELETE …/tasks/{taskId}`, `GET /admin/cases/{id}/events` |
| Mensajes | `GET/POST /admin/messages` |
| Documentos | `GET/POST /admin/documents`, `DELETE /admin/documents/{id}`, `GET /admin/documents/{id}/versions` |
| Catálogo | `GET/POST/PUT/DELETE /admin/catalog/products[/{id}]`, `GET/POST/PUT/DELETE /admin/catalog/categories[/{id}]` |
| Pedidos | `GET /admin/orders`, `GET /admin/orders/{id}`, `PATCH /admin/orders/{id}/status`, `POST /admin/orders/{id}/refund`, `POST /admin/orders/{id}/create-case` |
| Pagos | `GET /admin/payments`, `GET /admin/payments/{id}` |
| Solicitudes | `GET /admin/account-requests`, `GET …/{id}`, `POST …/{id}/approve`, `POST …/{id}/reject` |
| Cotizaciones | `GET /admin/quotes`, `PATCH /admin/quotes/{id}`, `POST /admin/quotes/{id}/convert` |
| Usuarios y roles | `GET/POST /admin/users`, `GET/PUT /admin/users/{id}`, `PATCH …/{id}/status`, `PUT …/{id}/roles`, `POST …/{id}/reset-password`, `GET/POST/PUT/DELETE /admin/roles`, `PUT /admin/roles/{id}/permissions`, `GET /admin/permissions` |
| Informes | `GET /admin/reports/sales`, `GET /admin/reports/cases`, `GET /admin/reports/productivity` |
| Ajustes y auditoría | `GET/PUT /admin/settings`, `GET /admin/audit` |
| Notificaciones | `GET /admin/notifications`, `POST /admin/notifications/{id}/read`, `POST /admin/notifications/read-all`, `POST /admin/notifications/send` |
| Tiempo real | SignalR `/hubs/realtime` (o `MockRealtime` + polling cada 15 s cuando `VITE_USE_MOCKS=true`) |

## 4. Cómo se calculan los permisos

```ts
// Permiso simple
const can = useCan()
can('clients.create')            // true/false

// Varios permisos y estado del usuario
const { can, canAny, canAll, roles, isSuperAdmin } = usePermission()
canAny(['cases.edit', 'cases.assign'])

// Ocultar una acción en el JSX
<PermissionGate permission="settings.edit">…</PermissionGate>

// Guarda de ruta (igual que en App.tsx)
<ProtectedRoute permission="users.view"><UsersPage /></ProtectedRoute>
```

Reglas aplicadas:

1. `SuperAdmin` pasa cualquier comprobación.
2. `permissions[]` del login se compara con el código `modulo.accion`.
3. Se admite comodín por módulo (`cases.*`).
4. La tabla de permisos por ruta vive en `src/config/routes.ts` (`routeViewPermission` y
   `routePermissions`) y es la misma fuente usada por el menú lateral.
