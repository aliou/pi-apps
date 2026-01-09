#!/bin/bash
set -e

# Download pi CLI binary from GitHub releases
# Usage: ./download-pi.sh [version]

VERSION="${1:-latest}"
PLATFORM="darwin"
ARCH="arm64"
BIN_DIR="$(cd "$(dirname "$0")/.." && pwd)/bin"
TMP_DIR=$(mktemp -d)

rm -rf "$BIN_DIR"
mkdir -p "$BIN_DIR"

if [ "$VERSION" = "latest" ]; then
    # Get latest version tag
    VERSION=$(curl -sL "https://api.github.com/repos/badlogic/pi-mono/releases/latest" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
fi

DOWNLOAD_URL="https://github.com/badlogic/pi-mono/releases/download/${VERSION}/pi-${PLATFORM}-${ARCH}.tar.gz"

echo "Downloading pi ${VERSION} from: $DOWNLOAD_URL"
curl -L -o "$TMP_DIR/pi.tar.gz" "$DOWNLOAD_URL"

echo "Extracting..."
tar -xzf "$TMP_DIR/pi.tar.gz" -C "$BIN_DIR"
rm -f "$BIN_DIR/pi.tar.gz"

chmod +x "$BIN_DIR/pi"
rm -rf "$TMP_DIR"

echo "Downloaded pi to: $BIN_DIR/pi"
"$BIN_DIR/pi" --version
