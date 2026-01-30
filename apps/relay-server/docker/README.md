# Pi Sandbox Docker Image

Docker image for running pi inside isolated containers.

## Building

```bash
# Build with latest pi version
docker build -t pi-sandbox:local .

# Build with specific pi version
docker build -t pi-sandbox:local --build-arg PI_VERSION=0.50.5 .
```

## Testing

```bash
# Run container interactively
docker run -it --rm pi-sandbox:local

# Run pi in RPC mode
docker run -it --rm pi-sandbox:local pi --mode rpc --no-session

# Run with workspace volume
docker run -it --rm \
  -v pi-test-workspace:/workspace \
  pi-sandbox:local
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PI_CODING_AGENT_DIR` | Pi agent data directory | `/data/agent` |
| `PI_SESSION_ID` | Session identifier | (none) |
| `CODEX_ENV_NODE_VERSION` | Node.js version (codex-universal) | (default) |
| `CODEX_ENV_PYTHON_VERSION` | Python version (codex-universal) | (default) |

## Volumes

- `/workspace` - Working directory for code
- `/data/agent` - Pi agent data (auth, models, sessions)

## Base Image

Based on [OpenAI's codex-universal](https://github.com/openai/codex-universal) image which provides:

- Multi-language runtime support (Node, Python, Go, Rust, etc.)
- Designed for AI coding agents
- Dynamic language version selection via env vars
