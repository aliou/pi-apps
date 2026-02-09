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

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install only the native addon needed at runtime.
# Uses npm (ships with node image) to avoid pnpm onlyBuiltDependencies config.
WORKDIR /app
RUN npm init -y && npm install better-sqlite3@11 && npm cache clean --force

# Copy built output
COPY --from=builder /build/dist ./dist

# Copy DB migrations (referenced via import.meta.dirname at runtime)
COPY --from=builder /build/src/db/migrations ./dist/db/migrations

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
