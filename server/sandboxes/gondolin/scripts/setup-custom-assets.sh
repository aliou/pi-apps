#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Build Gondolin custom assets from a local gondolin main checkout.

Usage:
  ./server/sandboxes/gondolin/scripts/setup-custom-assets.sh \
    --gondolin-src /abs/path/to/gondolin-src \
    [--config /abs/path/to/build-config.json] \
    [--output /abs/path/to/assets-dir]

Defaults:
  config: <repo>/server/sandboxes/gondolin/custom-assets.build-config.json
  output: <repo>/.dev/relay/cache/gondolin-custom/pi-runtime-main

After success, set for relay:
  export GONDOLIN_IMAGE_OUT=<output>
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

GONDOLIN_SRC=""
CONFIG_PATH="$REPO_ROOT/server/sandboxes/gondolin/custom-assets.build-config.json"
OUTPUT_PATH="$REPO_ROOT/.dev/relay/cache/gondolin-custom/pi-runtime-main"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --gondolin-src)
      GONDOLIN_SRC="$2"
      shift 2
      ;;
    --config)
      CONFIG_PATH="$2"
      shift 2
      ;;
    --output)
      OUTPUT_PATH="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$GONDOLIN_SRC" ]]; then
  echo "Missing --gondolin-src" >&2
  usage
  exit 1
fi

if [[ ! -d "$GONDOLIN_SRC/host" || ! -d "$GONDOLIN_SRC/guest" ]]; then
  echo "Invalid --gondolin-src: expected host/ and guest/ under $GONDOLIN_SRC" >&2
  exit 1
fi

if [[ ! -f "$CONFIG_PATH" ]]; then
  echo "Config not found: $CONFIG_PATH" >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found in PATH" >&2
  exit 1
fi

mkdir -p "$OUTPUT_PATH"

echo "[setup-custom-assets] gondolin src: $GONDOLIN_SRC"
echo "[setup-custom-assets] config: $CONFIG_PATH"
echo "[setup-custom-assets] output: $OUTPUT_PATH"

cd "$GONDOLIN_SRC/host"

if [[ ! -d node_modules ]]; then
  echo "[setup-custom-assets] installing host deps..."
  pnpm install
fi

echo "[setup-custom-assets] building assets..."
GONDOLIN_GUEST_SRC="$GONDOLIN_SRC/guest" \
  pnpm exec tsx bin/gondolin.ts build --config "$CONFIG_PATH" --output "$OUTPUT_PATH"

echo "[setup-custom-assets] verifying assets..."
GONDOLIN_GUEST_DIR="$OUTPUT_PATH" \
  pnpm exec tsx bin/gondolin.ts build --verify "$OUTPUT_PATH"

echo "[setup-custom-assets] smoke check (pi + npm + extension install)..."
GONDOLIN_GUEST_DIR="$OUTPUT_PATH" \
  pnpm exec tsx bin/gondolin.ts exec -- /bin/bash -lc "pi --version && npm --version && npm_config_prefix=/tmp/npm-ext npm install -g --no-audit --no-fund @aliou/pi-linkup"

echo "[setup-custom-assets] done"
echo "export GONDOLIN_IMAGE_OUT=$OUTPUT_PATH"
