#!/bin/bash
# Production-shaped migration rehearsal against a fresh restore of the latest
# encrypted off-box gbrain backup. This never contacts Supabase or Fly.
set -euo pipefail
umask 077

export PATH="/opt/homebrew/opt/postgresql@18/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"

PORT="${GBRAIN_DRILL_PORT:-55488}"
DB_NAME="gbrain_upgrade_restore"
LOCAL_DIR="${GBRAIN_DRILL_LOCAL_DIR:-/Users/clevin/backups/gbrain}"
OFFBOX_CONFIG="${GBRAIN_DRILL_OFFBOX_CONFIG:-/Users/clevin/.config/brain-backup-offbox}"
IDENTITY="/Users/clevin/.config/age/gbrain-backup.key"
WORK="$(mktemp -d /private/tmp/gbrain-upgrade-drill.XXXXXX)"
PGDATA="$WORK/postgres"
SOCKET_DIR="$WORK/socket"
RESTORE_COPY="$WORK/offbox.dump.age"
RAW="$WORK/brain.dump"
MIGRATE_STDOUT="$WORK/migrate.json"
MIGRATE_STDERR="$WORK/migrate.stderr"
DATABASE_URL="postgresql://postgres@127.0.0.1:${PORT}/${DB_NAME}"
SERVER_STARTED=0

LOCAL_BACKUP="${GBRAIN_DRILL_LOCAL_BACKUP:-}"
if [ -z "$LOCAL_BACKUP" ]; then
  LOCAL_BACKUP="$(ls -t "$LOCAL_DIR"/brain-*.dump.age 2>/dev/null | head -1 || true)"
fi
OFFBOX_DIR="${GBRAIN_DRILL_OFFBOX_DIR:-}"
if [ -z "$OFFBOX_DIR" ] && [ -r "$OFFBOX_CONFIG" ]; then
  OFFBOX_DIR="$(head -1 "$OFFBOX_CONFIG")"
fi
OFFBOX_BACKUP="${GBRAIN_DRILL_OFFBOX_BACKUP:-}"
if [ -z "$OFFBOX_BACKUP" ] && [ -n "$LOCAL_BACKUP" ] && [ -n "$OFFBOX_DIR" ]; then
  OFFBOX_BACKUP="$OFFBOX_DIR/$(basename "$LOCAL_BACKUP")"
fi

cleanup() {
  if [ "$SERVER_STARTED" -eq 1 ]; then
    pg_ctl -D "$PGDATA" -m fast -w stop >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT INT TERM HUP

for required in "$LOCAL_BACKUP" "$OFFBOX_BACKUP" "$IDENTITY"; do
  if [ -z "$required" ]; then
    echo "could not resolve a required drill input" >&2
    exit 1
  fi
  if [ ! -r "$required" ]; then
    echo "missing required drill input: $required" >&2
    exit 1
  fi
done

mkdir -p "$SOCKET_DIR"
cp "$OFFBOX_BACKUP" "$RESTORE_COPY"

LOCAL_SHA="$(shasum -a 256 "$LOCAL_BACKUP" | awk '{print $1}')"
OFFBOX_SHA="$(shasum -a 256 "$RESTORE_COPY" | awk '{print $1}')"
if [ "$LOCAL_SHA" != "$OFFBOX_SHA" ]; then
  echo "off-box checksum mismatch" >&2
  exit 1
fi

age --decrypt --identity "$IDENTITY" --output "$RAW" "$RESTORE_COPY"
pg_restore -l "$RAW" >/dev/null

initdb -D "$PGDATA" --auth=trust --username=postgres >/dev/null
pg_ctl -D "$PGDATA" -o "-p $PORT -k $SOCKET_DIR" -w start >/dev/null
SERVER_STARTED=1
createdb -h 127.0.0.1 -p "$PORT" -U postgres "$DB_NAME"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA public;
ALTER DATABASE gbrain_upgrade_restore
  SET search_path = "$user", public, extensions;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
END
$$;
SQL

pg_restore \
  --dbname="$DATABASE_URL" \
  --exit-on-error \
  --no-owner \
  --no-privileges \
  --schema=public \
  "$RAW"

PRE_VERSION="$(psql "$DATABASE_URL" -Atqc "SELECT value FROM public.config WHERE key='version'")"
PRE_COUNTS="$(psql "$DATABASE_URL" -AtF, -c \
  "SELECT (SELECT count(*) FROM public.pages),(SELECT count(*) FROM public.content_chunks),(SELECT count(*) FROM public.links),(SELECT count(*) FROM public.sources),(SELECT count(*) FROM public.minion_jobs)")"

if ! env \
  -u DATABASE_URL \
  -u GBRAIN_DIRECT_DATABASE_URL \
  GBRAIN_DATABASE_URL="$DATABASE_URL" \
  bun run src/cli.ts init --migrate-only --json \
  >"$MIGRATE_STDOUT" 2>"$MIGRATE_STDERR"; then
  echo "migration command failed" >&2
  tail -80 "$MIGRATE_STDERR" >&2
  tail -20 "$MIGRATE_STDOUT" >&2
  exit 1
fi

POST_VERSION="$(psql "$DATABASE_URL" -Atqc "SELECT value FROM public.config WHERE key='version'")"
POST_COUNTS="$(psql "$DATABASE_URL" -AtF, -c \
  "SELECT (SELECT count(*) FROM public.pages),(SELECT count(*) FROM public.content_chunks),(SELECT count(*) FROM public.links),(SELECT count(*) FROM public.sources),(SELECT count(*) FROM public.minion_jobs)")"

if [ "$POST_VERSION" != "125" ]; then
  echo "unexpected post-migration schema version: $POST_VERSION" >&2
  exit 1
fi
if [ "$PRE_COUNTS" != "$POST_COUNTS" ]; then
  echo "core relation counts changed during schema migration" >&2
  echo "before=$PRE_COUNTS" >&2
  echo "after=$POST_COUNTS" >&2
  exit 1
fi

SCHEMA_ACTIVE="$(env \
  -u DATABASE_URL \
  -u GBRAIN_DIRECT_DATABASE_URL \
  GBRAIN_DATABASE_URL="$DATABASE_URL" \
  bun run src/cli.ts schema active --json)"

echo "result=PASS"
echo "backup_sha256=$OFFBOX_SHA"
echo "pre_schema_version=$PRE_VERSION"
echo "post_schema_version=$POST_VERSION"
echo "core_counts=$POST_COUNTS"
echo "migration_receipt=$(tr -d '\n' < "$MIGRATE_STDOUT")"
echo "active_schema_pack=$(printf '%s' "$SCHEMA_ACTIVE" | tr -d '\n')"
