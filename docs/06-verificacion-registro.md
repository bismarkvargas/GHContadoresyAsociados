# Verificación del modo de registro de clientes

**Fecha:** 2026-09-24 (hora de Costa Rica) / 2026-09-25 UTC
**Entorno:** producción — `https://demostracion.es/ghcontadores/`
**Verificador:** ingeniero de QA (agente)
**Alcance:** verificar de extremo a extremo el ajuste `registration.mode` (`automatic` | `approval`),
el campo `password` en `POST /public/account-requests` y su efecto en el alta de clientes.
No se ha modificado el código de la API, del panel ni del app.

---

## 1. Veredicto

> **La función de modo de registro NO está implementada en producción.**
> El ajuste `registration.mode` **se guarda** pero **no lo lee nadie**: ningún endpoint lo consulta.
> Los tres comportamientos exigidos fallan (modo automático, contraseña elegida por el cliente y
> validación de contraseña), y `GET /public/site` no devuelve el objeto `registration`.
> La prueba de humo del servidor pasa 28/28 y la suite del panel 28/29, con 1 fallo
> **imputable a la propia suite** (aserción contradictoria), no a la aplicación.

| # | Comprobación pedida | Resultado |
|---|---|---|
| 1 | Modo `approval`: solicitud `Pending`, `canLogin=false`, visible en el panel, sin login (401) antes de aprobar | ✅ correcto |
| 1b | Tras aprobar, entra **con la contraseña que envió el cliente** | ❌ **FALLA** — entra solo con la contraseña por defecto `Gh.Cliente2026` |
| 2 | Modo `automatic`: `autoApproved`, `canLogin`, cliente nuevo en el CRM, login inmediato | ❌ **FALLA** — se comporta igual que `approval` |
| 2b | `GET /public/site` devuelve `autoApprove: true` y mensaje | ❌ **FALLA** — no existe el campo `registration` |
| 3 | Validación: contraseña < 8 caracteres → **400** | ❌ **FALLA** — devuelve **200** y crea la solicitud |
| 4 | Reversión del modo a `approval` | ✅ hecho (y además nunca dejó de comportarse como `approval`) |
| 5 | Regresión: `e2e-admin.mjs` 29/29 y `smoke-test.sh` 28/28 | ⚠️ smoke **28/28 ✅**; e2e **28/29**, con 1 fallo por defecto de la prueba |
| 6 | Limpieza de datos de prueba | ✅ hecha |

---

## 2. Causa raíz

El ajuste se sembró en la base de datos y el panel lo escribe, pero **la implementación de la API
se perdió en un commit posterior**.

```
$ cd /opt/ghcontadores && for c in d97a128 758b74d 8b4234d 639ab40 594821c HEAD; do \
    n=$(git show $c:api/src/GH.Api/Contracts/IdentityDtos.cs | grep -c "Registration"); \
    echo "$c Registration=$n"; done
d97a128 Registration=2      <- commit que INTRODUCE la función
758b74d Registration=0      <- desaparece
8b4234d Registration=0
639ab40 Registration=0
594821c Registration=0
HEAD    Registration=0
```

El commit que la elimina es **`8b4234d` «Identidad corporativa (azul marino + lima), Montserrat,
logotipos y modo de registro»**, cuyo mensaje *anuncia* la función. Su propio diff la borra:

```
$ git show 8b4234d --stat -- api
 api/src/GH.Api/Contracts/IdentityDtos.cs           |  13 +-
 api/src/GH.Api/Controllers/Admin/AdminOnboardingController.cs | 114 ++++++++++----
 api/src/GH.Api/Controllers/PublicController.cs     |  75 +---------
 api/src/GH.Api/Program.cs                          |   1 -
 api/src/GH.Api/Services/AccountActivationService.cs | 165 ---------------------
```

`api/src/GH.Api/Services/AccountActivationService.cs` (165 líneas, el servicio que aplicaba el modo
y la contraseña) **ya no existe** en el árbol desplegado. Líneas eliminadas de `PublicController.cs`:

```
-            new RegistrationConfigDto(
-            if (!string.IsNullOrWhiteSpace(request.Password) && request.Password.Length < 8)
-            var resultado = await _activacion.ActivarAsync(entity, password: request.Password, ct: ct);
-                autoApproved = true,
-                TemporaryPassword: resultado.PasswordTemporal,
```

El modo vigente en producción está en `639ab40` («Ajustes: alias legibles de marca y escritura con
la clave real de la API»), que reescribe el guardado de ajustes **desde la rama de la función pero
sin reintroducir la lógica de registro**.

**Queda un estado incoherente:** el binario en ejecución, `GET /public/site` y
`POST /public/account-requests` son los de *antes* de la función, pero la base de datos y el panel
son los de *después*.

---

## 3. Evidencia de la incoherencia de despliegue

### 3.1 El binario en ejecución no tiene la función

```
$ systemctl show ghcontadores-api -p ExecStart -p ActiveEnterTimestamp
ExecStart={ path=/root/.dotnet/dotnet ; argv[]=/root/.dotnet/dotnet /var/www/ghcontadores/api/GH.Api.dll ; ignore_errors=no ; start_time=[Fri 2026-09-25 04:57:13 UTC] ; stop_time=[n/a] ; pid=2159066 ; code=(null) ; status=0/0 }
ActiveEnterTimestamp=Fri 2026-09-25 04:57:13 UTC

$ ls -la /var/www/ghcontadores/api/GH.Api.dll
-rw-r--r-- 1 root root 885760 Sep 25 04:56 /var/www/ghcontadores/api/GH.Api.dll
```

Comprobación de la API real:

```
$ cd /opt/ghcontadores && grep -rn "registration" --include=*.cs api/src | head -40
(sin salida)

$ grep -rn "registration" api/src/GH.Infrastructure/Data/DbSeeder.cs
(sin salida)
```

### 3.2 El ajuste sí existe en la base de datos y el panel sí lo escribe/lee

```
$ GET /admin/settings   (33 claves; se muestran las 2 de Registro)
{"key": "registration.mode", "value": "approval", "group": "Registro",
 "description": "Alta de clientes: 'automatic' (registro abierto, la cuenta se activa al instante)
 o 'approval' (con visto bueno del administrador)"}
{"key": "registration.message", "value": "Solicite su cuenta y GH Contadores la activará tras revisarla.",
 "group": "Registro", "description": "Mensaje que ve el solicitante"}
```

El panel desplegado sí trae la interfaz:

```
$ cd /opt/ghcontadores/admin-web && grep -rn "registration.mode" src | head
src/pages/accountRequests/AccountRequestsPage.tsx:75:  ajustes.data?.items.find((s) => s.key === 'registration.mode')?.value ?? 'approval'
src/pages/settings/SettingsPage.tsx:121:          modo={values['registration.mode'] ?? 'approval'}
src/pages/settings/SettingsPage.tsx:128:            save.mutate([{ key: 'registration.mode', value: nuevo }])
```

Por tanto **el interruptor de «Ajustes → Registro de clientes» se puede mover y se guarda, pero no
cambia absolutamente nada en el alta de clientes**. Es un control muerto (y engañoso para el
administrador).

### 3.3 El contrato publicado tampoco lo tiene

```
$ curl -sS https://demostracion.es/ghcontadores/swagger/v1/swagger.json -w 'HTTP %{http_code}\n'
HTTP 500
$ # el JSON de Swagger no se pudo generar (500); sobre el cuerpo devuelto:
registration in spec: False
autoApproved in spec: False
autoApprove in spec: False
```

*(hallazgo adicional menor: `/swagger/v1/swagger.json` responde 500; la UI de `/swagger` figura en
el enunciado como disponible.)*

---

## 4. Prueba 1 — Modo `approval`

Marca temporal usada: `202609242322`. Petición de prueba: `qa.auto.202609242322@ejemplo.cr`
contraseña elegida `Qa.Cliente2026!`.

### 4.1 Poner el modo en `approval`

```
$ PUT /admin/settings {"values":[{"key":"registration.mode","value":"approval"}]}
[admin] PUT /admin/settings registration.mode=approval -> HTTP 200
[admin] GET /admin/settings registration.* -> HTTP 200
   {"key": "registration.mode", "value": "approval", "group": "Registro",
    "updatedAt": "2026-09-25T05:22:58.107856"}
```

La escritura del ajuste funciona: la API acepta `{ "values": [ { "key", "value" } ] }`.

### 4.2 `GET /public/site` — falta el objeto `registration`

```
--- [1] GET /public/site -> HTTP 200
    top-level keys: ["brand", "company", "currency", "payment", "catalogSourceUrl"]
    site.registration = "<AUSENTE>"
```

Las claves devueltas son `brand`, `company`, `currency`, `payment`, `catalogSourceUrl`.
**No existe `registration`**, luego no hay `mode`, ni `autoApprove`, ni `message`.

### 4.3 Crear la solicitud **con** `password`

```
--- [2] POST /public/account-requests (con password) -> HTTP 200
{
  "trackingCode": "GH-SOL-260925-0009",
  "email": "qa.auto.202609242322@ejemplo.cr",
  "status": "Pending",
  "statusLabel": "Pendiente de revisión",
  "createdAt": "2026-09-25T05:22:58.1573847Z",
  "canLogin": false
}
    trackingCode = "GH-SOL-260925-0009"
    status = "Pending"
    canLogin = false
    autoApproved = "<AUSENTE>"
    clientId = "<AUSENTE>"
    clientCode = "<AUSENTE>"
    temporaryPassword = "<AUSENTE>"
```

En modo `approval` esto es **correcto**: queda `Pending` y `canLogin=false`. El campo `password`
enviado se **ignora por completo** (nótese que la respuesta no lo refleja en absoluto).

### 4.4 No se puede iniciar sesión antes de aprobar

```
--- [3] POST /auth/login inmediato -> HTTP 401
{
  "title": "Credenciales incorrectas",
  "status": 401,
  "detail": "El correo o la contraseña no son válidos."
}
```

✅ Correcto.

### 4.5 La solicitud aparece en el panel

```
[5] GET /admin/account-requests?status=Pending&search=qa.auto.202609242322@ejemplo.cr -> HTTP 200 total=1
    id=c36bcca5-1039-496f-a899-f6ad42077e48
```

✅ Correcto (el buscador del panel usa `search`, y filtra bien).

### 4.6 Aprobar desde la API

```
--- [5b] POST /admin/account-requests/c36bcca5-1039-496f-a899-f6ad42077e48/approve -> HTTP 200
{
  "message": "Solicitud aprobada. El cliente ya puede iniciar sesión.",
  "userId": "3f66e092-608e-407c-80f0-7e76a90467d5",
  "clientId": "4c11f5c5-ffcd-4e2d-9850-58999f5a947b",
  "clientCode": "GH-CLI-00036",
  "temporaryPassword": "Gh.Cliente2026"
}
```

⚠️ La respuesta **genera y devuelve una contraseña por defecto** `Gh.Cliente2026`. Es el
comportamiento anterior a la función; la función debía respetar la contraseña de la solicitud.

### 4.7 ❌ La contraseña elegida por el cliente no queda activa

**Este es el fallo más grave señalado en el enunciado.**

```
--- [6] POST /auth/login tras aprobar CON la contraseña del cliente (Qa.Cliente2026!) -> HTTP 401
{
  "title": "Credenciales incorrectas",
  "status": 401,
  "detail": "El correo o la contraseña no son válidos."
}
```

Y sin embargo **sí entra con la contraseña por defecto**:

```
$ curl -sS -X POST .../auth/login -d '{"email":"qa.auto.202609242322@ejemplo.cr","password":"Gh.Cliente2026"}'
{"accessToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzZjY2ZTA5Mi02MDhlLTQwN2MtODBmMC03ZTc2YTkwNDY3ZDUi...
                                                                      ^ usuario 3f66e092... recién creado
```

**Traza exacta:** contraseña enviada en la solicitud → `ignorada` (`PublicController.CreateAccountRequest`
nunca lee `request.Password`; `AccountActivationService`, que era quien la aplicaba, no existe en el
árbol desplegado) → la aprobación cifra la contraseña fija `Gh.Cliente2026` → el login del cliente
con **su** contraseña da **401** y con la **por defecto** da **200**.

El cliente no tiene forma de saberlo: la interfaz de solicitud le pide una contraseña, y esa
contraseña no sirve.

### 4.8 El cliente sí aparece en el CRM

```
[7] GET /admin/clients?search=qa.auto.202609242322@ejemplo.cr -> HTTP 200 total=1
    GH-CLI-00036 | QA approval S.A. | Active | App
```

✅ Correcto.

---

## 5. Prueba 2 — Modo `automatic`

Petición de prueba: `qa.auto2.202609242322@ejemplo.cr`, contraseña `Qa.Cliente2026!`.

```
[admin] PUT /admin/settings registration.mode=automatic -> HTTP 200
[admin] GET /admin/settings registration.* -> HTTP 200
   {"key": "registration.mode", "value": "automatic", "group": "Registro",
    "updatedAt": "2026-09-25T05:23:06.495703"}
```

El ajuste queda guardado como `automatic`. Comportamiento observado a continuación:

```
--- [1] GET /public/site -> HTTP 200
    top-level keys: ["brand", "company", "currency", "payment", "catalogSourceUrl"]
    site.registration = "<AUSENTE>"

--- [2] POST /public/account-requests (con password) -> HTTP 200
{
  "trackingCode": "GH-SOL-260925-0011",
  "email": "qa.auto2.202609242322@ejemplo.cr",
  "status": "Pending",
  "statusLabel": "Pendiente de revisión",
  "createdAt": "2026-09-25T05:23:06.5346742Z",
  "canLogin": false
}
    status = "Pending"          <- se esperaba creación activa al instante
    canLogin = false            <- se esperaba true
    autoApproved = "<AUSENTE>"  <- se esperaba true
    clientId = "<AUSENTE>"
    clientCode = "<AUSENTE>"
    temporaryPassword = "<AUSENTE>"

--- [3] POST /auth/login inmediato -> HTTP 401
{
  "title": "Credenciales incorrectas",
  "status": 401,
  "detail": "El correo o la contraseña no son válidos."
}

[7] GET /admin/clients?search=qa.auto2.202609242322@ejemplo.cr -> HTTP 200 total=0
    (no se creó ningún cliente)
```

**Resultado: en modo `automatic` la API se comporta EXACTAMENTE igual que en `approval`.**
No hay `autoApproved`, no hay `canLogin`, no hay cliente en el CRM y no hay login inmediato.
`/public/site` tampoco devuelve `autoApprove`. La respuesta byte a byte solo cambia en el
`trackingCode`, el email y las fechas.

---

## 6. Prueba 3 — Validación de contraseña (mínimo 8 caracteres)

Con el modo en `automatic`, se envía `password: "Corta12"` (7 caracteres):

```
--- [8] POST /public/account-requests con password de menos de 8 caracteres -> HTTP 200
{
  "trackingCode": "GH-SOL-260925-0010",
  "email": "qa.corta.202609242322@ejemplo.cr",
  "status": "Pending",
  "statusLabel": "Pendiente de revisión",
  "createdAt": "2026-09-25T05:22:58.5267305Z",
  "canLogin": false
}
```

❌ **Se esperaba HTTP 400 con un mensaje claro; se obtuvo HTTP 200 y la solicitud se creó.**
No hay ninguna validación de contraseña: el campo no se lee.

---

## 7. Prueba 4 — Reversión del modo

```
$ PUT /admin/settings {"values":[{"key":"registration.mode","value":"approval"}]}
PUT HTTP 200
{"key": "registration.mode", "value": "approval", "group": "Registro",
 "updatedAt": "2026-09-25T05:26:55.838828"}
```

✅ Producción queda en `approval`, que es el valor exigido.

---

## 8. Prueba 5 — Regresión

### 8.1 `smoke-test.sh` en el servidor — **28/28 ✅**

```
$ cd /opt/ghcontadores && bash deploy/smoke-test.sh
1 · Salud de la API
  ✔ API responde 200 en /health
2 · Catálogo público migrado
  ✔ 4 categorías publicadas
  ✔ 62 servicios en el catálogo (esperado 62)
  ✔ servicio de prueba: Trámite Municipal - Renovación Patente Comercial
3 · Solicitud de cuenta desde el app
  ✔ solicitud creada con seguimiento GH-SOL-260925-0012
4 · Inicio de sesión del administrador
  ✔ login correcto · 1 permisos efectivos
5 · Aprobación de la solicitud (activación del cliente)
  ✔ solicitud aprobada · cliente GH-CLI-00037
6 · Inicio de sesión del cliente recién activado
  ✔ el cliente puede entrar solo tras la aprobación
7 · Compra con la pasarela simulada (carrito → checkout → pago)
  ✔ carrito: 1 línea por 678.0 USD
  ✔ repetir el mismo servicio acumula cantidad en una sola línea
  ✔ pedido GH-ORD-2026-00015 creado desde el carrito por 1017.0 USD
  ✔ el carrito queda vacío tras la compra
  ✔ pago aprobado · expediente(s) generados: ['GH-EXP-2026-0019']
  ✔ la tarjeta de prueba de rechazo devuelve Declined
  ✔ SINPE Móvil queda pendiente de confirmación
  ✔ la tarjeta en revisión devuelve Pending
8 · Gestión del expediente desde el panel
  ✔ estado del expediente actualizado a InProgress
  ✔ el cliente ve el expediente en su app
  ✔ 5 notificaciones recibidas por el cliente (pago + expediente)
9 · Contadores del panel de administración
  ✔ dashboard · clientes activos: 7 · expedientes abiertos: 10 · ingresos del mes: 2373.0 USD
10 · Seguridad
  ✔ sin token, /admin/clients responde 401
  ✔ un cliente del app no puede leer el CRM (403)
  ✔ el cliente sí accede a sus propios documentos
11 · Roles y permisos granulares (RBAC)
  ✔ el rol Abogado tiene 20 permisos asignados
  ✔ el Abogado sí puede ver el CRM (clients.view)
  ✔ el Abogado NO puede gestionar usuarios (403)
  ✔ el Abogado NO puede ver los ajustes del sistema (403)
  ✔ el Abogado NO puede crear clientes (sin clients.create)

==================================================
  Pruebas superadas: 28   ·   Fallidas: 0
==================================================
SMOKE_EXIT=0
```

**28/28 conforme a lo exigido.** Nota: la prueba de humo usa la contraseña fija `Gh.Cliente2026`
en los pasos 6 y 7, por lo que **no detecta** el fallo 4.7 (es coherente con el comportamiento
antiguo, no con la función nueva).

### 8.2 `tools/e2e-admin/e2e-admin.mjs` — **28/29** (1 fallo)

```
$ node tools/e2e-admin/e2e-admin.mjs
Verificación E2E del panel — GH Contadores
Panel: https://demostracion.es/ghcontadores/

3 · Datos reales de la API en el dashboard
  ✔ el dashboard muestra indicadores de clientes y expedientes
  ✘ el panel sigue mostrando datos de demostración (VITE_USE_MOCKS no está en false)
...
8 · Alta real de un cliente desde el formulario
  ✔ el formulario creó el cliente en la API real · GH-CLI-00035
  ✔ cliente de prueba retirado tras la comprobación
...
==================================================
  Comprobaciones superadas: 28   ·   Fallidas: 1
==================================================
```

**El fallo NO es de la aplicación: es una aserción contradictoria de la propia suite.**
El fichero se contradice consigo mismo con la misma cadena literal:

```
tools/e2e-admin/e2e-admin.mjs:110
  // Con el modo demo activado aparecerían estos datos inventados; con la API real, no.
  if (!/Pacífico Azul|Acme|Empresa Demo/i.test(cuerpo)) ok('no hay datos simulados: ...')
  else ko('el panel sigue mostrando datos de demostración (VITE_USE_MOCKS no está en false)')

tools/e2e-admin/e2e-admin.mjs:180
  step('6 · El CRM muestra el cliente sembrado')
  if (/Inversiones Pacífico Azul|Pacífico Azul/.test(crm)) {
    ok('aparece el cliente de demostración creado por la API (Inversiones Pacífico Azul S.A.)')
```

La línea 110 **falla si aparece «Pacífico Azul»**; la línea 180 **exige que aparezca «Pacífico Azul»**.
Las dos no pueden pasar a la vez mientras exista el cliente sembrado. Y ese cliente existe de verdad
en la API real:

```
$ mysql ... -e "SELECT Code, LegalName, TradeName FROM Clients WHERE LegalName LIKE '%Pac%';"
GH-CLI-00001	Inversiones Pacífico Azul S.A.	Pacífico Azul

$ curl ... /admin/clients
API devuelve: GH-CLI-00001 Inversiones Pacífico Azul S.A.
```

Por tanto la línea 110 produce un **falso positivo del detector de mocks**: confunde un cliente
sembrado legítimo con datos simulados. Verificado además que el panel **no** usa mocks:

```
$ for f in /var/www/ghcontadores/admin/assets/*.js; do grep -o "Acme\|Empresa Demo\|Pacífico Azul" $f; done
      1 Pacífico Azul          <- única coincidencia, y es el cliente real
   (ninguna coincidencia de "Acme" ni "Empresa Demo")
```

`Acme` y `Empresa Demo` (los marcadores inequívocos de mock) **no aparecen en el bundle**.
**Conclusión: el panel está conectado a la API real; la suite es la que está mal.** El resultado
exigido de 29/29 es **inalcanzable** con el cliente sembrado en la base de datos, sin tocar la suite.

---

## 9. Prueba 6 — Limpieza y estado final de la base de datos

### 9.1 Estado inicial (antes de tocar nada)

```
clients                 = 7    (IsDeleted=0)
products_active         = 62
accountrequests_pending = 1
quoterequests           = 2
users                   = 10
orders                  = 2
cases                   = 11
```

Detalle de los 7 clientes visibles:

```
GH-CLI-00001	Inversiones Pacífico Azul S.A.	Active	App          <- demo 1
GH-CLI-00004	Blue Wave Holdings LLC	        Active	Referral     <- demo 2
GH-CLI-00005	Distribuidora Guanacaste S.A.	Active	WalkIn       <- demo 3
GH-CLI-00006	Dr. Mauricio Salas Fernández	Active	Phone        <- demo 4
GH-CLI-00032	Bismark	                        Active	App          <- YA EXISTÍA (no es mío)
GH-CLI-00033	Cliente E2E 1790311954076	Lead	Referral     <- resto de una corrida previa
GH-CLI-00034	Cliente E2E 1790312277553	Lead	Referral     <- resto de una corrida previa
```

### 9.2 Lo que esta sesión de QA creó (y eliminó)

| Origen | Filas creadas |
|---|---|
| Prueba 1 (`approval`) | usuario `3f66e092…`, cliente `GH-CLI-00036`, solicitud `GH-SOL-260925-0009` |
| Prueba 2 (`automatic`) | solicitud `GH-SOL-260925-0011` (nunca llegó a cliente) |
| Prueba 3 (contraseña corta) | solicitud `GH-SOL-260925-0010` |
| Prueba 5 (`smoke-test.sh`) | usuario `2a8845d4…`, cliente `GH-CLI-00037`, solicitudes `GH-SOL-260925-0012`, pedidos `GH-ORD-2026-00015/16`, expedientes, pagos, documentos, notificaciones, carrito, auditoría |
| Prueba 5 (`e2e-admin.mjs`) | cliente `GH-CLI-00035` — la propia suite lo retiró con `DELETE /admin/clients/{id}` |

### 9.3 Limpieza aplicada (respetando claves foráneas)

Orden ejecutado: mensajes → actuaciones (`CaseEvents`) → tareas → documentos → interacciones →
contactos → pagos → líneas de pedido → pedidos → expedientes → ítems de carrito → carritos →
notificaciones → preferencias → tokens push → refresh tokens → roles → cotizaciones → auditoría →
desvincular solicitudes → solicitudes → desvincular `Clients.UserId`/`AssignedToUserId` → clientes →
usuarios. Siempre los hijos antes que el cliente y el usuario.

```
$ python3 /tmp/qa-cleanup.py --apply
MODO: APLICAR
  hecho     : Mensajes
  hecho     : Actuaciones
  hecho     : Tareas
  hecho     : Documentos
  hecho     : Interacciones
  hecho     : Contactos
  hecho     : Pagos
  hecho     : Lineas de pedido
  hecho     : Pedidos
  hecho     : Expedientes
  hecho     : Items de carrito
  hecho     : Carritos
  hecho     : Notificaciones
  hecho     : Pref. notif.
  hecho     : Tokens push
  hecho     : RefreshTokens
  hecho     : Roles
  hecho     : Cotizaciones
  hecho     : Auditoria
  hecho     : Solicitudes->desvincular
  hecho     : Solicitudes QA
  hecho     : Cliente->usuario
  hecho     : Cliente E2E->usuario
  hecho     : Clientes QA
  hecho     : Usuarios QA
  hecho     : Clientes E2E (borrado logico)
```

### 9.4 Estado final

```
clients_visibles = 5
clients_totales  = 8
acctreq_pending  = 1
acctreq_total    = 2
quoterequests    = 2
products_active  = 62
users_visibles   = 10
orders           = 3
cases            = 11
```

```
-- Clientes que quedan --
GH-CLI-00001	Inversiones Pacífico Azul S.A.	Active
GH-CLI-00004	Blue Wave Holdings LLC	        Active
GH-CLI-00005	Distribuidora Guanacaste S.A.	Active
GH-CLI-00006	Dr. Mauricio Salas Fernández	Active
GH-CLI-00032	Bismark	                        Active
GH-CLI-00033	Cliente E2E 1790311954076	retirado (IsDeleted=1)
GH-CLI-00034	Cliente E2E 1790312277553	retirado (IsDeleted=1)
GH-CLI-00035	Cliente E2E 1790313766431	retirado (IsDeleted=1)

-- Solicitudes que quedan --
carlos.mendoza@ejemplo.cr	Pending	GH-SOL-260101-0001
bis21290@gmail.com	        Approved	GH-SOL-260925-0008
```

| Requisito de estado final | Esperado | Real | |
|---|---|---|---|
| Clientes de demostración en el CRM | 4 | **5** | ⚠️ ver 9.5 |
| Servicios | 62 | **62** | ✅ |
| Solicitud pendiente (Carlos Mendoza) | 1 | **1** (`carlos.mendoza@ejemplo.cr`, `Pending`) | ✅ |
| Cotización | 1 | **2** | ⚠️ ver 9.5 |
| Modo de registro | `approval` | **`approval`** | ✅ |

### 9.5 Desviaciones que **no** he corregido (son previas a mi trabajo)

1. **5 clientes visibles en vez de 4.** El quinto es `GH-CLI-00032 «Bismark»`
   (`bis21290@gmail.com`, `Source=App`, alta 2026-09-25 04:17), con un pedido asociado
   `GH-ORD-2026-00014` (69.99 USD). **Ya existía antes de empezar**: no lo he creado yo y **no lo he
   borrado**, porque borrar un cliente real con su pedido es destructivo y el enunciado pedía dejar
   el entorno «como estaba». Para llegar a los 4 clientes exigidos habría que retirarlo a propósito:
   dime si lo hago y lo dejo en 4.
2. **2 cotizaciones en vez de 1.** Son `ana.brenes@ejemplo.cr` (sembrada, 2026-09-24) y
   `bis21290@gmail.com` (04:12, también previa). Ninguna es mía; no las he tocado.
3. **8 clientes totales** frente a 7 iniciales: mi limpieza y la del `e2e-admin` dejan el borrado
   **lógico** (`IsDeleted=1`) de `GH-CLI-00035/36/37`, que es el mecanismo que usa la propia
   aplicación (`DELETE /admin/clients/{id}`). Solo se puede bajar el total con borrado físico.
4. **Solicitud `bis21290@gmail.com` en estado `Approved`** con `GH-SOL-260925-0008` (previa).

*(Los scripts de sondeo y limpieza usados están en `_analysis/qa-probe.py` y `_analysis/qa-cleanup.py`;
son solo herramientas de prueba y no forman parte del producto.)*

---

## 10. Resumen de fallos

| ID | Severidad | Descripción | Traza |
|---|---|---|---|
| **F1** | **Crítica** | El modo `automatic` no existe: `POST /public/account-requests` devuelve `Pending`/`canLogin=false` y no crea cliente, idéntico a `approval` | §5 |
| **F2** | **Crítica** | `GET /public/site` no devuelve `registration` (`mode`/`autoApprove`/`message`): claves = `brand, company, currency, payment, catalogSourceUrl` | §4.2 |
| **F3** | **Alta** | La contraseña enviada por el cliente se ignora: tras aprobar, login con **su** contraseña → **401**; con `Gh.Cliente2026` → **200** | §4.7 |
| **F4** | **Alta** | Sin validación de contraseña: 7 caracteres devuelve **200**, no **400** | §6 |
| **F5** | Media | Interruptor «Registro de clientes» del panel es un control muerto: guarda `registration.mode` pero la API no lee el ajuste | §3.2 |
| **F6** | Media | `e2e-admin.mjs` se contradice (líneas 110 y 180): 29/29 es inalcanzable; falso positivo del detector de mocks | §8.2 |
| **F7** | Baja | `GET /swagger/v1/swagger.json` responde **500** | §3.3 |
| **F8** | Baja | La prueba de humo fija `Gh.Cliente2026`, por lo que pasa 28/28 sin cubrir la función nueva | §8.1 |

**Causa raíz común de F1–F5:** el commit `8b4234d` eliminó
`AccountActivationService.cs`, `RegistrationConfigDto`, el campo `Password` y la rama de
auto-aprobación, pero **dejó en pie el ajuste en la base de datos y la interfaz en el panel**.
Producción quedó en un estado mixto: binario antiguo + datos/interfaz nuevos.

**Para cerrarlo:** reaplicar la parte de API de `d97a128` (o portar
`AccountActivationService` + `RegistrationConfigDto` + lectura de `registration.mode` y
`request.Password`) y volver a publicar el binario. La prueba de humo debería además añadir
comprobaciones con contraseña propia y con los dos modos, para que este fallo no pueda volver a
pasar inadvertido.
