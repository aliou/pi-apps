# Pi Relay Server
#
# Runs the relay API server. Needs the Docker socket mounted to manage
# sandbox containers:
#
#   docker run -v /var/run/docker.sock:/var/run/docker.sock \
#     -v /opt/pi-relay/data:/data \
#     -v /opt/pi-relay/config:/config \
#     -v /opt/pi-relay/state:/state \
#     -v /opt/pi-relay/cache:/cache \
#     -e RELAY_ENCRYPTION_KEY=... \
#     -p 31415:31415 \
#     ghcr.io/aliou/pi-relay

# -- build stage --
FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

WORKDIR /build

# Install dependencies first (cache layer)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm run build

# -- runtime stage --
FROM node:22-slim

# better-sqlite3 needs shared libs that node:22-slim already provides.
# Install only the Docker CLI so healthchecks / debugging are possible.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built output
COPY --from=builder /build/dist ./dist

# Copy DB migrations (referenced via import.meta.dirname at runtime)
COPY --from=builder /build/src/db/migrations ./dist/db/migrations

# Copy native addon (better-sqlite3)
COPY --from=builder /build/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=builder /build/node_modules/bindings ./node_modules/bindings
COPY --from=builder /build/node_modules/file-uri-to-path ./node_modules/file-uri-to-path

# Default data directories. Mount volumes here and use identical host paths
# for sandbox bind mounts (see README).
ENV PI_RELAY_DATA_DIR=/data
ENV PI_RELAY_CONFIG_DIR=/config
ENV PI_RELAY_CACHE_DIR=/cache
ENV PI_RELAY_STATE_DIR=/state
ENV PI_RELAY_HOST=0.0.0.0
ENV PI_RELAY_PORT=31415

EXPOSE 31415

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:31415/health || exit 1

CMD ["node", "dist/index.js"]
