# ---- Build stage ----
FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@10.26.1 --activate
WORKDIR /app

# Copy workspace root files needed for pnpm install
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy package.json for every workspace member so pnpm can resolve the graph
COPY apps/relay-server/package.json apps/relay-server/
COPY apps/relay-dashboard/package.json apps/relay-dashboard/
COPY sandboxes/cloudflare/worker/package.json sandboxes/cloudflare/worker/

RUN pnpm install --frozen-lockfile

# Copy relay-server source and build
COPY apps/relay-server/ apps/relay-server/
RUN pnpm --filter pi-relay-server run build

# Place migrations alongside the bundle (import.meta.dirname resolves to dist/)
RUN mkdir -p apps/relay-server/dist/db \
    && cp -r apps/relay-server/src/db/migrations apps/relay-server/dist/db/migrations

# ---- Production stage ----
FROM node:22-slim

WORKDIR /app

# Install only the native module required at runtime (externalized by esbuild)
RUN npm install --no-save better-sqlite3@11.8.1

# Copy bundled server + migrations from build stage
COPY --from=builder /app/apps/relay-server/dist ./dist

ENV PI_RELAY_HOST=0.0.0.0
ENV PI_RELAY_PORT=31415
ENV PI_RELAY_DATA_DIR=/data
ENV PI_RELAY_CONFIG_DIR=/config
ENV PI_RELAY_STATE_DIR=/state

EXPOSE 31415

CMD ["node", "dist/index.js"]
