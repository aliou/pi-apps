# Pi Mobile

iOS app for the pi coding agent. Connects to relay server via REST + WebSocket.

## Architecture

- Cannot run pi locally (iOS limitation)
- REST API for session CRUD, models, secrets
- WebSocket for per-session agent communication
- Uses `ServerConnection` with `RelayAPIClient` and `RemoteAgentConnection`

## Structure

```
Sources/
├── PiApp.swift           # app entry point
├── Services/             # server connection, config
├── Views/                # SwiftUI views
│   ├── MainView.swift    # mode selection, session management
│   ├── ConversationView.swift  # chat interface
│   └── ...
└── NativeTools/          # device-specific tool implementations
```

## Development

```bash
# from repo root
nix develop
make xcode
```

Build and run the "Pi Mobile" scheme on simulator or device.

## Server Setup

Requires a running relay server:

```bash
pnpm --filter pi-relay-server dev
```

Configure server URL in the app's settings.

## Dependencies

- **PiCore** - Relay client, protocol types
- **PiUI** - Shared UI components, theme
- **Textual** - Markdown rendering
