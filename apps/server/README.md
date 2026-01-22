# Pi Server

WebSocket server for the pi coding agent. Enables iOS and remote clients to use pi.

## Quick Start

```bash
npm install
npm run dev    # with hot reload
```

## Development

```bash
npm run dev        # run with hot reload (tsx watch)
npm run build      # production build (esbuild)
npm run typecheck  # type check with tsgo
npm run lint       # lint with biome
npm run format     # format with biome
npm run test       # run tests
```

## CLI Options

```bash
node dist/index.js [options]
  --port, -p <port>    Listen port (default: 31415)
  --host <host>        Bind host (default: ::)
  --data-dir <path>    Data directory
  --tls-cert <path>    TLS certificate file
  --tls-key <path>     TLS private key file
```

## Configuration

### Data Directory

Default: `~/.local/share/pi-server/` (or `$XDG_DATA_HOME/pi-server/`)

```
<data-dir>/
├── .env           # API keys (OPENAI_API_KEY, ANTHROPIC_API_KEY, PI_SERVER_GITHUB_TOKEN)
├── auth.json      # pi auth (symlink to ~/.pi/agent/auth.json)
├── repos.json     # cloned repos
├── sessions/      # session data + repo worktrees
└── state.json     # server state
```

### Authentication

```bash
ln -s ~/.pi/agent/auth.json /path/to/data-dir/auth.json
```

## WebSocket Protocol

Connect to `ws://<host>:<port>/rpc`

### Request

```json
{
  "v": 1,
  "kind": "request",
  "id": "uuid",
  "sessionId": "session-uuid",
  "method": "prompt",
  "params": { "message": "Hello" }
}
```

### Response

```json
{
  "v": 1,
  "kind": "response",
  "id": "uuid",
  "ok": true,
  "result": { ... }
}
```

### Event

```json
{
  "v": 1,
  "kind": "event",
  "sessionId": "session-uuid",
  "seq": 1,
  "type": "message_update",
  "payload": { ... }
}
```

### Methods

| Method | Description |
|--------|-------------|
| `hello` | Handshake, returns connectionId |
| `repos.list` | List available repos |
| `session.create` | Create session with repo worktree |
| `session.list` | List sessions |
| `session.attach` | Subscribe to session events |
| `session.delete` | Delete session |
| `prompt` | Send message to agent |
| `abort` | Cancel current operation |
| `get_state` | Get session state |
| `get_messages` | Get conversation history |
| `get_available_models` | List models |
| `set_model` | Change model |

## HTTP Endpoints

- `GET /` - Server info
- `GET /health` - Health check

## Build

```bash
npm run build
node dist/index.js --port 31415 --data-dir /var/lib/pi-server
```

The build outputs a bundled JS file. `@mariozechner/pi-coding-agent` is externalized (must be in node_modules at runtime).

## Docker

The server is published to GitHub Container Registry on every push to main.

### Pull and Run

```bash
# Pull the image
docker pull ghcr.io/aliou/pi-apps/server:main

# Create data directory and .env
mkdir -p ~/.local/share/pi-server
cat > ~/.local/share/pi-server/.env <<EOF
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
PI_SERVER_GITHUB_TOKEN=ghp_...
EOF

# Run
docker run -d \
  --name pi-server \
  -p 31415:31415 \
  -v ~/.local/share/pi-server:/data \
  ghcr.io/aliou/pi-apps/server:main
```

### TLS

To enable HTTPS/WSS, mount your certificates and pass the paths:

```bash
# Place certificates in data directory
mkdir -p ~/.local/share/pi-server/certs
cp server.crt server.key ~/.local/share/pi-server/certs/

# Run with TLS
docker run -d \
  --name pi-server \
  -p 31415:31415 \
  -v ~/.local/share/pi-server:/data \
  ghcr.io/aliou/pi-apps/server:main \
  node dist/index.js \
    --host 0.0.0.0 \
    --tls-cert /data/certs/server.crt \
    --tls-key /data/certs/server.key
```

Both `--tls-cert` and `--tls-key` must be provided together. When TLS is enabled, the server listens on `https://` and WebSocket connections use `wss://`.
