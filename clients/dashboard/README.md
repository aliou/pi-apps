# Pi Relay Dashboard

Admin UI for the Pi Relay server. React + Vite + Tailwind CSS v4.

## Quick Start

```bash
nix develop
cd clients/dashboard
pnpm install
cp .env.example .env
pnpm run dev
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_RELAY_URL` | (empty) | Base URL of the relay server. Leave empty when served on the same origin. |

During local development, set `VITE_RELAY_URL=http://localhost:31415` to point at a locally running relay server.
