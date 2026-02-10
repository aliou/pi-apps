# Sandbox Infrastructure

Sandbox runtimes used by the relay server to run Pi sessions in isolation.

## Layout

- `docker/` — local/self-hosted container images.
- `cloudflare/` — Cloudflare Containers worker + bridge implementation.

## How relay uses this

The relay server selects a sandbox provider per environment:

- Docker provider for local hosts.
- Cloudflare provider for remote hosted sandboxes.

Both providers must expose the same lifecycle capabilities: create, status, pause, resume, terminate, and command/event transport for Pi.

## Where to start

- Docker details: `server/sandboxes/docker/README.md`
- Cloudflare details: `server/sandboxes/cloudflare/README.md`

## Important constraints

- Keep Pi RPC protocol unchanged. Sandbox transport must pass through RPC JSON as-is.
- Keep secret handling ephemeral at runtime. Do not persist provider API keys in sandbox images.
