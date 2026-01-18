/**
 * Authentication Middleware
 *
 * Validates API keys and OAuth tokens, attaching tenant context to requests.
 * Supports two authentication methods:
 * 1. API keys: Bearer sk-xxx (stored in Redis as apikey:{key})
 * 2. OAuth tokens: Bearer xxx (stored in Redis as oauth:access:{token})
 */

import { randomBytes } from 'crypto';
import { ulid } from 'ulid';
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, ApiKeyRecord, PLAN_LIMITS } from './types.js';
import { StorageClient } from '../persistence/storage-client.js';
import { OAuthService } from './oauth.service.js';
import { WorkspaceService } from './workspace.service.js';
import { createWorkspaceId } from '../types.js';

/**
 * Creates an authentication middleware with the given storage client
 * Supports both API keys (sk-xxx) and OAuth access tokens
 */
export function createAuthMiddleware(storageClient: StorageClient, oauthService?: OAuthService) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing Authorization header. Use: Bearer sk-xxx',
        },
      });
      return;
    }

    const [type, token] = authHeader.split(' ');

    if (type !== 'Bearer' || !token) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_AUTH_FORMAT',
          message: 'Invalid authorization format. Use: Bearer sk-xxx',
        },
      });
      return;
    }

    try {
      // Check if this is an API key (starts with sk-) or an OAuth token
      const isApiKey = token.startsWith('sk-');

      if (isApiKey) {
        // Validate API key
        const keyData = await storageClient.hgetall(`apikey:${token}`);

        if (!keyData || !keyData.tenantId) {
          res.status(401).json({
            success: false,
            error: {
              code: 'INVALID_API_KEY',
              message: 'Invalid API key',
            },
          });
          return;
        }

        // Check if key is revoked
        if (keyData.status === 'revoked') {
          res.status(401).json({
            success: false,
            error: {
              code: 'API_KEY_REVOKED',
              message: 'This API key has been revoked',
            },
          });
          return;
        }

        const record: ApiKeyRecord = {
          id: keyData.id || token.substring(3, 15), // Fallback for old keys without id
          tenantId: keyData.tenantId,
          apiKey: token,
          plan: (keyData.plan as ApiKeyRecord['plan']) || 'free',
          createdAt: parseInt(keyData.createdAt) || Date.now(),
          lastUsedAt: keyData.lastUsedAt
            ? parseInt(keyData.lastUsedAt)
            : undefined,
          name: keyData.name || undefined,
          usageCount: parseInt(keyData.usageCount) || 0,
          status: (keyData.status as ApiKeyRecord['status']) || 'active',
        };

        // Update last used timestamp and increment usage count (fire and forget)
        const newUsageCount = record.usageCount + 1;
        storageClient
          .hset(`apikey:${token}`, {
            lastUsedAt: Date.now().toString(),
            usageCount: newUsageCount.toString(),
          })
          .catch(() => {
            // Ignore errors updating usage stats
          });

        // Extract workspace from header (default to 'default' if not provided)
        const workspacePath =
          (req.headers['x-recall-workspace'] as string) || 'default';
        const isDefaultWorkspace = !req.headers['x-recall-workspace'];
        const workspaceId = createWorkspaceId(workspacePath);

        // Validate/register workspace
        const workspaceService = new WorkspaceService(storageClient);
        const workspaceResult = await workspaceService.getOrRegisterWorkspace(
          record.tenantId,
          workspacePath,
          record.plan
        );

        if (!workspaceResult) {
          const limit = PLAN_LIMITS[record.plan].maxWorkspaces;
          res.status(403).json({
            success: false,
            error: {
              code: 'WORKSPACE_LIMIT_EXCEEDED',
              message: `Your ${record.plan} plan allows ${limit} workspace(s). Upgrade to add more.`,
            },
          });
          return;
        }

        // Attach tenant context to request
        req.tenant = {
          tenantId: record.tenantId,
          apiKey: token,
          apiKeyId: record.id,
          plan: record.plan,
          limits: PLAN_LIMITS[record.plan],
          workspace: {
            id: workspaceId,
            path: workspacePath,
            isDefault: isDefaultWorkspace,
          },
        };

        next();
      } else {
        // Validate OAuth access token
        if (!oauthService) {
          res.status(401).json({
            success: false,
            error: {
              code: 'OAUTH_NOT_CONFIGURED',
              message: 'OAuth authentication is not configured',
            },
          });
          return;
        }

        const tokenData = await oauthService.validateAccessToken(token);

        if (!tokenData) {
          res.status(401).json({
            success: false,
            error: {
              code: 'INVALID_ACCESS_TOKEN',
              message: 'Invalid or expired access token',
            },
          });
          return;
        }

        // Get tenant's plan from their API keys (use the best plan they have)
        const apiKeys = await storageClient.smembers(`tenant:${tokenData.tenantId}:apikeys`);
        let bestPlan: ApiKeyRecord['plan'] = 'free';

        for (const apiKey of apiKeys) {
          const keyData = await storageClient.hgetall(`apikey:${apiKey}`);
          if (keyData && keyData.plan) {
            const plan = keyData.plan as ApiKeyRecord['plan'];
            // Upgrade plan if this key has a better plan
            if (plan === 'enterprise' ||
                (plan === 'team' && bestPlan !== 'enterprise') ||
                (plan === 'pro' && bestPlan === 'free')) {
              bestPlan = plan;
            }
          }
        }

        // Extract workspace from header (default to 'default' if not provided)
        const workspacePath =
          (req.headers['x-recall-workspace'] as string) || 'default';
        const isDefaultWorkspace = !req.headers['x-recall-workspace'];
        const workspaceId = createWorkspaceId(workspacePath);

        // Validate/register workspace
        const workspaceService = new WorkspaceService(storageClient);
        const workspaceResult = await workspaceService.getOrRegisterWorkspace(
          tokenData.tenantId,
          workspacePath,
          bestPlan
        );

        if (!workspaceResult) {
          const limit = PLAN_LIMITS[bestPlan].maxWorkspaces;
          res.status(403).json({
            success: false,
            error: {
              code: 'WORKSPACE_LIMIT_EXCEEDED',
              message: `Your ${bestPlan} plan allows ${limit} workspace(s). Upgrade to add more.`,
            },
          });
          return;
        }

        // Attach tenant context to request (OAuth auth)
        req.tenant = {
          tenantId: tokenData.tenantId,
          apiKey: `oauth:${token.substring(0, 8)}`, // OAuth identifier
          apiKeyId: 'oauth', // OAuth sessions don't have API key IDs
          plan: bestPlan,
          limits: PLAN_LIMITS[bestPlan],
          workspace: {
            id: workspaceId,
            path: workspacePath,
            isDefault: isDefaultWorkspace,
          },
        };

        console.log(
          `[Auth] OAuth token validated for tenant ${tokenData.tenantId}, workspace ${workspaceId}`
        );
        next();
      }
    } catch (error) {
      console.error('[Auth] Error validating credentials:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to validate credentials',
        },
      });
    }
  };
}

/**
 * Creates a new API key for a tenant
 */
export async function createApiKey(
  storageClient: StorageClient,
  tenantId: string,
  plan: ApiKeyRecord['plan'] = 'free',
  name?: string
): Promise<{ apiKey: string; record: ApiKeyRecord }> {
  const id = ulid();
  const apiKey = `sk-${generateSecureToken(32)}`;
  const now = Date.now();

  const record: ApiKeyRecord = {
    id,
    tenantId,
    apiKey,
    plan,
    createdAt: now,
    name,
    usageCount: 0,
    status: 'active',
  };

  const redisRecord: Record<string, string> = {
    id,
    tenantId,
    plan,
    createdAt: now.toString(),
    usageCount: '0',
    status: 'active',
  };

  if (name) {
    redisRecord.name = name;
  }

  await storageClient.hset(`apikey:${apiKey}`, redisRecord);

  // Store reference from tenant to API key (for listing)
  await storageClient.sadd(`tenant:${tenantId}:apikeys`, apiKey);

  // Store mapping from id to apiKey (for management by id)
  await storageClient.set(`apikey:id:${id}`, apiKey);

  return { apiKey, record };
}

/**
 * List all API keys for a tenant (without revealing full key values)
 */
export async function listApiKeys(
  storageClient: StorageClient,
  tenantId: string
): Promise<Array<Omit<ApiKeyRecord, 'apiKey'> & { apiKeyPreview: string }>> {
  const apiKeys = await storageClient.smembers(`tenant:${tenantId}:apikeys`);

  const results: Array<Omit<ApiKeyRecord, 'apiKey'> & { apiKeyPreview: string }> = [];

  for (const apiKey of apiKeys) {
    const keyData = await storageClient.hgetall(`apikey:${apiKey}`);

    if (keyData && keyData.tenantId === tenantId) {
      results.push({
        id: keyData.id || apiKey.substring(3, 15),
        tenantId: keyData.tenantId,
        apiKeyPreview: `${apiKey.substring(0, 7)}...${apiKey.substring(apiKey.length - 4)}`,
        plan: (keyData.plan as ApiKeyRecord['plan']) || 'free',
        createdAt: parseInt(keyData.createdAt) || 0,
        lastUsedAt: keyData.lastUsedAt ? parseInt(keyData.lastUsedAt) : undefined,
        name: keyData.name || undefined,
        usageCount: parseInt(keyData.usageCount) || 0,
        status: (keyData.status as ApiKeyRecord['status']) || 'active',
      });
    }
  }

  // Sort by createdAt descending (newest first)
  return results.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Get a single API key record by ID (for the same tenant)
 */
export async function getApiKeyById(
  storageClient: StorageClient,
  tenantId: string,
  keyId: string
): Promise<(Omit<ApiKeyRecord, 'apiKey'> & { apiKeyPreview: string }) | null> {
  // Look up the actual apiKey from the id
  const apiKey = await storageClient.get(`apikey:id:${keyId}`);

  if (!apiKey) {
    return null;
  }

  const keyData = await storageClient.hgetall(`apikey:${apiKey}`);

  if (!keyData || keyData.tenantId !== tenantId) {
    return null;
  }

  return {
    id: keyData.id || keyId,
    tenantId: keyData.tenantId,
    apiKeyPreview: `${apiKey.substring(0, 7)}...${apiKey.substring(apiKey.length - 4)}`,
    plan: (keyData.plan as ApiKeyRecord['plan']) || 'free',
    createdAt: parseInt(keyData.createdAt) || 0,
    lastUsedAt: keyData.lastUsedAt ? parseInt(keyData.lastUsedAt) : undefined,
    name: keyData.name || undefined,
    usageCount: parseInt(keyData.usageCount) || 0,
    status: (keyData.status as ApiKeyRecord['status']) || 'active',
  };
}

/**
 * Revoke an API key (marks as revoked, doesn't delete)
 */
export async function revokeApiKey(
  storageClient: StorageClient,
  tenantId: string,
  keyId: string
): Promise<boolean> {
  // Look up the actual apiKey from the id
  const apiKey = await storageClient.get(`apikey:id:${keyId}`);

  if (!apiKey) {
    return false;
  }

  const keyData = await storageClient.hgetall(`apikey:${apiKey}`);

  if (!keyData || keyData.tenantId !== tenantId) {
    return false;
  }

  // Mark as revoked
  await storageClient.hset(`apikey:${apiKey}`, { status: 'revoked' });

  return true;
}

/**
 * Regenerate an API key (creates new key, revokes old one)
 */
export async function regenerateApiKey(
  storageClient: StorageClient,
  tenantId: string,
  keyId: string
): Promise<{ apiKey: string; record: ApiKeyRecord } | null> {
  // Look up the actual apiKey from the id
  const oldApiKey = await storageClient.get(`apikey:id:${keyId}`);

  if (!oldApiKey) {
    return null;
  }

  const oldKeyData = await storageClient.hgetall(`apikey:${oldApiKey}`);

  if (!oldKeyData || oldKeyData.tenantId !== tenantId) {
    return null;
  }

  // Create new key with same plan and name
  const result = await createApiKey(
    storageClient,
    tenantId,
    (oldKeyData.plan as ApiKeyRecord['plan']) || 'free',
    oldKeyData.name
  );

  // Revoke old key
  await storageClient.hset(`apikey:${oldApiKey}`, { status: 'revoked' });

  // Update id mapping to point to new key
  await storageClient.set(`apikey:id:${keyId}`, result.apiKey);

  // Remove old key from tenant's key set and add new one
  await storageClient.srem(`tenant:${tenantId}:apikeys`, oldApiKey);

  return result;
}

/**
 * Delete an API key permanently (admin only)
 */
export async function deleteApiKey(
  storageClient: StorageClient,
  tenantId: string,
  keyId: string
): Promise<boolean> {
  // Look up the actual apiKey from the id
  const apiKey = await storageClient.get(`apikey:id:${keyId}`);

  if (!apiKey) {
    return false;
  }

  const keyData = await storageClient.hgetall(`apikey:${apiKey}`);

  if (!keyData || keyData.tenantId !== tenantId) {
    return false;
  }

  // Delete all related keys
  await storageClient.del(`apikey:${apiKey}`);
  await storageClient.del(`apikey:id:${keyId}`);
  await storageClient.srem(`tenant:${tenantId}:apikeys`, apiKey);

  return true;
}

/**
 * Generates a cryptographically secure random token
 */
function generateSecureToken(length: number): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}
