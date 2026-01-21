# Pi Mobile

iOS app for the pi coding agent. Connects to pi-server via WebSocket.

## Architecture

- Cannot run pi locally (iOS limitation)
- Connects to pi-server via `WebSocketTransport`
- Server manages pi sessions and repos

## Structure

```
Sources/
├── PiApp.swift           # app entry point
├── Services/             # WebSocket client
├── Views/                # SwiftUI views
│   ├── MainView.swift    # connection + session management
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

Requires a running pi-server instance:

```bash
cd apps/server
bun install
bun run dev
```

Configure server URL in the app's settings.

## Dependencies

- **PiCore** - RPC transport, protocol types
- **PiUI** - Shared UI components, theme
- **Textual** - Markdown rendering
