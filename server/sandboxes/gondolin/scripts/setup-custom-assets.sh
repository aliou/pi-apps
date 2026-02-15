#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Build Gondolin custom assets using the released Gondolin host package and guest
source cloned into a temporary directory.

Usage:
  ./server/sandboxes/gondolin/scripts/setup-custom-assets.sh \
    [--gondolin-ref v0.3.0] \
    [--config /abs/path/to/build-config.json] \
    [--output /abs/path/to/assets-dir]

Defaults:
  gondolin-ref: v0.3.0
  config: <repo>/server/sandboxes/gondolin/custom-assets.build-config.json
  output: <repo>/.dev/relay/cache/gondolin-custom/pi-runtime-main

After success, set for relay:
  export GONDOLIN_IMAGE_OUT=<output>
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
RELAY_DIR="$REPO_ROOT/server/relay"

GONDOLIN_REF="v0.3.0"
GONDOLIN_REPO_URL="https://github.com/earendil-works/gondolin.git"
CONFIG_PATH="$REPO_ROOT/server/sandboxes/gondolin/custom-assets.build-config.json"
OUTPUT_PATH="$REPO_ROOT/.dev/relay/cache/gondolin-custom/pi-runtime-main"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --gondolin-ref)
      GONDOLIN_REF="$2"
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

if [[ ! -f "$CONFIG_PATH" ]]; then
  echo "Config not found: $CONFIG_PATH" >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found in PATH" >&2
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "git not found in PATH" >&2
  exit 1
fi

if [[ ! -d "$RELAY_DIR" ]]; then
  echo "Relay dir not found: $RELAY_DIR" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d "$REPO_ROOT/.tmp-gondolin-src-XXXXXX")"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$OUTPUT_PATH"

echo "[setup-custom-assets] gondolin repo: $GONDOLIN_REPO_URL"
echo "[setup-custom-assets] gondolin ref: $GONDOLIN_REF"
echo "[setup-custom-assets] tmp dir: $TMP_DIR"
echo "[setup-custom-assets] config: $CONFIG_PATH"
echo "[setup-custom-assets] output: $OUTPUT_PATH"

echo "[setup-custom-assets] cloning gondolin guest source..."
git clone --depth 1 --branch "$GONDOLIN_REF" "$GONDOLIN_REPO_URL" "$TMP_DIR/gondolin"

if [[ ! -d "$TMP_DIR/gondolin/guest" ]]; then
  echo "Cloned gondolin ref does not contain guest/: $GONDOLIN_REF" >&2
  exit 1
fi

cd "$RELAY_DIR"

echo "[setup-custom-assets] ensuring relay deps..."
pnpm install --frozen-lockfile

echo "[setup-custom-assets] building assets..."
GONDOLIN_GUEST_SRC="$TMP_DIR/gondolin/guest" \
  pnpm exec gondolin build --config "$CONFIG_PATH" --output "$OUTPUT_PATH"

echo "[setup-custom-assets] verifying assets..."
GONDOLIN_GUEST_DIR="$OUTPUT_PATH" \
  pnpm exec gondolin build --verify "$OUTPUT_PATH"

echo "[setup-custom-assets] smoke check (pi + npm + extension install)..."
GONDOLIN_GUEST_DIR="$OUTPUT_PATH" \
  pnpm exec gondolin exec -- /bin/bash -lc "pi --version && npm --version && npm_config_prefix=/tmp/npm-ext npm install -g --no-audit --no-fund @aliou/pi-linkup"

echo "[setup-custom-assets] done"
echo "export GONDOLIN_IMAGE_OUT=$OUTPUT_PATH"
