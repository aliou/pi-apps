# Pi Server

WebSocket server for the pi coding agent. Enables remote clients (iOS, etc.) to use pi's AgentSession via WebSocket.

## Quick Start

```bash
# Install dependencies
bun install

# Run in development mode (with hot reload)
bun run dev

# Build standalone binary
bun run build
```

## Configuration

### CLI Options

```bash
pi-server [options]

Options:
  --port, -p <port>       Listen port (default: 3000)
  --host <host>           Bind host (default: 0.0.0.0)
  --data-dir <path>       Data directory
  --help, -h              Show help
```

### Environment Variables

- `PI_SERVER_PORT` - Listen port
- `PI_SERVER_DATA_DIR` - Data directory

### .env File

The server loads a `.env` file from the data directory if it exists. Use this to set API keys for additional providers and GitHub access:

```bash
# <data-dir>/.env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GITHUB_TOKEN=ghp_...
```

### Authentication

For pi authentication, symlink or copy your `auth.json`:

```bash
ln -s ~/.pi/agent/auth.json /path/to/data-dir/auth.json
```

### Data Directory

Default location follows XDG spec:
- `$XDG_DATA_HOME/pi-server/` if set
- `~/.local/share/pi-server/` otherwise

Structure:
```
<data-dir>/
├── .env                # Environment variables (API keys)
├── auth.json           # Pi authentication (symlink to ~/.pi/agent/auth.json)
├── repos.json          # Repository definitions
├── sessions/           # Pi session files + session repos
└── state.json          # Server state
```

## Repo Configuration

Repositories are pulled from GitHub using `GITHUB_TOKEN`. The `repos.list` RPC method returns all repos accessible by the token. When a session is created, the server clones the selected repo into the session directory and writes an entry to `repos.json` for that session.

Example entry (managed by the server):

```json
{
  "repos": [
    {
      "id": "owner/name",
      "name": "name",
      "fullName": "owner/name",
      "path": "/path/to/data-dir/sessions/<sessionId>/repo",
      "sessionId": "<sessionId>",
      "defaultBranch": "main",
      "branchName": "pi/session-<sessionId>",
      "cloneUrl": "https://github.com/owner/name.git"
    }
  ]
}
```

## WebSocket Protocol

Connect to `ws://<host>:<port>/rpc`

### Message Format

**Request (client → server):**
```json
{
  "v": 1,
  "kind": "request",
  "id": "unique-id",
  "sessionId": "session-uuid",
  "method": "prompt",
  "params": { "message": "Hello" }
}
```

**Response (server → client):**
```json
{
  "v": 1,
  "kind": "response",
  "id": "unique-id",
  "ok": true,
  "result": { ... }
}
```

**Event (server → client):**
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

| Method | Params | Description |
|--------|--------|-------------|
| `hello` | `{client: {name, version}, resume?}` | Handshake, returns connectionId |
| `repos.list` | - | List available repos |
| `session.create` | `{repoId}` | Create new session with worktree |
| `session.list` | - | List all sessions |
| `session.attach` | `{sessionId}` | Attach to receive session events |
| `session.delete` | `{sessionId}` | Delete session and worktree |
| `prompt` | `{message}` | Send prompt (requires sessionId) |
| `abort` | - | Abort current operation |
| `get_state` | - | Get session state |
| `get_messages` | - | Get conversation history |
| `get_available_models` | - | List available models |
| `set_model` | `{provider, modelId}` | Change model |

### Events

Events from the agent are forwarded to attached clients:
- `agent_start` / `agent_end`
- `message_start` / `message_update` / `message_end`
- `tool_execution_start` / `tool_execution_update` / `tool_execution_end`
- `turn_start` / `turn_end`
- etc.

## HTTP Endpoints

- `GET /` - Server info
- `GET /health` - Health check

## Development

```bash
# Type check
bun run typecheck

# Run with watch
bun run dev
```

## Deployment

Build a standalone binary:

```bash
bun run build
./dist/pi-server --port 3000 --data-dir /var/lib/pi-server
```

The binary includes all dependencies and can be deployed without Node.js/Bun installed.
