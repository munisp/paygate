# ─── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm (release-pinned toolchain; keep in sync with CI PNPM_VERSION)
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate

# Copy manifests first for layer caching
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build frontend (Vite) + backend (esbuild)
RUN pnpm build

# ─── Stage 2: Production ─────────────────────────────────────────────────────
FROM node:22-alpine AS production

WORKDIR /app

# Install pnpm for production install (release-pinned toolchain)
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate

# Copy manifests
COPY package.json pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/shared ./shared

# Non-root user for security
RUN addgroup -S paygate && adduser -S paygate -G paygate
RUN chown -R paygate:paygate /app
USER paygate

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3000}/api/health || exit 1

EXPOSE 3000

CMD ["node", "dist/index.js"]
