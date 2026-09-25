�#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Prueba de humo del sistema GH Contadores
#
# Recorre los flujos críticos contra la API desplegada:
#   1. Salud de la API y de la base de datos
#   2. Catálogo público (categorías y servicios migrados)
#   3. Solicitud de cuenta desde el app (queda pendiente)
#   4. Aprobación de la solicitud por el administrador (crea usuario y cliente)
#   5. Inicio de sesión del cliente aprobado
#   6. Compra en el app + pasarela simulada + generación automática de expediente
#   7. Gestión en el panel: cambio de estado del expediente y notificación al cliente
#   8. Comprobaciones de seguridad (sin token y con permisos insuficientes)
#
# Uso:  bash deploy/smoke-test.sh [URL_BASE]
# ---------------------------------------------------------------------------
set -uo pipefail

BASE="${1:-https://demostracion.es/ghcontadores/api/v1}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@ghcontadores.net}"
ADMIN_PASS="${ADMIN_PASS:-Gh.Admin2026}"
CLIENTE_DEMO="${CLIENTE_DEMO:-cliente@demo.cr}"
CLIENTE_DEMO_PASS="${CLIENTE_DEMO_PASS:-Gh.Cliente2026}"

PASS=0
FAIL=0
SUFFIX=$(date +%s)
NUEVO_EMAIL="prueba.humo.${SUFFIX}@ejemplo.cr"

# El flujo de alta de cliente (pasos 5 a 8) exige que el registro funcione «con aprobación».
# Se guarda el modo vigente y se restaura al final (paso 12), para que la suite sea
# determinista independientemente de cómo esté configurado el entorno.
MODO_ORIGINAL=""
guardar_y_fijar_modo_aprobacion() {
  MODO_ORIGINAL=$(curl -sS "$BASE/public/site" 2>/dev/null | python3 -c "import sys,json;print(json.load(sys.stdin).get('registration',{}).get('mode',''))" 2>/dev/null)
  if [ -n "$MODO_ORIGINAL" ] && [ "$MODO_ORIGINAL" != "approval" ]; then
    local token
    token=$(curl -sS -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
      -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASS}\"}" 2>/dev/null \
      | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)
    if [ -n "$token" ]; then
      curl -sS -o /dev/null -X PUT "$BASE/admin/settings" -H "Authorization: Bearer $token" \
        -H 'Content-Type: application/json' -d '{"values":[{"key":"registration.mode","value":"approval"}]}'
      sleep 1
    fi
  fi
}

ok()   { PASS=$((PASS+1)); printf '  \033[32m�S\033[0m %s\n' "$1"; }
ko()   { FAIL=$((FAIL+1)); printf '  \033[31m�S�\033[0m %s\n' "$1"; }
step() { printf '\n\033[1;36m%s\033[0m\n' "$1"; }

# jq no siempre está instalado: se usa python3 (presente en Ubuntu) para leer JSON.
json() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval('d'+sys.argv[1]))" "$1" 2>/dev/null; }

api() { # api METHOD PATH [BODY] [TOKEN]
  local method="$1" path="$2" body="${3:-}" token="${4:-}"
  local args=(-sS -X "$method" "$BASE$path" -H 'Content-Type: application/json' -w '\n%{http_code}')
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  [ -n "$body" ] && args+=(-d "$body")
  curl "${args[@]}"
}

step "1 · Salud de la API"
RESP=$(curl -sS "${BASE%/api/v1}/health" -w '\n%{http_code}' 2>/dev/null || curl -sS "$BASE/public/site" -w '\n%{http_code}')
CODE=$(tail -1 <<<"$RESP")
if [ "$CODE" = "200" ]; then ok "API responde 200 en /health"; else ko "API no responde (código $CODE)"; fi

step "2 · Catálogo público migrado"
RESP=$(api GET /public/catalog/categories); CODE=$(tail -1 <<<"$RESP"); BODY=$(sed '$d' <<<"$RESP")
COUNT=$(python3 -c "import sys,json;print(len(json.loads(sys.stdin.read())))" <<<"$BODY" 2>/dev/null || echo 0)
if [ "$CODE" = "200" ] && [ "$COUNT" -ge 4 ]; then ok "$COUNT categorías publicadas"; else ko "categorías: código $CODE, encontradas $COUNT"; fi

RESP=$(api GET "/public/catalog/products?pageSize=100"); CODE=$(tail -1 <<<"$RESP"); BODY=$(sed '$d' <<<"$RESP")
TOTAL=$(python3 -c "import sys,json;print(json.load(sys.stdin).get('total',0))" <<<"$BODY" 2>/dev/null || echo 0)
if [ "$CODE" = "200" ] && [ "$TOTAL" -ge 60 ]; then ok "$TOTAL servicios en el catálogo (esperado 62)"; else ko "catálogo: código $CODE, total $TOTAL"; fi

PRODUCTO_ID=$(python3 -c "
import sys,json
d=json.load(sys.stdin)
p=[x for x in d.get('items',[]) if x.get('requiresCase')]
print(p[0]['id'] if p else '')" <<<"$BODY" 2>/dev/null)
PRODUCTO_NOMBRE=$(python3 -c "
import sys,json
d=json.load(sys.stdin)
p=[x for x in d.get('items',[]) if x.get('requiresCase')]
print(p[0]['name'] if p else '')" <<<"$BODY" 2>/dev/null)
[ -n "$PRODUCTO_ID" ] && ok "servicio de prueba: $PRODUCTO_NOMBRE" || ko "no se encontró un servicio que requiera expediente"

step "3 · Solicitud de cuenta desde el app"
# El alta desde el app queda pendiente y la aprueba el administrador: se fija ese modo
# (el modo original del entorno se restaura al final, en el paso 12).
guardar_y_fijar_modo_aprobacion
RESP=$(api POST /public/account-requests "{\"fullName\":\"Prueba Humo ${SUFFIX}\",\"email\":\"${NUEVO_EMAIL}\",\"phone\":\"+506 8888 0001\",\"idNumber\":\"1-1111-2222\",\"clientType\":\"Company\",\"company\":\"Prueba Humo S.A.\",\"message\":\"Solicitud generada por la prueba de humo\"}")
CODE=$(tail -1 <<<"$RESP"); BODY=$(sed '$d' <<<"$RESP")
TRACKING=$(json "['trackingCode']" <<<"$BODY")
if [ "$CODE" = "200" ] && [ -n "$TRACKING" ]; then ok "solicitud creada con seguimiento $TRACKING"; else ko "solicitud: código $CODE"; echo "$BODY" | head -3; fi

step "4 · Inicio de sesión del administrador"
RESP=$(api POST /auth/login "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASS}\"}")
CODE=$(tail -1 <<<"$RESP"); BODY=$(sed '$d' <<<"$RESP")
ADMIN_TOKEN=$(json "['accessToken']" <<<"$BODY")
PERMS=$(python3 -c "import sys,json;print(len(json.load(sys.stdin).get('permissions',[])))" <<<"$BODY" 2>/dev/null || echo 0)
if [ "$CODE" = "200" ] && [ -n "$ADMIN_TOKEN" ]; then ok "login correcto · $PERMS permisos efectivos"; else ko "login admin: código $CODE"; echo "$BODY" | head -3; fi

step "5 · Aprobación de la solicitud (activación del cliente)"
SOLICITUD_ID=$(api GET "/admin/account-requests?status=Pending&search=${NUEVO_EMAIL}" "" "$ADMIN_TOKEN" | sed '$d' | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['items'][0]['id'] if d.get('items') else '')" 2>/dev/null)
if [ -n "$SOLICITUD_ID" ]; then
  RESP=$(api POST "/admin/account-requests/${SOLICITUD_ID}/approve" '{"tags":"prueba-humo"}' "$ADMIN_TOKEN")
  CODE=$(tail -1 <<<"$RESP"); BODY=$(sed '$d' <<<"$RESP")
  CLIENTE_ID=$(json "['clientId']" <<<"$BODY"); CLIENTE_CODIGO=$(json "['clientCode']" <<<"$BODY")
  if [ "$CODE" = "200" ]; then ok "solicitud aprobada · cliente $CLIENTE_CODIGO"; else ko "aprobación: código $CODE"; echo "$BODY" | head -3; fi
else
  ko "no se encontró la solicitud pendiente en el panel"
fi

step "6 · Inicio de sesión del cliente recién activado"
RESP=$(api POST /auth/login "{\"email\":\"${NUEVO_EMAIL}\",\"password\":\"Gh.Cliente2026\"}")
CODE=$(tail -1 <<<"$RESP"); BODY=$(sed '$d' <<<"$RESP")
NUEVO_TOKEN=$(json "['accessToken']" <<<"$BODY")
if [ "$CODE" = "200" ] && [ -n "$NUEVO_TOKEN" ]; then ok "el cliente puede entrar solo tras la aprobación"; else ko "login del cliente nuevo: código $CODE"; echo "$BODY" | head -3; fi

step "7 · Compra con la pasarela simulada (carrito �  checkout �  pago)"
# Se compra desde el carrito, que es el flujo real del app.
curl -sS -o /dev/null -X DELETE "$BASE/me/cart" -H "Authorization: Bearer $NUEVO_TOKEN"
RESP=$(api POST /me/cart/items "{\"productId\":\"${PRODUCTO_ID}\",\"quantity\":2}" "$NUEVO_TOKEN")
CODE=$(tail -1 <<<"$RESP"); BODY=$(sed '$d' <<<"$RESP")
CARRITO_ITEMS=$(json "['itemCount']" <<<"$BODY"); CARRITO_SUBTOTAL=$(json "['subtotal']" <<<"$BODY")
if [ "$CODE" = "200" ] && [ "$CARRITO_ITEMS" = "1" ]; then
  ok "carrito: 1 línea por ${CARRITO_SUBTOTAL} USD"
else
  ko "agregar al carrito: código $CODE · $CARRITO_ITEMS líneas"
fi

RESP=$(api POST /me/cart/items "{\"productId\":\"${PRODUCTO_ID}\",\"quantity\":1}" "$NUEVO_TOKEN")
CARRITO_ITEMS=$(sed '$d' <<<"$RESP" | json "['itemCount']")
[ "$CARRITO_ITEMS" = "1" ] && ok "repetir el mismo servicio acumula cantidad en una sola línea" || ko "el carrito duplicó líneas ($CARRITO_ITEMS)"

RESP=$(api POST /me/orders "{\"useCart\":true,\"customerName\":\"Prueba Humo S.A.\",\"customerEmail\":\"${NUEVO_EMAIL}\",\"requiresInvoice\":true,\"invoiceData\":{\"legalName\":\"Prueba Humo S.A.\",\"idNumber\":\"3-101-000000\"}}" "$NUEVO_TOKEN")
CODE=$(tail -1 <<<"$RESP"); BODY=$(sed '$d' <<<"$RESP")
PEDIDO_ID=$(json "['id']" <<<"$BODY"); PEDIDO_NUM=$(json "['number']" <<<"$BODY"); PEDIDO_TOTAL=$(json "['total']" <<<"$BODY")
if [ "$CODE" = "200" ] && [ -n "$PEDIDO_ID" ]; then ok "pedido $PEDIDO_NUM creado desde el carrito por ${PEDIDO_TOTAL} USD"; else ko "checkout: código $CODE"; echo "$BODY" | head -3; fi

RESP=$(api GET /me/cart "" "$NUEVO_TOKEN")
CARRITO_ITEMS=$(sed '$d' <<<"$RESP" | json "['itemCount']")
[ "$CARRITO_ITEMS" = "0" ] && ok "el carrito queda vacío tras la compra" || ko "el carrito conserva $CARRITO_ITEMS líneas tras la compra"

if [ -n "$PEDIDO_ID" ]; then
  RESP=$(api POST "/me/orders/${PEDIDO_ID}/pay" '{"method":"Card","card":{"number":"4242 4242 4242 4242","holder":"PRUEBA HUMO","expiry":"12/29","cvv":"123"}}' "$NUEVO_TOKEN")
  CODE=$(tail -1 <<<"$RESP"); BODY=$(sed '$d' <<<"$RESP")
  EXITO=$(json "['succeeded']" <<<"$BODY"); CASOS=$(json "['createdCaseCodes']" <<<"$BODY")
  if [ "$CODE" = "200" ] && [ "$EXITO" = "True" ]; then ok "pago aprobado · expediente(s) generados: $CASOS"; else ko "pago: código $CODE · $BODY"; fi

  # El rechazo se prueba con un pedido nuevo: un pedido ya pagado no admite otro cobro.
  RESP=$(api POST /me/orders "{\"useCart\":false,\"items\":[{\"productId\":\"${PRODUCTO_ID}\",\"quantity\":1}],\"customerName\":\"Prueba Humo S.A.\",\"customerEmail\":\"${NUEVO_EMAIL}\"}" "$NUEVO_TOKEN")
  PEDIDO2=$(sed '$d' <<<"$RESP" | json "['id']")
  RESP=$(api POST "/me/orders/${PEDIDO2}/pay" '{"method":"Card","card":{"number":"4000 0000 0000 0002","holder":"PRUEBA HUMO","expiry":"12/29","cvv":"123"}}' "$NUEVO_TOKEN")
  RECHAZO=$(sed '$d' <<<"$RESP" | json "['payment']['status']")
  [ "$RECHAZO" = "Declined" ] && ok "la tarjeta de prueba de rechazo devuelve Declined" || ko "rechazo inesperado: $RECHAZO"

  RESP=$(api POST "/me/orders/${PEDIDO2}/pay" '{"method":"Sinpe","sinpePhone":"+506 8888 0001"}' "$NUEVO_TOKEN")
  PENDIENTE=$(sed '$d' <<<"$RESP" | json "['payment']['status']")
  [ "$PENDIENTE" = "Pending" ] && ok "SINPE Móvil queda pendiente de confirmación" || ko "SINPE inesperado: $PENDIENTE"

  RESP=$(api POST "/me/orders/${PEDIDO2}/pay" '{"method":"Card","card":{"number":"4000 0000 0000 9995","holder":"PRUEBA HUMO","expiry":"12/29","cvv":"123"}}' "$NUEVO_TOKEN")
  EN_REVISION=$(sed '$d' <<<"$RESP" | json "['payment']['status']")
  [ "$EN_REVISION" = "Pending" ] && ok "la tarjeta en revisión devuelve Pending" || ko "tarjeta en revisión inesperada: $EN_REVISION"
fi

step "8 · Gestión del expediente desde el panel"
EXPEDIENTE_ID=$(api GET "/admin/cases?clientId=${CLIENTE_ID}" "" "$ADMIN_TOKEN" | sed '$d' | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['items'][0]['id'] if d.get('items') else '')" 2>/dev/null)
if [ -n "$EXPEDIENTE_ID" ]; then
  RESP=$(api PATCH "/admin/cases/${EXPEDIENTE_ID}/status" '{"status":"InProgress","progressPercent":35,"note":"Prueba de humo: expediente en proceso."}' "$ADMIN_TOKEN")
  CODE=$(tail -1 <<<"$RESP"); BODY=$(sed '$d' <<<"$RESP")
  ESTADO=$(json "['status']" <<<"$BODY")
  [ "$CODE" = "200" ] && ok "estado del expediente actualizado a $ESTADO" || ko "cambio de estado: código $CODE"

  # El cliente debe ver el cambio reflejado en su app.
  RESP=$(api GET /me/cases "" "$NUEVO_TOKEN")
  VISIBLE=$(sed '$d' <<<"$RESP" | python3 -c "import sys,json;d=json.load(sys.stdin);print('si' if any(c['id']=='${EXPEDIENTE_ID}' for c in d) else 'no')" 2>/dev/null)
  [ "$VISIBLE" = "si" ] && ok "el cliente ve el expediente en su app" || ko "el expediente no aparece en el app del cliente"

  RESP=$(api GET /me/notifications "" "$NUEVO_TOKEN")
  NOTIF=$(sed '$d' <<<"$RESP" | python3 -c "import sys,json;print(json.load(sys.stdin).get('total',0))" 2>/dev/null || echo 0)
  [ "$NOTIF" -ge 2 ] && ok "$NOTIF notificaciones recibidas por el cliente (pago + expediente)" || ko "notificaciones insuficientes ($NOTIF)"
else
  ko "no se encontró el expediente del cliente recién creado"
fi

step "9 · Contadores del panel de administración"
BODY=$(api GET /admin/dashboard/summary "" "$ADMIN_TOKEN" | sed '$d')
CLIENTES=$(json "['activeClients']" <<<"$BODY"); ABIERTOS=$(json "['openCases']" <<<"$BODY"); PEND=$(json "['pendingAccountRequests']" <<<"$BODY")
INGRESOS=$(json "['revenueThisMonth']" <<<"$BODY")
[ -n "$CLIENTES" ] && ok "dashboard · clientes activos: $CLIENTES · expedientes abiertos: $ABIERTOS · ingresos del mes: $INGRESOS USD" || ko "el dashboard no devolvió datos"

step "10 · Seguridad"
RESP=$(api GET /admin/clients "" ""); CODE=$(tail -1 <<<"$RESP")
[ "$CODE" = "401" ] && ok "sin token, /admin/clients responde 401" || ko "sin token se obtuvo $CODE (se esperaba 401)"

RESP=$(api GET /admin/clients "" "$NUEVO_TOKEN"); CODE=$(tail -1 <<<"$RESP")
[ "$CODE" = "403" ] && ok "un cliente del app no puede leer el CRM (403)" || ko "el cliente obtuvo $CODE (se esperaba 403)"

RESP=$(api GET "/me/documents" "" "$NUEVO_TOKEN"); CODE=$(tail -1 <<<"$RESP")
[ "$CODE" = "200" ] && ok "el cliente sí accede a sus propios documentos" || ko "/me/documents devolvió $CODE"

step "11 · Roles y permisos granulares (RBAC)"
RESP=$(api POST /auth/login '{"email":"abogado@ghcontadores.net","password":"Gh.Abogado2026"}')
CODE=$(tail -1 <<<"$RESP"); BODY=$(sed '$d' <<<"$RESP")
ABOGADO_TOKEN=$(json "['accessToken']" <<<"$BODY")
ABOGADO_PERMS=$(python3 -c "import sys,json;print(len(json.load(sys.stdin).get('permissions',[])))" <<<"$BODY" 2>/dev/null || echo 0)
if [ "$CODE" = "200" ] && [ "$ABOGADO_PERMS" -gt 10 ]; then ok "el rol Abogado tiene $ABOGADO_PERMS permisos asignados"; else ko "login del abogado: código $CODE · $ABOGADO_PERMS permisos"; fi

RESP=$(api GET "/admin/clients?pageSize=1" "" "$ABOGADO_TOKEN"); CODE=$(tail -1 <<<"$RESP")
[ "$CODE" = "200" ] && ok "el Abogado sí puede ver el CRM (clients.view)" || ko "el Abogado obtuvo $CODE en /admin/clients (se esperaba 200)"

RESP=$(api GET "/admin/users?pageSize=1" "" "$ABOGADO_TOKEN"); CODE=$(tail -1 <<<"$RESP")
[ "$CODE" = "403" ] && ok "el Abogado NO puede gestionar usuarios (403)" || ko "el Abogado obtuvo $CODE en /admin/users (se esperaba 403)"

RESP=$(api GET "/admin/settings" "" "$ABOGADO_TOKEN"); CODE=$(tail -1 <<<"$RESP")
[ "$CODE" = "403" ] && ok "el Abogado NO puede ver los ajustes del sistema (403)" || ko "el Abogado obtuvo $CODE en /admin/settings (se esperaba 403)"

RESP=$(api POST "/admin/clients" '{"clientType":"Individual","legalName":"Cliente creado por prueba","status":"Lead","source":"Web"}' "$ABOGADO_TOKEN")
CODE=$(tail -1 <<<"$RESP")
[ "$CODE" = "403" ] && ok "el Abogado NO puede crear clientes (sin clients.create)" || ko "el Abogado obtuvo $CODE al crear un cliente (se esperaba 403)"

step "12 · Modo de registro configurable (automático / con aprobación)"
# El administrador decide desde el panel si el registro es abierto o con visto bueno.
MODO_INICIAL=$(api GET /public/site | sed '$d' | python3 -c "import sys,json;print(json.load(sys.stdin).get('registration',{}).get('mode','?'))" 2>/dev/null)
[ -n "$MODO_INICIAL" ] && ok "el modo de registro se publica en /public/site (actual: $MODO_INICIAL)" || ko "/public/site no informa del modo de registro"

cambiar_modo() {
  api PUT /admin/settings "{\"values\":[{\"key\":\"registration.mode\",\"value\":\"$1\"}]}" "$ADMIN_TOKEN" >/dev/null
  sleep 1
}

# --- 12.a Registro automático: la cuenta se activa al instante ---
cambiar_modo automatic
AUTO_EMAIL="auto.${SUFFIX}@ejemplo.cr"
AUTO_PASS="Auto.Cliente2026"
RESP=$(api POST /public/account-requests "{\"fullName\":\"Registro Automatico ${SUFFIX}\",\"email\":\"${AUTO_EMAIL}\",\"phone\":\"+506 8888 1234\",\"clientType\":\"Individual\",\"password\":\"${AUTO_PASS}\"}")
CODE=$(tail -1 <<<"$RESP"); BODY=$(sed '$d' <<<"$RESP")
AUTO_OK=$(json "['autoApproved']" <<<"$BODY"); AUTO_LOGIN=$(json "['canLogin']" <<<"$BODY")
if [ "$CODE" = "200" ] && [ "$AUTO_OK" = "True" ] && [ "$AUTO_LOGIN" = "True" ]; then
  ok "con registro automático la cuenta queda activa al instante (autoApproved/canLogin)"
else
  ko "registro automático: código $CODE · autoApproved=$AUTO_OK · canLogin=$AUTO_LOGIN"
fi

RESP=$(api POST /auth/login "{\"email\":\"${AUTO_EMAIL}\",\"password\":\"${AUTO_PASS}\"}")
CODE=$(tail -1 <<<"$RESP")
[ "$CODE" = "200" ] && ok "el cliente entra de inmediato con la contraseña que eligió" || ko "login automático: código $CODE"

RESP=$(api GET "/admin/clients?search=${AUTO_EMAIL}&pageSize=5" "" "$ADMIN_TOKEN")
AUTO_CLIENTE=$(sed '$d' <<<"$RESP" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['items'][0]['code'] if d.get('items') else '')" 2>/dev/null)
[ -n "$AUTO_CLIENTE" ] && ok "el cliente aparece en el CRM ($AUTO_CLIENTE)" || ko "el cliente automático no llegó al CRM"

RESP=$(api GET /public/site | sed '$d' | python3 -c "import sys,json;r=json.load(sys.stdin).get('registration',{});print(r.get('autoApprove'),'|',r.get('message','')[:40])" 2>/dev/null)
case "$RESP" in True*) ok "con registro automático el app recibe autoApprove=true y el mensaje correspondiente" ;; *) ko "/public/site no refleja el registro automático: $RESP" ;; esac

# --- 12.b Validación de contraseña demasiado corta ---
RESP=$(api POST /public/account-requests "{\"fullName\":\"Clave Corta\",\"email\":\"corta.${SUFFIX}@ejemplo.cr\",\"phone\":\"+506 8888 0001\",\"clientType\":\"Individual\",\"password\":\"corta12\"}")
CODE=$(tail -1 <<<"$RESP")
[ "$CODE" = "400" ] && ok "una contraseña de menos de 8 caracteres se rechaza (400)" || ko "contraseña corta devolvió $CODE (se esperaba 400)"

# --- 12.c Con aprobación: la contraseña elegida por el cliente es la que queda activa ---
cambiar_modo approval
APR_EMAIL="aprob.${SUFFIX}@ejemplo.cr"
APR_PASS="Aprob.Cliente2026"
RESP=$(api POST /public/account-requests "{\"fullName\":\"Con Aprobacion ${SUFFIX}\",\"email\":\"${APR_EMAIL}\",\"phone\":\"+506 8888 5678\",\"clientType\":\"Individual\",\"password\":\"${APR_PASS}\"}")
CODE=$(tail -1 <<<"$RESP"); BODY=$(sed '$d' <<<"$RESP")
APR_LOGIN=$(json "['canLogin']" <<<"$BODY")
[ "$CODE" = "200" ] && [ "$APR_LOGIN" = "False" ] && ok "con aprobación la solicitud queda pendiente y sin acceso" || ko "solicitud con aprobación: código $CODE · canLogin=$APR_LOGIN"

RESP=$(api POST /auth/login "{\"email\":\"${APR_EMAIL}\",\"password\":\"${APR_PASS}\"}")
CODE=$(tail -1 <<<"$RESP")
[ "$CODE" = "403" ] || [ "$CODE" = "401" ] && ok "antes de aprobarla no puede iniciar sesión ($CODE)" || ko "la solicitud pendiente obtuvo $CODE al entrar"

SOLICITUD_ID=$(api GET "/admin/account-requests?status=Pending&search=${APR_EMAIL}" "" "$ADMIN_TOKEN" | sed '$d' | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['items'][0]['id'] if d.get('items') else '')" 2>/dev/null)
if [ -n "$SOLICITUD_ID" ]; then
  RESP=$(api POST "/admin/account-requests/${SOLICITUD_ID}/approve" '{}' "$ADMIN_TOKEN")
  CODE=$(tail -1 <<<"$RESP")
  [ "$CODE" = "200" ] && ok "el administrador aprueba la solicitud" || ko "aprobación: código $CODE"

  # Lo importante: debe entrar con LA CONTRASE�A QUE ELIGI�, no con una por defecto.
  RESP=$(api POST /auth/login "{\"email\":\"${APR_EMAIL}\",\"password\":\"${APR_PASS}\"}")
  CODE=$(tail -1 <<<"$RESP")
  [ "$CODE" = "200" ] && ok "tras aprobarla entra con la contraseña que eligió el cliente" || ko "no entra con su propia contraseña (código $CODE): se está usando una por defecto"
else
  ko "no se encontró la solicitud pendiente en el panel"
fi

# --- 12.d Se restaura el modo con el que estaba el entorno al empezar la suite ---
cambiar_modo "$MODO_ORIGINAL"
MODO_FINAL=$(api GET /public/site | sed '$d' | python3 -c "import sys,json;print(json.load(sys.stdin).get('registration',{}).get('mode','?'))" 2>/dev/null)
[ "$MODO_FINAL" = "$MODO_ORIGINAL" ] && ok "modo de registro restaurado a «$MODO_ORIGINAL»" || ko "el modo quedó en $MODO_FINAL (se esperaba $MODO_ORIGINAL)"

printf '\n\033[1m==================================================\033[0m\n'
printf '  Pruebas superadas: \033[32m%d\033[0m   ·   Fallidas: \033[31m%d\033[0m\n' "$PASS" "$FAIL"
printf '\033[1m==================================================\033[0m\n'
[ "$FAIL" -eq 0 ] || exit 1
