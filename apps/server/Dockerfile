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
