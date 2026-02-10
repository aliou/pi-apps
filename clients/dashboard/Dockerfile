# Pi Dashboard
#
# Static SPA served by Caddy. Build with:
#
#   docker build -t pi-dashboard clients/dashboard/
#
# Run with:
#
#   docker run -p 8080:8080 pi-dashboard

# -- build stage --
FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

WORKDIR /build

# Use placeholder at build time for runtime substitution
ARG VITE_RELAY_URL="__RELAY_URL_PLACEHOLDER__"
ENV VITE_RELAY_URL=${VITE_RELAY_URL}

# Install dependencies first (cache layer)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm run build

# -- runtime stage --
FROM caddy:alpine

COPY --from=builder /build/build/client /srv
COPY Caddyfile /etc/caddy/Caddyfile
COPY docker-entrypoint.sh /usr/local/bin/

RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 8080
CMD ["/usr/local/bin/docker-entrypoint.sh"]
