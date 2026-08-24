#!/usr/bin/env bash
# ==============================================================================
# LegisVox - Automated Database Backup Script (PostgreSQL / Supabase)
# ==============================================================================
# Usage:
#   chmod +x scripts/backup_database.sh
#   ./scripts/backup_database.sh
#
# Recommended Cron Schedule (daily at 03:00 AM):
#   0 3 * * * /opt/notorialAI/scripts/backup_database.sh >> /var/log/legisvox_backup.log 2>&1
# ==============================================================================

set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/opt/notorialAI/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/legisvox_db_${TIMESTAMP}.sql.gz"
LOG_PREFIX="[$(date +"%Y-%m-%d %H:%M:%S")] [BACKUP]"

# Ensure backup directory exists
mkdir -p "${BACKUP_DIR}"

echo "${LOG_PREFIX} Starting database backup..."

# Load DATABASE_URL from .env if not already set
if [ -z "${DATABASE_URL:-}" ]; then
    if [ -f "/opt/notorialAI/notorial-api/.env" ]; then
        export $(grep -v '^#' /opt/notorialAI/notorial-api/.env | grep -E '^DATABASE_URL' | xargs)
    elif [ -f "./notorial-api/.env" ]; then
        export $(grep -v '^#' ./notorial-api/.env | grep -E '^DATABASE_URL' | xargs)
    fi
fi

if [ -z "${DATABASE_URL:-}" ]; then
    echo "${LOG_PREFIX} ERROR: DATABASE_URL is not set." >&2
    exit 1
fi

# Execute pg_dump with compression
if pg_dump --dbname="${DATABASE_URL}" --clean --if-exists --no-owner --no-privileges | gzip -9 > "${BACKUP_FILE}"; then
    FILE_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
    echo "${LOG_PREFIX} SUCCESS: Backup created successfully at ${BACKUP_FILE} (Size: ${FILE_SIZE})"
else
    echo "${LOG_PREFIX} ERROR: pg_dump failed." >&2
    rm -f "${BACKUP_FILE}"
    exit 1
fi

# Rotate / delete backups older than RETENTION_DAYS
echo "${LOG_PREFIX} Rotating backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -name "legisvox_db_*.sql.gz" -type f -mtime +"${RETENTION_DAYS}" -exec rm -f {} +

echo "${LOG_PREFIX} Backup routine completed successfully."
