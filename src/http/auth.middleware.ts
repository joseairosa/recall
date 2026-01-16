/**
 * Authentication Middleware
 *
 * Validates API keys and attaches tenant context to requests.
 * API keys are stored in Redis with format: apikey:{key} -> ApiKeyRecord
 */

import { randomBytes } from 'crypto';
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, ApiKeyRecord, PLAN_LIMITS } from './types.js';
import { StorageClient } from '../persistence/storage-client.js';

/**
 * Creates an authentication middleware with the given storage client
 */
export function createAuthMiddleware(storageClient: StorageClient) {
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
      // Look up API key in Redis
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

      const record: ApiKeyRecord = {
        tenantId: keyData.tenantId as string,
        apiKey: token,
        plan: (keyData.plan as ApiKeyRecord['plan']) || 'free',
        createdAt: parseInt(keyData.createdAt as string) || Date.now(),
        lastUsedAt: keyData.lastUsedAt
          ? parseInt(keyData.lastUsedAt as string)
          : undefined,
        name: keyData.name as string | undefined,
      };

      // Update last used timestamp (fire and forget)
      storageClient
        .hset(`apikey:${token}`, { lastUsedAt: Date.now().toString() })
        .catch(() => {
          // Ignore errors updating last used
        });

      // Attach tenant context to request
      req.tenant = {
        tenantId: record.tenantId,
        apiKey: token,
        plan: record.plan,
        limits: PLAN_LIMITS[record.plan],
      };

      next();
    } catch (error) {
      console.error('[Auth] Error validating API key:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to validate API key',
        },
      });
    }
  };
}

/**
 * Creates or retrieves an API key for a tenant
 */
export async function createApiKey(
  storageClient: StorageClient,
  tenantId: string,
  plan: ApiKeyRecord['plan'] = 'free',
  name?: string
): Promise<string> {
  const apiKey = `sk-${generateSecureToken(32)}`;

  const record: Record<string, string> = {
    tenantId,
    plan,
    createdAt: Date.now().toString(),
  };

  if (name) {
    record.name = name;
  }

  await storageClient.hset(`apikey:${apiKey}`, record);

  // Also store reference from tenant to API key
  await storageClient.sadd(`tenant:${tenantId}:apikeys`, apiKey);

  return apiKey;
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
