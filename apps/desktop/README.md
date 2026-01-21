# Pi Desktop

macOS app for the pi coding agent. Runs pi locally as a subprocess.

## Architecture

- Spawns `pi --mode rpc` subprocess
- Communicates via JSONL over stdin/stdout
- Uses `SubprocessTransport` from pi-core

## Structure

```
Sources/
├── PiApp.swift           # app entry point
├── AppDelegate.swift     # lifecycle, menu bar
├── Services/             # RPC client, subprocess management
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

- **PiCore** - RPC transport, protocol types
- **PiUI** - Shared UI components, theme
- **Textual** - Markdown rendering
