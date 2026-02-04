FROM node:22-slim

# Install system deps (ca-certificates needed for curl HTTPS)
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl tar bash git ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Install pi CLI
ARG PI_VERSION=0.51.5
RUN ARCH=$(uname -m | sed 's/aarch64/arm64/' | sed 's/x86_64/x64/') && \
    curl -fsSL "https://github.com/badlogic/pi-mono/releases/download/v${PI_VERSION}/pi-linux-${ARCH}.tar.gz" \
      -o /tmp/pi.tar.gz && \
    mkdir -p /opt/pi && \
    tar -xzf /tmp/pi.tar.gz -C /opt && \
    rm /tmp/pi.tar.gz && \
    chmod +x /opt/pi/pi && \
    ln -s /opt/pi/pi /usr/local/bin/pi

# Install bridge
WORKDIR /bridge
COPY bridge/package.json bridge/package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev
COPY bridge/bridge.js ./

# Create workspace and agent data directories
RUN mkdir -p /workspace /data/agent

ENV PI_CODING_AGENT_DIR=/data/agent
ENV BRIDGE_PORT=4000
WORKDIR /workspace
EXPOSE 4000

CMD ["node", "/bridge/bridge.js"]
