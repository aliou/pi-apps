# Native Client

iOS and macOS apps for pi, built with Swift/SwiftUI. Uses XcodeGen for project generation.

## Commands

Run from the repo root:

```bash
make setup         # generate Xcode project + first-time setup
make generate      # regenerate Xcode project from project.yml
make xcode         # generate and open in Xcode
make build         # build macOS (debug)
make build-ios     # build iOS simulator (debug)
make build-release # build macOS (release)
make test          # run tests
make clean         # remove generated project + DerivedData
```

## Structure

```
clients/native/
├── PiApps.xcworkspace     # Workspace tying apps + packages
├── apps/
│   └── ios/               # PiNative app
│       ├── project.yml    # XcodeGen spec
│       ├── Sources/       # Shared SwiftUI sources (iOS + macOS)
│       ├── SourcesMac/    # macOS-only sources
│       └── Config/        # Xcconfig files (Debug/Release)
└── packages/
    ├── pi-core/           # Core types and relay server client (Swift package)
    └── pi-ui/             # Shared UI components (Swift package)
```

## App Targets

Defined in `apps/ios/project.yml`:

- **PiNative iOS** - iOS 26+
- **PiNative macOS** - macOS 26+

Both targets share sources from `Sources/`. macOS has additional sources in `SourcesMac/`.

## Swift Packages

- **pi-core** (`packages/pi-core/`) - Core types, relay API client, WebSocket handling.
- **pi-ui** (`packages/pi-ui/`) - Shared SwiftUI components used by both iOS and macOS targets.

Packages are referenced by the app via local path in `project.yml`.

## Adding a Package

1. Create the package in `packages/`
2. Add a `<FileRef>` entry to `PiApps.xcworkspace/contents.xcworkspacedata`
3. Reference it in `apps/ios/project.yml` under `packages`
4. Run `make generate`
