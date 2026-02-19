# Relay Dashboard

Admin UI for the relay server.

Stack: React Router v7 (SPA), Vite, Tailwind v4, TypeScript, Biome.

## Commands

Run from `clients/dashboard/`:

```bash
pnpm install
pnpm dev
pnpm build
pnpm typecheck
```

Or run `just dev` from repo root to start dashboard + relay together.

## Environment

- `VITE_RELAY_URL` — relay base URL.
  - Empty means same-origin.
  - Local dev usually: `http://localhost:31415`.

## Structure

- `app/routes/` — route screens.
- `app/components/` — shared UI.
- `app/lib/api.ts` — typed REST client for relay endpoints.
- `app/lib/theme.tsx` — dark/light theme logic.
