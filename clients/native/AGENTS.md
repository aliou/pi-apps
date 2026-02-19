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

## Previews

Every SwiftUI view should have at least one `#Preview` block. Use the macro syntax (`#Preview("Label") { ... }`), not the older `PreviewProvider` protocol.

For views that depend on `@Environment(AppState.self)`, provide a dummy instance:
```swift
#Preview {
    MyView()
        .environment(AppState(relayURL: URL(string: "http://localhost:3000")!))
}
```

For views that require a live server connection (WebSocket, network calls), preview the static sub-views or visual states instead of the full connected view. Show all meaningful states: empty, loading, populated, error.

When creating or modifying a view, add or update its previews in the same commit.

## UI Automation

A UI test harness (`apps/ios/UITests/`) and runner script (`tools/ui-automation-runner.sh`) enable automated UI interaction via `xcode_ui` with `runnerCommand`.

Every interactive element (buttons, text fields, toggles) must have a stable `.accessibilityIdentifier(...)`. Use kebab-case IDs (`"new-session-button"`, `"chat-input"`). Run `describe_ui` to verify identifiers are visible before writing automation calls.

On macOS, SwiftUI `Button` does not expose `AXPress` to the accessibility API. Use `AccessibleButton` (in `SourcesMac/AccessibleButton.swift`) for toolbar/sidebar buttons that need to be tappable by AXorcist or other accessibility-based automation tools. It reads `@Environment(\.isEnabled)` so `.disabled()` works correctly.

## Adding a Package

1. Create the package in `packages/`
2. Add a `<FileRef>` entry to `PiApps.xcworkspace/contents.xcworkspacedata`
3. Reference it in `apps/ios/project.yml` under `packages`
4. Run `make generate`
