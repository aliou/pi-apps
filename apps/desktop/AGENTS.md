# Pi Desktop

macOS app with dual mode: local subprocess or remote relay.

## Build

From repo root: `nix develop`, then `make build` or open via `make xcode`.

## Key Files

- `Services/LocalConnection.swift` - subprocess mode via RPCConnection
- `Services/ServerConnection.swift` - relay mode via REST + WebSocket
- `Services/PiConnection.swift` - unified interface for both modes
- `Views/MainView.swift` - main conversation view
