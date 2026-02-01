# Pi Desktop

macOS app for the pi coding agent. Supports local and remote modes.

## Architecture

**Local mode:**
- Spawns `pi --mode rpc` subprocess
- Communicates via JSONL over stdin/stdout
- Uses `LocalConnection` with `RPCConnection` from pi-core

**Remote mode:**
- Connects to relay server
- REST for session management, WebSocket for agent communication
- Uses `ServerConnection` with `RelayAPIClient` and `RemoteAgentConnection`

## Structure

```
Sources/
├── PiApp.swift           # app entry point
├── AppDelegate.swift     # lifecycle, menu bar
├── Services/             # connections, subprocess management
├── Views/                # SwiftUI views
└── Models/               # view models
```

## Development

```bash
# from repo root
nix develop
make xcode
```

Build and run the "Pi Desktop" scheme.

## Dependencies

- **PiCore** - RPC transport, relay client, protocol types
- **PiUI** - Shared UI components, theme
- **Textual** - Markdown rendering
