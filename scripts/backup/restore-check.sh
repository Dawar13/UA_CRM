#!/usr/bin/env bash
# Restores a dump made by dump.sh into a scratch local Supabase (Docker) and checks that every
# table holds as many rows as the dump. This is the restore in docs/RUNBOOK.md, run for real
# every night, so a backup that cannot be restored fails loudly.
#
# The logs of this repository are public: on failure only the psql error line is shown, with
# quoted values masked, never the data or psql's DETAIL lines.
set -euo pipefail

dump=$(cd "${1:?usage: restore-check.sh <dump folder>}" && pwd)
root=$(cd "$(dirname "$0")/../.." && pwd)
cli="$root/node_modules/.bin/supabase"
major=$(awk -F' *= *' '$1 == "major_version" { print $2; exit }' "$root/supabase/config.toml")

scratch=$(mktemp -d)
mkdir -p "$scratch/restorecheck"
cd "$scratch/restorecheck"
"$cli" init > /dev/null
sed -i -E "s/^major_version = .*/major_version = ${major}/" supabase/config.toml
cleanup() {
  "$cli" stop --no-backup > /dev/null 2>&1 || true
  rm -rf "$scratch"
}
trap cleanup EXIT

# The same services the app uses (auth and storage create their schemas on start).
"$cli" start -x imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor > /dev/null
db=$(docker ps --filter 'name=supabase_db_restorecheck' --format '{{.Names}}' | head -n 1)
if [ -z "$db" ]; then
  echo "::error::The scratch database did not start."
  exit 1
fi

errors="$scratch/errors.txt"
if ! {
  gunzip -c "$dump/roles.sql.gz"
  gunzip -c "$dump/schema.sql.gz"
  echo 'SET session_replication_role = replica;'
  gunzip -c "$dump/data.sql.gz"
  # The restored nightly purge must not run inside the scratch copy.
  echo 'UPDATE cron.job SET active = false;'
} | docker exec -i "$db" psql -U supabase_admin -d postgres --single-transaction \
  -v ON_ERROR_STOP=1 -q > /dev/null 2> "$errors"; then
  echo "::error::The dump did not restore."
  grep -E '^(psql:|ERROR)' "$errors" | sed -E "s/'[^']*'/'…'/g" | head -n 3
  exit 1
fi

failed=0
tables=0
while read -r table expected; do
  tables=$((tables + 1))
  actual=$(docker exec "$db" psql -U supabase_admin -d postgres -tAc "select count(*) from ${table}")
  if [ "$actual" != "$expected" ]; then
    echo "::error::${table}: ${expected} rows in the dump, ${actual} after the restore."
    failed=1
  fi
done < "$dump/counts.txt"

if [ "$failed" -eq 0 ]; then
  echo "Restore check passed: ${tables} tables, every row count matches."
fi
exit "$failed"
