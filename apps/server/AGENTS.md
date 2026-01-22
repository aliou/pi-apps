# Pi Server

WebSocket server for remote pi access. Node.js + Hono.

## Build

```bash
npm install
npm run dev       # hot reload (tsx)
npm run build     # production bundle (esbuild)
npm run typecheck # type check (tsgo)
npm run lint      # biome
npm run test      # vitest
```

## Key Files

- `src/index.ts` - server entry, bootstrapping
- `src/routes/health.ts` - HTTP endpoints (/, /health)
- `src/routes/rpc.ts` - WebSocket endpoint setup
- `src/ws/handler.ts` - WebSocket message routing
- `src/ws/connection.ts` - connection state management
- `src/session/` - pi session management
- `src/github.ts` - GitHub API for repo listing
- `src/config.ts` - CLI args, data dirs
- `src/env.ts` - dotenv loading

## Protocol

WebSocket at `/rpc`. JSON-RPC style messages:

- `hello` - handshake
- `session.create/list/attach/delete` - session management
- `prompt/abort` - agent interaction
- `repos.list` - available repositories
