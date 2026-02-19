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
just dev          # start relay server + dashboard (parallel, hot reload)
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
just setup        # generate Xcode project
just xcode        # open in Xcode
just build        # build macOS (debug)
just build-ios    # build iOS simulator (debug)
```

## Just

Run `just` for all available tasks. Key ones:

- `just dev` - start relay server and dashboard in parallel
- `just build` / `just build-ios` - build native apps
- `just test` - run native tests
- `just clean` - remove generated projects and build artifacts
- `just sandboxes build-docker <name>` - build sandbox Docker images

## Docker Images

Pre-built images are published to GitHub Container Registry on pushes to `main`.

| Image | Path | Port |
|-------|------|------|
| Relay server | `ghcr.io/aliou/pi-relay` | 31415 |
| Dashboard | `ghcr.io/aliou/pi-dashboard` | 8080 |

Sandbox images (used by the relay to run pi sessions):

| Image | Path |
|-------|------|
| Alpine (arm64) | `ghcr.io/aliou/pi-sandbox-alpine-arm64` |
| Codex (universal) | `ghcr.io/aliou/pi-sandbox-codex-universal` |
| Cloudflare | `ghcr.io/aliou/pi-sandbox-cloudflare` |

## Requirements

- Nix (for development shell)
- Node.js 22+
- pnpm
- Xcode (for native apps)
