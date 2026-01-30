# Pi Apps

Native Apple clients for the [pi](https://github.com/mariozechner/pi-coding-agent) coding agent.

## What is this?

An attempt at creating native macOS/iOS clients for Pi - not just as a coding agent, but also as a general-purpose chat tool for mobile.

**Architecture:**
- **Mobile app** connects to the relay server via WebSocket. The relay runs Pi as an RPC subprocess and bridges messages. Mobile cannot run Pi locally (iOS limitation).
- **Desktop app** has dual mode:
  - **Local mode:** Vendors and spawns the pi CLI directly, communicating via RPC over stdin/stdout
  - **Remote mode:** Connects to the relay via WebSocket, same as mobile
- **Relay** wraps Pi sessions, manages repos (cloned from GitHub), and exposes an RPC-over-WebSocket protocol for remote clients.

## Build

Swift apps require nix shell. Run `nix develop` first, or prefix commands with `nix develop --command bash -c "..."`.

```bash
make setup    # first-time (creates Local.xcconfig, generates xcode projects)
make build    # build desktop (debug)
make test     # run tests
make xcode    # open in xcode
```

TypeScript apps are managed as a pnpm workspace with turbo:
```bash
pnpm install        # install all dependencies (run from repo root)
pnpm dev            # run all TS apps (hot reload)
pnpm build          # build all TS apps
pnpm lint           # lint all (biome)
pnpm typecheck      # typecheck all (tsc/tsgo)
pnpm test           # test all (vitest)
```

To run a single app:
```bash
pnpm --filter pi-relay-server dev
pnpm --filter pi-relay-dashboard dev
```

## Structure

- `apps/desktop/` - macOS app, XcodeGen project.yml
- `apps/mobile/` - iOS app, connects to relay via WebSocket
- `apps/relay-server/` - Relay API server (Node.js/Hono/SQLite)
- `apps/relay-dashboard/` - Relay admin UI (React/Vite/Tailwind)
- `packages/pi-core/` - RPC types, transport layer (Foundation only)
- `packages/pi-ui/` - Shared UI components (SwiftUI)

## Native Tools (Mobile)

The mobile app exposes native iOS capabilities as tools the LLM can invoke. Tools are registered with the relay during the hello handshake. See existing tools in `apps/mobile/Sources/NativeTools/Tools/` for examples.

**Creating a native tool:**
1. Create `apps/mobile/Sources/NativeTools/Tools/YourTool.swift` implementing `NativeToolExecutable`
2. Add case to `NativeTool` enum in `NativeTool.swift` with raw value matching the tool name
3. Update the `definition`, `makeExecutor()`, and `isAvailable` switch statements

**Handling iOS permissions:**
- Implement `isAvailable()` to check device capability (e.g., `HKHealthStore.isHealthDataAvailable()` returns false on iPad)
- Add usage description keys to `Info.plist` (e.g., `NSCalendarsFullAccessUsageDescription`)
- Request authorization in `execute()` - prompts appear on first use, not at app launch
- For HealthKit read-only access: iOS hides authorization status for privacy, so `authorizationStatus(for:)` always returns `.notDetermined`. Tools should return "no data found" if the query returns empty results (could mean denied or no data).
- For frameworks that don't conform to `Sendable` (EventKit, HealthKit), use `@preconcurrency import`

## Code Style

**Swift:** Swift 6, SwiftLint enforced. Use `Theme.*` colors from PiUI. Types should be `Sendable`. Use `Self` in static refs.

**TypeScript:** pnpm workspace monorepo with turbo. Biome for lint/format (config at repo root, sub-packages extend with `"root": false`). Turbo orchestrates build/dev/lint/typecheck/test across packages.

## Desktop App Paths

**IMPORTANT:** The desktop app does NOT use `~/.pi/agent/`. It uses Application Support:

```
~/Library/Application Support/me.aliou.pi-desktop/
├── agent/          # PI_CODING_AGENT_DIR (auth.json, models.json, sessions/)
├── bin/            # pi binary versions
├── worktrees/      # git worktrees for code sessions
├── sessions/       # desktop session metadata
└── logs/           # app logs
```

See `apps/desktop/Sources/Services/AppPaths.swift` for all paths.

**To test auth flow:** Remove files from Application Support, not ~/.pi:
```bash
rm -f ~/Library/Application\ Support/me.aliou.pi-desktop/agent/auth.json
rm -f ~/Library/Application\ Support/me.aliou.pi-desktop/agent/models.json
```
