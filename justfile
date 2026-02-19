# Pi Apps - Development Tasks

# Import submodules
mod sandboxes 'server/sandboxes/justfile'

# Default to showing available tasks
[private]
default:
    @just --list

# =============================================================================
# Setup
# =============================================================================

# First-time setup (generates Xcode project)
setup: generate
    @echo "Setup complete! Run 'just xcode' to open the project."

# Regenerate Xcode project from project.yml
generate:
    @echo "==> Generating Xcode project..."
    cd clients/native/apps/ios && xcodegen generate --quiet
    @echo "Generated clients/native/apps/ios/PiNative.xcodeproj"

# =============================================================================
# Building (Native)
# =============================================================================

# Build macOS (debug)
build: generate
    @echo "==> Building PiNative macOS (Debug)..."
    xcodebuild -project clients/native/apps/ios/PiNative.xcodeproj \
        -scheme "PiNative macOS" \
        -configuration Debug \
        build 2>&1 | grep -E "^(Build|Compile|Link|error:|warning:)" || true

# Build iOS (debug, simulator)
build-ios: generate
    @echo "==> Building PiNative iOS (Debug)..."
    xcodebuild -project clients/native/apps/ios/PiNative.xcodeproj \
        -scheme "PiNative iOS" \
        -configuration Debug \
        -destination 'generic/platform=iOS Simulator' \
        build 2>&1 | grep -E "^(Build|Compile|Link|error:|warning:)" || true

# Build macOS (release)
build-release: generate
    @echo "==> Building PiNative macOS (Release)..."
    xcodebuild -project clients/native/apps/ios/PiNative.xcodeproj \
        -scheme "PiNative macOS" \
        -configuration Release \
        build 2>&1 | grep -E "^(Build|Compile|Link|error:|warning:)" || true

# =============================================================================
# Testing
# =============================================================================

# Run tests
test: generate
    @echo "==> Running tests..."
    xcodebuild -project clients/native/apps/ios/PiNative.xcodeproj \
        -scheme "PiNative macOS" \
        -configuration Debug \
        test 2>&1 | grep -E "^(Test|Executed|error:|warning:|\*\*)" || true

# =============================================================================
# Cleaning
# =============================================================================

# Remove generated projects and build artifacts
clean:
    @echo "==> Cleaning generated projects..."
    rm -rf clients/native/apps/ios/PiNative.xcodeproj
    @echo "==> Cleaning DerivedData..."
    rm -rf ~/Library/Developer/Xcode/DerivedData/PiNative-*
    @echo "Clean complete"

# =============================================================================
# Development
# =============================================================================

# Start relay server and dashboard (parallel, hot reload)
dev:
    @echo "==> Starting relay server and dashboard in dev mode..."
    trap 'kill 0' INT TERM EXIT; \
        pnpm --prefix server/relay dev & \
        pnpm --prefix clients/dashboard dev & \
        wait

# Generate project and open in Xcode
xcode: generate
    open clients/native/apps/ios/PiNative.xcodeproj

# =============================================================================
# Short aliases
# =============================================================================

alias b := build
alias bi := build-ios
alias br := build-release
alias d := dev
alias g := generate
alias t := test
alias x := xcode
