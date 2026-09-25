# ============================================
# Build Stage
# ============================================
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first (better caching)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Keep only runtime dependencies. tsx, drizzle-orm, mysql2 and nodemailer are regular
# dependencies because scripts/migrate.ts and the weekly summary job run from this image.
RUN npm prune --omit=dev

# ============================================
# Production Stage
# ============================================
FROM node:22-alpine AS production

WORKDIR /app

# Database export from the administrator maintenance page
RUN apk add --no-cache mariadb-client

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S sveltekit -u 1001

# Copy built application from builder
COPY --from=builder --chown=sveltekit:nodejs /app/build ./build
COPY --from=builder --chown=sveltekit:nodejs /app/package.json ./package.json
COPY --from=builder --chown=sveltekit:nodejs /app/node_modules ./node_modules
# Copy migrations and scripts for init container / migration runner
COPY --from=builder --chown=sveltekit:nodejs /app/src/lib/db/migrations ./src/lib/db/migrations
COPY --from=builder --chown=sveltekit:nodejs /app/scripts ./scripts

# Switch to non-root user
USER sveltekit

# Expose the port (SvelteKit adapter-node default)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/api/v1/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Start the application
CMD ["node", "build/index.js"]
