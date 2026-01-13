# Pi Apps

Native Apple platform clients for the Pi coding agent.

## Quick Start

See [Installation](#installation) below to set up your development environment, then:

```bash
# First-time setup
make setup

# Open in Xcode
make xcode
```

## Structure

```
pi-apps/
├── apps/
│   ├── desktop/    # macOS app
│   └── mobile/     # iOS app (placeholder)
├── packages/
│   └── pi-core/    # Shared Swift package
└── Config/         # Build configuration
```

## Commands

| Command | Description |
|---------|-------------|
| `make setup` | First-time setup (creates Local.xcconfig, generates projects) |
| `make generate` | Regenerate Xcode projects from YAML specs |
| `make build` | Build debug version |
| `make build-release` | Build release version |
| `make test` | Run tests |
| `make clean` | Remove generated projects and build artifacts |
| `make xcode` | Generate projects and open in Xcode |

## Configuration

Each developer needs their own bundle IDs. On first `make setup`, a `Config/Local.xcconfig` is created from the example. Edit it with your own values:

```xcconfig
PI_DESKTOP_BUNDLE_ID = dev.yourname.pi.desktop
PI_MOBILE_BUNDLE_ID = dev.yourname.pi.mobile
```

## Requirements

- macOS with Xcode installed
- Development tools (see installation options below)

## Installation

### Option 1: Using Nix

```bash
# Enter development environment
nix develop
```

### Option 2: Using Homebrew

```bash
brew install xcodegen swiftlint
```

> **Note:** When using Homebrew, pre-commit hooks for SwiftLint are not automatically configured. You can manually run `swiftlint` before committing or set up your own pre-commit hooks.
