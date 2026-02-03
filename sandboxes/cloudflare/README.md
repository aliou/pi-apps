# Cloudflare Sandbox Infrastructure

Runs pi agent sandboxes on [Cloudflare Containers](https://developers.cloudflare.com/containers/). The relay server communicates with this infrastructure via HTTP (lifecycle) and WebSocket (pi RPC forwarding).

## Architecture

```
Relay Server (Node.js)
    |
    | HTTPS (lifecycle: create, status, pause, resume, delete)
    | WSS   (pi RPC: commands <-> events)
    v
CF Worker (routing, auth)
    |
    v
PiSandbox Durable Object (container lifecycle, R2 state)
    |
    | container.fetch() for WS forwarding
    | containerFetch() for HTTP to bridge
    v
Container (pi + bridge server on port 4000)
    |
    v
R2 Bucket (workspace + agent state tarballs)
```

## Structure

```
sandboxes/cloudflare/
├── bridge/
│   ├── bridge.js          # WS+HTTP bridge (runs inside container)
│   └── package.json
├── Dockerfile              # Container image (pi + bridge)
├── worker/
│   ├── src/
│   │   ├── index.ts       # Worker entrypoint (Hono router)
│   │   ├── sandbox.ts     # PiSandbox Container/DO class
│   │   ├── auth.ts        # Shared secret middleware
│   │   ├── env.ts         # Env type (CF bindings)
│   │   └── state.ts       # R2 state management helpers
│   ├── wrangler.jsonc      # Cloudflare config
│   ├── package.json
│   └── tsconfig.json
└── README.md               # This file
```

## Prerequisites

- Cloudflare Workers Paid plan (required for Containers)
- Node.js >= 22
- Docker (for local container builds)
- `wrangler` CLI (installed as dev dependency)

## Setup

```bash
cd sandboxes/cloudflare/worker
npm install
```

## Development

Typecheck:

```bash
npm run typecheck
```

Local dev (requires CF auth via `wrangler login`):

```bash
# Create .dev.vars with your test secret
echo 'RELAY_SECRET=test-secret' > .dev.vars

# Start local dev server
npm run dev
```

**Note:** `wrangler dev` builds the Docker container image for linux/amd64. This fails on Apple Silicon (arm64) with "exec format error." This is a known limitation of local container dev on macOS. Full testing requires deployment to CF or an x86_64 Linux machine.

## Deployment

### First-time setup

1. Log in to Cloudflare:
   ```bash
   npx wrangler login
   ```

2. Create the R2 bucket:
   ```bash
   npx wrangler r2 bucket create pi-sandbox-state
   ```

3. Set the shared secret (must match `SANDBOX_CF_API_TOKEN` on the relay):
   ```bash
   npx wrangler secret put RELAY_SECRET
   ```

4. Deploy:
   ```bash
   npm run deploy
   ```

### Subsequent deploys

```bash
npm run deploy
```

## API

All endpoints except `/health` require the `X-Relay-Secret` header.

### Lifecycle

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (no auth) |
| POST | `/api/sandboxes/:id` | Create sandbox |
| GET | `/api/sandboxes/:id/status` | Get sandbox status |
| POST | `/api/sandboxes/:id/pause` | Pause (backup to R2, destroy container) |
| POST | `/api/sandboxes/:id/resume` | Resume (restore from R2, start container) |
| DELETE | `/api/sandboxes/:id` | Terminate (destroy container, delete R2 state) |
| GET | `/api/sandboxes` | List (returns 501, relay DB is source of truth) |

### WebSocket

| Path | Description |
|------|-------------|
| GET | `/ws/sandboxes/:id` | WebSocket upgrade, forwarded to bridge |

### Create body

```json
{
  "envVars": { "ANTHROPIC_API_KEY": "sk-..." },
  "repoUrl": "https://github.com/user/repo.git",
  "repoBranch": "main"
}
```

### Resume body

```json
{
  "envVars": { "ANTHROPIC_API_KEY": "sk-..." }
}
```

Secrets are passed as `envVars` on create/resume. They are ephemeral -- lost on container stop, never persisted to R2.

## Bridge Server

The bridge runs inside the container on port 4000. It bridges WebSocket connections to pi's stdin/stdout and exposes HTTP endpoints for state management.

| Endpoint | Description |
|----------|-------------|
| GET `/health` | Bridge health + pi process status |
| WS (any path) | WebSocket bridge to pi stdin/stdout |
| POST `/backup` | Tar /workspace + /data/agent, stream as response |
| POST `/restore` | Accept tar body, extract to / |
| POST `/start-pi` | Manually start pi process |
| POST `/exec` | Run shell command, return stdout/stderr/exitCode |

### WAIT_FOR_RESTORE

The bridge supports two-phase startup via the `WAIT_FOR_RESTORE` env var:
- `false` (default): starts pi immediately on container boot.
- `true`: starts HTTP+WS server, waits for `POST /restore` before spawning pi. Times out after 60 seconds and starts pi with empty state.

## Testing

### Bridge (local, no CF account needed)

```bash
cd sandboxes/cloudflare/worker/bridge
npm install

# Start with mock pi (override PI_COMMAND)
PI_COMMAND=/bin/cat node bridge.js &

# Test health
curl http://localhost:4000/health

# Test exec
curl -X POST http://localhost:4000/exec \
  -H 'Content-Type: application/json' \
  -d '{"command": "echo hello"}'
```

### Worker (after deployment)

```bash
SECRET="your-secret"
BASE="https://pi-sandbox-worker.<account>.workers.dev"

# Health (no auth)
curl "$BASE/health"

# Create
curl -X POST -H "X-Relay-Secret: $SECRET" \
  -H "Content-Type: application/json" \
  -d '{"envVars":{"ANTHROPIC_API_KEY":"sk-test"}}' \
  "$BASE/api/sandboxes/test-1"

# Status
curl -H "X-Relay-Secret: $SECRET" "$BASE/api/sandboxes/test-1/status"

# Pause
curl -X POST -H "X-Relay-Secret: $SECRET" "$BASE/api/sandboxes/test-1/pause"

# Resume
curl -X POST -H "X-Relay-Secret: $SECRET" \
  -H "Content-Type: application/json" \
  -d '{"envVars":{"ANTHROPIC_API_KEY":"sk-test"}}' \
  "$BASE/api/sandboxes/test-1/resume"

# Terminate
curl -X DELETE -H "X-Relay-Secret: $SECRET" "$BASE/api/sandboxes/test-1"
```
