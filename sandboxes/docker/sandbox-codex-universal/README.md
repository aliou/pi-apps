# Pi Sandbox: Codex Universal

Default sandbox image for running pi in isolated containers. Based on [OpenAI's codex-universal](https://github.com/openai/codex-universal) image, which provides a multi-language environment (Node.js, Python, Go, Rust, etc.).

Published to GHCR as `ghcr.io/aliou/pi-sandbox-codex-universal`.

## Building

```bash
# Build locally
docker build -t pi-sandbox-codex-universal:local .

# Build with specific pi version (GitHub release expects v prefix, added automatically)
docker build --build-arg PI_VERSION=0.51.5 -t pi-sandbox-codex-universal:local .
```

## Image Details

- **Base**: `ghcr.io/openai/codex-universal:latest` (~5GB)
- **Pi**: Downloaded from GitHub releases (binary, no Node.js runtime needed)
- **Multi-language**: Node.js, Python, Go, Rust, etc. pre-installed
- **User**: Runs as non-root `user` for security

## Secrets Management

**Secrets are NOT passed as environment variables** (visible in `docker inspect`, `/proc`).

Instead, secrets are mounted as read-only files in `/run/secrets/`:

```
/run/secrets/
├── anthropic_api_key    # Contains: sk-ant-...
├── openai_api_key       # Contains: sk-...
└── groq_api_key         # Contains: gsk_...
```

The entrypoint script automatically loads these files into environment variables:
- `/run/secrets/anthropic_api_key` → `ANTHROPIC_API_KEY`
- `/run/secrets/openai_api_key` → `OPENAI_API_KEY`

### Why Files Instead of Env Vars?

| Method | `docker inspect` | `/proc/[pid]/environ` | Logs |
|--------|-----------------|----------------------|------|
| Env vars | Visible | Visible | Often leaked |
| Mounted files | Path only | Hidden | Safer |

## Testing Locally

```bash
# Run with pi version check
docker run --rm pi-sandbox-codex-universal:local pi --version

# Run with mounted secrets
echo "sk-test-key" > /tmp/anthropic_api_key
docker run --rm \
  -v /tmp/anthropic_api_key:/run/secrets/anthropic_api_key:ro \
  pi-sandbox-codex-universal:local \
  bash -c 'echo "Key loaded: ${ANTHROPIC_API_KEY:0:10}..."'

# Run pi in RPC mode
docker run --rm -i \
  -v /tmp/anthropic_api_key:/run/secrets/anthropic_api_key:ro \
  pi-sandbox-codex-universal:local \
  pi --mode rpc --no-session
```

## Relay Server Integration

The relay server uses this image by default for sandboxed sessions:
1. Stores API keys encrypted in SQLite (AES-256-GCM)
2. Decrypts keys at container creation time
3. Writes keys to temp files on host (mode 0400)
4. Mounts temp directory as `/run/secrets:ro`
5. Cleans up temp files when container stops

Configure the relay:
```bash
export SANDBOX_PROVIDER=docker
export SANDBOX_DOCKER_IMAGE=ghcr.io/aliou/pi-sandbox-codex-universal:main
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
