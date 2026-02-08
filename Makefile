.PHONY: all setup generate build build-release test clean xcode help

# Tools
XCODEGEN := xcodegen

# Project
NATIVE_DIR := clients/native/apps/ios
NATIVE_PROJECT := $(NATIVE_DIR)/PiNative.xcodeproj
WORKSPACE := clients/native/PiApps.xcworkspace
MACOS_SCHEME := PiNative macOS
IOS_SCHEME := PiNative iOS

# Default target
all: build

# =============================================================================
# Setup
# =============================================================================

setup:
	@echo "==> Setting up development environment"
	@$(MAKE) generate
	@echo ""
	@echo "Setup complete! Run 'make xcode' to open the project."

# =============================================================================
# Project Generation
# =============================================================================

generate:
	@echo "==> Generating Xcode project..."
	@cd $(NATIVE_DIR) && $(XCODEGEN) generate --quiet
	@echo "Generated $(NATIVE_PROJECT)"

# =============================================================================
# Building
# =============================================================================

build: generate
	@echo "==> Building PiNative macOS (Debug)..."
	@xcodebuild -project $(NATIVE_PROJECT) \
		-scheme "$(MACOS_SCHEME)" \
		-configuration Debug \
		build \
		| grep -E "^(Build|Compile|Link|error:|warning:)" || true

build-ios: generate
	@echo "==> Building PiNative iOS (Debug)..."
	@xcodebuild -project $(NATIVE_PROJECT) \
		-scheme "$(IOS_SCHEME)" \
		-configuration Debug \
		-destination 'generic/platform=iOS Simulator' \
		build \
		| grep -E "^(Build|Compile|Link|error:|warning:)" || true

build-release: generate
	@echo "==> Building PiNative macOS (Release)..."
	@xcodebuild -project $(NATIVE_PROJECT) \
		-scheme "$(MACOS_SCHEME)" \
		-configuration Release \
		build \
		| grep -E "^(Build|Compile|Link|error:|warning:)" || true

# =============================================================================
# Testing
# =============================================================================

test: generate
	@echo "==> Running tests..."
	@xcodebuild -project $(NATIVE_PROJECT) \
		-scheme "$(MACOS_SCHEME)" \
		-configuration Debug \
		test \
		| grep -E "^(Test|Executed|error:|warning:|\\*\\*)" || true

# =============================================================================
# Cleaning
# =============================================================================

clean:
	@echo "==> Cleaning generated projects..."
	@rm -rf $(NATIVE_PROJECT)
	@echo "==> Cleaning DerivedData..."
	@rm -rf ~/Library/Developer/Xcode/DerivedData/PiNative-*
	@echo "Clean complete"

# =============================================================================
# Development
# =============================================================================

xcode: generate
	@open $(NATIVE_PROJECT)

# =============================================================================
# Help
# =============================================================================

help:
	@echo "Pi Apps Build System"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Setup:"
	@echo "  setup         - First-time setup (generates Xcode project)"
	@echo "  generate      - Regenerate Xcode project from project.yml"
	@echo ""
	@echo "Building (Native):"
	@echo "  build         - Build macOS (debug)"
	@echo "  build-ios     - Build iOS (debug, simulator)"
	@echo "  build-release - Build macOS (release)"
	@echo "  test          - Run tests"
	@echo ""
	@echo "Other:"
	@echo "  clean         - Remove generated projects and build artifacts"
	@echo "  xcode         - Generate project and open in Xcode"
	@echo "  help          - Show this message"
