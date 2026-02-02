#!/usr/bin/env bash
set -euo pipefail

DB=".dev/relay/data/relay.db"

if [ ! -f "$DB" ]; then
  echo "Database not found: $DB"
  exit 1
fi

echo "Sessions in database:"
echo ""
sqlite3 -header -column "$DB" \
  "SELECT id, status, sandbox_provider, sandbox_provider_id, name, created_at FROM sessions ORDER BY created_at DESC;"
echo ""

count=$(sqlite3 "$DB" "SELECT COUNT(*) FROM sessions;")
if [ "$count" -eq 0 ]; then
  echo "No sessions to delete."
  exit 0
fi

read -rp "Delete all $count session(s) and their sandbox containers? [y/N] " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

# Remove sandbox containers
provider_ids=$(sqlite3 "$DB" "SELECT sandbox_provider_id FROM sessions WHERE sandbox_provider_id IS NOT NULL;")
for pid in $provider_ids; do
  container=$(docker ps -a -q --filter "id=$pid" 2>/dev/null || true)
  if [ -n "$container" ]; then
    echo "Removing container $pid"
    docker rm -f "$pid" 2>/dev/null || true
  fi
done

# Remove secrets dirs
session_ids=$(sqlite3 "$DB" "SELECT id FROM sessions;")
for sid in $session_ids; do
  secrets_dir=".dev/relay/state/pi-secrets-$sid"
  if [ -d "$secrets_dir" ]; then
    echo "Removing secrets dir $secrets_dir"
    rm -rf "$secrets_dir"
  fi
done

# Remove Docker volumes
for sid in $session_ids; do
  vol="pi-session-$sid-workspace"
  if docker volume inspect "$vol" &>/dev/null; then
    echo "Removing volume $vol"
    docker volume rm "$vol" 2>/dev/null || true
  fi
done

# Delete from DB
sqlite3 "$DB" "DELETE FROM sessions;"
echo ""
echo "Deleted $count session(s)."
