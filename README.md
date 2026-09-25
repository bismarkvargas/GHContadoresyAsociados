# GH Contadores y Asociados — Plataforma de gestión contable-legal

Sistema completo para **GH Contadores & Asociados** (Huacas, Santa Cruz, Guanacaste, Costa Rica):
panel de administración web, API y aplicación móvil híbrida con tienda de servicios.

> Catálogo: los **62 servicios reales** de <https://www.ghcontadores.net/category/servicios> se
> migran como datos por defecto (precios en USD) y se administran desde el panel.

## Componentes

| Carpeta | Qué es | Tecnología |
|---|---|---|
| `api/` | API REST + tiempo real + push | .NET 8 · EF Core · MySQL 8 · JWT · SignalR · FCM |
| `admin-web/` | Panel de administración | React 18 · TypeScript · Vite · Tailwind · TanStack Query |
| `app-movil/` | App híbrida con ecommerce | Flutter 3 · Riverpod · go_router · Dio · Firebase Messaging |
| `tools/catalog-import/` | Migración del catálogo real | Node.js (crawler + normalizador) |
| `docs/` | Análisis, modelo de datos y contrato de API | Markdown |
| `deploy/` | Despliegue en `demostracion.es` | Nginx · systemd · scripts |

## Documentación

1. [`docs/01-analisis-mercado.md`](docs/01-analisis-mercado.md) — auditoría del sitio actual, competencia, huecos, tokens de marca y navegación del app.
2. [`docs/02-modelo-datos.md`](docs/02-modelo-datos.md) — modelo de datos completo (entidades, enums, índices, permisos por rol).
3. [`docs/03-contrato-api.md`](docs/03-contrato-api.md) — contrato de API compartido entre api, admin y app.
4. [`docs/04-despliegue.md`](docs/04-despliegue.md) — puesta en producción en `https://demostracion.es/ghcontadores/`.

## Entorno desplegado

| Servicio | URL |
|---|---|
| Panel de administración | <https://demostracion.es/ghcontadores/> |
| API REST | `https://demostracion.es/ghcontadores/api/v1` |
| Tiempo real (SignalR) | `wss://demostracion.es/ghcontadores/hubs/realtime` |
| Documentación interactiva | <https://demostracion.es/ghcontadores/swagger> |
| Estado del servicio | <https://demostracion.es/ghcontadores/health> |

Despliegue y verificación: `bash deploy/deploy.sh` (en el servidor) · `bash deploy/smoke-test.sh` ·
`node tools/realtime-test/realtime-test.mjs` · `node tools/e2e-admin/e2e-admin.mjs`.

## Funcionalidad principal

- **CRM de clientes**: alta, estados, etiquetas, responsable, contactos, interacciones con recordatorios y línea de tiempo unificada.
- **Expedientes y casos** con materia (contable, tributario, legal, municipal), ente (SUGEF, ACAM, ATV, CCSS, INS, MEIC, MAG, ICT, municipalidad), nº de referencia, progreso, responsable, tareas, actuaciones y vencimientos.
- **Documentos**: subida y descarga de PDFs y anexos por cliente y expediente, con versionado, visibilidad al cliente y enlaces firmados.
- **Tienda**: catálogo migrado, carrito, checkout y **pasarela de pago simulada** (aprobado / rechazado / pendiente).
- **Solicitudes de cuenta**: cualquiera puede solicitar registro desde el app; aparece en el panel y **solo el administrador activa la cuenta**.
- **Roles y permisos granulares** (SuperAdmin, Admin, Abogado, Contador, Asistente, Cliente) aplicados en el panel y en el app.
- **Tiempo real**: lo que el administrador gestiona se refleja en el app sin recargar (SignalR + respaldo por sondeo).
- **Notificaciones push** con Firebase Cloud Messaging por evento de proceso y con preferencias por tipo.

## Arranque rápido

```bash
# API (requiere MySQL 8)
cd api
dotnet restore
dotnet run --project src/GH.Api          # http://localhost:5080 · Swagger en /swagger

# Panel de administración
cd admin-web
npm install
npm run dev                               # http://localhost:5173

# App móvil
cd app-movil
flutter pub get
flutter run
```

## Accesos de demostración

| Rol | Correo | Contraseña |
|---|---|---|
| SuperAdmin | `admin@ghcontadores.net` | `Gh.Admin2026` |
| Administración | `gerencia@ghcontadores.net` | `Gh.Gerencia2026` |
| Abogado | `abogado@ghcontadores.net` | `Gh.Abogado2026` |
| Contador | `contador@ghcontadores.net` | `Gh.Contador2026` |
| Asistente | `asistente@ghcontadores.net` | `Gh.Asistente2026` |
| Cliente (app) | `cliente@demo.cr` | `Gh.Cliente2026` |

Tarjetas de la pasarela simulada: `4242 4242 4242 4242` (aprobado) · `4000 0000 0000 0002` (rechazado) · `4000 0000 0000 9995` (pendiente).

---

© GH Contadores & Asociados · Ruta Nacional Secundaria 155, Huacas, Santa Cruz, Guanacaste, Costa Rica · +506 2653 6634
