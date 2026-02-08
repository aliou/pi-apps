# Pi Relay Server

API server for Pi clients. Manages sessions, repos, and events with SQLite persistence.

## Stack

- **Runtime:** Node.js 22+
- **HTTP:** Hono
- **Database:** SQLite via Drizzle ORM + better-sqlite3
- **Testing:** Vitest
- **Lint/Format:** Biome (per-app config)

## Quick Start

```bash
nix develop
cd server/relay
pnpm install
pnpm run dev
```
