# Pi Sandbox Image
# Based on OpenAI's codex-universal image for multi-language support

ARG CODEX_IMAGE=ghcr.io/openai/codex-universal@sha256:956c2e7dd1590fc12763f172579d777464312006b9fa1f6405f5f1b78b8ea2dc
FROM ${CODEX_IMAGE}

# Install pi CLI from GitHub releases (binary, no Node required)
ARG PI_VERSION=v0.50.9
ARG TARGETARCH
RUN set -ex && \
    if [ "$TARGETARCH" = "arm64" ]; then ARCH="arm64"; else ARCH="x64"; fi && \
    if [ "$PI_VERSION" = "latest" ]; then \
      PI_URL=$(curl -s https://api.github.com/repos/badlogic/pi-mono/releases/latest | grep "browser_download_url.*pi-linux-${ARCH}.tar.gz" | cut -d '"' -f 4); \
    else \
      PI_URL="https://github.com/badlogic/pi-mono/releases/download/${PI_VERSION}/pi-linux-${ARCH}.tar.gz"; \
    fi && \
    curl -fsSL "$PI_URL" -o /tmp/pi.tar.gz && \
    mkdir -p /opt/pi && \
    tar -xzf /tmp/pi.tar.gz -C /opt && \
    rm /tmp/pi.tar.gz && \
    chmod +x /opt/pi/pi && \
    ln -s /opt/pi/pi /usr/local/bin/pi

# Create directories
RUN mkdir -p /workspace /data/agent

# Copy entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create non-root user for security
RUN useradd -m -s /bin/bash user && \
    chown -R user:user /workspace /data/agent

# Set environment for runtime
ENV PI_CODING_AGENT_DIR=/data/agent
ENV HOME=/home/user

WORKDIR /workspace
USER user

ENTRYPOINT ["/entrypoint.sh"]
CMD ["pi", "--mode", "rpc", "--no-session"]
