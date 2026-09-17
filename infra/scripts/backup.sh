#!/usr/bin/env bash
set -euo pipefail

# Nightly backup (B12.4, PROJECT_SPEC.md §8.6): a `pg_dump` of the database
# plus a tarball of the document storage volume, both gzipped, written under
# infra/backups/ with 30 days of local retention. An untested backup is not a
# backup — B12.5's restore drill is what actually proves this script works,
# not this script exiting 0 (root README §8.6).
#
# Usage:   infra/scripts/backup.sh
# Cron (02:00 Europe/Stockholm, B12.4.3 — the container itself stays on UTC,
# PROJECT_SPEC.md §2.1, so the *host* crontab is where the timezone belongs):
#   0 2 * * * cd /opt/verkstad && TZ=Europe/Stockholm infra/scripts/backup.sh >> /var/log/verkstad-backup.log 2>&1
# `set -euo pipefail` is what makes a failure loud: any failing step (a dead
# Postgres container, a full disk, `docker` itself missing) exits non-zero,
# which is what a cron wrapper or `systemd` `OnFailure=` unit alerts on
# rather than a backup that silently stopped running weeks ago.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE=(docker compose -f "${REPO_ROOT}/infra/docker-compose.yml" --project-directory "${REPO_ROOT}")
BACKUP_DIR="${REPO_ROOT}/infra/backups"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RETENTION_DAYS=30

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1"
}

mkdir -p "${BACKUP_DIR}"

# `.env` supplies POSTGRES_USER/DB below; `docker compose` itself reads the
# same file automatically via --project-directory, so the two never disagree.
set -a
# shellcheck disable=SC1091
source "${REPO_ROOT}/.env"
set +a

POSTGRES_USER="${POSTGRES_USER:-verkstad}"
POSTGRES_DB="${POSTGRES_DB:-verkstad}"

log "Starting backup ${TIMESTAMP}"

# ------------------------------------------------------------- database
# Custom format (`-Fc`), not plain SQL: it is what `pg_restore` needs for
# `--clean --if-exists` in restore.sh, and it compresses the dump itself, on
# top of the outer gzip, at essentially no extra cost.
DB_DUMP="${BACKUP_DIR}/db_${TIMESTAMP}.dump.gz"
log "Dumping database '${POSTGRES_DB}' to ${DB_DUMP}"
"${COMPOSE[@]}" exec -T postgres pg_dump \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  --format=custom \
  | gzip >"${DB_DUMP}"

# ------------------------------------------------------------------ storage
# The document store is a named Docker volume (infra/docker-compose.yml),
# never a host path, so it is archived the same way in development and
# production: a throwaway container mounts it read-only and tars it out.
STORAGE_TAR="${BACKUP_DIR}/storage_${TIMESTAMP}.tar.gz"
log "Archiving storage volume to ${STORAGE_TAR}"
docker run --rm \
  -v verkstad-storage:/data:ro \
  -v "${BACKUP_DIR}:/backup" \
  postgres:16 \
  tar czf "/backup/storage_${TIMESTAMP}.tar.gz" -C /data .

log "Backup complete: $(du -h "${DB_DUMP}" | cut -f1) database, $(du -h "${STORAGE_TAR}" | cut -f1) storage"

# ------------------------------------------------------------ retention
log "Pruning local backups older than ${RETENTION_DAYS} days"
find "${BACKUP_DIR}" -name 'db_*.dump.gz' -mtime "+${RETENTION_DAYS}" -print -delete
find "${BACKUP_DIR}" -name 'storage_*.tar.gz' -mtime "+${RETENTION_DAYS}" -print -delete

# ------------------------------------------------------------- off-site
# Pluggable, not credentialed (decided with the human rather than guessed at,
# B12.4.2): set BACKUP_OFFSITE_RCLONE_REMOTE in .env (e.g.
# "s3:verkstad-backups") once a real destination exists, with `rclone`
# installed and configured on the host (`rclone config`) — outside this
# script's scope, since it is a one-time operator setup step, not a
# per-backup one. Unset, this is a documented no-op rather than a nightly
# backup that fails over a copy step nobody has a destination for yet.
if [ -n "${BACKUP_OFFSITE_RCLONE_REMOTE:-}" ]; then
  log "Copying to off-site remote ${BACKUP_OFFSITE_RCLONE_REMOTE}"
  rclone copy "${DB_DUMP}" "${BACKUP_OFFSITE_RCLONE_REMOTE}"
  rclone copy "${STORAGE_TAR}" "${BACKUP_OFFSITE_RCLONE_REMOTE}"
else
  log "BACKUP_OFFSITE_RCLONE_REMOTE not set — skipping off-site copy"
fi

log "Backup ${TIMESTAMP} finished"
