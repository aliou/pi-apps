# Pi Sandbox Image
# Based on OpenAI's codex-universal image for multi-language support

FROM ghcr.io/openai/codex-universal:latest

# Install pi CLI
ARG PI_VERSION=latest
RUN npm install -g @mariozechner/pi-coding-agent@${PI_VERSION}

# Create directories
RUN mkdir -p /workspace /data/agent

# Copy entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Default environment
ENV PI_CODING_AGENT_DIR=/data/agent
ENV HOME=/home/user

# Create non-root user for security
RUN useradd -m -s /bin/bash user && \
    chown -R user:user /workspace /data/agent

WORKDIR /workspace
USER user

ENTRYPOINT ["/entrypoint.sh"]
CMD ["pi", "--mode", "rpc", "--no-session"]
