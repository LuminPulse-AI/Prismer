FROM node:24-alpine AS base

# Install dependencies
FROM base AS deps
WORKDIR /app

RUN apk add --no-cache libc6-compat openssl

COPY package.json package-lock.json* ./
COPY prisma ./prisma

RUN npm ci

# Build application
FROM base AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=4096"

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG BUILD_ENV=production
RUN echo "Building for environment: ${BUILD_ENV}"

ENV DATABASE_URL="file:./build.db"

RUN npm run build
RUN rm -rf node_modules/.cache

# Pre-build SQLite template DB with full schema (so runner doesn't need Prisma CLI)
# Stored at /app/.template.db to avoid being hidden by volume mounts on /app/prisma
RUN DATABASE_URL="file:/tmp/template.db" npx prisma db push --skip-generate \
    && cp /tmp/template.db .template.db

# Production runtime
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache openssl

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

RUN mkdir -p .next prisma public/data/output
RUN chown -R nextjs:nodejs .next prisma public/data/output

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/src/generated ./src/generated

# Pre-built SQLite template (outside /app/prisma to survive volume mounts)
COPY --from=builder --chown=nextjs:nodejs /app/.template.db ./.template.db

# Prisma Client engine binaries (needed for runtime queries)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Entrypoint script: auto-initialize SQLite DB on first run
COPY --chown=nextjs:nodejs docker-entrypoint-web.sh /app/docker-entrypoint-web.sh
RUN chmod +x /app/docker-entrypoint-web.sh

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["/app/docker-entrypoint-web.sh"]
