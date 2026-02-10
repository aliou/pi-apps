# Relay Server

Node.js API server that manages sessions and sandboxes for Pi clients.

## Protocol boundary

This service has two communication layers:

1. REST API (`/api/*`) — custom, extendable.
2. WebSocket (`/ws/sessions/:id`) — transparent proxy for upstream Pi RPC.

Do not change RPC message types or wrap/transform RPC payloads in WS handlers.

## Stack

- Node.js 22+
- Hono
- SQLite + Drizzle ORM
- Vitest
- Biome

## Commands

Run from `server/relay/`:

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```

Database:

```bash
pnpm db:generate
pnpm db:migrate
```

## Core directories

- `src/routes/` — REST endpoints.
- `src/ws/` — WS proxy layer for Pi RPC.
- `src/services/` — business logic.
- `src/sandbox/` — sandbox providers (docker, cloudflare, mock).
- `src/db/` — schema, migration, DB wiring.

## Common endpoints

- `GET /health`
- `GET/POST/DELETE /api/sessions`
- `POST /api/sessions/:id/activate`
- `GET /api/sessions/:id/history`
- `GET /api/models`
- `GET/POST /api/github/token`
- `GET /api/github/repos`
- `GET/PUT/DELETE /api/secrets`
