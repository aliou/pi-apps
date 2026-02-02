# Pi Apps

Native Apple clients for the [pi](https://github.com/mariozechner/pi-coding-agent) coding agent.

## Structure

```
pi-apps/
├── apps/
│   ├── desktop/           # macOS app (local subprocess or relay)
│   ├── mobile/            # iOS app (connects to relay)
│   ├── pi-native/         # New SwiftUI iOS + macOS app (from-scratch)
│   ├── relay-server/      # Relay API server (Node.js/Hono/SQLite)
│   └── relay-dashboard/   # Relay admin UI (React Router v7/Vite)
└── packages/
    ├── pi-core/           # RPC types, relay client, transport protocols
    └── pi-ui/             # Shared SwiftUI components
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

Dual mode: runs pi locally via subprocess, or connects to relay server.

```bash
make build        # build debug
make xcode        # open in xcode
```

### Mobile (iOS)

Connects to the relay via REST + WebSocket. Cannot run pi locally (iOS limitation).

### Pi Native (iOS + macOS)

Greenfield SwiftUI app that targets iOS and macOS with shared UI and modern “Liquid Glass” styling.

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

## Configuration

Bundle IDs are developer-specific. On first `make setup`, `Config/Local.xcconfig` is created:

```xcconfig
PI_DESKTOP_BUNDLE_ID = dev.yourname.pi.desktop
PI_MOBILE_BUNDLE_ID = dev.yourname.pi.mobile
PI_NATIVE_IOS_BUNDLE_ID = dev.yourname.pi.native.ios
PI_NATIVE_MAC_BUNDLE_ID = dev.yourname.pi.native.mac
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
