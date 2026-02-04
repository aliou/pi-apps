#!/usr/bin/env bash
set -euo pipefail

DB=".dev/relay/data/relay.db"
STATE_DIR=".dev/relay/state"
ORPHANS_ONLY=false

# Parse flags
while [[ $# -gt 0 ]]; do
  case $1 in
    --orphans)
      ORPHANS_ONLY=true
      shift
      ;;
    *)
      echo "Unknown flag: $1"
      echo "Usage: $0 [--orphans]"
      echo ""
      echo "Flags:"
      echo "  --orphans  Only clean orphaned directories (not in database)"
      exit 1
      ;;
  esac
done

if [ ! -f "$DB" ]; then
  echo "Database not found: $DB"
  exit 1
fi

if [ "$ORPHANS_ONLY" = true ]; then
  echo "Orphan cleanup mode - searching for directories not in database..."
  echo ""
  
  # Get session IDs from database
  db_sessions=$(sqlite3 "$DB" "SELECT id FROM sessions;" 2>/dev/null || echo "")
  
  # Find orphaned session directories
  orphaned_dirs=()
  if [ -d "$STATE_DIR/sessions" ]; then
    for session_dir in "$STATE_DIR/sessions"/*; do
      if [ -d "$session_dir" ]; then
        session_id=$(basename "$session_dir")
        if ! echo "$db_sessions" | grep -q "^$session_id$"; then
          orphaned_dirs+=("$session_dir")
        fi
      fi
    done
  fi
  
  # Find orphaned old-style secrets directories
  orphaned_secrets=()
  for secrets_dir in "$STATE_DIR"/pi-secrets-*; do
    if [ -d "$secrets_dir" ]; then
      dir_name=$(basename "$secrets_dir")
      # Extract session ID from pi-secrets-<uuid>
      if [[ "$dir_name" =~ ^pi-secrets-([a-f0-9-]+)$ ]]; then
        session_id="${BASH_REMATCH[1]}"
        if ! echo "$db_sessions" | grep -q "^$session_id$"; then
          orphaned_secrets+=("$secrets_dir")
        fi
      # Also include test secrets dirs
      elif [[ "$dir_name" =~ ^pi-secrets-test- ]]; then
        orphaned_secrets+=("$secrets_dir")
      fi
    fi
  done
  
  total_orphans=$((${#orphaned_dirs[@]} + ${#orphaned_secrets[@]}))
  
  if [ "$total_orphans" -eq 0 ]; then
    echo "No orphaned directories found."
    exit 0
  fi
  
  echo "Found $total_orphans orphaned director(ies):"
  echo ""
  if [ ${#orphaned_dirs[@]} -gt 0 ]; then
    echo "Session directories:"
    for dir in "${orphaned_dirs[@]}"; do
      size=$(du -sh "$dir" 2>/dev/null | cut -f1)
      echo "  - $dir ($size)"
    done
  fi
  if [ ${#orphaned_secrets[@]} -gt 0 ]; then
    echo ""
    echo "Secrets directories:"
    for dir in "${orphaned_secrets[@]}"; do
      echo "  - $dir"
    done
  fi
  echo ""
  
  read -rp "Delete all $total_orphans orphaned director(ies)? [y/N] " confirm
  if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
  fi
  
  # Remove orphaned directories
  for dir in "${orphaned_dirs[@]}" "${orphaned_secrets[@]}"; do
    echo "Removing $dir"
    rm -rf "$dir"
  done
  
  echo ""
  echo "Deleted $total_orphans orphaned director(ies)."
  exit 0
fi

# Normal mode - delete all sessions from database
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

# Get session IDs before deleting from DB
session_ids=$(sqlite3 "$DB" "SELECT id FROM sessions;")

# Remove sandbox containers
provider_ids=$(sqlite3 "$DB" "SELECT sandbox_provider_id FROM sessions WHERE sandbox_provider_id IS NOT NULL;")
for pid in $provider_ids; do
  container=$(docker ps -a -q --filter "id=$pid" 2>/dev/null || true)
  if [ -n "$container" ]; then
    echo "Removing container $pid"
    docker rm -f "$pid" 2>/dev/null || true
  fi
done

# Remove session data directories (the main missing piece from issue #15)
for sid in $session_ids; do
  session_dir="$STATE_DIR/sessions/$sid"
  if [ -d "$session_dir" ]; then
    echo "Removing session directory $session_dir"
    rm -rf "$session_dir"
  fi
done

# Remove old-style secrets dirs
for sid in $session_ids; do
  secrets_dir="$STATE_DIR/pi-secrets-$sid"
  if [ -d "$secrets_dir" ]; then
    echo "Removing secrets dir $secrets_dir"
    rm -rf "$secrets_dir"
  fi
done

# Remove test secrets directories
for secrets_dir in "$STATE_DIR"/pi-secrets-test-*; do
  if [ -d "$secrets_dir" ]; then
    echo "Removing test secrets dir $secrets_dir"
    rm -rf "$secrets_dir"
  fi
done

# Remove Docker volumes (legacy)
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
