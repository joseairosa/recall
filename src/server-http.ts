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
import { listAvailableProviders } from './embeddings/generator.js';

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
  log(`PORT: ${PORT}`);
  log(`NODE_ENV: ${process.env.NODE_ENV || 'development'}`);

  // Check for embedding providers
  const providers = listAvailableProviders();
  const configuredProviders = providers.filter(p => p.configured && p.type !== 'ollama');

  if (configuredProviders.length === 0) {
    logError('WARNING: No embedding provider API keys found!');
    logError('Set at least one of: VOYAGE_API_KEY, COHERE_API_KEY, OPENAI_API_KEY, DEEPSEEK_API_KEY, GROK_API_KEY, ANTHROPIC_API_KEY');
  } else {
    log(`Configured embedding providers: ${configuredProviders.map(p => p.type).join(', ')}`);
  }

  // Initialize storage client
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  log(`Connecting to backend: ${redisUrl.replace(/\/\/.*@/, '//***@')}`); // Mask credentials
  storageClient = await createStorageClient();

  const isConnected = await storageClient.checkConnection();
  if (!isConnected) {
    logError('ERROR: Failed to connect to Redis/Valkey');
    logError(`REDIS_URL: ${redisUrl.replace(/\/\/.*@/, '//***@')}`);
    logError('Please ensure REDIS_URL is set correctly and Redis is accessible');
    process.exit(1);
  }
  log('Backend connection successful');

  // Create and start HTTP server
  const app = createHttpServer(storageClient);

  app.listen(PORT, '0.0.0.0', () => {
    log('='.repeat(50));
    log(`Server READY on port ${PORT}`);
    log(`Health check: http://localhost:${PORT}/health`);
    log('='.repeat(50));
    log('');
    log('API Endpoints:');
    log('  POST   /api/memories       - Store a memory');
    log('  GET    /api/memories       - List recent memories');
    log('  GET    /api/memories/:id   - Get memory by ID');
    log('  GET    /api/memories/search?q=query - Search memories');
    log('  DELETE /api/memories/:id   - Delete a memory');
    log('  POST   /api/keys           - Create API key (admin)');
    log('  GET    /api/me             - Get tenant info');
    log('');
    log('Server is ready to accept connections');
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
