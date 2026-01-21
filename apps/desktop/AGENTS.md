# Pi Desktop

macOS app. Runs pi as subprocess via `SubprocessTransport`.

## Build

From repo root: `nix develop`, then `make build` or open via `make xcode`.

## Key Files

- `Services/RPCClient.swift` - wraps SubprocessTransport
- `Views/MainView.swift` - main conversation view
- `Views/SessionView.swift` - session UI
