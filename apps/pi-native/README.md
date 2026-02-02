# Pi Native

Pi Native is a fresh, multi-platform SwiftUI client for Pi designed for iPhone and macOS.
It is intentionally isolated from the existing desktop and mobile codebases so it can
serve as a clean reference implementation.

## Generate the Xcode project

```bash
xcodegen generate
```

## Open the project

```bash
open PiNative.xcodeproj
```

## Notes

- Targets: **PiNative-iOS** and **PiNative-macOS**
- Deployment targets are set to platform version 26.0 as requested.
- UI uses a glass-like material style to align with modern Liquid Glass design.
