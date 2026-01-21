.PHONY: all setup generate build build-release test clean xcode help \
	server-build server-build-linux-arm64 server-build-darwin-arm64

# Tools
XCODEGEN := xcodegen

# Project
WORKSPACE := PiApps.xcworkspace
DESKTOP_PROJECT := apps/desktop/pi-desktop.xcodeproj
DESKTOP_SCHEME := Pi Desktop

# Default target
all: build

# =============================================================================
# Setup
# =============================================================================

setup:
	@echo "==> Setting up pi-apps development environment"
	@if [ ! -f Config/Local.xcconfig ]; then \
		cp Config/Local.xcconfig.example Config/Local.xcconfig; \
		echo "Created Config/Local.xcconfig"; \
		echo "Edit this file to set your bundle IDs (optional but recommended)"; \
	else \
		echo "Config/Local.xcconfig already exists"; \
	fi
	@$(MAKE) generate
	@echo ""
	@echo "Setup complete! Run 'make xcode' to open the project."

# =============================================================================
# Project Generation
# =============================================================================

generate:
	@echo "==> Generating Xcode projects..."
	@cd apps/desktop && $(XCODEGEN) generate --quiet
	@cd apps/mobile && $(XCODEGEN) generate --quiet
	@mkdir -p $(WORKSPACE)
	@echo '<?xml version="1.0" encoding="UTF-8"?><Workspace version="1.0"><FileRef location="group:apps/desktop/pi-desktop.xcodeproj"></FileRef><FileRef location="group:apps/mobile/pi-mobile.xcodeproj"></FileRef><FileRef location="group:packages/pi-core"></FileRef></Workspace>' > $(WORKSPACE)/contents.xcworkspacedata
	@echo "Generated $(WORKSPACE)"

# =============================================================================
# Building
# =============================================================================

build: generate
	@echo "==> Building Pi (Debug)..."
	@xcodebuild -project $(DESKTOP_PROJECT) \
		-scheme "$(DESKTOP_SCHEME)" \
		-configuration Debug \
		build \
		| grep -E "^(Build|Compile|Link|error:|warning:)" || true

build-release: generate
	@echo "==> Building Pi (Release)..."
	@xcodebuild -project $(DESKTOP_PROJECT) \
		-scheme "$(DESKTOP_SCHEME)" \
		-configuration Release \
		build \
		| grep -E "^(Build|Compile|Link|error:|warning:)" || true

# =============================================================================
# Server Builds
# =============================================================================

SERVER_DIR := apps/server
SERVER_DIST := $(SERVER_DIR)/dist

server-build-linux-arm64:
	@echo "==> Building pi-server (linux-arm64)..."
	@cd $(SERVER_DIR) && bun build --compile --target=bun-linux-arm64 src/index.ts --outfile dist/pi-server-linux-arm64
	@cp $(SERVER_DIR)/node_modules/@mariozechner/pi-coding-agent/package.json $(SERVER_DIST)/

server-build-darwin-arm64:
	@echo "==> Building pi-server (darwin-arm64)..."
	@cd $(SERVER_DIR) && bun build --compile --target=bun-darwin-arm64 src/index.ts --outfile dist/pi-server-darwin-arm64
	@cp $(SERVER_DIR)/node_modules/@mariozechner/pi-coding-agent/package.json $(SERVER_DIST)/

server-build: server-build-linux-arm64 server-build-darwin-arm64
	@echo "==> All server binaries built in $(SERVER_DIST)/"

# =============================================================================
# Testing
# =============================================================================

test: generate
	@echo "==> Running tests..."
	@xcodebuild -project $(DESKTOP_PROJECT) \
		-scheme "$(DESKTOP_SCHEME)" \
		-configuration Debug \
		test \
		| grep -E "^(Test|Executed|error:|warning:|\\*\\*)" || true

# =============================================================================
# Cleaning
# =============================================================================

clean:
	@echo "==> Cleaning generated projects..."
	@rm -rf apps/desktop/*.xcodeproj
	@rm -rf apps/mobile/*.xcodeproj
	@rm -rf $(WORKSPACE)
	@echo "==> Cleaning DerivedData..."
	@rm -rf ~/Library/Developer/Xcode/DerivedData/Pi-*
	@rm -rf ~/Library/Developer/Xcode/DerivedData/PiApps-*
	@echo "Clean complete"

# =============================================================================
# Development
# =============================================================================

xcode: generate
	@open $(WORKSPACE)

# =============================================================================
# Help
# =============================================================================

help:
	@echo "Pi Apps Build System"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Setup:"
	@echo "  setup         - First-time setup (creates Local.xcconfig, generates projects)"
	@echo "  generate      - Regenerate Xcode projects from YAML specs"
	@echo ""
	@echo "Building (Desktop):"
	@echo "  build         - Build debug version"
	@echo "  build-release - Build release version"
	@echo "  test          - Run tests"
	@echo ""
	@echo "Building (Server):"
	@echo "  server-build              - Build all aarch64 binaries"
	@echo "  server-build-linux-arm64  - Build for Linux aarch64"
	@echo "  server-build-darwin-arm64 - Build for macOS aarch64"
	@echo ""
	@echo "Other:"
	@echo "  clean         - Remove generated projects and build artifacts"
	@echo "  xcode         - Generate projects and open in Xcode"
	@echo "  help          - Show this message"
