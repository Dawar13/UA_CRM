#!/usr/bin/env bash
# Dumps the production database into the folder given: roles, schema and data, gzipped, plus
# counts.txt (rows per table). Needs SUPABASE_DB_URL (the session pooler connection string) and
# Docker (the Supabase CLI runs pg_dump in a container).
#
# The logs of this repository are public, so this prints sizes and counts only, never data.
set -euo pipefail

out=${1:?usage: dump.sh <folder>}
: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL (docs/RUNBOOK.md)}"

root=$(cd "$(dirname "$0")/../.." && pwd)
cli="$root/node_modules/.bin/supabase"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

"$cli" db dump --remote="$SUPABASE_DB_URL" --role-only -f "$work/roles.sql"
"$cli" db dump --remote="$SUPABASE_DB_URL" -f "$work/schema.sql"
# pg_cron's run history is left out: it is only a log, and it changes while the check runs.
"$cli" db dump --remote="$SUPABASE_DB_URL" --data-only --use-copy \
  -x cron.job_run_details -f "$work/data.sql"

awk -f "$root/scripts/backup/copy-counts.awk" "$work/data.sql" > "$work/counts.txt"
members=$(awk '$1 == "\"public\".\"members\"" { print $2 }' "$work/counts.txt")
if [ -z "$members" ] || [ "$members" -eq 0 ]; then
  echo "::error::The dump has no members. Is SUPABASE_DB_URL the ua-crm project?"
  exit 1
fi

mkdir -p "$out"
for part in roles schema data; do
  gzip -n -9 -c "$work/$part.sql" > "$out/$part.sql.gz"
done
cp "$work/counts.txt" "$out/counts.txt"

rows=$(awk '$1 == "\"public\".\"rows\"" { print $2 }' "$work/counts.txt")
echo "Dumped $(wc -l < "$work/counts.txt") tables: ${members} members, ${rows:-0} rows."
du -h "$out"/*.gz
