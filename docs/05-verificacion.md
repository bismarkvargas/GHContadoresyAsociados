# Verificación de la entrega — GH Contadores y Asociados

Todo lo que sigue se ha ejecutado **contra el entorno desplegado en producción**
(`https://demostracion.es/ghcontadores/`), no en local y no contra datos simulados.

## Herramientas de verificación incluidas en el repositorio

| Comando | Qué comprueba |
|---|---|
| `bash deploy/smoke-test.sh` | 28 comprobaciones de los flujos de negocio de la API (en el servidor) |
| `node tools/realtime-test/realtime-test.mjs` | 11 comprobaciones de tiempo real por SignalR (WebSocket a través de Nginx) |
| `node tools/e2e-admin/e2e-admin.mjs` | 29 comprobaciones del panel con un navegador real (Playwright) |
| `node tools/demo-data/demo-data.mjs` | Carga clientes, expedientes y tareas representativos del negocio |
| `mysql … < deploy/limpiar-datos-prueba.sql` | Retira los datos que generan las pruebas |
| `dart run tool/verificar_urls.dart` | Comprueba que la app apunta al despliegue correcto (en `app-movil/`) |
| `pwsh -File deploy/verify.ps1` | Lanza las verificaciones desde la estación de trabajo |

## 1. API y flujos de negocio — 28/28

```
1 · Salud de la API                          ✔ API responde 200 en /health
2 · Catálogo público migrado                 ✔ 4 categorías · ✔ 62 servicios (esperado 62)
3 · Solicitud de cuenta desde el app         ✔ creada con código de seguimiento GH-SOL-…
4 · Inicio de sesión del administrador       ✔ login correcto
5 · Aprobación de la solicitud               ✔ cliente GH-CLI-… creado y activado
6 · Inicio de sesión del cliente aprobado    ✔ solo puede entrar tras la aprobación
7 · Compra (carrito → checkout → pago)       ✔ carrito · ✔ acumula cantidades · ✔ pedido GH-ORD-…
                                             ✔ carrito vaciado · ✔ pago aprobado + expediente
                                             ✔ tarjeta de rechazo → Declined
                                             ✔ SINPE Móvil → Pending
                                             ✔ tarjeta en revisión → Pending
8 · Gestión del expediente desde el panel    ✔ estado actualizado · ✔ visible en el app
                                             ✔ notificaciones recibidas por el cliente
9 · Contadores del panel                     ✔ clientes, expedientes, ingresos del mes
10 · Seguridad                               ✔ 401 sin token · ✔ 403 para un cliente del app
                                             ✔ el cliente sí accede a sus documentos
11 · Roles y permisos granulares             ✔ Abogado con 20 permisos · ✔ sí ve el CRM
                                             ✔ no gestiona usuarios · ✔ no ve ajustes
                                             ✔ no puede crear clientes
```

## 2. Tiempo real — 11/11

El requisito «ver en tiempo real desde el app toda gestión que le hagan en el admin» se verificó
abriendo **dos conexiones SignalR simultáneas** (una de administrador y otra de cliente) contra
`wss://demostracion.es/ghcontadores/hubs/realtime` y cambiando el estado de un expediente desde el panel:

```
✔ el panel de administración se conecta a SignalR
✔ el app del cliente se conecta a SignalR
✔ el admin cambió el estado a WaitingClient (HTTP 200)
✔ el app recibió case.updated sin recargar
✔ el app recibió la notificación push/in-app
✔ el panel recibió el evento de expediente
✔ el evento corresponde al expediente GH-EXP-2026-0002 con el estado WaitingClient
✔ bandeja del cliente con los avisos persistidos (respaldo si el app está cerrado)
```

## 3. Panel de administración — 29/29

Navegador real (Chromium) contra el panel desplegado, con el modo demo **desactivado**:

```
✔ el panel responde HTTP 200 y tiene título propio
✔ sesión iniciada como admin@ghcontadores.net escribiendo las credenciales
✔ el dashboard muestra indicadores de clientes y expedientes
✔ no hay datos simulados: el panel está conectado a la API real
✔ el catálogo muestra los servicios reales y las 4 categorías del sitio original
✔ 14 módulos cargados con datos reales: Dashboard, Clientes, Expedientes, Tablero kanban,
  Documentos, Pedidos, Pagos, Cotizaciones, Solicitudes de cuenta, Informes, Usuarios,
  Roles y permisos, Ajustes, Auditoría
✔ el CRM muestra el cliente de demostración creado por la API
✔ se listan expedientes reales con su código GH-EXP-AAAA-NNNN
✔ el formulario creó el cliente en la API real (GH-CLI-NNNNN) y se retiró después
✔ un Abogado no ve ni abre la gestión de usuarios (permisos aplicados en la interfaz)
✔ sin errores en la consola del navegador
✔ ninguna llamada a la API terminó en error
```

## 4. Aplicación móvil

| Comprobación | Resultado |
|---|---|
| `flutter analyze` | **No issues found!** (0 problemas) |
| `flutter test` | **18 pasan · 0 fallan · 10 segundos** |
| `flutter build apk --release` (con `API_BASE_URL` de producción) | **`app-release.apk` · 63,3 MB** (arm64-v8a, armeabi-v7a, x86_64) |
| URL de la API embebida en el binario | `demostracion.es/ghcontadores/api/v1` (verificado dentro de `libapp.so`) |
| Catálogo semilla incluido como activo | `assets/flutter_assets/assets/mock/catalog.seed.json` (89,7 KB) |
| `dart run tool/verificar_urls.dart` | raíz y hub correctos con el prefijo de despliegue |

Cobertura de la suite: carrito (3) · catálogo real de 62 servicios y 4 categorías (3) ·
pasarela simulada aprobada/rechazada/pendiente/SINPE (4) · arranque y onboarding (2) ·
catálogo del activo (2) · URLs del despliegue y enlaces firmados (4).

Comando de compilación:

```bash
cd app-movil
flutter build apk --release \
  --dart-define=USE_MOCKS=false \
  --dart-define=API_BASE_URL=https://demostracion.es/ghcontadores/api/v1
```

## 5. Defectos encontrados y corregidos durante la verificación

Todos ellos se detectaron **probando contra producción**, no en revisión de código:

| # | Defecto | Impacto | Corrección |
|---|---|---|---|
| 1 | Los códigos correlativos chocaban con los datos sembrados | Alta: no se podían crear clientes, pedidos ni expedientes | El sembrador usa los generadores reales y sincroniza los contadores al arrancar |
| 2 | SKU duplicados en el catálogo migrado | Alta: la siembra del catálogo fallaba | SKU con hash determinista + siembra tolerante a duplicados |
| 3 | Los items nuevos del carrito se marcaban como *Modified* (EF Core con clave GUID asignada) | Alta: comprar desde el carrito devolvía 500 | Se registran en el `DbSet` y la respuesta se relee sin seguimiento |
| 4 | Los componentes de formulario de React no reenviaban el `ref` | Alta: ningún formulario del panel registraba lo escrito | `forwardRef` en los campos y verificación en navegador real |
| 5 | Credenciales de demostración del panel no coincidían con la API | Media | Alineadas con las cuentas sembradas |
| 6 | El panel enviaba `undefined` en rutas y parámetros | Media | Saneado central de parámetros y guardas de identificador |
| 7 | El panel enviaba cadenas vacías en campos opcionales | Media: alta de cliente devolvía 400 | La API las interpreta como ausencia de valor |
| 8 | El panel esperaba `GET /admin/notifications` (no existía) | Media | Endpoint de bandeja, resumen y marcado de leídas |
| 9 | Swagger devolvía 500 | Media | Declaración correcta de las subidas multipart (`[Consumes]`) |
| 10 | El app construía el hub de tiempo real sin el prefijo `/ghcontadores` | **Crítica: el tiempo real nunca habría funcionado en producción** | Se conserva la raíz de despliegue |
| 11 | El app llamaba a un endpoint de descarga inexistente | Alta: los documentos no se podían descargar | `GET /me/documents/{id}/link` + conversión a URL absoluta por origen |
| 12 | El app vaciaba el carrito con una ruta que no existe | Media | `DELETE /me/cart`, según el contrato |
| 13 | El app ofrecía eliminar la cuenta sin endpoint en la API | Media | `DELETE /me/profile` con baja, revocación de sesiones y aviso al panel |
| 14 | `compileSdk` de los complementos Android | Alta: el APK no compilaba | Se unifica a 36 en todos los módulos |
| 15 | El mock del app usaba esperas reales y colgaba la suite (10 minutos) | Media: la suite no servía como red de seguridad | Latencia inyectable (`mockLatencyOverride`); la suite pasa de 10 min a 10 s |

## 6. Operación en producción

| Elemento | Estado |
|---|---|
| `ghcontadores-api` (systemd) | `active (running)` · 249 MB de memoria |
| Nginx | include `snippets/ghcontadores.conf` dentro del vhost de `demostracion.es`; el resto de aplicaciones del servidor intactas |
| Copia de seguridad diaria | cron `15 3 * * *` → `/var/backups/ghcontadores` (base + documentos, retención 14 días), probada manualmente |
| Puerto de la API | `127.0.0.1:8095` (sin exposición directa) |
| Certificado | Let's Encrypt de `demostracion.es` (ya existente, reutilizado) |

## 7. Estado final de los datos de demostración

```
clientes 4 · expedientes 11 · tareas 30 · servicios 62 · pedidos 2 · pagos 2
notificaciones 15 · solicitudes de cuenta 1 · usuarios 9
```

Clientes de ejemplo creados con el perfil real del negocio: *Inversiones Pacífico Azul S.A.*
(sociedad de inversionistas extranjeros), *Blue Wave Holdings LLC* (inversionista de EE. UU.),
*Distribuidora Guanacaste S.A.* (pyme con planilla) y *Dr. Mauricio Salas Fernández*
(profesional independiente), cada uno con sus expedientes por materia y ente.
