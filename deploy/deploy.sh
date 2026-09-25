#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Despliegue de GH Contadores y Asociados en demostracion.es
#
#   /var/www/ghcontadores/api    -> API .NET 8 publicada (systemd: ghcontadores-api)
#   /var/www/ghcontadores/admin  -> panel React compilado (servido por Nginx)
#   /opt/ghcontadores            -> clon del repositorio (fuente)
#
# Uso (en el servidor):
#   bash /opt/ghcontadores/deploy/deploy.sh
#
# Es idempotente: se puede ejecutar tantas veces como haga falta.
# NO toca otras aplicaciones del servidor (/prelab, /CRMPXS, ...).
# ---------------------------------------------------------------------------
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/ghcontadores}"
APP_DIR="${APP_DIR:-/var/www/ghcontadores}"
API_DIR="$APP_DIR/api"
ADMIN_DIR="$APP_DIR/admin"
BRANCH="${BRANCH:-main}"
DOTNET="${DOTNET:-/root/.dotnet/dotnet}"
PORT="${PORT:-8095}"

log() { printf '\n\033[1;31m==> %s\033[0m\n' "$*"; }

log "1/8 · Actualizando código desde origin/$BRANCH"
cd "$REPO_DIR"
git fetch --prune origin
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

log "2/8 · Publicando la API (.NET 8)"
rm -rf "$REPO_DIR/api/src/GH.Api/publish"
"$DOTNET" publish "$REPO_DIR/api/src/GH.Api/GH.Api.csproj" \
  -c Release -o "$REPO_DIR/api/src/GH.Api/publish" --nologo

log "3/8 · Instalando la API en $API_DIR"
mkdir -p "$API_DIR" "$API_DIR/storage/documents"
# Se conserva appsettings.Production.json (secretos) y los documentos subidos.
rsync -a --delete \
  --exclude 'appsettings.Production.json' \
  --exclude 'storage/' \
  "$REPO_DIR/api/src/GH.Api/publish/" "$API_DIR/"

log "4/8 · Compilando el panel de administración"
if [ -d "$REPO_DIR/admin-web" ] && [ -f "$REPO_DIR/admin-web/package.json" ]; then
  cd "$REPO_DIR/admin-web"
  if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi
  npm run build
  mkdir -p "$ADMIN_DIR"
  rsync -a --delete "$REPO_DIR/admin-web/dist/" "$ADMIN_DIR/"
else
  echo "   (admin-web todavía no existe; se omite)"
fi

log "5/8 · Servicio systemd"
install -m 0644 "$REPO_DIR/deploy/systemd/ghcontadores-api.service" /etc/systemd/system/ghcontadores-api.service
systemctl daemon-reload
systemctl enable ghcontadores-api >/dev/null 2>&1 || true
systemctl restart ghcontadores-api

log "6/8 · Nginx"
install -d /etc/nginx/snippets
install -m 0644 "$REPO_DIR/deploy/nginx/ghcontadores.conf" /etc/nginx/snippets/ghcontadores.conf
if ! grep -q 'snippets/ghcontadores.conf' /etc/nginx/sites-available/demostracion.es 2>/dev/null; then
  # Se inserta el include justo después de la primera llave del bloque server de demostracion.es.
  cp /etc/nginx/sites-available/demostracion.es "/etc/nginx/sites-available/demostracion.es.bak.$(date +%Y%m%d%H%M%S)"
  awk 'BEGIN{done=0}
       {print}
       /server[[:space:]]*\{/ && done==0 {print "    include /etc/nginx/snippets/ghcontadores.conf;"; done=1}' \
    /etc/nginx/sites-available/demostracion.es > /tmp/demo.es.new
  mv /tmp/demo.es.new /etc/nginx/sites-available/demostracion.es
  echo "   include añadido a demostracion.es (copia de seguridad guardada)"
else
  echo "   include ya presente"
fi
nginx -t
systemctl reload nginx

log "7/8 · Esperando a que la API responda"
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
    echo "   API operativa tras ${i}s"
    break
  fi
  sleep 1
done

log "8/8 · Verificación"
echo "--- health local ---"
curl -sS "http://127.0.0.1:$PORT/health" || true
echo
echo "--- health público ---"
curl -sS "https://demostracion.es/ghcontadores/health" || true
echo
echo "--- panel ---"
curl -sS -o /dev/null -w 'HTTP %{http_code}\n' "https://demostracion.es/ghcontadores/" || true

log "Despliegue completado"
echo "Panel : https://demostracion.es/ghcontadores/"
echo "API   : https://demostracion.es/ghcontadores/api/v1"
echo "Docs  : https://demostracion.es/ghcontadores/swagger"
