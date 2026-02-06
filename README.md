# Pi Apps

Clients for the [pi](https://github.com/mariozechner/pi-coding-agent) coding agent.

**Scope:** Single-user personal deployment. No multi-user, no user accounts, no per-user isolation.

## Structure

```
pi-apps/
├── apps/
│   ├── relay-server/      # Relay API server (Node.js/Hono/SQLite)
│   └── relay-dashboard/   # Relay admin UI (React Router v7/Vite)
└── sandboxes/
    ├── cloudflare/        # CF Containers sandbox (Worker + bridge + Dockerfile)
    └── docker/            # Docker sandbox images for local/self-hosted relay
```

Native macOS/iOS apps were archived. The relay server and dashboard are the active components.

## Quick Start

```bash
nix develop       # enter nix shell
pnpm install      # install all dependencies
pnpm dev          # run all apps (hot reload)
```

## Apps

### Relay Server

API server that wraps Pi sessions, manages repos, and bridges WebSocket clients.

```bash
pnpm --filter pi-relay-server dev    # run dev server
pnpm --filter pi-relay-server test   # run tests
```

### Relay Dashboard

Admin UI for managing secrets, GitHub token, and viewing sessions.

```bash
pnpm --filter pi-relay-dashboard dev
```

## TypeScript (monorepo)

All TS apps are managed from the repo root via pnpm workspace + turbo:

```bash
pnpm install      # install all dependencies
pnpm dev          # run all apps (hot reload)
pnpm build        # build all apps
pnpm lint         # lint (biome)
pnpm typecheck    # typecheck (tsc)
pnpm test         # test (vitest)
```

## Requirements

- Nix (for development shell)
- Node.js 22+
- pnpm
