# Pi Mobile

iOS app. Connects to pi-server via `WebSocketTransport`.

## Build

From repo root: `nix develop`, then open via `make xcode`. Run "Pi Mobile" scheme.

## Key Files

- `Views/MainView.swift` - server setup, session list, connection state
- `Views/SessionView.swift` - conversation view
- `NativeTools/` - iOS-specific tool implementations
