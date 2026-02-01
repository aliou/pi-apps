# Pi Mobile

iOS app. Connects to relay server via REST + WebSocket.

## Build

From repo root: `nix develop`, then open via `make xcode`. Run "Pi Mobile" scheme.

## Key Files

- `Services/ServerConnection.swift` - REST (RelayAPIClient) + WebSocket (RemoteAgentConnection)
- `Views/MainView.swift` - server setup, mode selection
- `Views/ConversationView.swift` - chat interface
- `NativeTools/` - iOS-specific tool implementations
