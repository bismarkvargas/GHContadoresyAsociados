#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Copia de seguridad diaria de GH Contadores y Asociados.
#
#   - Volcado comprimido de la base de datos MySQL.
#   - Archivo comprimido de los documentos de los expedientes.
#   - Retención de 14 días.
#
# Instalación (cron diario a las 03:15):
#   install -m 0755 deploy/backup.sh /usr/local/bin/gh-backup.sh
#   echo "15 3 * * * /usr/local/bin/gh-backup.sh >> /var/log/gh-backup.log 2>&1" | crontab -
# ---------------------------------------------------------------------------
set -euo pipefail

DEST="${DEST:-/var/backups/ghcontadores}"
RETENCION_DIAS="${RETENCION_DIAS:-14}"
DB_NAME="${DB_NAME:-ghcontadores}"
DB_USER="${DB_USER:-ghcontadores}"
DB_PASS="${DB_PASS:-Gh2026.Cr!Segura}"
DOCS_DIR="${DOCS_DIR:-/var/www/ghcontadores/api/storage}"
FECHA=$(date +%Y-%m-%d_%H%M)

mkdir -p "$DEST"
echo "[$(date -Is)] Iniciando copia de seguridad de GH Contadores"

mysqldump -u "$DB_USER" -p"$DB_PASS" --single-transaction --routines --triggers "$DB_NAME" \
  | gzip -9 > "$DEST/gh-db-$FECHA.sql.gz"
echo "[$(date -Is)] Base de datos: $(du -h "$DEST/gh-db-$FECHA.sql.gz" | cut -f1)"

if [ -d "$DOCS_DIR" ]; then
  tar czf "$DEST/gh-docs-$FECHA.tar.gz" -C "$(dirname "$DOCS_DIR")" "$(basename "$DOCS_DIR")"
  echo "[$(date -Is)] Documentos: $(du -h "$DEST/gh-docs-$FECHA.tar.gz" | cut -f1)"
fi

# Retención: se eliminan las copias más antiguas que el límite configurado.
find "$DEST" -type f -name 'gh-*.gz' -mtime "+$RETENCION_DIAS" -delete
echo "[$(date -Is)] Copias conservadas: $(find "$DEST" -type f -name 'gh-*.gz' | wc -l)"
echo "[$(date -Is)] Copia de seguridad completada en $DEST"
