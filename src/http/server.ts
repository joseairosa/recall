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
import { ContextType } from '../types.js';
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
import {
  createCheckoutSession,
  createPortalSession,
  handleWebhookEvent,
  verifyWebhookSignature,
  isStripeConfigured,
  getCustomerAddons,
  purchaseWorkspaceAddons,
  updateWorkspaceAddons,
} from './billing.service.js';
import { OAuthService, OAUTH_CLIENTS, isValidRedirectUri } from './oauth.service.js';
import { WorkspaceService } from './workspace.service.js';
import { TeamService } from './team.service.js';
import { TeamRole } from './team.types.js';
import { randomBytes } from 'crypto';

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Creates and configures the Express HTTP server
 */
export function createHttpServer(storageClient: StorageClient) {
  const app = express();
  const auditService = new AuditService(storageClient);
  const oauthService = new OAuthService(storageClient);

  // Middleware - Configure CORS to expose MCP session headers
  app.use(cors({
    origin: true, // Allow all origins (API key provides security)
    credentials: true,
    exposedHeaders: ['Mcp-Session-Id', 'mcp-session-id'], // Critical for MCP session management
    allowedHeaders: ['Content-Type', 'Authorization', 'Mcp-Session-Id', 'mcp-session-id'],
  }));
  // Parse JSON for all routes EXCEPT the Stripe webhook (needs raw body for signature verification)
  app.use((req, res, next) => {
    if (req.originalUrl === '/api/webhooks/stripe') {
      next();
    } else {
      express.json()(req, res, next);
    }
  });
  // Parse URL-encoded bodies (for OAuth token endpoint)
  app.use(express.urlencoded({ extended: true }));

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

  // Auth middleware for protected routes (supports both API keys and OAuth tokens)
  const authMiddleware = createAuthMiddleware(storageClient, oauthService);

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
        const store = createTenantMemoryStore(
          storageClient,
          tenant.tenantId,
          tenant.workspace.id
        );

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
          is_global: false,
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
        const store = createTenantMemoryStore(
          storageClient,
          tenant.tenantId,
          tenant.workspace.id
        );

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
        const store = createTenantMemoryStore(
          storageClient,
          tenant.tenantId,
          tenant.workspace.id
        );

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
        const store = createTenantMemoryStore(
          storageClient,
          tenant.tenantId,
          tenant.workspace.id
        );

        const memories = await store.getMemoriesByType(req.params.type as ContextType);

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
        const store = createTenantMemoryStore(
          storageClient,
          tenant.tenantId,
          tenant.workspace.id
        );

        const memories = await store.getMemoriesByTag(req.params.tag as string);

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
        const store = createTenantMemoryStore(
          storageClient,
          tenant.tenantId,
          tenant.workspace.id
        );

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
        const store = createTenantMemoryStore(
          storageClient,
          tenant.tenantId,
          tenant.workspace.id
        );

        const memory = await store.getMemory(req.params.id as string);

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
        const store = createTenantMemoryStore(
          storageClient,
          tenant.tenantId,
          tenant.workspace.id
        );

        const { content, context_type, importance, tags, metadata } = req.body;

        const memory = await store.updateMemory(req.params.id as string, {
          content,
          context_type,
          importance,
          tags,
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
        const store = createTenantMemoryStore(
          storageClient,
          tenant.tenantId,
          tenant.workspace.id
        );

        const memoryId = req.params.id as string;
        await store.deleteMemory(memoryId);

        res.json({
          success: true,
          data: { deleted: memoryId },
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
        const store = createTenantMemoryStore(
          storageClient,
          tenant.tenantId,
          tenant.workspace.id
        );

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
        const store = createTenantMemoryStore(
          storageClient,
          tenant.tenantId,
          tenant.workspace.id
        );

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
        const store = createTenantMemoryStore(
          storageClient,
          tenant.tenantId,
          tenant.workspace.id
        );

        const session = await store.getSession(req.params.id as string);

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
  // Workspace Management
  // ============================================

  /**
   * List all workspaces for current tenant
   * GET /api/workspaces
   */
  app.get(
    '/api/workspaces',
    authMiddleware,
    auditMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenant = req.tenant!;
        const workspaceService = new WorkspaceService(storageClient);

        const workspaces = await workspaceService.listWorkspaces(tenant.tenantId);

        res.json({
          success: true,
          data: {
            workspaces,
            current: tenant.workspace,
            limit: tenant.limits.maxWorkspaces,
            count: workspaces.length,
          },
        });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  /**
   * Get current workspace info
   * GET /api/workspaces/current
   */
  app.get(
    '/api/workspaces/current',
    authMiddleware,
    auditMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenant = req.tenant!;
        const workspaceService = new WorkspaceService(storageClient);

        const workspace = await workspaceService.getWorkspace(
          tenant.tenantId,
          tenant.workspace.id
        );

        res.json({
          success: true,
          data: {
            ...tenant.workspace,
            ...workspace,
          },
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
      const existingKeysList = await storageClient.smembers(`tenant:${tenantId}:apikeys`);
      if (existingKeysList.length > 0) {
        // Return the existing API key (safe since Firebase auth verified)
        const existingApiKey = existingKeysList[0];
        const keyData = await storageClient.hgetall(`apikey:${existingApiKey}`);

        res.json({
          success: true,
          data: {
            apiKey: existingApiKey,
            id: keyData?.id || existingApiKey.substring(3, 15),
            tenantId,
            plan: keyData?.plan || 'free',
            message: 'Existing API key retrieved.',
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
          req.params.id as string
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
        if ((req.params.id as string) === tenant.apiKeyId) {
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
          req.params.id as string
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
          data: { revoked: req.params.id as string },
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
          req.params.id as string
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
          req.params.id as string
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
        const store = createTenantMemoryStore(
          storageClient,
          tenant.tenantId,
          tenant.workspace.id
        );

        const stats = await store.getSummaryStats();

        res.json({
          success: true,
          data: {
            tenantId: tenant.tenantId,
            plan: tenant.plan,
            limits: tenant.limits,
            workspace: tenant.workspace,
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
  // Workspace Endpoints
  // ============================================

  /**
   * List all workspaces for the authenticated tenant
   * GET /api/workspaces
   *
   * Requires Firebase authentication.
   * Returns workspace list with metadata and usage statistics.
   */
  app.get('/api/workspaces', async (req: Request, res: Response) => {
    try {
      // Verify Firebase token
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' },
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

      const tenantId = decodedToken.uid;
      const workspaceService = new WorkspaceService(storageClient);

      // Get workspaces (this will also auto-clean orphaned IDs)
      const workspaces = await workspaceService.listWorkspaces(tenantId);
      const workspaceCount = await workspaceService.getWorkspaceCount(tenantId);

      // Get plan limits
      const customerData = await storageClient.hgetall(`customer:${tenantId}`);
      const plan = customerData?.plan || 'free';
      const addonWorkspaces = parseInt(customerData?.workspaceAddons || '0') || 0;

      // Import PLAN_LIMITS from types
      const { PLAN_LIMITS } = await import('./types.js');
      const basePlanLimit = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS]?.maxWorkspaces ?? 1;
      const totalLimit = basePlanLimit === -1 ? -1 : basePlanLimit + addonWorkspaces;

      res.json({
        success: true,
        data: {
          workspaces,
          count: workspaceCount,
          limits: {
            base: basePlanLimit,
            addons: addonWorkspaces,
            total: totalLimit,
            remaining: totalLimit === -1 ? -1 : totalLimit - workspaceCount,
          },
          plan,
        },
      });
    } catch (error) {
      console.error('[Server] Error listing workspaces:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to list workspaces',
        },
      });
    }
  });

  // ============================================
  // Billing Endpoints (Stripe)
  // ============================================

  /**
   * Create Stripe Checkout session
   * POST /api/billing/checkout
   *
   * Requires Firebase authentication.
   */
  app.post('/api/billing/checkout', async (req: Request, res: Response) => {
    try {
      // Verify Firebase token
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' },
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

      if (!isStripeConfigured()) {
        res.status(503).json({
          success: false,
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Billing is not configured' },
        });
        return;
      }

      const { priceId, successUrl, cancelUrl } = req.body;

      if (!priceId) {
        res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'priceId is required' },
        });
        return;
      }

      const session = await createCheckoutSession(
        storageClient,
        decodedToken.uid,
        priceId,
        decodedToken.email,
        decodedToken.name,
        successUrl,
        cancelUrl
      );

      res.json({
        success: true,
        data: {
          url: session.url,
          sessionId: session.sessionId,
        },
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * Create Stripe Customer Portal session
   * POST /api/billing/portal
   *
   * Requires Firebase authentication.
   */
  app.post('/api/billing/portal', async (req: Request, res: Response) => {
    try {
      // Verify Firebase token
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' },
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

      if (!isStripeConfigured()) {
        res.status(503).json({
          success: false,
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Billing is not configured' },
        });
        return;
      }

      const { returnUrl } = req.body;

      const session = await createPortalSession(
        storageClient,
        decodedToken.uid,
        returnUrl
      );

      res.json({
        success: true,
        data: {
          url: session.url,
        },
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  // ============================================
  // Add-on Endpoints
  // ============================================

  /**
   * Get current add-ons for user
   * GET /api/billing/addons
   *
   * Requires Firebase authentication.
   */
  app.get('/api/billing/addons', async (req: Request, res: Response) => {
    try {
      // Verify Firebase token
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' },
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

      const addons = await getCustomerAddons(storageClient, decodedToken.uid);

      res.json({
        success: true,
        data: addons,
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * Purchase workspace add-ons
   * POST /api/billing/addons/workspaces
   *
   * Requires Firebase authentication and active subscription.
   */
  app.post('/api/billing/addons/workspaces', async (req: Request, res: Response) => {
    try {
      // Verify Firebase token
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' },
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

      if (!isStripeConfigured()) {
        res.status(503).json({
          success: false,
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Billing is not configured' },
        });
        return;
      }

      const { quantity } = req.body;

      if (!quantity || typeof quantity !== 'number' || quantity < 1) {
        res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'quantity must be a positive number' },
        });
        return;
      }

      const result = await purchaseWorkspaceAddons(
        storageClient,
        decodedToken.uid,
        quantity
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * Update workspace add-on quantity
   * PUT /api/billing/addons/workspaces
   *
   * Requires Firebase authentication and active subscription.
   */
  app.put('/api/billing/addons/workspaces', async (req: Request, res: Response) => {
    try {
      // Verify Firebase token
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' },
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

      if (!isStripeConfigured()) {
        res.status(503).json({
          success: false,
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Billing is not configured' },
        });
        return;
      }

      const { quantity } = req.body;

      if (typeof quantity !== 'number' || quantity < 0) {
        res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'quantity must be a non-negative number' },
        });
        return;
      }

      const result = await updateWorkspaceAddons(
        storageClient,
        decodedToken.uid,
        quantity
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * Stripe Webhook handler
   * POST /api/webhooks/stripe
   *
   * Handles subscription lifecycle events from Stripe.
   */
  app.post(
    '/api/webhooks/stripe',
    express.raw({ type: 'application/json' }),
    async (req: Request, res: Response) => {
      try {
        const signature = req.headers['stripe-signature'];

        if (!signature || typeof signature !== 'string') {
          res.status(400).json({
            success: false,
            error: { code: 'BAD_REQUEST', message: 'Missing stripe-signature header' },
          });
          return;
        }

        let event;
        try {
          event = verifyWebhookSignature(req.body, signature);
        } catch (err) {
          console.error('[Webhook] Signature verification failed:', err);
          res.status(400).json({
            success: false,
            error: { code: 'BAD_REQUEST', message: 'Invalid signature' },
          });
          return;
        }

        await handleWebhookEvent(storageClient, event);

        res.json({ success: true, received: true });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  // ============================================
  // Team Management Endpoints
  // ============================================

  const teamService = new TeamService(storageClient);

  /**
   * Create a new team
   * POST /api/teams
   *
   * Requires Firebase authentication (team owner).
   */
  app.post('/api/teams', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' },
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

      // Check if user is already in a team
      const existingTeamId = await teamService.getTenantTeamId(decodedToken.uid);
      if (existingTeamId) {
        res.status(400).json({
          success: false,
          error: { code: 'ALREADY_IN_TEAM', message: 'You are already in a team' },
        });
        return;
      }

      // Check if user has a Team or Enterprise plan
      const customerData = await storageClient.hgetall(`customer:${decodedToken.uid}`);
      const userPlan = customerData?.plan || 'free';
      if (userPlan !== 'team' && userPlan !== 'enterprise') {
        res.status(403).json({
          success: false,
          error: {
            code: 'PLAN_REQUIRED',
            message: 'Team plan or higher is required to create a team. Please upgrade your plan.',
          },
        });
        return;
      }

      const { name, settings } = req.body;

      if (!name) {
        res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'name is required' },
        });
        return;
      }

      const team = await teamService.createTeam(decodedToken.uid, name, 'team', settings);

      res.status(201).json({
        success: true,
        data: team,
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * Get current user's team
   * GET /api/teams/me
   *
   * Requires Firebase authentication.
   */
  app.get('/api/teams/me', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' },
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

      const teamId = await teamService.getTenantTeamId(decodedToken.uid);
      if (!teamId) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_IN_TEAM', message: 'You are not in a team' },
        });
        return;
      }

      const team = await teamService.getTeam(teamId);
      const member = await teamService.getMemberByTenantId(teamId, decodedToken.uid);

      res.json({
        success: true,
        data: {
          team,
          membership: member,
        },
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * Get team by ID
   * GET /api/teams/:id
   *
   * Requires Firebase authentication and team membership.
   */
  app.get('/api/teams/:id', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' },
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

      const teamId = req.params.id as string;
      const member = await teamService.getMemberByTenantId(teamId, decodedToken.uid);

      if (!member) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'You are not a member of this team' },
        });
        return;
      }

      const team = await teamService.getTeam(teamId);

      if (!team) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Team not found' },
        });
        return;
      }

      res.json({
        success: true,
        data: team,
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * Update team settings
   * PUT /api/teams/:id
   *
   * Requires Firebase authentication and admin/owner role.
   */
  app.put('/api/teams/:id', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' },
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

      const { name, settings } = req.body;

      const team = await teamService.updateTeam(req.params.id as string, decodedToken.uid, {
        name,
        settings,
      });

      if (!team) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Team not found' },
        });
        return;
      }

      res.json({
        success: true,
        data: team,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Permission denied') {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: error.message },
        });
        return;
      }
      handleError(res, error);
    }
  });

  /**
   * Delete team
   * DELETE /api/teams/:id
   *
   * Requires Firebase authentication and owner role.
   */
  app.delete('/api/teams/:id', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' },
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

      await teamService.deleteTeam(req.params.id as string, decodedToken.uid);

      res.json({
        success: true,
        data: { deleted: req.params.id as string },
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('owner')) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: error.message },
        });
        return;
      }
      handleError(res, error);
    }
  });

  /**
   * List team members
   * GET /api/teams/:id/members
   *
   * Requires Firebase authentication and team membership.
   */
  app.get('/api/teams/:id/members', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' },
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

      const teamId = req.params.id as string;
      const member = await teamService.getMemberByTenantId(teamId, decodedToken.uid);

      if (!member) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'You are not a member of this team' },
        });
        return;
      }

      const members = await teamService.listMembers(teamId);

      res.json({
        success: true,
        data: members,
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * Update member role
   * PUT /api/teams/:id/members/:memberId/role
   *
   * Requires Firebase authentication and admin/owner role.
   */
  app.put('/api/teams/:id/members/:memberId/role', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' },
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

      const { role } = req.body;

      if (!role || !['admin', 'member', 'viewer'].includes(role)) {
        res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'role must be admin, member, or viewer' },
        });
        return;
      }

      const updatedMember = await teamService.updateMemberRole(
        req.params.id as string,
        decodedToken.uid,
        req.params.memberId as string,
        role as TeamRole
      );

      if (!updatedMember) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Member not found' },
        });
        return;
      }

      res.json({
        success: true,
        data: updatedMember,
      });
    } catch (error) {
      if (error instanceof Error && (error.message.includes('Permission') || error.message.includes('Cannot'))) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: error.message },
        });
        return;
      }
      handleError(res, error);
    }
  });

  /**
   * Remove member from team
   * DELETE /api/teams/:id/members/:memberId
   *
   * Requires Firebase authentication and admin/owner role.
   */
  app.delete('/api/teams/:id/members/:memberId', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' },
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

      const removed = await teamService.removeMember(
        req.params.id as string,
        decodedToken.uid,
        req.params.memberId as string
      );

      if (!removed) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Member not found' },
        });
        return;
      }

      res.json({
        success: true,
        data: { removed: req.params.memberId as string },
      });
    } catch (error) {
      if (error instanceof Error && (error.message.includes('Permission') || error.message.includes('Cannot'))) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: error.message },
        });
        return;
      }
      handleError(res, error);
    }
  });

  /**
   * Create team invite
   * POST /api/teams/:id/invites
   *
   * Requires Firebase authentication and admin/owner role.
   */
  app.post('/api/teams/:id/invites', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' },
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

      const { email, role, workspaceIds } = req.body;

      if (!email) {
        res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'email is required' },
        });
        return;
      }

      if (!role || !['admin', 'member', 'viewer'].includes(role)) {
        res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'role must be admin, member, or viewer' },
        });
        return;
      }

      const invite = await teamService.createInvite(
        req.params.id as string,
        decodedToken.uid,
        email,
        role as TeamRole,
        workspaceIds
      );

      res.status(201).json({
        success: true,
        data: {
          id: invite.id,
          email: invite.email,
          role: invite.role,
          expiresAt: invite.expiresAt,
          // Include invite link token for sharing
          inviteToken: invite.token,
        },
      });
    } catch (error) {
      if (error instanceof Error && (error.message.includes('Permission') || error.message.includes('already'))) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: error.message },
        });
        return;
      }
      handleError(res, error);
    }
  });

  /**
   * List pending invites
   * GET /api/teams/:id/invites
   *
   * Requires Firebase authentication and admin/owner role.
   */
  app.get('/api/teams/:id/invites', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' },
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

      const teamId = req.params.id as string;
      const member = await teamService.getMemberByTenantId(teamId, decodedToken.uid);

      if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Admin or owner access required' },
        });
        return;
      }

      const invites = await teamService.listInvites(teamId);

      res.json({
        success: true,
        data: invites.map((inv) => ({
          id: inv.id,
          email: inv.email,
          role: inv.role,
          createdAt: inv.createdAt,
          expiresAt: inv.expiresAt,
        })),
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * Cancel invite
   * DELETE /api/teams/:id/invites/:inviteId
   *
   * Requires Firebase authentication and admin/owner role.
   */
  app.delete('/api/teams/:id/invites/:inviteId', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' },
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

      const cancelled = await teamService.cancelInvite(
        req.params.id as string,
        decodedToken.uid,
        req.params.inviteId as string
      );

      if (!cancelled) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Invite not found' },
        });
        return;
      }

      res.json({
        success: true,
        data: { cancelled: req.params.inviteId as string },
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Permission')) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: error.message },
        });
        return;
      }
      handleError(res, error);
    }
  });

  /**
   * Accept invite (public endpoint)
   * POST /api/invites/:token/accept
   *
   * Requires Firebase authentication.
   */
  app.post('/api/invites/:token/accept', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' },
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

      const { name } = req.body;
      const email = decodedToken.email;

      if (!email) {
        res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'Email is required in Firebase token' },
        });
        return;
      }

      const member = await teamService.acceptInvite(
        req.params.token as string,
        decodedToken.uid,
        email,
        name || decodedToken.name
      );

      res.status(201).json({
        success: true,
        data: member,
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Invalid') || error.message.includes('expired')) {
          res.status(400).json({
            success: false,
            error: { code: 'BAD_REQUEST', message: error.message },
          });
          return;
        }
        if (error.message.includes('already')) {
          res.status(409).json({
            success: false,
            error: { code: 'CONFLICT', message: error.message },
          });
          return;
        }
      }
      handleError(res, error);
    }
  });

  /**
   * Grant workspace permission to member
   * PUT /api/teams/:id/workspaces/:wsId/members/:memberId
   *
   * Requires Firebase authentication and admin/owner role.
   */
  app.put('/api/teams/:id/workspaces/:wsId/members/:memberId', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' },
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

      const { permission } = req.body;

      if (!permission || !['read', 'write', 'admin'].includes(permission)) {
        res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'permission must be read, write, or admin' },
        });
        return;
      }

      await teamService.grantWorkspacePermission(
        req.params.id as string,
        decodedToken.uid,
        req.params.memberId as string,
        req.params.wsId as string,
        permission
      );

      res.json({
        success: true,
        data: { granted: true },
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Permission')) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: error.message },
        });
        return;
      }
      handleError(res, error);
    }
  });

  /**
   * Revoke workspace permission from member
   * DELETE /api/teams/:id/workspaces/:wsId/members/:memberId
   *
   * Requires Firebase authentication and admin/owner role.
   */
  app.delete('/api/teams/:id/workspaces/:wsId/members/:memberId', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' },
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

      await teamService.revokeWorkspacePermission(
        req.params.id as string,
        decodedToken.uid,
        req.params.memberId as string,
        req.params.wsId as string
      );

      res.json({
        success: true,
        data: { revoked: true },
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Permission')) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: error.message },
        });
        return;
      }
      handleError(res, error);
    }
  });

  /**
   * Get member's workspace permissions
   * GET /api/teams/:id/members/:memberId/workspaces
   *
   * Requires Firebase authentication and team membership.
   */
  app.get('/api/teams/:id/members/:memberId/workspaces', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' },
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

      const teamId = req.params.id as string;
      const currentMember = await teamService.getMemberByTenantId(teamId, decodedToken.uid);

      if (!currentMember) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'You are not a member of this team' },
        });
        return;
      }

      const workspaces = await teamService.listMemberWorkspaces(teamId, req.params.memberId as string);

      res.json({
        success: true,
        data: workspaces,
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * Get team audit log
   * GET /api/teams/:id/audit
   *
   * Requires Firebase authentication and admin/owner role.
   */
  app.get('/api/teams/:id/audit', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' },
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

      const teamId = req.params.id as string;
      const member = await teamService.getMemberByTenantId(teamId, decodedToken.uid);

      if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Admin or owner access required' },
        });
        return;
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const auditLog = await teamService.getAuditLog(teamId, limit, offset);

      res.json({
        success: true,
        data: auditLog,
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  // ============================================
  // OAuth 2.0 Endpoints (for Claude Desktop integration)
  // ============================================

  /**
   * OAuth 2.0 Authorization Server Metadata
   * GET /.well-known/oauth-authorization-server
   *
   * Returns OAuth 2.0 server configuration for automatic discovery.
   * See RFC 8414: OAuth 2.0 Authorization Server Metadata
   */
  app.get('/.well-known/oauth-authorization-server', (req: Request, res: Response) => {
    // Determine the base URL from the request
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'recallmcp.com';
    const baseUrl = `${protocol}://${host}`;

    res.json({
      // RFC 8414 required fields
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,

      // Supported response types
      response_types_supported: ['code'],

      // Supported grant types
      grant_types_supported: ['authorization_code', 'refresh_token'],

      // Token endpoint authentication methods
      token_endpoint_auth_methods_supported: ['none'], // Public clients only

      // PKCE support (required for public clients)
      code_challenge_methods_supported: ['S256', 'plain'],

      // Scopes
      scopes_supported: ['memories'],

      // Service documentation
      service_documentation: 'https://github.com/joseairosa/recall-mcp',
    });
  });

  /**
   * OAuth Authorization Endpoint
   * GET /oauth/authorize
   *
   * Starts the OAuth flow. Redirects to login page or shows login form.
   * Query params:
   * - client_id: OAuth client ID (required)
   * - redirect_uri: Callback URL (required)
   * - response_type: Must be "code" (required)
   * - state: CSRF token (required)
   * - scope: Requested scopes (optional)
   * - code_challenge: PKCE challenge (optional)
   * - code_challenge_method: PKCE method (optional, default S256)
   */
  app.get('/oauth/authorize', async (req: Request, res: Response) => {
    try {
      const {
        client_id,
        redirect_uri,
        response_type,
        state,
        scope = 'memories',
        code_challenge,
        code_challenge_method,
      } = req.query as Record<string, string>;

      // Validate required parameters
      if (!client_id) {
        res.status(400).json({
          error: 'invalid_request',
          error_description: 'client_id is required',
        });
        return;
      }

      if (!redirect_uri) {
        res.status(400).json({
          error: 'invalid_request',
          error_description: 'redirect_uri is required',
        });
        return;
      }

      if (response_type !== 'code') {
        res.status(400).json({
          error: 'unsupported_response_type',
          error_description: 'Only response_type=code is supported',
        });
        return;
      }

      if (!state) {
        res.status(400).json({
          error: 'invalid_request',
          error_description: 'state is required for CSRF protection',
        });
        return;
      }

      // Validate client
      const client = oauthService.getClient(client_id);
      if (!client) {
        res.status(400).json({
          error: 'invalid_client',
          error_description: 'Unknown client_id',
        });
        return;
      }

      // Validate redirect URI
      if (!isValidRedirectUri(client, redirect_uri)) {
        res.status(400).json({
          error: 'invalid_request',
          error_description: 'Invalid redirect_uri for this client',
        });
        return;
      }

      // Store pending authorization request
      await oauthService.storePendingAuth(state, {
        clientId: client_id,
        redirectUri: redirect_uri,
        scope,
        codeChallenge: code_challenge,
        codeChallengeMethod: code_challenge_method || 'S256',
      });

      // Redirect to login page with state parameter
      const loginUrl = `/oauth/login?state=${encodeURIComponent(state)}`;
      res.redirect(loginUrl);
    } catch (error) {
      console.error('[OAuth] Authorize error:', error);
      res.status(500).json({
        error: 'server_error',
        error_description: 'Internal server error',
      });
    }
  });

  /**
   * OAuth Token Endpoint
   * POST /oauth/token
   *
   * Exchanges authorization code for access tokens.
   * Supports:
   * - grant_type=authorization_code (exchange code for tokens)
   * - grant_type=refresh_token (refresh access token)
   */
  app.post('/oauth/token', async (req: Request, res: Response) => {
    try {
      const {
        grant_type,
        code,
        redirect_uri,
        client_id,
        code_verifier,
        refresh_token,
      } = req.body;

      if (grant_type === 'authorization_code') {
        if (!code || !redirect_uri || !client_id) {
          res.status(400).json({
            error: 'invalid_request',
            error_description: 'code, redirect_uri, and client_id are required',
          });
          return;
        }

        const tokens = await oauthService.exchangeCodeForTokens({
          code,
          clientId: client_id,
          redirectUri: redirect_uri,
          codeVerifier: code_verifier,
        });

        if (!tokens) {
          res.status(400).json({
            error: 'invalid_grant',
            error_description: 'Invalid or expired authorization code',
          });
          return;
        }

        res.json({
          access_token: tokens.accessToken,
          token_type: tokens.tokenType,
          expires_in: tokens.expiresIn,
          refresh_token: tokens.refreshToken,
          scope: tokens.scope,
        });
      } else if (grant_type === 'refresh_token') {
        if (!refresh_token) {
          res.status(400).json({
            error: 'invalid_request',
            error_description: 'refresh_token is required',
          });
          return;
        }

        const tokens = await oauthService.refreshAccessToken(refresh_token);

        if (!tokens) {
          res.status(400).json({
            error: 'invalid_grant',
            error_description: 'Invalid or expired refresh token',
          });
          return;
        }

        res.json({
          access_token: tokens.accessToken,
          token_type: tokens.tokenType,
          expires_in: tokens.expiresIn,
          refresh_token: tokens.refreshToken,
          scope: tokens.scope,
        });
      } else {
        res.status(400).json({
          error: 'unsupported_grant_type',
          error_description: 'Only authorization_code and refresh_token are supported',
        });
      }
    } catch (error) {
      console.error('[OAuth] Token error:', error);
      res.status(500).json({
        error: 'server_error',
        error_description: 'Internal server error',
      });
    }
  });

  /**
   * OAuth Callback from Firebase
   * POST /oauth/callback
   *
   * Called after Firebase authentication. Generates authorization code
   * and redirects back to the client's redirect_uri.
   */
  app.post('/oauth/callback', async (req: Request, res: Response) => {
    try {
      const { idToken, state } = req.body;

      if (!idToken || !state) {
        res.status(400).json({
          error: 'invalid_request',
          error_description: 'idToken and state are required',
        });
        return;
      }

      // Verify Firebase token
      const decodedToken = await verifyFirebaseToken(idToken);
      if (!decodedToken) {
        res.status(401).json({
          error: 'invalid_token',
          error_description: 'Invalid Firebase token',
        });
        return;
      }

      // Get pending auth request
      const pendingAuth = await oauthService.getPendingAuth(state);
      if (!pendingAuth) {
        res.status(400).json({
          error: 'invalid_request',
          error_description: 'Invalid or expired state parameter',
        });
        return;
      }

      // Use Firebase UID as tenant ID
      const tenantId = decodedToken.uid;

      // Ensure tenant exists and has an API key
      const existingKeys = await storageClient.smembers(`tenant:${tenantId}:apikeys`);
      if (existingKeys.length === 0) {
        // Create API key for new user (same logic as /api/auth/keys)
        const apiKey = 'sk-recall-' + randomBytes(24).toString('base64url');
        const keyId = randomBytes(8).toString('hex');

        await storageClient.hset(`apikey:${apiKey}`, {
          id: keyId,
          tenantId,
          plan: 'free',
          createdAt: Date.now().toString(),
          status: 'active',
        });

        await storageClient.sadd(`tenant:${tenantId}:apikeys`, apiKey);

        // Initialize customer record
        await storageClient.hset(`customer:${tenantId}`, {
          email: decodedToken.email || '',
          name: decodedToken.name || '',
          firebaseUid: tenantId,
          plan: 'free',
          createdAt: Date.now().toString(),
        });

        console.log(`[OAuth] Created new tenant: ${tenantId}`);
      }

      // Generate authorization code
      const authCode = await oauthService.generateAuthorizationCode({
        clientId: pendingAuth.clientId,
        tenantId,
        redirectUri: pendingAuth.redirectUri,
        scope: pendingAuth.scope,
        codeChallenge: pendingAuth.codeChallenge,
        codeChallengeMethod: pendingAuth.codeChallengeMethod,
      });

      // Build redirect URL with code
      const redirectUrl = new URL(pendingAuth.redirectUri);
      redirectUrl.searchParams.set('code', authCode);
      redirectUrl.searchParams.set('state', state);

      res.json({
        success: true,
        redirectUrl: redirectUrl.toString(),
      });
    } catch (error) {
      console.error('[OAuth] Callback error:', error);
      res.status(500).json({
        error: 'server_error',
        error_description: 'Internal server error',
      });
    }
  });

  /**
   * OAuth Login Page
   * GET /oauth/login
   *
   * Shows the Firebase login page for OAuth flow.
   * This is a simple HTML page that handles Firebase auth and then
   * posts the result to /oauth/callback.
   */
  app.get('/oauth/login', (req: Request, res: Response) => {
    const state = req.query.state as string;

    if (!state) {
      res.status(400).send('Missing state parameter');
      return;
    }

    // Serve the OAuth login page
    const loginHtml = getOAuthLoginPage(state);
    res.setHeader('Content-Type', 'text/html');
    res.send(loginHtml);
  });

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
 * Creates a tenant and workspace-scoped MemoryStore instance
 */
function createTenantMemoryStore(
  storageClient: StorageClient,
  tenantId: string,
  workspaceId: string
): MemoryStore {
  // The workspace path becomes tenant + workspace scoped
  // This ensures all Redis keys are prefixed with tenant and workspace ID
  return new MemoryStore(
    storageClient,
    `tenant:${tenantId}:workspace:${workspaceId}`
  );
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

/**
 * Generate OAuth login page HTML
 * This page handles Firebase authentication and then redirects back to the OAuth flow.
 */
function getOAuthLoginPage(state: string): string {
  // Firebase config from environment variables (same as dashboard)
  const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign in to Recall</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
    }
    .container {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      padding: 40px;
      max-width: 400px;
      width: 100%;
      text-align: center;
      backdrop-filter: blur(10px);
    }
    .logo {
      font-size: 48px;
      margin-bottom: 16px;
    }
    h1 {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .subtitle {
      color: rgba(255, 255, 255, 0.7);
      margin-bottom: 32px;
      font-size: 14px;
    }
    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      width: 100%;
      padding: 14px 20px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.05);
      color: #fff;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      margin-bottom: 12px;
    }
    .btn:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.3);
    }
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .btn svg {
      width: 20px;
      height: 20px;
    }
    .error {
      background: rgba(239, 68, 68, 0.2);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #fca5a5;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 16px;
      font-size: 14px;
      display: none;
    }
    .loading {
      display: none;
      margin: 20px 0;
    }
    .loading.active {
      display: block;
    }
    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid rgba(255, 255, 255, 0.2);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 12px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .footer {
      margin-top: 24px;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.5);
    }
    .footer a {
      color: rgba(255, 255, 255, 0.7);
      text-decoration: none;
    }
    .footer a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">🧠</div>
    <h1>Sign in to Recall</h1>
    <p class="subtitle">Connect your memory to Claude Desktop</p>

    <div id="error" class="error"></div>

    <div id="loading" class="loading">
      <div class="spinner"></div>
      <p>Signing you in...</p>
    </div>

    <div id="buttons">
      <button class="btn" onclick="signInWithGoogle()">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Continue with Google
      </button>

      <button class="btn" onclick="signInWithGitHub()">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
        </svg>
        Continue with GitHub
      </button>
    </div>

    <div class="footer">
      <p>By signing in, you agree to our <a href="https://recallmcp.com/terms">Terms</a> and <a href="https://recallmcp.com/privacy">Privacy Policy</a></p>
    </div>
  </div>

  <script type="module">
    import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
    import { getAuth, signInWithPopup, GoogleAuthProvider, GithubAuthProvider } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

    // Initialize Firebase
    const firebaseConfig = ${JSON.stringify(firebaseConfig)};
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);

    const state = ${JSON.stringify(state)};

    function showError(message) {
      const errorEl = document.getElementById('error');
      errorEl.textContent = message;
      errorEl.style.display = 'block';
      document.getElementById('buttons').style.display = 'block';
      document.getElementById('loading').classList.remove('active');
    }

    function showLoading() {
      document.getElementById('buttons').style.display = 'none';
      document.getElementById('loading').classList.add('active');
      document.getElementById('error').style.display = 'none';
    }

    async function handleSignIn(provider) {
      showLoading();

      try {
        const result = await signInWithPopup(auth, provider);
        console.log('[OAuth] Firebase sign-in successful, getting ID token...');
        const idToken = await result.user.getIdToken();
        console.log('[OAuth] Got ID token, calling callback...');

        // Send token to backend with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch('/oauth/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken, state }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        console.log('[OAuth] Callback response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[OAuth] Callback error:', errorText);
          showError('Server error: ' + response.status);
          return;
        }

        const data = await response.json();
        console.log('[OAuth] Callback data:', data);

        if (data.success && data.redirectUrl) {
          console.log('[OAuth] Redirecting to:', data.redirectUrl);
          window.location.href = data.redirectUrl;
        } else {
          showError(data.error_description || data.error || 'Authentication failed');
        }
      } catch (error) {
        console.error('[OAuth] Sign-in error:', error);
        if (error.name === 'AbortError') {
          showError('Request timed out. Please try again.');
        } else if (error.code === 'auth/popup-closed-by-user') {
          showError('Sign-in was cancelled');
        } else if (error.code === 'auth/popup-blocked') {
          showError('Pop-up was blocked. Please allow pop-ups for this site.');
        } else {
          showError(error.message || 'Failed to sign in');
        }
      }
    }

    window.signInWithGoogle = () => handleSignIn(new GoogleAuthProvider());
    window.signInWithGitHub = () => handleSignIn(new GithubAuthProvider());
  </script>
</body>
</html>`;
}
