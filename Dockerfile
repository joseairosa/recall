# Recall HTTP Server Dockerfile
# For Railway, Render, and other container deployments
# Builds both the backend API server and Next.js web frontend

FROM node:20-slim AS base

# Install curl for health checks
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# ============================================
# Stage 1: Build the Next.js frontend
# ============================================
FROM base AS web-builder

WORKDIR /app/web

# Copy web package files
COPY web/package*.json ./

# Install dependencies
RUN npm ci

# Copy web source files
COPY web/ ./

# Build Next.js static export
ENV NODE_ENV=production
RUN npm run build

# ============================================
# Stage 2: Build the backend
# ============================================
FROM base AS backend-builder

WORKDIR /app

# Copy backend package files
COPY package*.json ./
COPY tsup.config.ts ./

# Install ALL dependencies (including dev for building)
# --ignore-scripts prevents 'prepare' from running before src/ is copied
RUN npm ci --ignore-scripts

# Copy source files
COPY src/ ./src/
COPY tsconfig.json ./

# Build the backend
RUN npm run build

# ============================================
# Stage 3: Production image
# ============================================
FROM base AS production

WORKDIR /app

# Copy backend package files and install production deps only
COPY package*.json ./
RUN npm ci --production --ignore-scripts

# Copy built backend
COPY --from=backend-builder /app/dist ./dist

# Copy built frontend
COPY --from=web-builder /app/web/out ./web/out

# Expose port (Railway uses PORT env var)
EXPOSE 8080

# Set default environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1

# Run the HTTP server
CMD ["node", "dist/server-http.js"]
