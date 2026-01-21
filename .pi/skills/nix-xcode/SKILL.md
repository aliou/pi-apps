---
name: nix-xcode
description: Building iOS/macOS apps with Xcode from nix-shell. Use when running xcodebuild or xcrun commands from a Nix dev shell. Covers xcodeenv.composeXcodeWrapper and environment setup.
---

# Xcode Development from Nix Shell

## The Problem

Nix shells set environment variables (`SDKROOT`, `CC`, `LD`) that interfere with Xcode tooling. Additionally, some nix packages (like `swiftlint`) depend on `xcbuild` which provides its own `xcrun` that can't find tools like `simctl`.

**Symptoms:**
- `error: tool 'simctl' not found`
- "SDK not found" errors
- Missing iOS Simulator or device platforms
- Linker errors with malformed `-Xlinker` flags

## The Solution: xcodeenv.composeXcodeWrapper

Use `mkShellNoCC` with the official nixpkgs Xcode wrapper:

```nix
{
  pkgs ? import <nixpkgs> { },
}:
let
  xcodeWrapper = pkgs.xcodeenv.composeXcodeWrapper {
    versions = [ ]; # Empty = allow any version
  };
in
pkgs.mkShellNoCC {  # Use mkShellNoCC to avoid nix CC/LD wrappers
  packages = with pkgs; [
    swiftlint
    # other dependencies
  ];

  shellHook = ''
    export PATH="${xcodeWrapper}/bin:$PATH"
    export DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer"

    # Unset CC/LD in case outer environment has nix compiler wrappers
    unset CC LD
  '';

  # Do NOT set SDKROOT - it breaks xcodebuild linker arguments
}
```

**Why this works:**

1. `mkShellNoCC` avoids bringing in stdenv's CC/LD wrappers that interfere with Xcode's linker
2. `xcodeWrapper` creates symlinks to `/usr/bin/xcrun`, `/usr/bin/xcodebuild`, etc.
3. `shellHook` prepends it to PATH, overriding xcbuild's xcrun
4. `DEVELOPER_DIR` tells xcrun where to find Xcode tools like simctl
5. `unset CC LD` handles cases where outer nix environment leaks compiler vars

## What xcodeWrapper Provides

The wrapper symlinks these macOS system binaries:
- `/usr/bin/xcrun`
- `/usr/bin/xcodebuild` (or version-checking wrapper)
- `/usr/bin/codesign`
- `/usr/bin/security`
- `/usr/bin/plutil`
- `/usr/bin/clang`
- `/usr/bin/lipo`
- `Simulator.app`

## xcodebuild Quick Reference

### Build for Simulator

```bash
xcodebuild build \
  -project MyApp.xcodeproj \
  -scheme MyApp \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -quiet
```

### Build for Device (No Signing)

```bash
xcodebuild build \
  -project MyApp.xcodeproj \
  -scheme MyApp \
  -destination 'generic/platform=iOS' \
  CODE_SIGN_IDENTITY="" \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGNING_ALLOWED=NO
```

### Common Destinations

| Platform | Destination |
|----------|-------------|
| iOS Simulator | `platform=iOS Simulator,name=iPhone 17` |
| iOS Device | `generic/platform=iOS` |
| watchOS Simulator | `platform=watchOS Simulator,name=Apple Watch Series 10` |
| macOS | `platform=macOS` |

## xcrun simctl Commands

```bash
# List booted simulators
xcrun simctl list devices booted

# Get app info for booted simulator
xcrun simctl listapps booted

# Open URL in simulator
xcrun simctl openurl booted "myapp://path"

# Add media to simulator
xcrun simctl addmedia booted /path/to/image.jpg

# Boot a simulator
xcrun simctl boot "iPhone 17"
```

## Troubleshooting

### Still getting xcbuild's xcrun?

Ensure `shellHook` prepends (not appends) the wrapper to PATH:
```nix
export PATH="${xcodeWrapper}/bin:$PATH"
```

### Multiple Xcode versions?

Point to the correct one:
```nix
shellHook = ''
  export PATH="${xcodeWrapper}/bin:$PATH"
  export DEVELOPER_DIR="/Applications/Xcode-beta.app/Contents/Developer"
'';
```

### Linker errors with `-Xlinker` flags?

If you see errors like:
```
ld: unknown options: -Xlinker -isysroot -Xlinker -Xlinker ...
```

This means nix's CC/LD wrappers are interfering. Fix:
1. Use `mkShellNoCC` instead of `mkShell`
2. Add `unset CC LD` to shellHook
3. Do NOT set `SDKROOT` in your shell

### Verify setup

```bash
which xcrun        # Should show nix store path with xcode-wrapper
xcrun --find simctl # Should return path in Xcode.app
xcodebuild -version # Should show Xcode version
echo $CC $LD       # Should be empty
```
