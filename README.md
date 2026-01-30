# Pi Apps

Native Apple clients for the [pi](https://github.com/mariozechner/pi-coding-agent) coding agent.

## Structure

```
pi-apps/
├── apps/
│   ├── desktop/       # macOS app (local subprocess)
│   ├── mobile/        # iOS app (connects to server)
│   ├── relay/         # Relay server (Node.js/Hono) - WIP replacement for server
│   └── server/        # WebSocket server (Bun/Hono)
└── packages/
    ├── pi-core/       # RPC types, transport protocols
    └── pi-ui/         # Shared SwiftUI components
```

## Quick Start

```bash
# enter nix shell (required for swift apps)
nix develop

# install all TypeScript dependencies
pnpm install

# first-time swift/xcode setup
make setup

# open in xcode
make xcode
```

## Apps

### Desktop (macOS)

Runs pi locally via subprocess. Communicates over stdin/stdout using JSONL.

```bash
make build        # build debug
make xcode        # open in xcode
```

### Mobile (iOS)

Connects to a pi-server instance via WebSocket. Cannot run pi locally (iOS limitation).

### Server

WebSocket server that wraps pi sessions. Enables iOS and remote clients.

### Relay (WIP)

Next-gen relay server. SQLite persistence, Drizzle ORM, admin UI. Will replace `apps/server/`.

### TypeScript (monorepo)

All TS apps are managed from the repo root via pnpm workspace + turbo:

```bash
pnpm install      # install all dependencies
pnpm dev          # run all apps (hot reload)
pnpm build        # build all apps
pnpm lint         # lint (biome)
pnpm test         # test (vitest)
```

Run a single app with `pnpm --filter pi-relay dev` or `pnpm --filter pi-server dev`.

## Configuration

Bundle IDs are developer-specific. On first `make setup`, `Config/Local.xcconfig` is created:

```xcconfig
PI_DESKTOP_BUNDLE_ID = dev.yourname.pi.desktop
PI_MOBILE_BUNDLE_ID = dev.yourname.pi.mobile
```

## Commands

| Command | Description |
|---------|-------------|
| `make setup` | First-time setup |
| `make build` | Build desktop (debug) |
| `make test` | Run tests |
| `make xcode` | Open workspace in Xcode |
| `make clean` | Remove build artifacts |

## Requirements

- macOS with Xcode 26+
- Nix (for development shell)
