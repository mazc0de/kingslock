#!/usr/bin/env bash
# Runs the migrations against a throwaway Postgres (Docker) with a stubbed
# Supabase auth schema, then runs the security tests.
set -euo pipefail
cd "$(dirname "$0")"
NAME=kingslock-sqltest
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=test postgres:17-alpine >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
until docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; do sleep 0.5; done
sleep 1
psql() {
  local log status
  log=$(docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -t -A "$@" 2>&1) && status=0 || status=$?
  printf '%s\n' "$log" | sed -e '/^$/d' -e 's/^NOTICE:  //'
  return "$status"
}
psql < auth_stub.sql
for f in ../migrations/*.sql; do echo "applying $f"; psql < "$f"; done
psql < rls_test.sql
