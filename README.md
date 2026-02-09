# Pi Apps

Clients for the [pi](https://github.com/mariozechner/pi-coding-agent) coding agent.

**Scope:** Single-user personal deployment. No multi-user, no user accounts, no per-user isolation.

## Structure

```
pi-apps/
├── server/
│   ├── relay/             # Relay API server (Node.js/Hono/SQLite)
│   ├── sandboxes/
│   │   ├── cloudflare/    # CF Containers sandbox (Worker + bridge + Dockerfile)
│   │   └── docker/        # Docker sandbox images for local/self-hosted relay
│   └── scripts/           # Utility scripts (nuke-sessions, list-containers)
├── clients/
│   ├── dashboard/         # Relay admin UI (React Router v7 SPA/Vite/Tailwind)
│   └── native/            # Native Swift apps and packages (iOS, macOS)
│       ├── apps/ios/      # PiNative Xcode project (XcodeGen)
│       └── packages/      # Swift packages (pi-core, pi-ui)
└── packages/              # Shared packages (currently empty)
```

## Quick Start

```bash
nix develop       # enter nix shell
make dev          # start relay server + dashboard (parallel, hot reload)
```

## Apps

### Relay Server

API server that wraps Pi sessions, manages repos, and bridges WebSocket clients.

```bash
cd server/relay
pnpm install
pnpm dev          # run dev server (hot reload)
pnpm test         # run tests
```

### Dashboard

Admin UI for managing secrets, GitHub token, and viewing sessions.

```bash
cd clients/dashboard
pnpm install
pnpm dev          # run dev server (hot reload)
```

### Native (iOS / macOS)

Swift apps built with XcodeGen. Requires Xcode.

```bash
make setup        # generate Xcode project
make xcode        # open in Xcode
make build        # build macOS (debug)
make build-ios    # build iOS simulator (debug)
```

## Makefile

Run `make help` for all targets. Key ones:

- `make dev` - start relay server and dashboard in parallel
- `make build` / `make build-ios` - build native apps
- `make test` - run native tests
- `make clean` - remove generated projects and build artifacts

## Requirements

- Nix (for development shell)
- Node.js 22+
- pnpm
- Xcode (for native apps)
