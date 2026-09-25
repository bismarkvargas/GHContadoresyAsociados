# Modelo de datos — GH Contadores y Asociados

Motor: **MySQL 8** (`utf8mb4` / `utf8mb4_0900_ai_ci`), EF Core code-first, `DateTime` en UTC, soft-delete con `IsDeleted` en agregados de negocio.

## Diagrama de relaciones (texto)

```
AccountRequest ──aprueba──▶ User ◀──UserRole──▶ Role ◀──RolePermission──▶ Permission
                             │                                              ▲
                             ├──RefreshToken / DeviceToken / NotificationPreference
                             ├──Notification
                             │
                             ├──(1:1 opcional) Client  ──▶ ClientContact
                             │                     ──▶ ClientInteraction
                             │                     ──▶ CaseFile ──▶ CaseTask
                             │                                │   ──▶ CaseEvent (timeline)
                             │                                │   ──▶ Document
                             │                                │   ──▶ Message
                             │                                └──▶ (OrderItem origen)
                             ├──Cart ──▶ CartItem ──▶ Product
                             └──Order ──▶ OrderItem ──▶ Product ──▶ ProductCategory
                                       └──▶ Payment
QuoteRequest ──convertir──▶ Client
AuditLog / Setting / EntityCounter
```

## 1. Identidad y seguridad

### `Users`
| Campo | Tipo | Notas |
|---|---|---|
| Id | char(36) PK | GUID |
| Email | varchar(256) UNIQUE | login |
| PasswordHash | varchar(512) | PBKDF2 (ASP.NET Identity hasher) |
| FullName, Phone, IdNumber | varchar(200/40/40) | |
| Status | enum | `Pending=0, Active=1, Suspended=2, Rejected=3` |
| IsStaff | bool | true ⇒ usuario de la firma (admin/abogado/contador) |
| ClientId | char(36) NULL FK→Clients | solo clientes del app |
| AvatarUrl, Locale, TimeZone | varchar | por defecto `es-CR`, `America/Costa_Rica` |
| LastLoginAt, CreatedAt, UpdatedAt | datetime(6) | UTC |
| FailedLoginCount, LockoutUntil | int/datetime NULL | bloqueo tras 5 intentos |

Regla: **todo** usuario creado por solicitud nace `Pending`; solo el admin lo pone `Active`. Los usuarios semilla `IsStaff=true` nacen `Active`.

### `Roles`
`Id, Name (UNIQUE), Description, IsSystem (bool), IsStaffRole (bool), CreatedAt`
Semilla: `SuperAdmin`, `Admin`, `Abogado`, `Contador`, `Asistente`, `Cliente`.

### `Permissions`
`Id, Code (UNIQUE, `modulo.accion`), Module, Action, Description`
Catálogo (semilla, 60+): `clients.*`, `cases.*`, `documents.*`, `catalog.*`, `orders.*`, `payments.*`, `accountrequests.*`, `users.*`, `roles.*`, `reports.*`, `settings.*`, `quotes.*`, `messages.*`, `notifications.*` con acciones `view, create, edit, delete, approve, export, assign`.

### `RolePermissions` (`RoleId`, `PermissionId`) · `UserRoles` (`UserId`, `RoleId`)
### `RefreshTokens`
`Id, UserId, TokenHash (UNIQUE), ExpiresAt, RevokedAt, ReplacedByTokenHash, CreatedByIp, UserAgent, CreatedAt`
### `DeviceTokens`
`Id, UserId, Token (UNIQUE), Platform (android|ios|web), DeviceModel, AppVersion, IsActive, LastSeenAt`
### `NotificationPreferences`
`Id, UserId, Type (enum NotificationType), Push, InApp, Email`

## 2. Solicitudes de cuenta (onboarding del app)

### `AccountRequests`
`Id, FullName, Email, Phone, IdNumber, ClientType, Company, Message, Source (app|web|admin), Status (Pending|Approved|Rejected|Cancelled), ReviewedByUserId FK→Users NULL, ReviewedAt, RejectionReason, CreatedUserId FK→Users NULL, IpAddress, CreatedAt`
- Al **aprobar**: se crea `User` (rol `Cliente`, estado `Active`) + `Client` vinculado, y se emite push + notificación in-app.
- Al **rechazar**: solo cambia estado y guarda motivo (no se crea usuario).
- El admin ve el listado con contador en el dashboard; el app consulta su estado por `email` + código de seguimiento.

## 3. CRM

### `Clients`
`Id, Code (UNIQUE, `GH-CLI-00001`), ClientType (Individual|Company|ForeignInvestor), LegalName, TradeName, IdNumber (cédula/NIT/pasaporte), Email, Phone, Whatsapp, Address, Province, Canton, District, Country (CR), Status (Lead|Active|Inactive|Blocked), Source (app|web|whatsapp|referral|walkin|campaign), AssignedToUserId FK→Users NULL, TagsCsv, Notes, UserId FK→Users NULL (cuenta del app), CreatedAt, UpdatedAt, IsDeleted`
### `ClientContacts`
`Id, ClientId, FullName, Position, Email, Phone, IsPrimary`
### `ClientInteractions`
`Id, ClientId, Type (Call|Email|Meeting|Whatsapp|Note|Task|System), Subject, Notes, OccurredAt, ReminderAt NULL, IsCompleted, CreatedByUserId`

## 4. Expedientes y casos

### `CaseFiles`
| Campo | Notas |
|---|---|
| Id, Code UNIQUE | `GH-EXP-2026-0001` (contador por año) |
| ClientId FK | obligatorio |
| Title, Description | |
| Matter | `Contable, Tributario, Legal, Municipal, Laboral, Otro` |
| Entity | SUGEF, ACAM, ATV, CCSS, INS, MEIC, MAG, ICT, Municipalidad, RTBF, Otro |
| ReferenceNumber | número de trámite/expediente del ente |
| Status | `Open, InProgress, WaitingClient, OnHold, Completed, Closed, Cancelled` |
| Priority | `Low, Normal, High, Urgent` |
| ResponsibleUserId, OpenedAt, DueAt, ClosedAt | |
| AgreedAmount, Currency | precio pactado (del pedido o manual) |
| ProgressPercent | 0–100, editable o derivado de tareas |
| ClientVisible | bool — si el cliente lo ve en el app |
| OrderItemId NULL | origen comercial |

### `CaseTasks`
`Id, CaseFileId, Title, Description, Status (Todo|InProgress|Done|Blocked|Cancelled), Priority, DueAt, CompletedAt, AssignedToUserId, CreatedByUserId, SortOrder, ClientVisible`
### `CaseEvents` (timeline inmutable, alimenta el tiempo real)
`Id, CaseFileId, Type (Created|StatusChanged|TaskAdded|TaskCompleted|DocumentAdded|MessageAdded|PaymentReceived|Note|DueDateChanged), Title, Description, ActorUserId NULL (NULL = sistema), ClientVisible, MetadataJson, CreatedAt`
### `Messages`
`Id, CaseFileId NULL, ClientId, SenderUserId, Body, AttachmentDocumentId NULL, IsFromClient, ReadByStaffAt, ReadByClientAt, CreatedAt`

## 5. Documentos

### `Documents`
`Id, ClientId NULL, CaseFileId NULL, OrderId NULL, Category (Expediente|Identidad|Contable|Tributario|Legal|Municipal|Contrato|Comprobante|Otro), FileName (almacenado), OriginalName, ContentType, SizeBytes, StoragePath (relativo), Sha256, Version, IsCurrent, UploadedByUserId, UploadedAt, ClientVisible, IsDeleted`
- Almacenamiento en disco `api/storage/documents/{yyyy}/{MM}/`, servido por endpoint autenticado con URL firmada (HMAC, 15 min) — nunca exposición directa de la carpeta.
- Validación: solo `application/pdf`, `image/png`, `image/jpeg`, `application/vnd.openxmlformats-officedocument.*`, `application/msword`; máx. 25 MB por archivo.

## 6. Catálogo

### `ProductCategories`
`Id, Slug UNIQUE, Name, Description, IconName, SortOrder, IsActive, ImageUrl`
Semilla: `servicios-contables`, `servicios-legales`, `servicios-municipales`, `servicios-tributarios`.
### `Products`
`Id, Sku UNIQUE, Slug UNIQUE, Name, ShortDescription, Description, Price decimal(12,2), Currency (USD), TaxRate decimal(5,2), CategoryId FK, ImageUrl, GalleryJson, IsActive, IsFeatured, RequiresCase bool, DeliveryMode (Digital|Presencial|Mixto), EstimatedDays int NULL, SortOrder, SourceUrl, SeoTitle, SeoDescription, CreatedAt, UpdatedAt, IsDeleted`
### `ProductPrices` *(histórico simple)*
`Id, ProductId, Price, Currency, ValidFrom, CreatedByUserId`

## 7. Venta

### `Carts` / `CartItems`
`Carts: Id, UserId UNIQUE(activo), Status (Active|Converted|Abandoned), CreatedAt, UpdatedAt`
`CartItems: Id, CartId, ProductId, Quantity, UnitPrice, NotesJson, AddedAt`
### `Orders`
`Id, Number UNIQUE (`GH-ORD-2026-00001`), UserId, ClientId NULL, Status (PendingPayment|Paid|InProcess|Completed|Cancelled|Refunded), Subtotal, Discount, Tax, Total, Currency, Notes, RequiresInvoice, InvoiceDataJson, CreatedAt, PaidAt, CompletedAt`
### `OrderItems`
`Id, OrderId, ProductId, NameSnapshot, UnitPrice, Quantity, Total, CaseFileId NULL (expediente generado)`
### `Payments` (pasarela simulada)
`Id, OrderId, Provider (`GH-Simulated`), Method (Card|Sinpe|Transfer), Status (Initiated|Approved|Declined|Pending|Refunded), Amount, Currency, Reference UNIQUE, AuthorizationCode, CardBrand, CardLast4, CardHolder, FailureReason, RawRequestJson, RawResponseJson, CreatedAt, ProcessedAt`
- Tarjetas de prueba: `4242 4242 4242 4242` ⇒ aprobado · `4000 0000 0000 0002` ⇒ rechazado · `4000 0000 0000 9995` ⇒ pendiente.

## 8. Soporte

### `QuoteRequests` (formulario de cotizaciones del sitio)
`Id, FullName, Email, Phone, Company, ServiceId NULL, Message, Status (New|Contacted|Quoted|Converted|Discarded), HandledByUserId NULL, ClientId NULL, CreatedAt`
### `Notifications`
`Id, UserId, Title, Body, Type (enum), DataJson, Channel (Push|InApp|Email), Status (Queued|Sent|Failed|Read), FcmMessageId, Error, CreatedAt, SentAt, ReadAt`
### `AuditLogs`
`Id, UserId NULL, Action, EntityName, EntityId, BeforeJson, AfterJson, IpAddress, UserAgent, CreatedAt`
### `Settings`
`Key PK, Value, Group, Description, UpdatedAt` — incluye marca, contactos, moneda, tipo de cambio USD→CRC, textos legales, horas de recordatorio.
### `EntityCounters`
`Key PK (ej. `case-2026`), Value` — numeración atómica de códigos.
### `Notifications` de tareas programadas
`ReminderJobs` lógicos: vencimiento de tareas y expedientes (job diario) ⇒ `Notification` + push.

## Índices clave

- `Users(Email)` UNIQUE · `Users(Status, IsStaff)`
- `Clients(Code)` UNIQUE · `Clients(UserId)` · `Clients(Status, AssignedToUserId)` · FULLTEXT(`LegalName, IdNumber, Email, Phone`)
- `CaseFiles(Code)` UNIQUE · `CaseFiles(ClientId, Status)` · `CaseFiles(DueAt)`
- `CaseTasks(CaseFileId, Status)` · `CaseTasks(DueAt, Status)`
- `CaseEvents(CaseFileId, CreatedAt DESC)`
- `Documents(CaseFileId)`, `Documents(ClientId)` · `Payments(OrderId)`, `Payments(Reference)` UNIQUE
- `Notifications(UserId, Status, CreatedAt DESC)` · `AuditLogs(CreatedAt DESC)`

## Permisos por rol (resumen semilla)

| Módulo | SuperAdmin | Admin | Abogado | Contador | Asistente | Cliente |
|---|---|---|---|---|---|---|
| clientes | todo | todo | ver/editar | ver/editar | ver/crear/editar | — (solo su perfil) |
| expedientes | todo | todo | ver/crear/editar/asignar | ver/crear/editar | ver/editar | ver (los suyos) |
| documentos | todo | todo | ver/subir/borrar | ver/subir | ver/subir | ver/subir (los suyos) |
| catálogo | todo | todo | ver | ver | ver | ver |
| pedidos | todo | todo | ver | ver | ver/editar | ver (los suyos) |
| pagos | todo | todo | ver | ver | ver | ver (los suyos) |
| solicitudes | todo | aprobar/rechazar/ver | — | — | ver | — |
| usuarios/roles | todo | todo | — | — | — | — |
| ajustes | todo | editar/ver | — | — | — | — |
| informes | todo | ver/exportar | ver | ver | — | — |
