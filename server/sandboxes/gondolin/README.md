# Gondolin sandbox scripts

This directory contains Gondolin-specific validation scripts.

## Scripts

- `scripts/probe-pi-rpc.mjs`
  - Single direct `pi` RPC probe (no LLM prompt)
  - Ensures VM assets exist (uses docker2vm conversion if needed)
  - Starts `pi --mode rpc`
  - Sends llm-less commands:
    - `get_state`
    - `set_session_name`
    - `get_state`
  - Verifies the session name change is applied in state
  - Uses `ANTHROPIC_API_KEY=test-key` fallback only to keep model selection available; no model call is made

- `scripts/setup-custom-assets.sh`
  - Builds custom Gondolin assets using released host package + temp clone of Gondolin guest source
  - Defaults to cloning tag `v0.3.0` into a temporary directory and wiring `GONDOLIN_GUEST_SRC`
  - Uses `custom-assets.build-config.json` (nodejs/npm/git + `apk add npm` + pi install in postBuild)
  - Verifies assets and runs smoke check (`pi --version`, `npm --version`, extension `npm install -g`)


## Usage

From repo root:

```bash
# Build custom assets (defaults to gondolin v0.3.0 guest source)
./server/sandboxes/gondolin/scripts/setup-custom-assets.sh

# Optional: pin a different gondolin tag/ref
./server/sandboxes/gondolin/scripts/setup-custom-assets.sh \
  --gondolin-ref v0.3.0

# Direct pi RPC probe (recommended before relay wiring)
node server/sandboxes/gondolin/scripts/probe-pi-rpc.mjs

# Optional: override source Docker image for conversion
GONDOLIN_SOURCE_IMAGE=ghcr.io/aliou/pi-sandbox-alpine-arm64:latest \
node server/sandboxes/gondolin/scripts/probe-pi-rpc.mjs

# Optional: use prebuilt Gondolin assets (skip conversion)
GONDOLIN_IMAGE_OUT=/abs/path/to/assets \
node server/sandboxes/gondolin/scripts/probe-pi-rpc.mjs
```

## Requirements

- `@earendil-works/gondolin` available in `server/relay` deps
- `git` available (script clones Gondolin guest source tag into temp dir)
- `bun` only needed when conversion is required (docker2vm path)
- Docker image source available locally or pullable
