# Contrato de API — GH Contadores y Asociados

Base: **`/api/v1`** · Formato: JSON UTF-8 · Auth: `Authorization: Bearer <accessToken>` (JWT HS256, 60 min) + `refreshToken` (30 días, rotativo).
Errores: `application/problem+json` (RFC 7807) con `traceId` y `errors{}` de validación.
Listados: `?page=1&pageSize=20&sort=field&order=asc|desc` → `{ "items": [...], "total": n, "page": 1, "pageSize": 20, "totalPages": n }`.
Fechas: ISO-8601 UTC (`2026-02-14T18:30:00Z`). Dinero: número decimal + `currency`.
Idempotencia de compra: cabecera `Idempotency-Key` en `POST /me/orders`.
Swagger vivo en `/swagger`. Esta tabla es el contrato de referencia entre api ↔ admin ↔ app.

## 1. Público (sin token)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/public/site` | Marca, contactos, monedas, tipos de cambio, textos legales |
| GET | `/public/catalog/categories` | Categorías con conteo de servicios |
| GET | `/public/catalog/products` | Filtros: `category`, `search`, `featured`, `minPrice`, `maxPrice`, paginado |
| GET | `/public/catalog/products/{slug}` | Ficha completa + relacionados |
| POST | `/public/account-requests` | Solicitud de cuenta desde el app (nombre, email, teléfono, cédula, tipo, mensaje) |
| GET | `/public/account-requests/status` | `?email=` → `{ status, rejectionReason, trackingCode }` |
| POST | `/public/quotes` | Cotización (formulario web/app) |
| GET | `/public/files/{token}` | Descarga de documento con token firmado (HMAC, 15 min) |
| GET | `/health` | Estado de la API y de la base de datos |

## 2. Autenticación

| Método | Ruta | Cuerpo / Respuesta |
|---|---|---|
| POST | `/auth/login` | `{email, password}` → `{accessToken, refreshToken, expiresAt, user{id,fullName,email,avatarUrl,status,isStaff,clientId}, roles[], permissions[]}` |
| POST | `/auth/refresh` | `{refreshToken}` → mismo payload (rotación) |
| POST | `/auth/logout` | `{refreshToken}` → 204 |
| POST | `/auth/forgot-password` | `{email}` → 202 |
| POST | `/auth/reset-password` | `{email, token, newPassword}` |
| POST | `/auth/change-password` | `{currentPassword, newPassword}` |
| GET | `/auth/me` | Perfil + roles + permisos efectivos |

`401` si el token expira o el usuario no está `Active`; `403` si falta el permiso `modulo.accion` (política `Permission:xxx`).

## 3. Cliente del app (`/me`)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/me/dashboard` | Contadores + últimas novedades (expedientes, tareas, documentos, pedidos) |
| GET/PUT | `/me/profile` | Datos personales y fiscales |
| GET | `/me/cases` · `/me/cases/{id}` · `/me/cases/{id}/timeline` | Expedientes visibles para el cliente |
| GET | `/me/tasks` · POST `/me/tasks/{id}/complete` | Tareas que el cliente debe completar |
| GET | `/me/documents` · POST `/me/documents` (multipart) | Documentos del cliente (subida permitida por categoría) |
| GET | `/me/messages` · POST `/me/messages` | Mensajería con la firma |
| GET | `/me/cart` · POST `/me/cart/items` · PATCH `/me/cart/items/{id}` · DELETE `/me/cart/items/{id}` | Carrito del app |
| POST | `/me/orders` | Checkout: `{items|cartId, customer, requiresInvoice, invoice{...}}` → orden `PendingPayment` |
| POST | `/me/orders/{id}/pay` | Pasarela simulada: `{method, card{number,exp,cvv,holder} | reference}` → resultado `Approved|Declined|Pending` |
| GET | `/me/orders` · `/me/orders/{id}` | Historial y detalle |
| GET | `/me/notifications` · POST `/me/notifications/{id}/read` · POST `/me/notifications/read-all` | Bandeja in-app |
| GET/PUT | `/me/notification-preferences` | Preferencias por tipo |
| POST | `/me/devices` · DELETE `/me/devices/{token}` | Alta/baja de token FCM (`{token, platform, deviceModel, appVersion}`) |

## 4. Administración (`/admin`, requiere permiso)

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/admin/dashboard/summary` | `reports.view` |
| GET/POST/PUT/DELETE | `/admin/clients` `/admin/clients/{id}` | `clients.*` |
| GET/POST | `/admin/clients/{id}/contacts` · `/admin/clients/{id}/interactions` | `clients.view/edit` |
| GET | `/admin/clients/{id}/timeline` | `clients.view` |
| GET/POST/PUT/DELETE | `/admin/cases` `/admin/cases/{id}` | `cases.*` |
| PATCH | `/admin/cases/{id}/status` | `cases.edit` (emite evento + push) |
| GET/POST/PATCH/DELETE | `/admin/cases/{id}/tasks` `/admin/cases/{id}/tasks/{taskId}` | `cases.edit` |
| GET | `/admin/cases/{id}/events` | `cases.view` |
| GET | `/admin/documents` · POST `/admin/documents` · DELETE `/admin/documents/{id}` | `documents.*` |
| GET/POST/PUT/DELETE | `/admin/catalog/products` `/admin/catalog/products/{id}` | `catalog.*` |
| GET/POST/PUT | `/admin/catalog/categories` | `catalog.*` |
| GET | `/admin/orders` · GET `/admin/orders/{id}` | `orders.view` |
| PATCH | `/admin/orders/{id}/status` · POST `/admin/orders/{id}/refund` | `orders.edit` |
| GET | `/admin/orders/{id}/create-case` (POST) | `orders.edit` ⇒ genera expediente + tareas |
| GET | `/admin/payments` | `payments.view` |
| GET | `/admin/account-requests` · POST `/admin/account-requests/{id}/approve` · `/reject` | `accountrequests.*` |
| GET | `/admin/quotes` · POST `/admin/quotes/{id}/convert` | `quotes.*` |
| GET/POST/PUT | `/admin/users` `/admin/users/{id}` · PATCH `/admin/users/{id}/status` · PUT `/admin/users/{id}/roles` | `users.*` |
| GET/POST/PUT/DELETE | `/admin/roles` · PUT `/admin/roles/{id}/permissions` · GET `/admin/permissions` | `roles.*` |
| GET | `/admin/reports/sales` · `/admin/reports/cases` · `/admin/reports/productivity` | `reports.view` |
| GET/PUT | `/admin/settings` | `settings.*` |
| GET | `/admin/audit` | `settings.view` |
| GET | `/admin/notifications` (reenviar) POST `/admin/notifications/send` | `notifications.send` |

## 5. Tiempo real

- **SignalR** en `/hubs/realtime` (JWT por `access_token` en query string).
- Grupos: `user:{userId}` (cada cliente/staff), `staff` (todos los `IsStaff`), `case:{caseFileId}`.
- Eventos servidor→cliente: `notification`, `case.updated`, `case.event`, `task.assigned`, `task.completed`, `document.added`, `order.updated`, `payment.updated`, `message.created`, `accountrequest.created`, `client.updated`.
- El app y el admin se suscriben a `user:{id}` (y el admin además a `staff`): **toda gestión del admin sobre un cliente se refleja sin recargar**.
- Fallback: `GET /me/notifications?since=` para clientes con la conexión caída (reconexión automática con backoff).

## 6. Push (Firebase Cloud Messaging)

- `POST /me/devices` registra el token; la API guarda `DeviceTokens` por usuario y plataforma.
- Envío por HTTP v1 de FCM usando cuenta de servicio (`Firebase:ServiceAccountJson`). Sin credenciales configuradas, la API registra la notificación como `InApp` y la entrega por SignalR (modo desarrollo).
- Tipos: `AccountApproved`, `AccountRejected`, `CaseCreated`, `CaseStatusChanged`, `TaskAssigned`, `TaskDueSoon`, `TaskCompleted`, `DocumentAvailable`, `OrderPaid`, `OrderStatusChanged`, `PaymentFailed`, `MessageReceived`, `System`.
- Payload de datos estándar: `{ type, entityId, caseFileId?, orderId?, deepLink, title, body }` ⇒ el app navega con `deepLink`.

## 7. Matriz de estados (compartida por API, admin y app)

- **User**: `Pending → Active → Suspended`; `Pending → Rejected`.
- **AccountRequest**: `Pending → Approved | Rejected | Cancelled`.
- **Client**: `Lead → Active → Inactive | Blocked`.
- **CaseFile**: `Open → InProgress → WaitingClient → Completed → Closed` (+`OnHold`, `Cancelled`).
- **CaseTask**: `Todo → InProgress → Done` (+`Blocked`, `Cancelled`).
- **Order**: `PendingPayment → Paid → InProcess → Completed` (+`Cancelled`, `Refunded`).
- **Payment**: `Initiated → Approved | Declined | Pending` (+`Refunded`).
