# Relay Dashboard

Admin UI for the relay server. React Router v7 SPA with Vite and Tailwind CSS.

## Commands

Run from this directory (`clients/dashboard/`):

```bash
pnpm install       # install dependencies
pnpm dev           # dev server (hot reload)
pnpm build         # production build
pnpm typecheck     # react-router typegen + tsc
```

Or use `just dev` from the repo root to start both the relay server and dashboard together.

## Stack

- React Router v7 (SPA mode)
- Vite
- Tailwind CSS v4
- Biome (lint/format)
- Phosphor Icons

## Structure

```
app/
├── routes/          # Page routes
│   ├── dashboard.tsx           # Index route (/)
│   ├── sessions.tsx            # /sessions
│   ├── session.tsx             # /sessions/:id
│   ├── settings-layout.tsx     # /settings layout wrapper
│   ├── settings-index.tsx      # /settings (index redirect)
│   ├── settings.tsx            # /settings/secrets
│   ├── github-setup.tsx        # /settings/github
│   ├── environments.tsx        # /settings/environments
│   ├── settings-models.tsx     # /settings/models
│   └── settings-extensions.tsx # /settings/extensions
├── components/      # Reusable UI components
├── lib/             # Utilities, API client, theme
│   ├── api.ts       # Typed fetch wrapper for relay REST API
│   ├── sidebar.tsx  # Sidebar layout component
│   └── theme.tsx    # Dark/light mode
├── styles/          # CSS
├── root.tsx         # App root
└── routes.ts        # Route config
```

## API Client

`app/lib/api.ts` provides a typed fetch wrapper around the relay server REST API. The relay URL is configured via the `VITE_RELAY_URL` env var (defaults to same origin).

## Code Style

- Biome for lint/format (config in `biome.json`)
- Strict TypeScript (`noUnusedLocals`, `noUncheckedIndexedAccess`, etc.)
- Never use `npm` or `npx`. Always use `pnpm`.
