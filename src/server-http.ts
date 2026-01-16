#!/usr/bin/env node

/**
 * Recall HTTP Server Entry Point
 *
 * Starts the Express HTTP server for SaaS deployment.
 * Use this instead of index.ts for cloud deployments (Railway, Render, etc.)
 *
 * Environment Variables:
 * - PORT: HTTP port (default: 8080)
 * - REDIS_URL: Redis connection string
 * - ANTHROPIC_API_KEY: For embeddings
 * - ADMIN_SECRET: Secret for admin endpoints (optional)
 */

import { createStorageClient } from './persistence/storage-client.factory.js';
import { createHttpServer } from './http/server.js';
import { StorageClient } from './persistence/storage-client.js';

const PORT = parseInt(process.env.PORT || '8080');

function log(message: string, ...args: unknown[]) {
  console.log(`[Recall HTTP] ${message}`, ...args);
}

function logError(message: string, ...args: unknown[]) {
  console.error(`[Recall HTTP] ${message}`, ...args);
}

let storageClient: StorageClient;

async function main() {
  log('Starting Recall HTTP Server...');

  // Check required environment variables
  if (!process.env.ANTHROPIC_API_KEY) {
    logError('WARNING: ANTHROPIC_API_KEY not set. Embeddings will not work.');
  }

  // Initialize storage client
  log('Connecting to backend...');
  storageClient = await createStorageClient();

  const isConnected = await storageClient.checkConnection();
  if (!isConnected) {
    logError('ERROR: Failed to connect to Redis/Valkey');
    logError('Please ensure REDIS_URL is set correctly');
    process.exit(1);
  }
  log('Backend connection successful');

  // Create and start HTTP server
  const app = createHttpServer(storageClient);

  app.listen(PORT, () => {
    log(`Server running on port ${PORT}`);
    log(`Health check: http://localhost:${PORT}/health`);
    log('');
    log('API Endpoints:');
    log('  POST   /api/memories       - Store a memory');
    log('  GET    /api/memories       - List recent memories');
    log('  GET    /api/memories/:id   - Get memory by ID');
    log('  GET    /api/memories/search?q=query - Search memories');
    log('  DELETE /api/memories/:id   - Delete a memory');
    log('  POST   /api/keys           - Create API key (admin)');
    log('  GET    /api/me             - Get tenant info');
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  log('\nShutting down...');
  if (storageClient) {
    await storageClient.closeClient();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  log('\nShutting down...');
  if (storageClient) {
    await storageClient.closeClient();
  }
  process.exit(0);
});

// Start server
main().catch((error) => {
  logError('Fatal error:', error);
  process.exit(1);
});
