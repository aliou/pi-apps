# Pi Apps

Native macOS/iOS clients for the `pi` CLI coding agent, plus a WebSocket server for remote access.

## Build Commands
Swift apps require nix: `nix develop` first, or prefix with `nix develop --command bash -c "..."`.
- `make setup` - First-time setup (creates Local.xcconfig, generates Xcode projects)
- `make build` - Build desktop app (debug)
- `make test` - Run tests
- `make xcode` - Open workspace in Xcode

Server (TypeScript/Bun):
- `cd apps/server && bun install` - Install dependencies
- `bun run dev` - Run with hot reload
- `bun run build` - Build standalone binary
- `bun run lint` - Lint with Biome

## Structure
- `apps/desktop/` - macOS app (XcodeGen project.yml, Sources/, Resources/)
- `apps/mobile/` - iOS app (same structure, connects to server via WebSocket)
- `apps/server/` - WebSocket server for remote pi agent access (Bun/Hono)
- `packages/pi-core/` - RPC types, transport protocols (Foundation-only, no SwiftUI)
- `packages/pi-ui/` - Shared UI: Theme, MarkdownTheme, ButtonStyles, ToolCallViews (SwiftUI)

## Code Style
Swift: Swift 6, SwiftLint enforced (`.swiftlint.yml`), use `Theme.*` colors from PiUI, `Sendable` types, `Self` in static refs.
TypeScript: Biome for linting/formatting (`biome.json`).
