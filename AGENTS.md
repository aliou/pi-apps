# Pi Apps

Native Apple clients for the [pi](https://github.com/mariozechner/pi-coding-agent) coding agent.

## What is this?

An attempt at creating native macOS/iOS clients for Pi - not just as a coding agent, but also as a general-purpose chat tool for mobile.

**Architecture:**
- **Mobile app** connects to a remote server via WebSocket. The server runs Pi as an RPC subprocess and bridges messages. Mobile cannot run Pi locally (iOS limitation).
- **Desktop app** has dual mode:
  - **Local mode:** Vendors and spawns the pi CLI directly, communicating via RPC over stdin/stdout
  - **Remote mode:** Connects to a server via WebSocket, same as mobile
- **Server** wraps Pi sessions, manages repos (cloned from GitHub), and exposes an RPC-over-WebSocket protocol for remote clients.

## Build

Swift apps require nix shell. Run `nix develop` first, or prefix commands with `nix develop --command bash -c "..."`.

```bash
make setup    # first-time (creates Local.xcconfig, generates xcode projects)
make build    # build desktop (debug)
make test     # run tests
make xcode    # open in xcode
```

Server (TypeScript/Bun):
```bash
cd apps/server && bun install
bun run dev   # hot reload
bun run build # standalone binary
bun run lint  # biome
```

## Structure

- `apps/desktop/` - macOS app, XcodeGen project.yml
- `apps/mobile/` - iOS app, connects to server via WebSocket
- `apps/server/` - WebSocket server (Bun/Hono)
- `packages/pi-core/` - RPC types, transport layer (Foundation only)
- `packages/pi-ui/` - Shared UI components (SwiftUI)

## Code Style

**Swift:** Swift 6, SwiftLint enforced. Use `Theme.*` colors from PiUI. Types should be `Sendable`. Use `Self` in static refs.

**TypeScript:** Biome for lint/format.
