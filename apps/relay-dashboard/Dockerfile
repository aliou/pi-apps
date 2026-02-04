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

# Copy dashboard source and build (SPA – no SSR)
COPY apps/relay-dashboard/ apps/relay-dashboard/
RUN pnpm --filter pi-relay-dashboard run build

# ---- Production stage ----
FROM nginx:alpine

# Copy built static files from the React Router SPA build
COPY --from=builder /app/apps/relay-dashboard/dist/client /usr/share/nginx/html

# Custom nginx config: SPA routing + reverse proxy to relay-server
COPY apps/relay-dashboard/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
