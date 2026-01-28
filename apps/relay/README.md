# Pi Relay Server

A relay server for Pi clients. Manages sessions, repos, and events with SQLite persistence. Eventually replaces `apps/server/`.

## Stack

- **Runtime:** Node.js 22+
- **HTTP:** Hono
- **Database:** SQLite via Drizzle ORM + better-sqlite3
- **Validation:** Zod
- **Testing:** Vitest
- **Lint/Format:** Biome

## Quick Start

```bash
# from repo root
nix develop

# install dependencies
cd apps/relay
pnpm install

# run dev server
pnpm run dev

# run tests
pnpm test
```

## Project Structure

```
apps/relay/
├── src/
│   ├── db/                 # Database layer
│   │   ├── schema.ts       # Drizzle schema (sessions, events, repos, settings)
│   │   ├── connection.ts   # Database connection factory
│   │   ├── migrate.ts      # Migration runner
│   │   └── migrations/     # SQL migrations
│   ├── services/           # Business logic
│   │   ├── session.service.ts   # Session CRUD
│   │   ├── event-journal.ts     # Event log with monotonic seq
│   │   ├── repo.service.ts      # Repository management
│   │   └── github.service.ts    # GitHub API client
│   ├── routes/             # HTTP endpoints
│   │   ├── health.ts       # Health check + server info
│   │   ├── sessions.ts     # Session API
│   │   ├── github.ts       # GitHub token + repos API
│   │   └── settings.ts     # Settings API
│   ├── app.ts              # Hono app factory
│   ├── config.ts           # CLI config parsing
│   ├── env.ts              # Environment validation
│   └── index.ts            # Entry point
├── ui/                     # Admin UI (React + Vite)
│   ├── src/
│   │   ├── pages/          # Dashboard, GitHub setup, Settings
│   │   ├── components/     # Shared UI components
│   │   └── lib/            # API client, utilities
│   └── vite.config.ts
├── drizzle.config.ts       # Drizzle Kit config
├── vitest.config.ts        # Test config
└── package.json
```

## URL Structure

| Path | Description |
|------|-------------|
| `/` | Admin UI (static files) |
| `/health` | Health check |
| `/api` | Server info + endpoint list |
| `/api/sessions` | Session management |
| `/api/github/*` | GitHub token + repos |
| `/api/settings` | Settings key-value store |
| `/rpc` | WebSocket RPC (not yet implemented) |

## API Response Format

All API responses follow a consistent format:

```typescript
// Success
{ data: T, error: null }

// Error
{ data: null, error: string }
```

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Run with hot reload |
| `pnpm build` | Build for production |
| `pnpm start` | Run production build |
| `pnpm test` | Run tests |
| `pnpm typecheck` | Type check |
| `pnpm lint` | Lint + format check |
| `pnpm db:generate` | Generate migrations |
| `pnpm db:migrate` | Run migrations |
| `pnpm ui:dev` | Run UI dev server |
| `pnpm ui:build` | Build UI for production |

## Configuration

Uses XDG Base Directory Specification. Override with env vars or CLI flags.

### Directories

| Env | Flag | Default | Contents |
|-----|------|---------|----------|
| `PI_RELAY_DATA_DIR` | `--data-dir` | `~/.local/share/pi-relay` | Database |
| `PI_RELAY_CONFIG_DIR` | `--config-dir` | `~/.config/pi-relay` | .env file |
| `PI_RELAY_CACHE_DIR` | `--cache-dir` | `~/.cache/pi-relay` | Cached data |
| `PI_RELAY_STATE_DIR` | `--state-dir` | `~/.local/state/pi-relay` | Logs, runtime state |
| `PI_RELAY_DB_PATH` | - | `$DATA_DIR/relay.db` | Database file path |

### Server

| Env | Flag | Default | Description |
|-----|------|---------|-------------|
| `PI_RELAY_PORT` | `--port` | 31415 | Server port |
| `PI_RELAY_HOST` | `--host` | 0.0.0.0 | Bind address |
| `PI_RELAY_TLS_CERT` | `--tls-cert` | - | TLS certificate path |
| `PI_RELAY_TLS_KEY` | `--tls-key` | - | TLS key path |

### Development

In the nix devshell, all paths are redirected to `.dev/relay/` in the project root to avoid polluting your system XDG directories.

## Database

Schema managed via Drizzle. Tables:

- **sessions** - Chat/code sessions with status, model preferences
- **events** - Append-only event log with session-scoped monotonic seq
- **repos** - Cached GitHub repository metadata
- **settings** - Key-value settings store

Generate new migrations after schema changes:

```bash
pnpm db:generate
```

## Testing

Tests are colocated with source files (`*.test.ts`). Uses in-memory SQLite for fast, isolated tests.

```bash
pnpm test           # run all tests
pnpm test --watch   # watch mode
```
