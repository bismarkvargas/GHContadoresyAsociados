# Despliegue en `https://demostracion.es/ghcontadores/`

Servidor: **VPS BISMARK** (`srv1916162`, Ubuntu 24.04, `2.25.111.177`) — el mismo que ya aloja
`/prelab`, `/CRMPXS` y `/manager`. El despliegue de GH Contadores es **un bloque independiente**:
no modifica ninguna otra aplicación.

## Reparto de responsabilidades en el servidor

| Ruta / recurso | Contenido |
|---|---|
| `/opt/ghcontadores` | clon del repositorio (fuente) |
| `/var/www/ghcontadores/api` | API .NET 8 publicada |
| `/var/www/ghcontadores/api/storage/documents` | documentos de expedientes subidos |
| `/var/www/ghcontadores/api/appsettings.Production.json` | **secretos** (no versionado) |
| `/var/www/ghcontadores/admin` | panel React compilado (Nginx lo sirve) |
| `127.0.0.1:8095` | puerto de la API (solo local; Nginx hace de proxy) |
| `systemd: ghcontadores-api` | servicio de la API |
| `/etc/nginx/snippets/ghcontadores.conf` | locations incluidas en el vhost de `demostracion.es` |
| MySQL `ghcontadores` | base de datos (usuario `ghcontadores`) |

## URLs públicas

| URL | Destino |
|---|---|
| `https://demostracion.es/ghcontadores/` | panel de administración (React SPA) |
| `https://demostracion.es/ghcontadores/api/v1/...` | API REST |
| `https://demostracion.es/ghcontadores/hubs/realtime` | SignalR (tiempo real, WebSocket) |
| `https://demostracion.es/ghcontadores/swagger` | documentación interactiva |
| `https://demostracion.es/ghcontadores/health` | estado de la API y de la base de datos |

## Despliegue (una orden)

Desde el servidor:

```bash
ssh root@2.25.111.177
bash /opt/ghcontadores/deploy/deploy.sh
```

El script es idempotente y hace: `git reset --hard origin/main` → `dotnet publish` de la API →
instalación con `rsync` conservando `appsettings.Production.json` y `storage/` → `npm ci && npm run build`
del panel → `systemctl restart ghcontadores-api` → `nginx -t && reload` → comprobación de salud.

### El repositorio es privado

El servidor necesita leerlo para actualizarse. Dos opciones:

1. **Recomendada — token de despliegue**: crear un *fine-grained PAT* de solo lectura sobre este
   repositorio y usarlo en el remoto del clon del servidor:
   ```bash
   cd /opt/ghcontadores
   git remote set-url origin https://<TOKEN>@github.com/bismarkvargas/GHContadoresyAsociados.git
   ```
2. **Clave de despliegue (deploy key)**: generar un par de claves en el servidor y añadir la pública
   en *Settings → Deploy keys* del repositorio (solo lectura).

Instalación inicial desde cero:

```bash
apt-get update && apt-get install -y mysql-server nginx git curl
curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel 8.0 --install-dir /root/.dotnet

mysql -e "CREATE DATABASE ghcontadores CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
mysql -e "CREATE USER 'ghcontadores'@'localhost' IDENTIFIED BY '<CLAVE>';"
mysql -e "GRANT ALL PRIVILEGES ON ghcontadores.* TO 'ghcontadores'@'localhost'; FLUSH PRIVILEGES;"

git clone <URL> /opt/ghcontadores
# crear /var/www/ghcontadores/api/appsettings.Production.json (ver más abajo)
bash /opt/ghcontadores/deploy/deploy.sh
```

## Configuración de producción

`/var/www/ghcontadores/api/appsettings.Production.json` (fuera de git, permisos `600`):

```json
{
  "ConnectionStrings": { "MySql": "server=localhost;port=3306;database=ghcontadores;user=ghcontadores;password=<CLAVE>;AllowUserVariables=true;UseAffectedRows=false" },
  "Jwt": { "Issuer": "GHContadores", "Audience": "GHContadoresClient", "Key": "<48 bytes aleatorios>", "AccessTokenMinutes": 120, "RefreshTokenDays": 30 },
  "Storage": { "RootPath": "storage/documents", "SigningKey": "<aleatorio>", "DownloadTokenMinutes": 15 },
  "Firebase": { "ServiceAccountJson": "", "ServiceAccountPath": "/var/www/ghcontadores/api/firebase-service-account.json" },
  "PublicBasePath": "/ghcontadores",
  "Cors": { "AllowedOrigins": ["https://demostracion.es", "https://www.demostracion.es"] }
}
```

`PublicBasePath` es lo que hace que las URLs de descarga de documentos salgan ya con el prefijo
`/ghcontadores` (válidas tanto para el panel como para la app).

## Firebase Cloud Messaging (push)

1. En la consola de Firebase del proyecto: *Configuración → Cuentas de servicio → Generar nueva clave privada*.
2. Copiar el JSON a `/var/www/ghcontadores/api/firebase-service-account.json` (`chmod 600`).
3. Reiniciar: `systemctl restart ghcontadores-api`.

Sin credenciales, la API funciona igual: guarda la notificación in-app y la entrega por SignalR, y
registra en el diario el push que habría enviado (`[PUSH simulado]`). Es el comportamiento de demostración.

## Operación

```bash
systemctl status ghcontadores-api          # estado
journalctl -u ghcontadores-api -f          # registro en vivo
journalctl -u ghcontadores-api -n 200      # últimas 200 líneas
systemctl restart ghcontadores-api         # reinicio
mysql -u ghcontadores -p ghcontadores      # consola SQL
```

Copias de seguridad de la base y de los documentos:

```bash
mysqldump -u ghcontadores -p --single-transaction ghcontadores | gzip > /root/gh-$(date +%F).sql.gz
tar czf /root/gh-docs-$(date +%F).tar.gz -C /var/www/ghcontadores/api storage
```

La API migra y siembra automáticamente al arrancar (permisos, roles, usuarios de la firma, ajustes,
los 62 servicios del catálogo y el cliente de demostración). Es idempotente: solo crea lo que falta.

## Prueba de humo

```bash
bash /opt/ghcontadores/deploy/smoke-test.sh
```

Recorre contra producción: salud, catálogo migrado, solicitud de cuenta desde el app, aprobación por
el administrador, login del cliente recién activado, compra con la pasarela simulada (aprobado,
rechazado, SINPE pendiente y tarjeta en revisión), generación automática del expediente, cambio de
estado desde el panel visible en el app, notificaciones recibidas y controles de acceso (401/403).

## Notas de seguridad

- El puerto 8095 solo escucha en `127.0.0.1`; no hay exposición directa.
- Las descargas de documentos usan tokens HMAC firmados de 15 minutos: nunca se expone la carpeta.
- Los datos de tarjeta no se almacenan: solo marca, últimos 4 dígitos y el nombre del titular.
- `appsettings.Production.json`, `storage/` y las claves de Firebase están en `.gitignore`.
