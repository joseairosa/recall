/**
 * HTTP Server Types
 *
 * Type definitions for the Recall HTTP API layer.
 */

import { Request } from 'express';

/**
 * Tenant information attached to authenticated requests
 */
export interface TenantContext {
  tenantId: string;
  apiKey: string;
  plan: 'free' | 'pro' | 'team' | 'enterprise';
  limits: {
    maxMemories: number;
    maxWorkspaces: number;
  };
}

/**
 * Extended Express Request with tenant context
 */
export interface AuthenticatedRequest extends Request {
  tenant?: TenantContext;
}

/**
 * API Key record stored in Redis
 */
export interface ApiKeyRecord {
  tenantId: string;
  apiKey: string;
  plan: 'free' | 'pro' | 'team' | 'enterprise';
  createdAt: number;
  lastUsedAt?: number;
  name?: string;
}

/**
 * Standard API response format
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Plan limits configuration
 */
export const PLAN_LIMITS = {
  free: {
    maxMemories: 500,
    maxWorkspaces: 1,
  },
  pro: {
    maxMemories: 10000,
    maxWorkspaces: 5,
  },
  team: {
    maxMemories: 50000,
    maxWorkspaces: -1, // unlimited
  },
  enterprise: {
    maxMemories: -1, // unlimited
    maxWorkspaces: -1,
  },
} as const;
