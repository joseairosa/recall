# Recall HTTP Server Dockerfile
# For Railway, Render, and other container deployments

FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsup.config.ts ./

# Install ALL dependencies (including dev for building)
# --ignore-scripts prevents 'prepare' from running before src/ is copied
RUN npm ci --ignore-scripts

# Copy source files
COPY src/ ./src/
COPY tsconfig.json ./

# Build the project
RUN npm run build

# Remove dev dependencies to reduce image size
RUN npm prune --production

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
