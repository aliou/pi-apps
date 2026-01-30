# Pi Relay Server

API server for Pi clients. Manages sessions, repos, and events with SQLite persistence. Eventually replaces `apps/server/`.

## Stack

- **Runtime:** Node.js 22+
- **HTTP:** Hono
- **Database:** SQLite via Drizzle ORM + better-sqlite3
- **Testing:** Vitest
- **Lint/Format:** Biome (root config)

## Quick Start

```bash
nix develop
cd apps/relay-server
pnpm install
pnpm run dev
```
