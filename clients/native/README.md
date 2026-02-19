# Native Clients

Swift/SwiftUI clients for Pi Apps (iOS + macOS).

## What is here

- `apps/ios/` — app target definitions and shared app source.
- `packages/pi-core/` — core models, relay API client, WS transport.
- `packages/pi-ui/` — shared SwiftUI components.
- `PiApps.xcworkspace/` — workspace that links the app + local packages.

## Build and run

Run from repo root:

```bash
just setup         # first-time setup (generates Xcode project)
just generate      # regenerate project from project.yml
just xcode         # open generated Xcode project
just build         # build macOS debug target
just build-ios     # build iOS simulator debug target
just test          # run tests
```

## Notes

- Project generation uses XcodeGen.
- If you add a new package under `clients/native/packages/`, also add it to:
  - `clients/native/PiApps.xcworkspace/contents.xcworkspacedata`
  - `clients/native/apps/ios/project.yml`
- Then run `just generate`.
