# Relay Scripts

## nuke-sessions.sh

Delete all sessions from the database and clean up associated resources.

### Usage

**Delete all sessions:**
```bash
./scripts/nuke-sessions.sh
```

This will:
- List all sessions in the database
- Prompt for confirmation
- Remove sandbox containers (Docker/Cloudflare)
- Remove session data directories (`.dev/relay/state/sessions/<id>/`)
- Remove old-style secrets directories (`.dev/relay/state/pi-secrets-<id>`)
- Remove test secrets directories (`.dev/relay/state/pi-secrets-test-*`)
- Remove legacy Docker volumes
- Delete session rows from database

**Clean orphaned directories only:**
```bash
./scripts/nuke-sessions.sh --orphans
```

This will:
- Find session directories that exist on disk but not in the database
- Find old-style secrets directories for sessions not in the database
- Find test secrets directories
- List them with sizes
- Prompt for confirmation before deletion

Useful for cleaning up leftover directories from:
- Crashes or interrupted processes
- Manual testing
- Previous incomplete cleanups

### Requirements

- `sqlite3` CLI tool
- Docker (if using Docker sandbox provider)
- Run from repository root

## list-containers.sh

List all Docker containers for pi-relay sessions.

### Usage

```bash
./scripts/list-containers.sh
```
