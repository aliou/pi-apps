FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile
COPY src ./src
RUN bun run build

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/dist/pi-server /usr/local/bin/pi-server
COPY --from=builder /app/dist/package.json /app/package.json
RUN mkdir -p /data
ENV PI_SERVER_PORT=3000
ENV PI_SERVER_DATA_DIR=/data
EXPOSE 3000
CMD ["pi-server", "--host", "0.0.0.0"]
