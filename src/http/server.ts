/**
 * HTTP Server
 *
 * Express server that wraps Recall MCP tools as REST API endpoints.
 * Provides multi-tenant memory storage via API key authentication.
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import { AuthenticatedRequest } from './types.js';
import { createAuthMiddleware, createApiKey } from './auth.middleware.js';
import { StorageClient } from '../persistence/storage-client.js';
import { MemoryStore } from '../persistence/memory-store.js';

/**
 * Creates and configures the Express HTTP server
 */
export function createHttpServer(storageClient: StorageClient) {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Health check (no auth required)
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        status: 'healthy',
        version: '1.7.0',
        timestamp: new Date().toISOString(),
      },
    });
  });

  // Auth middleware for protected routes
  const authMiddleware = createAuthMiddleware(storageClient);

  // ============================================
  // Memory CRUD Operations
  // ============================================

  /**
   * Store a memory
   * POST /api/memories
   */
  app.post(
    '/api/memories',
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenant = req.tenant!;
        const store = createTenantMemoryStore(storageClient, tenant.tenantId);

        const { content, context_type, importance, tags, metadata } = req.body;

        if (!content) {
          res.status(400).json({
            success: false,
            error: { code: 'MISSING_CONTENT', message: 'content is required' },
          });
          return;
        }

        const memory = await store.createMemory({
          content,
          context_type: context_type || 'information',
          importance: importance || 5,
          tags: tags || [],
          metadata,
        });

        res.status(201).json({
          success: true,
          data: memory,
        });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  /**
   * Get a memory by ID
   * GET /api/memories/:id
   */
  app.get(
    '/api/memories/:id',
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenant = req.tenant!;
        const store = createTenantMemoryStore(storageClient, tenant.tenantId);

        const memory = await store.getMemory(req.params.id);

        if (!memory) {
          res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Memory not found' },
          });
          return;
        }

        res.json({
          success: true,
          data: memory,
        });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  /**
   * Search memories
   * GET /api/memories/search?q=query&limit=10
   */
  app.get(
    '/api/memories/search',
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenant = req.tenant!;
        const store = createTenantMemoryStore(storageClient, tenant.tenantId);

        const query = req.query.q as string;
        const limit = parseInt(req.query.limit as string) || 10;

        if (!query) {
          res.status(400).json({
            success: false,
            error: { code: 'MISSING_QUERY', message: 'q parameter is required' },
          });
          return;
        }

        const results = await store.searchMemories(query, limit);

        res.json({
          success: true,
          data: results,
        });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  /**
   * Get recent memories
   * GET /api/memories?limit=50
   */
  app.get(
    '/api/memories',
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenant = req.tenant!;
        const store = createTenantMemoryStore(storageClient, tenant.tenantId);

        const limit = parseInt(req.query.limit as string) || 50;
        const memories = await store.getRecentMemories(limit);

        res.json({
          success: true,
          data: memories,
        });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  /**
   * Delete a memory
   * DELETE /api/memories/:id
   */
  app.delete(
    '/api/memories/:id',
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenant = req.tenant!;
        const store = createTenantMemoryStore(storageClient, tenant.tenantId);

        await store.deleteMemory(req.params.id);

        res.json({
          success: true,
          data: { deleted: req.params.id },
        });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  // ============================================
  // Tenant Management (Admin endpoints)
  // ============================================

  /**
   * Create an API key (for admin use or self-service)
   * POST /api/keys
   *
   * Note: In production, this should be protected by admin auth
   * or triggered by Stripe webhook after subscription.
   */
  app.post('/api/keys', async (req: Request, res: Response) => {
    try {
      const { tenantId, plan, name, adminSecret } = req.body;

      // Simple admin secret check (replace with proper auth in production)
      const expectedSecret = process.env.ADMIN_SECRET;
      if (expectedSecret && adminSecret !== expectedSecret) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Invalid admin secret' },
        });
        return;
      }

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: { code: 'MISSING_TENANT', message: 'tenantId is required' },
        });
        return;
      }

      const apiKey = await createApiKey(
        storageClient,
        tenantId,
        plan || 'free',
        name
      );

      res.status(201).json({
        success: true,
        data: {
          apiKey,
          tenantId,
          plan: plan || 'free',
          message: 'Store this API key securely - it cannot be retrieved later',
        },
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * Get tenant info
   * GET /api/me
   */
  app.get(
    '/api/me',
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenant = req.tenant!;
        const store = createTenantMemoryStore(storageClient, tenant.tenantId);

        const stats = await store.getSummaryStats();

        res.json({
          success: true,
          data: {
            tenantId: tenant.tenantId,
            plan: tenant.plan,
            limits: tenant.limits,
            usage: {
              memories: stats.total_memories || 0,
            },
          },
        });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Endpoint not found' },
    });
  });

  return app;
}

/**
 * Creates a tenant-scoped MemoryStore instance
 */
function createTenantMemoryStore(
  storageClient: StorageClient,
  tenantId: string
): MemoryStore {
  // The workspace path becomes tenant-scoped
  // This ensures all Redis keys are prefixed with tenant ID
  return new MemoryStore(storageClient, `tenant:${tenantId}`);
}

/**
 * Standard error handler
 */
function handleError(res: Response, error: unknown): void {
  console.error('[HTTP] Error:', error);

  const message =
    error instanceof Error ? error.message : 'An unexpected error occurred';

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message,
    },
  });
}
