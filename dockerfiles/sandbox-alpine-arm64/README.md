# Pi Sandbox: Alpine ARM64

Lightweight sandbox image for running pi in isolated containers on ARM64 hosts. Based on Alpine Linux for minimal image size.

Published to GHCR as `ghcr.io/aliou/pi-sandbox-alpine-arm64`.

## Building

```bash
# Build locally
docker build -t pi-sandbox-alpine-arm64:local .

# Build with specific pi version
docker build --build-arg PI_VERSION=v0.50.6 -t pi-sandbox-alpine-arm64:local .
```

## Image Details

- **Base**: `alpine:3.21` (~200MB built)
- **Platform**: `linux/arm64` only
- **Pi**: Downloaded from GitHub releases (binary, no Node.js runtime needed)
- **Tools**: git, curl, jq, ripgrep, fd
- **User**: Runs as non-root `user` for security

## Secrets Management

Same as codex-universal. Secrets are mounted as read-only files in `/run/secrets/`:

```
/run/secrets/
├── anthropic_api_key    # Contains: sk-ant-...
├── openai_api_key       # Contains: sk-...
└── groq_api_key         # Contains: gsk_...
```

The entrypoint script automatically loads these files into environment variables.

## Testing Locally

```bash
# Run with pi version check
docker run --rm pi-sandbox-alpine-arm64:local pi --version

# Run with mounted secrets
echo "sk-test-key" > /tmp/anthropic_api_key
docker run --rm \
  -v /tmp/anthropic_api_key:/run/secrets/anthropic_api_key:ro \
  pi-sandbox-alpine-arm64:local \
  bash -c 'echo "Key loaded: ${ANTHROPIC_API_KEY:0:10}..."'

# Run pi in RPC mode
docker run --rm -i \
  -v /tmp/anthropic_api_key:/run/secrets/anthropic_api_key:ro \
  pi-sandbox-alpine-arm64:local \
  pi --mode rpc --no-session
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PI_CODING_AGENT_DIR` | Pi agent data directory | `/data/agent` |
| `PI_SECRETS_DIR` | Directory containing secret files | `/run/secrets` |
| `PI_SESSION_ID` | Session ID (set by relay) | - |

## Volumes

| Path | Purpose |
|------|---------|
| `/workspace` | Git repository / working directory |
| `/data/agent` | Pi agent config and sessions |
| `/run/secrets` | Mounted secrets (read-only) |
