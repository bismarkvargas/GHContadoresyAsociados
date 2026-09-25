# GH Contadores y Asociados — Panel de administración

SPA React del sistema de gestión de la firma **GH Contadores & Asociados** (firma contable y bufete
legal, Huacas, Santa Cruz, Guanacaste, Costa Rica).

Cubre los 14 módulos del sistema (dashboard, CRM, expedientes, documentos, catálogo, pedidos, pagos,
solicitudes de cuenta, cotizaciones, usuarios, roles y permisos, informes, ajustes y auditoría) con
**RBAC real en la interfaz** y **modo mock completo** que permite usar todo el panel sin backend.

- Documentación de referencia: `../docs/01-analisis-mercado.md`, `../docs/02-modelo-datos.md`,
  `../docs/03-contrato-api.md`.
- Rutas del router y permisos que exige cada una: [`RUTAS.md`](./RUTAS.md).

---

## 1. Requisitos

| Componente | Versión mínima | Notas |
|---|---|---|
| Node.js | 20 LTS o superior | Probado con **Node v24.11.0** |
| npm | 10 o superior | Probado con **npm 11.7.0**. **No se usa pnpm ni yarn** |
| Navegador | Chrome/Edge/Firefox/Safari recientes | Requiere `localStorage` para el modo mock |

## 2. Instalación

```powershell
cd C:\bismarkvargas.com\GHContadoresyAsociados\admin-web
npm install
```

## 3. Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo en `http://127.0.0.1:5173/ghcontadores/` |
| `npm run typecheck` | `tsc --noEmit` (debe salir limpio) |
| `npm run build` | `tsc --noEmit && vite build` → genera `dist/` |
| `npm run smoke` | Prueba de humo del contrato mock fuera del navegador (122 comprobaciones: auth, RBAC, paginación, CRUD, versionado, notificaciones, etiquetas, informes, ajustes, 401/404) |
| `npm run preview` | Sirve `dist/` localmente para revisar el build |

> El servidor de desarrollo publica la app bajo el base `/ghcontadores/`, por lo que la URL es
> `http://127.0.0.1:5173/ghcontadores/` (no `/`).

### Verificación en navegador real

En `../tools/e2e-admin` (Playwright ya instalado):

| Script | Qué comprueba |
|---|---|
| `node e2e-admin.mjs` | **Producción**: login escribiendo credenciales, datos reales en los 14 módulos, alta real de cliente contra la API, control de acceso de un Abogado y errores de consola/red |
| `node verificar-local.mjs` | Panel local en modo mock: enlace de campos de formulario, KPIs, alias de rutas y validación en español |
| `node verificar-alta-cliente.mjs` | El alta de cliente navega a la ficha con un identificador **válido** (nunca `/clientes/undefined`) |
| `node verificar-ronda2.mjs` | Campana con el contrato real de notificaciones, rutas con id ausente, etiquetas como arreglo y reenvío |
| `node diagnostico-red.mjs` | Registra todas las respuestas ≥ 400 del panel desplegado |
| `node diagnostico-sesion.mjs` | Ciclo de vida del token y de `/auth/me` al navegar |
| `node diagnostico-alta.mjs` | Respuesta cruda del alta de cliente y URL final |
| `node diagnostico-respuestas.mjs` | Compara varios payloads de alta contra la API real |
| `node diagnostico-formulario.mjs` · `diagnostico-login.mjs` | Diagnóstico del formulario de acceso y de las cuentas demo |
| `node verificar-bundle.mjs` | Comprueba que el `dist/` construido contiene las correcciones y que el modo mock quedó desactivado |

Despliegue en el servidor (`ssh root@2.25.111.177`): `bash /opt/ghcontadores/deploy/deploy.sh`.

## 4. Variables de entorno

Crea un `.env` en la raíz de `admin-web/` (hay un `.env.example` de referencia y un `.env.api`
listo para pegar cuando la API real esté disponible). **El `.env` entregado usa el modo mock**, para
que la demo en `https://demostracion.es/ghcontadores/` funcione sin backend:

| Variable | Valor entregado | Descripción |
|---|---|---|
| `VITE_API_URL` | `/ghcontadores/api/v1` | Base de la API REST (misma ruta que la del panel). |
| `VITE_USE_MOCKS` | `true` | `true` → adaptador en memoria + `localStorage`. `false` → axios habla con `VITE_API_URL`. |
| `VITE_HUB_URL` | `/ghcontadores/hubs/realtime` | Hub **SignalR** de tiempo real. Solo se usa con `VITE_USE_MOCKS=false`. |

```powershell
# Para pasar a la API real
Copy-Item .env.api .env -Force
npm run dev          # o: npm run build
```

## 5. Credenciales demo (modo mock)

Todas las cuentas usan la contraseña indicada; en pantalla de login puede pulsar la tarjeta
correspondiente para autocompletar.

| Correo | Contraseña | Rol | Qué demuestra |
|---|---|---|---|
| `admin@ghcontadores.net` | `Gh.Admin2026` | SuperAdmin | Ve **todo** el menú y todos los botones de acción |
| `gerencia@ghcontadores.net` | `Gh.Gerencia2026` | Administración | Operación completa del despacho |
| `abogado@ghcontadores.net` | `Gh.Abogado2026` | Abogado | **No** ve Usuarios, Roles, Ajustes ni Auditoría; sin botones de borrado en el catálogo |
| `contador@ghcontadores.net` | `Gh.Contador2026` | Contador | Expedientes y documentos, sin gestión de usuarios |
| `asistente@ghcontadores.net` | `Gh.Asistente2026` | Asistente | Clientes, documentos y pedidos; solicitudes en solo lectura |

Estas son **las mismas credenciales que siembra la API en producción**, de modo que el modo demo y el
modo real se comportan igual. La cuenta de cliente del app sembrada por la API es
`cliente@demo.cr` / `Gh.Cliente2026`.

**RBAC en la UI:** los permisos efectivos llegan en la respuesta del login (`permissions[]`) y se
consumen con `usePermission('clients.create')` / `useCan()`; el menú lateral, los botones y las rutas
se ocultan o bloquean según ese arreglo. Compare el menú de `admin@` con el de `abogado@`.

Contraseña de los usuarios Cliente creados al aprobar una solicitud: `Cliente123!`.

### Reiniciar los datos demo

Los datos se persisten en `localStorage` bajo la clave `gh.mock.db.v8`. Para volver al estado
inicial, en la consola del navegador:

```js
localStorage.removeItem('gh.mock.db.v8'); location.reload()
```

## 6. Modo mock y modo API real

### Modo mock (`VITE_USE_MOCKS=true`, por defecto)

- `src/api/mock/db.ts` construye una base en memoria con datos realistas (34 clientes, 58
  expedientes con tareas/timeline/documentos, 46 pedidos, pagos, solicitudes de cuenta,
  cotizaciones, notificaciones y 60 registros de auditoría) y la persiste en `localStorage`.
- `src/api/mock/router.ts` es un adaptador instalado en `axios.defaults.adapter` que intercepta
  **todas** las rutas del contrato (`docs/03-contrato-api.md`) y responde con latencia simulada de
  **150–400 ms**, paginación (`{items,total,page,pageSize,totalPages}`), orden, filtros y errores
  `application/problem+json` (401/403/404/400).
- **Catálogo real**: `public/catalog.seed.json` (copiado de
  `tools/catalog-import/out/catalog.normalized.json`) aporta las **4 categorías** y los **62
  servicios reales** con precios en USD (mín. 16,95 → máx. 960,50). No hay productos inventados.
- La subida de documentos simula el `multipart` (valida MIME y el máximo de **25 MB**) y versiona
  automáticamente cuando el nombre se repite en el mismo expediente.

### Modo API real (`VITE_USE_MOCKS=false`)

1. Levante la API .NET que implementa `docs/03-contrato-api.md`.
2. Ajuste `.env` con `VITE_USE_MOCKS=false`, la URL real de la API y el hub.
3. Si la API vive en otro origen, habilite CORS para el origen del panel y configure el proxy en
   `vite.config.ts` (`server.proxy`) durante el desarrollo.
4. El login guarda `accessToken` (60 min) y `refreshToken` (30 días) y los envía como
   `Authorization: Bearer …`; el rol `SuperAdmin`/`Admin` controla el RBAC igual que en mock.

## 7. Tiempo real

- **Con API real**: cliente **SignalR** (`@microsoft/signalr`) contra `/hubs/realtime`, con el token
  en la query string (`?access_token=…`) y reconexión automática con backoff
  (`[0, 2s, 5s, 10s, 20s]`). Escucha `notification`, `case.updated`, `case.event`, `task.assigned`,
  `task.completed`, `document.added`, `order.updated`, `payment.updated`, `message.created`,
  `accountrequest.created` y `client.updated`.
- **En modo mock**: `MockRealtime` emite eventos periódicamente (cada ~12 s) y **muta la misma base
  en memoria** que consume la UI, de modo que el dashboard, el tablero kanban y la campana de
  notificaciones se mueven solos. Además hay **polling de respaldo cada 15 s**.
- El estado del canal se muestra en la topbar (`En vivo (mock)` / `SignalR` / `Sin conexión`).

## 8. Marca

Los tokens están en `src/styles/theme.css` exactamente con los valores de `docs/01 §7` y se
consumen vía clases Tailwind (`bg-primary`, `text-ink`, `border-line`, `bg-surface-2`…) definidas en
`tailwind.config.js`:

```
--gh-primary:#DF3131  --gh-primary-600:#C42121  --gh-primary-50:#FDECEC
--gh-ink:#212121      --gh-ink-700:#3A3A3A      --gh-muted:#646464
--gh-surface:#ECEFF3  --gh-surface-2:#F7F8FA    --gh-border:#E2E5E9
--gh-success:#008250  --gh-warning:#D49341      --gh-danger:#E62214  --gh-info:#116DFF
```

Tipografía del sistema con escala 12/14/16/20/24/32, radios 10 px (controles) y 16 px (tarjetas),
sombra suave única. Los colores se exponen además como canales RGB (`--gh-primary-rgb`) para que
Tailwind pueda aplicar opacidad (`bg-danger/10`) y el **tema claro/oscuro** funcione en caliente.

Datos reales visibles en Ajustes y en el pie del panel: GH Contadores & Asociados · Ruta Nacional
Secundaria 155, Huacas, Santa Cruz, Guanacaste, Costa Rica · +506 2653 6634 · +506 8846 9454 ·
gustavo.ghcontadores@outlook.com · pedidos@ghcontadores.net · moneda base **USD**.

## 9. Despliegue en `/ghcontadores/`

La aplicación se publica en `https://demostracion.es/ghcontadores/` **sin tocar otras vhosts**.
El servidor es un VPS Ubuntu 24.04 con Nginx (ver `../docs/04-despliegue.md`).

### Despliegue real (recomendado)

```bash
ssh root@2.25.111.177
bash /opt/ghcontadores/deploy/deploy.sh
```

El script es idempotente: actualiza el clon de `/opt/ghcontadores`, publica la API, **compila el panel
con `VITE_USE_MOCKS=false`** y lo instala en `/var/www/ghcontadores/admin`, reinicia el servicio y
recarga Nginx. El panel desplegado habla siempre con la API real.

### Detalles que hacen posible el despliegue

1. `vite.config.ts` define `base: '/ghcontadores/'`: los assets se referencian como
   `/ghcontadores/assets/…` y el router usa ese `basename`.
2. **Reescritura de URL (obligatorio)**: el panel usa `BrowserRouter`, de modo que cualquier ruta
   interna debe devolver `index.html`. La configuración vive en
   `/etc/nginx/snippets/ghcontadores.conf` (incluida en el vhost de `demostracion.es`):

   ```nginx
   location /ghcontadores/ {
     alias /var/www/ghcontadores/admin/;
     try_files $uri $uri/ /ghcontadores/index.html;
   }
   location /ghcontadores/api/  { proxy_pass http://127.0.0.1:8095/api/; }
   location /ghcontadores/hubs/ { proxy_pass http://127.0.0.1:8095/hubs/;
                                  proxy_set_header Upgrade $http_upgrade;
                                  proxy_set_header Connection "upgrade"; }
   ```

   Si se desplegara sobre IIS, bastaría con un `web.config` que reescriba a `index.html` excluyendo
   `^/ghcontadores/(api|hubs)/`.

3. La API (.NET) se sirve bajo `/ghcontadores/api/v1` y el hub bajo `/ghcontadores/hubs/realtime` en
   el mismo dominio, por lo que `VITE_API_URL` relativo funciona sin CORS.
4. Tras desplegar, comprobar con `node tools/e2e-admin/e2e-admin.mjs` (29 comprobaciones contra
   producción).

## 10. Estructura del proyecto

```
admin-web/
├─ public/catalog.seed.json     Catálogo real: 4 categorías + 62 servicios (USD)
├─ src/
│  ├─ api/                      Cliente axios, endpoints del contrato, SignalR
│  │  ├─ normalize.ts           Traduce las variantes de la API real al modelo interno
│  │  └─ mock/                  db.ts (seed + persistencia) · router.ts (adaptador) · MockRealtime.ts
│  ├─ components/
│  │  ├─ ui/                    Librería propia: Button, Card, DataTable, Modal, EmptyState…
│  │  ├─ layout/                AppShell (sidebar + topbar), campana, buscador global, guardas
│  │  └─ documents/             Modal de previsualización de documentos
│  ├─ config/routes.ts          Menú + permisos por ruta (fuente de RUTAS.md)
│  ├─ contexts/                 Auth, Tema, Toasts, Realtime
│  ├─ hooks/                    useAuth/usePermission, useApi (tablas y mutaciones), useUi
│  ├─ lib/                      Formato y pickId, etiquetas y tonos, constantes, zod-es
│  ├─ pages/                    Una carpeta por módulo (14 módulos)
│  ├─ styles/theme.css          Tokens de marca
│  ├─ types/index.ts            Modelo de datos completo
│  ├─ App.tsx                   Definición de rutas (alias en inglés → rutas españolas)
│  └─ main.tsx                  Providers: Query, Tema, Toasts, Auth, Realtime, Router
├─ RUTAS.md
└─ README.md
```

## 11. Notas de alcance

- La previsualización de PDF en el modal muestra un marcador en modo mock (no hay archivo físico).
  Con la API real se incrusta la URL firmada HMAC de 15 minutos (`/public/files/{token}`).
- La exportación CSV usa `;` como separador y BOM UTF-8 para que Excel respete los acentos.
- **Normalización de la API**: la API .NET en producción devuelve formas distintas a las del
  contrato de referencia (nombres de campo como `amount`/`total` o `label`/`month`, envoltorios
  `{client,cases,tasks…}` en los detalles, etiquetas ya traducidas `{name,slug,count}` y
  `permissions: ["*"]` para los roles con acceso total). `src/api/normalize.ts` traduce esas
  variantes en el interceptor de axios, de modo que los componentes consumen un único modelo.
  Con `VITE_USE_MOCKS=true` no se aplica, porque el adaptador ya devuelve el modelo interno.
- **Identificadores**: `pickId()` (`src/lib/format.ts`) extrae el id de respuestas envueltas y
  descarta cadenas vacías, `undefined` y `null`; las fichas de cliente, expediente y pedido no
  consultan la API con un id inválido. Es la defensa contra rutas tipo `/clientes/undefined`.
- **Validación**: los mensajes de zod están en español mediante un mapa global
  (`src/lib/zod-es.ts`), así que nunca aparece el «Required» por defecto en inglés.
- **Verificación de entrega**: `npm run build` (con `tsc --noEmit`), `npm run smoke` (107
  comprobaciones del contrato mock), `node tools/e2e-admin/verificar-local.mjs` (17 comprobaciones en
  navegador real contra el panel local) y `node tools/e2e-admin/e2e-admin.mjs` (29 comprobaciones
  contra producción).
