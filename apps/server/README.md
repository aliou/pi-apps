# Pi Server

WebSocket server for the pi coding agent. Enables iOS and remote clients to use pi.

## Quick Start

```bash
bun install
bun run dev    # with hot reload
```

## CLI Options

```bash
pi-server [options]
  --port, -p <port>    Listen port (default: 3141)
  --host <host>        Bind host (default: 0.0.0.0)
  --data-dir <path>    Data directory
```

## Configuration

### Data Directory

Default: `~/.local/share/pi-server/` (or `$XDG_DATA_HOME/pi-server/`)

```
<data-dir>/
├── .env           # API keys (OPENAI_API_KEY, ANTHROPIC_API_KEY, GITHUB_TOKEN)
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
bun run build
./dist/pi-server --port 3141 --data-dir /var/lib/pi-server
```

Standalone binary, no runtime required.
