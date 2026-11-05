#!/usr/bin/env bash
# Aplica a migration em um PostgreSQL local descartável e roda os testes de RLS.
# Requer binários do PostgreSQL (initdb/pg_ctl/psql). Não toca em nenhum projeto Supabase.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)}"
D="$(mktemp -d)"; PORT="${PORT:-5499}"
RUN() { if [ "$(id -u)" = 0 ]; then su postgres -c "$*"; else bash -c "$*"; fi; }
[ "$(id -u)" = 0 ] && chown postgres "$D"
RUN "$PGBIN/initdb -D $D/data -A trust >/dev/null && $PGBIN/pg_ctl -D $D/data -o '-p $PORT -k $D' -l $D/log -w start >/dev/null"
trap 'RUN "$PGBIN/pg_ctl -D $D/data stop -m fast" >/dev/null; rm -rf "$D"' EXIT
P="psql -h $D -p $PORT -U postgres -d postgres -q -v ON_ERROR_STOP=1"
$P -f "$ROOT/supabase/tests/auth_stub.sql"
$P -f "$ROOT/supabase/migrations/0001_central_comando.sql"
$P -f "$ROOT/supabase/tests/rls_test.sql"
