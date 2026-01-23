# Build stage
FROM node:22-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json build.mjs ./
COPY src ./src

RUN npm run build

# Production stage
FROM node:22-slim

WORKDIR /app

# Install CLI tools for coding agent
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    jq \
    make \
    ripgrep \
    fd-find \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# fd is installed as fd-find, symlink to fd
RUN ln -s $(which fdfind) /usr/local/bin/fd

# Copy package files and install prod deps only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && find /app/node_modules \( \
        -name "*.md" -o \
        -name "*.ts" ! -name "*.d.ts" -o \
        -name "*.map" -o \
        -name "LICENSE*" -o \
        -name "CHANGELOG*" -o \
        -name "README*" -o \
        -name "__tests__" -o \
        -name "test" -type d -o \
        -name "tests" -type d -o \
        -name "docs" -type d -o \
        -name "examples" -type d \
    \) -exec rm -rf {} + 2>/dev/null || true \
    && npm cache clean --force

# Copy built output
COPY --from=builder /app/dist ./dist

RUN mkdir -p /data

ENV NODE_ENV=production
ENV PI_DATA_DIR=/data

EXPOSE 31415

CMD ["node", "dist/index.js", "--host", "0.0.0.0"]
