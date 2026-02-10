# Relay Server

Node.js server that wraps pi sessions and exposes REST API + WebSocket for remote clients.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Relay Server                           │
├─────────────────────────────────────────────────────────────┤
│  REST API (/api/*)           │  WebSocket (/ws/*)           │
│  - Sessions CRUD             │  - RPC message proxy         │
│  - Environments CRUD         │  - Transparent passthrough   │
│  - GitHub repos              │  - No protocol modification  │
│  - Secrets management        │                              │
├─────────────────────────────────────────────────────────────┤
│                    Sandbox Manager                          │
│  - Provider abstraction (mock, docker, cloudflare)          │
│  - Manages sandbox lifecycle                                │
│  - Routes RPC messages via SandboxChannel                   │
└─────────────────────────────────────────────────────────────┘
```

## Session Lifecycle

Sessions follow this state machine: `creating → active → idle → archived`. `error` can be reached from any state except `archived`.

- `creating`: sandbox being provisioned
- `active`: sandbox running, session usable
- `idle`: sandbox paused due to inactivity (resumable via activate)
- `archived`: user explicitly archived; sandbox terminated (terminal state)
- `error`: something went wrong

**Client flow:**
1. `POST /api/sessions` — creates session + starts sandbox provisioning (status: `creating`)
2. `POST /api/sessions/:id/activate` — blocks until sandbox is running (status: `active`)
3. Open WebSocket to `ws://host/ws/sessions/:id` — WS requires `active` status
4. Work (send prompts, receive events)
5. Close WS → idle timeout → `idle`
6. Come back → `activate` again → open WS
7. `POST /api/sessions/:id/archive` — archive session (terminal)
8. `DELETE /api/sessions/:id` — hard delete from DB

**Sandbox manager is stateless.** The DB stores `sandboxProvider` and `sandboxProviderId` per session. The manager delegates to the provider (Docker/mock) and inspects real state (e.g., Docker API) rather than maintaining in-memory maps.

## Per-Session Host Storage

Each Docker sandbox session gets a dedicated directory on the host:

```
<stateDir>/sessions/<sessionId>/
  workspace/   → /workspace    (bind mount, repo clone + working files)
  agent/       → /data/agent   (bind mount, pi's JSONL session files)
```

Pi writes JSONL session files to `/data/agent/sessions/`. These are available on the host for the history endpoint to read without exec-ing into the container.

Secrets remain in a separate directory (`<stateDir>/pi-secrets-<sessionId>/`) and are bind-mounted read-only.

## Two Communication Layers

### REST API (Custom, Extendable)

Location: `src/routes/`

The REST API is our custom infrastructure for managing resources. Add new endpoints freely.

**Current endpoints:**
- `/api/sessions` - Session lifecycle
- `/api/sessions/:id/history` - Session conversation from JSONL
- `/api/environments` - Environment configuration
- `/api/github/*` - GitHub integration
- `/api/secrets` - Provider API keys
- `/api/models` - Available AI models

**Adding a new endpoint:**
1. Create route file in `src/routes/`
2. Create service in `src/services/` if needed
3. Add types (request/response interfaces)
4. Wire up in `src/app.ts`
5. Update client types if native apps are rebuilt

### WebSocket (RPC Proxy, DO NOT MODIFY)

Location: `src/ws/handler.ts`

The WebSocket handler is a **transparent proxy** for RPC messages between the client and the pi agent running in a sandbox.

**Rules:**
- DO NOT add new message types to the WebSocket protocol
- DO NOT transform or enrich RPC messages
- DO NOT wrap RPC messages in additional envelopes
- The WebSocket just forwards JSON between client and pi's stdin/stdout

**What the WebSocket does:**
```
Client → WebSocket → pi stdin (JSON command)
pi stdout → WebSocket → Client (JSON event)
```

**What the WebSocket does NOT do:**
- Define its own protocol
- Add metadata to RPC messages
- Filter or modify events
- Maintain protocol-level state

If you need to add relay-specific communication (not agent communication), use REST endpoints or a separate WebSocket namespace - never modify the RPC proxy.

## Directory Structure

```
src/
├── routes/           # REST API endpoints
│   ├── sessions.ts   # Session CRUD + activate
│   ├── environments.ts
│   ├── github.ts
│   ├── secrets.ts
│   ├── models.ts
│   ├── settings.ts
│   └── health.ts
├── services/         # Business logic
│   ├── session.service.ts
│   ├── environment.service.ts
│   ├── event-journal.ts   # Event persistence for replay
│   ├── session-history.ts # JSONL parser + file finder for pi session files
│   ├── github.service.ts
│   ├── repo.service.ts
│   ├── secrets.service.ts
│   └── crypto.service.ts
├── sandbox/          # Sandbox providers
│   ├── types.ts      # SandboxHandle, SandboxChannel interfaces
│   ├── provider-types.ts # Provider type enum and config
│   ├── manager.ts    # Stateless provider orchestration (DB is source of truth)
│   ├── docker.ts     # Docker provider (local containers)
│   ├── cloudflare.ts # Cloudflare Containers provider (remote, via CF Worker)
│   ├── mock.ts       # Mock provider for testing
│   └── state-store.ts # Sandbox state persistence interface
├── ws/               # WebSocket handling
│   ├── handler.ts    # RPC proxy (DO NOT ADD PROTOCOL)
│   ├── connection.ts # Per-session WS connection + event forwarding
│   └── types.ts      # Client commands and server events
├── db/               # Database
│   ├── schema.ts     # Drizzle schema
│   ├── connection.ts
│   ├── migrate.ts
│   └── migrations/
├── app.ts            # Hono app factory
├── config.ts         # Configuration
├── env.ts            # Environment variable parsing
└── index.ts          # Entry point
```

## Database

> **Note:** Run all commands from `server/relay/` directory.

Uses SQLite with Drizzle ORM.

**Schema location:** `src/db/schema.ts`

**Generating migrations:**
```bash
pnpm db:generate
```

**Running migrations:**
```bash
pnpm db:migrate
```

Migrations are auto-generated by drizzle-kit. Do not write SQL migration files manually.

## Response Format

All REST endpoints use consistent response format:

```typescript
interface RelayResponse<T> {
  data: T | null;
  error: string | null;
}
```

Success: `{ data: <result>, error: null }`
Error: `{ data: null, error: "<message>" }`

## Docker Integration Tests

> **Note:** Run all commands from `server/relay/` directory.

Docker sandbox tests are skipped by default. To run them:

```bash
RUN_DOCKER_TESTS=1 pnpm vitest run src/sandbox/docker.test.ts
```

On macOS with Lima, also set the Docker socket and a Lima-accessible secrets dir:

```bash
DOCKER_HOST="unix://$HOME/.lima/default/sock/docker.sock" \
PI_SECRETS_BASE_DIR="$PWD/.dev/relay/state" \
PI_SANDBOX_IMAGE=pi-sandbox:alpine \
RUN_DOCKER_TESTS=1 \
pnpm vitest run src/sandbox/docker.test.ts
```

Environment variables:
- `RUN_DOCKER_TESTS` — enable Docker tests (any truthy value)
- `DOCKER_HOST` — Docker socket path (auto-detected from env by the provider)
- `PI_SANDBOX_IMAGE` — image to test with (default: `pi-sandbox:local`)
- `PI_SECRETS_BASE_DIR` — host dir for secrets bind mount (default: `os.tmpdir()`, must be Docker-accessible)
- `PI_SESSION_DATA_DIR` — host dir for per-session data (workspace + agent dirs)

## Service Pattern

Services encapsulate database operations and business logic:

```typescript
export class SomeService {
  constructor(private db: AppDatabase) {}
  
  create(params: CreateParams): Record { ... }
  get(id: string): Record | undefined { ... }
  list(): Record[] { ... }
  update(id: string, params: UpdateParams): void { ... }
  delete(id: string): void { ... }
}
```

Services are injected via Hono context middleware in `app.ts`.

## Adding a New Feature

Example: Adding a new resource "widgets"

1. **Schema** (`src/db/schema.ts`):
   ```typescript
   export const widgets = sqliteTable("widgets", {
     id: text("id").primaryKey(),
     name: text("name").notNull(),
     // ...
   });
   ```

2. **Generate migration**:
   ```bash
   pnpm db:generate
   ```

3. **Service** (`src/services/widget.service.ts`):
   ```typescript
   export class WidgetService {
     constructor(private db: AppDatabase) {}
     // CRUD methods
   }
   ```

4. **Routes** (`src/routes/widgets.ts`):
   ```typescript
   export function widgetsRoutes(): Hono<AppEnv> {
     const app = new Hono<AppEnv>();
     app.get("/", (c) => { ... });
     app.post("/", (c) => { ... });
     return app;
   }
   ```

5. **Wire up** (`src/app.ts`):
   - Add to `AppEnv.Variables`
   - Add to `AppServices`
   - Inject in middleware
   - Mount route

6. **Client types**: Update client-side types when native apps are rebuilt.

## Environment Variables

See `src/env.ts` and `src/config.ts` for all environment variables.

Key variables:
- `PORT` - Server port (default: 31415)
- `RELAY_ENCRYPTION_KEY` - Required. Base64-encoded 32-byte key for secrets at rest. Server fails to start with a clear error and generation command if missing.
- `RELAY_ENCRYPTION_KEY_VERSION` - Key version for rotation (default: 1)

Sandbox provider configuration is managed via the dashboard UI and stored in the database:
- Per-environment settings (Docker image, CF Worker URL) are stored in the `environments` table's `config` JSON column
- Cloudflare API token is stored as a global encrypted secret (`SANDBOX_CF_API_TOKEN`, kind: `sandbox_provider`) in the `secrets` table
- Docker availability is detected automatically from the Docker daemon
- Mock provider is used internally for chat mode and tests, never exposed in UI

Provider API keys (stored as encrypted secrets via `/api/secrets`, injected into sandboxes at runtime):
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, etc.
