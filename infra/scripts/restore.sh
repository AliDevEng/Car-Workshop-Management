#!/usr/bin/env bash
set -euo pipefail

# Restore drill (B12.4.4, B12.5, PROJECT_SPEC.md §8.6): rebuilds the database
# and the document storage volume from one backup.sh pair. Destructive by
# design — it replaces whatever is currently in `postgres` and the
# `verkstad-storage` volume — so on an interactive terminal it refuses to
# proceed until "restore" is typed back; pass `--yes` to skip that prompt for
# scripted/unattended use.
#
# Usage:
#   infra/scripts/restore.sh <db_dump.gz> <storage_tar.gz> [--yes]
#
# Both arguments are files produced by backup.sh, e.g.:
#   infra/scripts/restore.sh \
#     infra/backups/db_20260917T020000Z.dump.gz \
#     infra/backups/storage_20260917T020000Z.tar.gz

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <db_dump.gz> <storage_tar.gz> [--yes]" >&2
  exit 1
fi

DB_DUMP="$1"
STORAGE_TAR="$2"
ASSUME_YES="${3:-}"

for f in "${DB_DUMP}" "${STORAGE_TAR}"; do
  if [ ! -f "${f}" ]; then
    echo "Not found: ${f}" >&2
    exit 1
  fi
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE=(docker compose -f "${REPO_ROOT}/infra/docker-compose.yml" --project-directory "${REPO_ROOT}")

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1"
}

if [ "${ASSUME_YES}" != "--yes" ]; then
  echo "This REPLACES the current database and document storage with:"
  echo "  database: ${DB_DUMP}"
  echo "  storage:  ${STORAGE_TAR}"
  read -r -p "Type 'restore' to continue: " confirmation
  if [ "${confirmation}" != "restore" ]; then
    echo "Aborted." >&2
    exit 1
  fi
fi

set -a
# shellcheck disable=SC1091
source "${REPO_ROOT}/.env"
set +a
POSTGRES_USER="${POSTGRES_USER:-verkstad}"
POSTGRES_DB="${POSTGRES_DB:-verkstad}"

START_EPOCH=$(date +%s)

# ------------------------------------------------------------- bring up postgres only
# `backend`/`frontend`/`caddy` stay down for the whole restore: nothing
# should read a half-restored database or write a PDF into a storage volume
# that is about to be overwritten out from under it.
log "Stopping application services (postgres stays up for the restore)"
"${COMPOSE[@]}" stop backend frontend caddy 2>/dev/null || true
log "Ensuring postgres is up"
"${COMPOSE[@]}" up -d postgres
"${COMPOSE[@]}" exec -T postgres sh -c \
  "until pg_isready -U '${POSTGRES_USER}' -d '${POSTGRES_DB}'; do sleep 1; done"

# ------------------------------------------------------------- database
log "Restoring database from ${DB_DUMP}"
# --clean --if-exists: drops each object before recreating it, so this works
# unchanged whether the target is a freshly-migrated empty database (B12.5.1,
# "a clean environment") or an existing one being rolled back onto.
# --no-owner: the dump's roles are whatever produced it, which do not have to
# exist on the restore target.
gunzip -c "${DB_DUMP}" | "${COMPOSE[@]}" exec -T postgres pg_restore \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  --clean --if-exists --no-owner

# ------------------------------------------------------------------ storage
log "Restoring storage volume from ${STORAGE_TAR}"
docker run --rm \
  -v verkstad-storage:/data \
  -v "$(cd "$(dirname "${STORAGE_TAR}")" && pwd):/backup" \
  postgres:16 \
  sh -c "rm -rf /data/* /data/..?* /data/.[!.]* 2>/dev/null; tar xzf /backup/$(basename "${STORAGE_TAR}") -C /data"

# ------------------------------------------------------------------ restart
log "Starting application services"
"${COMPOSE[@]}" up -d migrate backend frontend caddy

log "Waiting for the backend to report ready"
for _ in $(seq 1 60); do
  if "${COMPOSE[@]}" exec -T backend node -e \
    "fetch('http://127.0.0.1:3001/api/health/ready').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))" \
    >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

END_EPOCH=$(date +%s)
ELAPSED=$((END_EPOCH - START_EPOCH))

log "Restore finished in ${ELAPSED}s"
echo "Record this elapsed time in the root README.md (B12.5.3)."
