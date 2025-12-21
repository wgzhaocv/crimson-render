# -----------------------------------------------------------------------------
# Dockerfile for Hono + Bun project
# -----------------------------------------------------------------------------

# Use Bun's official image
FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3003

# Create non-root user for security
RUN apt-get update && apt-get install -y adduser && \
    addgroup --system --gid 1001 bunjs && \
    adduser --system --uid 1001 --ingroup bunjs honoapp && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy dependencies and source code
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=honoapp:bunjs . .

USER honoapp

EXPOSE 3003

CMD ["bun", "run", "src/index.ts"]

