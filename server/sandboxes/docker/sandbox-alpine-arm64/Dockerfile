# Pi Sandbox Image (Alpine ARM64)
# Lightweight Alpine-based image for ARM64 hosts
#
# Multi-stage: installs pi via npm in the builder stage, copies only the
# installed package (dist, node_modules, docs, examples) to a clean runtime
# image with just the Node.js runtime (no npm).

FROM node:22-alpine AS builder

ARG PI_VERSION=0.51.5
RUN npm install -g @mariozechner/pi-coding-agent@${PI_VERSION}

# ---

FROM alpine:3.21

# Install Node.js runtime (no npm) and base tools
RUN apk add --no-cache \
    nodejs \
    bash \
    curl \
    git \
    openssh-client \
    jq \
    ripgrep \
    fd \
    tar \
    gzip \
    ca-certificates

# Copy installed pi package and bin symlink from builder
COPY --from=builder /usr/local/lib/node_modules/@mariozechner/pi-coding-agent /opt/pi
RUN ln -s /opt/pi/dist/cli.js /usr/local/bin/pi && \
    chmod +x /opt/pi/dist/cli.js

# Create directories and writable secrets profile location
RUN mkdir -p /workspace /data/agent /etc/profile.d && \
    touch /etc/profile.d/pi-secrets.sh && \
    chmod 666 /etc/profile.d/pi-secrets.sh

# Copy entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create non-root user for security
RUN adduser -D -s /bin/bash user && \
    chown -R user:user /workspace /data/agent

# Install fixuid for bind mount UID/GID remapping
RUN curl -SsL https://github.com/boxboat/fixuid/releases/download/v0.6.0/fixuid-0.6.0-linux-arm64.tar.gz | tar -C /usr/local/bin -xzf - && \
    chown root:root /usr/local/bin/fixuid && \
    chmod 4755 /usr/local/bin/fixuid && \
    mkdir -p /etc/fixuid && \
    printf "user: user\ngroup: user\npaths:\n  - /home/user\n  - /workspace\n  - /data/agent\n" > /etc/fixuid/config.yml

# Set environment for runtime
ENV PI_CODING_AGENT_DIR=/data/agent
ENV HOME=/home/user

WORKDIR /workspace
USER user

ENTRYPOINT ["fixuid", "-q", "/entrypoint.sh"]
CMD ["pi", "--mode", "rpc"]
