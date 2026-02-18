# Deployment

Production deployment of relay + dashboard using Docker Compose.

## Prerequisites

- Docker Engine with Compose plugin (`docker compose`)
- A sandbox image pulled or built (e.g., `ghcr.io/aliou/pi-sandbox-alpine-arm64`)

## Quick Start

1. Generate an encryption key for secrets at rest:

```bash
export RELAY_ENCRYPTION_KEY=$(openssl rand -base64 32)
```

Save this key somewhere safe. You need it every time the stack starts. Losing it means losing access to stored secrets (API keys, GitHub token).

2. Create the host directories for relay data:

```bash
sudo mkdir -p /opt/pi-relay/{data,config,state,cache}
```

The relay bind-mounts these paths with identical host/container paths. This is required because the relay passes these paths to Docker when creating sandbox containers, and Docker resolves them on the host.

3. Start the stack:

```bash
RELAY_ENCRYPTION_KEY=$RELAY_ENCRYPTION_KEY docker compose up -d
```

4. Open the dashboard at `http://localhost:8080`.

5. Configure secrets via the dashboard:
   - Go to **Settings > Secrets** and add at least one provider API key (e.g., `ANTHROPIC_API_KEY`).
   - Go to **Settings > GitHub** and add a GitHub token if you want to clone repos.

## Ports

| Service   | Port  | Purpose                    |
|-----------|-------|----------------------------|
| Dashboard | 8080  | Web UI                     |
| Relay     | 31415 | REST API + WebSocket       |

The dashboard proxies API requests to the relay internally via Docker networking. External clients (native apps) connect to the relay directly on port 31415.

## Sandbox Images

Pull a sandbox image before creating sessions:

```bash
docker pull ghcr.io/aliou/pi-sandbox-alpine-arm64   # ARM64 (Apple Silicon)
docker pull ghcr.io/aliou/pi-sandbox-codex-universal # Multi-arch
```

Configure the sandbox image in the dashboard under **Settings > Environments**.

## Data Persistence

All relay data is stored under `/opt/pi-relay/` on the host:

```
/opt/pi-relay/
├── data/     # SQLite DB, cloned repos
├── config/   # Secrets, settings
├── state/    # Per-session workspace + agent data
└── cache/    # Cache
```

Data persists across container restarts and recreations.

## Updating

Pull new images and recreate containers:

```bash
docker compose pull
RELAY_ENCRYPTION_KEY=$RELAY_ENCRYPTION_KEY docker compose up -d
```

## Using Pre-built Images

The compose file references both `build` and `image` directives. By default, `docker compose up` will pull the pre-built GHCR images. To build locally instead:

```bash
docker compose build
RELAY_ENCRYPTION_KEY=$RELAY_ENCRYPTION_KEY docker compose up -d
```
