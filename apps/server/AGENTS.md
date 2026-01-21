# Pi Server

WebSocket server for remote pi access. Bun + Hono.

## Build

```bash
bun install
bun run dev       # hot reload
bun run build     # standalone binary
bun run typecheck # type check
bun run lint      # biome
```

## Key Files

- `src/index.ts` - server entry, HTTP + WebSocket setup
- `src/ws/handler.ts` - WebSocket message routing
- `src/ws/connection.ts` - connection state management
- `src/session/` - pi session management
- `src/github.ts` - GitHub API for repo listing
- `src/config.ts` - CLI args, env vars

## Protocol

WebSocket at `/rpc`. JSON-RPC style messages:

- `hello` - handshake
- `session.create/list/attach/delete` - session management
- `prompt/abort` - agent interaction
- `repos.list` - available repositories
