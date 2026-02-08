# Pi Apps

Clients for the [pi](https://github.com/mariozechner/pi-coding-agent) coding agent.

**Scope:** Single-user personal deployment. No multi-user, no user accounts, no per-user isolation.

## Protocol Boundaries (READ FIRST)

This project has **two distinct communication layers**. Understanding when to modify each is critical.

### RPC Protocol (NEVER MODIFY)

The RPC protocol is defined by the upstream [pi-coding-agent](https://github.com/mariozechner/pi-coding-agent) package.

- **Source of truth:** `@anthropic/pi-coding-agent` npm package (see `pi-mono` repo)
- **Rule:** NEVER add, remove, or modify RPC message types. If upstream changes, update any mirrors to match.
- **Examples:** `AgentEvent`, `ClientCommand`, `ToolCall`, `Message`, etc.

The WebSocket connection (`ws://host/ws/sessions/:id`) is a **transparent proxy** for RPC messages. It does not define a new protocol - it just transports the same JSON-RPC messages that pi uses over stdin/stdout.

### REST API (CAN EXTEND)

The REST API (`/api/*`) is our custom relay server infrastructure. This is where we add features like environments, sessions, repos, secrets.

- **Location:** `server/relay/src/routes/`
- **Rule:** Add new endpoints freely, but keep REST concerns separate from RPC concerns.
- **Examples:** `/api/sessions`, `/api/environments`, `/api/github/repos`

### Quick Reference

| Layer | Can Modify? | Where Defined | Purpose |
|-------|-------------|---------------|---------|
| RPC Protocol | NO | pi-coding-agent upstream | Agent communication |
| WebSocket Transport | NO | Proxy only | Carries RPC over network |
| REST API | YES | relay-server | Session/resource management |

See `server/relay/AGENTS.md` for package-specific guidance.

## Architecture

- **Relay** wraps Pi sessions, manages repos (cloned from GitHub), and exposes REST API + WebSocket protocol for remote clients.
- Native macOS/iOS apps were archived (`z_archives/`). New native clients will be rebuilt when ready.

## Xcode Workspace

`clients/native/PiApps.xcworkspace` ties together the native app and Swift packages. When adding a new Swift package to `clients/native/packages/` or a new native app, add a `<FileRef>` entry to `clients/native/PiApps.xcworkspace/contents.xcworkspacedata`.

## Build

TypeScript apps are independent with their own dependencies and build commands.

**Relay Server:**
```bash
cd server/relay
pnpm install       # install dependencies
pnpm dev           # run dev server (hot reload)
pnpm build         # build
pnpm lint          # lint (biome)
pnpm typecheck     # typecheck (tsc)
pnpm test          # test (vitest)
```

**Dashboard:**
```bash
cd clients/dashboard
pnpm install       # install dependencies
pnpm dev           # run dev server (hot reload)
pnpm build         # build
pnpm typecheck     # typecheck (react-router + tsc)
```

## Structure

- `server/relay/` - Relay API server (Node.js/Hono/SQLite)
- `server/sandboxes/cloudflare/` - Cloudflare Containers sandbox (Worker, bridge, Dockerfile)
- `server/sandboxes/docker/` - Docker sandbox images for local/self-hosted relay
- `server/scripts/` - Utility scripts (nuke-sessions, list-containers)
- `clients/dashboard/` - Relay admin UI (React Router v7 SPA/Vite/Tailwind)
- `clients/native/` - Native Swift apps and packages (iOS, macOS)

## Relay API

The relay server exposes REST endpoints and WebSocket for session communication.

**REST Endpoints:**
- `GET /health` - Server health check
- `GET /api/sessions` - List sessions
- `POST /api/sessions` - Create session
- `GET /api/sessions/:id` - Get session
- `DELETE /api/sessions/:id` - Delete session
- `POST /api/sessions/:id/activate` - Activate session (ensure sandbox running, blocks until ready)
- `GET /api/sessions/:id/events` - Get recent events from journal (for debug view)
- `GET /api/sessions/:id/history` - Get session conversation from pi's JSONL file
- `GET /api/models` - List available models (based on configured secrets)
- `GET /api/github/token` - GitHub token status
- `POST /api/github/token` - Set GitHub token
- `GET /api/github/repos` - List accessible repos
- `GET /api/secrets` - List configured secrets (metadata only)
- `PUT /api/secrets/:id` - Set a secret
- `DELETE /api/secrets/:id` - Delete a secret

**WebSocket:** `ws://host/ws/sessions/:id?lastSeq=N`

Session communication uses WebSocket. Client sends commands (prompt, abort, get_state, etc.), server streams events (agent_start, message_update, tool_execution_*, etc.).

**Models Endpoint:**

`GET /api/models` returns available models based on configured provider secrets. Uses pi-ai's built-in provider list. For the full list including extension-defined providers, use `get_available_models` via RPC on an active session.

## Code Style

**TypeScript:** Independent pnpm projects (not a workspace). Each app has its own biome.json, package.json, and lockfile. Biome for lint/format. **Never use `npm` or `npx` commands.** Always use `pnpm` and `pnpm exec` (or `pnpm dlx` for one-off binaries). This includes sub-projects like the Cloudflare Worker -- use `pnpm exec wrangler`, not `npx wrangler`.

## Local Dev Paths (Relay)

The nix dev shell (`nix develop`) sets environment variables that isolate relay server data under `.dev/` in the repo root. This prevents dev data from polluting system XDG directories (`~/.local/share`, `~/.config`, etc.).

```
.dev/relay/
├── data/       # PI_RELAY_DATA_DIR (SQLite DB, cloned repos)
├── config/     # PI_RELAY_CONFIG_DIR (secrets, settings)
├── cache/      # PI_RELAY_CACHE_DIR
└── state/      # PI_RELAY_STATE_DIR
```

These are set in `flake.nix` shellHook. To reset relay state locally, delete `.dev/`.
