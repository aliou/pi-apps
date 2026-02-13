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


## Usage

From repo root:

```bash
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
- `bun` only needed when conversion is required (docker2vm path)
- Docker image source available locally or pullable
