/**
 * HTTP Server
 *
 * Express server that wraps Recall MCP tools as REST API endpoints.
 * Provides multi-tenant memory storage via API key authentication.
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { AuthenticatedRequest, AuditAction, AuditResource } from './types.js';
import {
  createAuthMiddleware,
  createApiKey,
  listApiKeys,
  getApiKeyById,
  revokeApiKey,
  regenerateApiKey,
  deleteApiKey,
} from './auth.middleware.js';
import { StorageClient } from '../persistence/storage-client.js';
import { MemoryStore } from '../persistence/memory-store.js';
import { createMcpHandler } from './mcp-handler.js';
import { getProviderInfo, listAvailableProviders } from '../embeddings/generator.js';
import { AuditService, parseRequestForAudit } from './audit.service.js';
import { verifyFirebaseToken } from './firebase-admin.js';

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Creates and configures the Express HTTP server
 */
export function createHttpServer(storageClient: StorageClient) {
  const app = express();
  const auditService = new AuditService(storageClient);

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Health check (no auth required)
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        status: 'healthy',
        version: '1.8.0',
        timestamp: new Date().toISOString(),
      },
    });
  });

  // Embedding provider info (no auth required - useful for debugging)
  app.get('/api/provider', (_req: Request, res: Response) => {
    const currentProvider = getProviderInfo();
    const availableProviders = listAvailableProviders();

    res.json({
      success: true,
      data: {
        current: currentProvider,
        available: availableProviders,
        priority: [
          'voyage (VOYAGE_API_KEY)',
          'cohere (COHERE_API_KEY)',
          'openai (OPENAI_API_KEY)',
          'deepseek (DEEPSEEK_API_KEY)',
          'grok (GROK_API_KEY)',
          'anthropic (ANTHROPIC_API_KEY)',
        ],
      },
    });
  });

  // Auth middleware for protected routes
  const authMiddleware = createAuthMiddleware(storageClient);

  // Audit logging middleware (logs after response)
  const auditMiddleware = (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    const startTime = Date.now();

    // Store original send function
    const originalSend = res.send.bind(res);

    // Override send to capture status and log audit
    res.send = function (body: any) {
      const duration = Date.now() - startTime;

      // Log audit entry asynchronously (fire and forget)
      if (req.tenant) {
        const { action, resource, resourceId } = parseRequestForAudit(
          req.method,
          req.path
        );

        auditService
          .log({
            tenantId: req.tenant.tenantId,
            apiKeyId: req.tenant.apiKeyId,
            action,
            resource,
            resourceId,
            ip: req.ip || req.socket.remoteAddress,
            userAgent: req.get('user-agent'),
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration,
          })
          .catch((err) => {
            console.error('[Audit] Failed to log entry:', err);
          });
      }

      return originalSend(body);
    };

    next();
  };

  // ============================================
  // Memory CRUD Operations
  // ============================================
  // IMPORTANT: Route order matters! Specific paths must come before :id params

  /**
   * Store a memory
   * POST /api/memories
   */
  app.post(
    '/api/memories',
    authMiddleware,
    auditMiddleware,
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
   * Search memories (must be before :id route)
   * GET /api/memories/search?q=query&limit=10
   */
  app.get(
    '/api/memories/search',
    authMiddleware,
    auditMiddleware,
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
   * Get important memories (must be before :id route)
   * GET /api/memories/important
   */
  app.get(
    '/api/memories/important',
    authMiddleware,
    auditMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenant = req.tenant!;
        const store = createTenantMemoryStore(storageClient, tenant.tenantId);

        const limit = parseInt(req.query.limit as string) || 50;
        const minImportance = parseInt(req.query.min as string) || 8;
        const memories = await store.getImportantMemories(minImportance, limit);

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
   * Get memories by context type (must be before :id route)
   * GET /api/memories/by-type/:type
   */
  app.get(
    '/api/memories/by-type/:type',
    authMiddleware,
    auditMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenant = req.tenant!;
        const store = createTenantMemoryStore(storageClient, tenant.tenantId);

        const memories = await store.getMemoriesByType(req.params.type);

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
   * Get memories by tag (must be before :id route)
   * GET /api/memories/by-tag/:tag
   */
  app.get(
    '/api/memories/by-tag/:tag',
    authMiddleware,
    auditMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenant = req.tenant!;
        const store = createTenantMemoryStore(storageClient, tenant.tenantId);

        const memories = await store.getMemoriesByTag(req.params.tag);

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
   * Get recent memories
   * GET /api/memories?limit=50
   */
  app.get(
    '/api/memories',
    authMiddleware,
    auditMiddleware,
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
   * Get a memory by ID (must be after specific routes like /search, /important)
   * GET /api/memories/:id
   */
  app.get(
    '/api/memories/:id',
    authMiddleware,
    auditMiddleware,
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
   * Update a memory
   * PUT /api/memories/:id
   */
  app.put(
    '/api/memories/:id',
    authMiddleware,
    auditMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenant = req.tenant!;
        const store = createTenantMemoryStore(storageClient, tenant.tenantId);

        const { content, context_type, importance, tags, metadata } = req.body;

        const memory = await store.updateMemory(req.params.id, {
          content,
          context_type,
          importance,
          tags,
          metadata,
        });

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
   * Delete a memory
   * DELETE /api/memories/:id
   */
  app.delete(
    '/api/memories/:id',
    authMiddleware,
    auditMiddleware,
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

  /**
   * Get usage statistics
   * GET /api/stats
   */
  app.get(
    '/api/stats',
    authMiddleware,
    auditMiddleware,
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
            usage: stats,
          },
        });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  /**
   * List all sessions
   * GET /api/sessions
   */
  app.get(
    '/api/sessions',
    authMiddleware,
    auditMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenant = req.tenant!;
        const store = createTenantMemoryStore(storageClient, tenant.tenantId);

        const sessions = await store.getAllSessions();

        res.json({
          success: true,
          data: sessions,
        });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  /**
   * Get session details
   * GET /api/sessions/:id
   */
  app.get(
    '/api/sessions/:id',
    authMiddleware,
    auditMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenant = req.tenant!;
        const store = createTenantMemoryStore(storageClient, tenant.tenantId);

        const session = await store.getSession(req.params.id);

        if (!session) {
          res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Session not found' },
          });
          return;
        }

        res.json({
          success: true,
          data: session,
        });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  // ============================================
  // API Key Management
  // ============================================

  /**
   * Create or retrieve API key using Firebase authentication
   * POST /api/auth/keys
   *
   * This endpoint is for authenticated users from the web dashboard.
   * It verifies the Firebase ID token and creates/retrieves an API key.
   */
  app.post('/api/auth/keys', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' },
        });
        return;
      }

      const idToken = authHeader.substring(7);
      const decodedToken = await verifyFirebaseToken(idToken);

      if (!decodedToken) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Invalid Firebase token' },
        });
        return;
      }

      // Use Firebase UID as tenant ID
      const tenantId = decodedToken.uid;
      const name = decodedToken.name || decodedToken.email || 'Firebase User';
      const plan = 'free'; // Default to free plan

      // Check if user already has an API key
      const existingKeys = await listApiKeys(storageClient, tenantId);
      if (existingKeys.length > 0) {
        // Return existing key info (but not the actual key for security)
        res.json({
          success: true,
          data: {
            id: existingKeys[0].id,
            tenantId,
            plan: existingKeys[0].plan,
            hasExistingKey: true,
            message: 'You already have an API key. Use the dashboard to manage it.',
          },
        });
        return;
      }

      // Create new API key
      const { apiKey, record } = await createApiKey(
        storageClient,
        tenantId,
        plan,
        name
      );

      res.status(201).json({
        success: true,
        data: {
          apiKey,
          id: record.id,
          tenantId,
          plan,
          message: 'Store this API key securely - it cannot be retrieved later',
        },
      });
    } catch (error) {
      handleError(res, error);
    }
  });

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

      const { apiKey, record } = await createApiKey(
        storageClient,
        tenantId,
        plan || 'free',
        name
      );

      res.status(201).json({
        success: true,
        data: {
          apiKey,
          id: record.id,
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
   * List API keys for current tenant
   * GET /api/keys
   */
  app.get(
    '/api/keys',
    authMiddleware,
    auditMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenant = req.tenant!;
        const keys = await listApiKeys(storageClient, tenant.tenantId);

        res.json({
          success: true,
          data: keys,
        });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  /**
   * Get a specific API key by ID
   * GET /api/keys/:id
   */
  app.get(
    '/api/keys/:id',
    authMiddleware,
    auditMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenant = req.tenant!;
        const key = await getApiKeyById(
          storageClient,
          tenant.tenantId,
          req.params.id
        );

        if (!key) {
          res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: 'API key not found' },
          });
          return;
        }

        res.json({
          success: true,
          data: key,
        });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  /**
   * Revoke an API key
   * DELETE /api/keys/:id
   */
  app.delete(
    '/api/keys/:id',
    authMiddleware,
    auditMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenant = req.tenant!;

        // Prevent revoking the current key
        if (req.params.id === tenant.apiKeyId) {
          res.status(400).json({
            success: false,
            error: {
              code: 'CANNOT_REVOKE_CURRENT',
              message: 'Cannot revoke the API key you are currently using',
            },
          });
          return;
        }

        const success = await revokeApiKey(
          storageClient,
          tenant.tenantId,
          req.params.id
        );

        if (!success) {
          res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: 'API key not found' },
          });
          return;
        }

        res.json({
          success: true,
          data: { revoked: req.params.id },
        });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  /**
   * Regenerate an API key
   * POST /api/keys/:id/regenerate
   */
  app.post(
    '/api/keys/:id/regenerate',
    authMiddleware,
    auditMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenant = req.tenant!;

        const result = await regenerateApiKey(
          storageClient,
          tenant.tenantId,
          req.params.id
        );

        if (!result) {
          res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: 'API key not found' },
          });
          return;
        }

        res.json({
          success: true,
          data: {
            apiKey: result.apiKey,
            id: result.record.id,
            message:
              'Store this new API key securely - it cannot be retrieved later. The old key has been revoked.',
          },
        });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  // ============================================
  // Audit Log
  // ============================================

  /**
   * Get audit log entries
   * GET /api/audit?limit=50&offset=0&action=create&resource=memory
   */
  app.get(
    '/api/audit',
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenant = req.tenant!;

        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;
        const action = req.query.action as AuditAction | undefined;
        const resource = req.query.resource as AuditResource | undefined;
        const startTime = req.query.startTime
          ? parseInt(req.query.startTime as string)
          : undefined;
        const endTime = req.query.endTime
          ? parseInt(req.query.endTime as string)
          : undefined;

        const { entries, total } = await auditService.getEntries({
          tenantId: tenant.tenantId,
          limit,
          offset,
          action,
          resource,
          startTime,
          endTime,
        });

        res.json({
          success: true,
          data: {
            entries,
            total,
            limit,
            offset,
          },
        });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  /**
   * Get a specific audit entry
   * GET /api/audit/:id
   */
  app.get(
    '/api/audit/:id',
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenant = req.tenant!;

        const entry = await auditService.getEntry(
          tenant.tenantId,
          req.params.id
        );

        if (!entry) {
          res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Audit entry not found' },
          });
          return;
        }

        res.json({
          success: true,
          data: entry,
        });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  // ============================================
  // Tenant Info
  // ============================================

  /**
   * Get tenant info
   * GET /api/me
   */
  app.get(
    '/api/me',
    authMiddleware,
    auditMiddleware,
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

  // ============================================
  // MCP Protocol Endpoint
  // ============================================

  /**
   * MCP HTTP Transport
   * POST /mcp - Handle MCP JSON-RPC requests
   * GET /mcp - Handle SSE connections for streaming
   * DELETE /mcp - Close MCP session
   */
  const mcpHandler = createMcpHandler(storageClient);
  app.all('/mcp', authMiddleware, mcpHandler as any);

  // ============================================
  // Static Website Serving
  // ============================================

  // Path to the static website (built with Next.js static export)
  // From dist/server-http.js, go up to root then into web/out
  const webDistPath = path.resolve(__dirname, '../web/out');

  // Serve static files from the web/out directory
  app.use(express.static(webDistPath, {
    // Enable index.html serving for directories
    index: 'index.html',
  }));

  // SPA fallback - serve index.html for unmatched routes
  // This handles client-side routing
  // Note: Express 5 requires named wildcard params, hence '{*path}' instead of '*'
  app.get('/{*path}', (req: Request, res: Response) => {
    // Don't serve index.html for API routes that weren't found
    if (req.path.startsWith('/api/') || req.path.startsWith('/mcp')) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Endpoint not found' },
      });
      return;
    }

    // For SPA routes, try to serve the specific HTML file first
    const htmlPath = path.join(webDistPath, req.path, 'index.html');
    const fallbackPath = path.join(webDistPath, 'index.html');

    // Check if the specific page exists (for static export with trailingSlash)
    res.sendFile(htmlPath, (err) => {
      if (err) {
        // Fall back to the main index.html for SPA routing
        res.sendFile(fallbackPath, (err2) => {
          if (err2) {
            res.status(404).json({
              success: false,
              error: { code: 'NOT_FOUND', message: 'Page not found' },
            });
          }
        });
      }
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
