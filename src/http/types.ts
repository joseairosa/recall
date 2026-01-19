/**
 * HTTP Server Types
 *
 * Type definitions for the Recall HTTP API layer.
 */

import { Request } from 'express';

/**
 * Workspace context for request scoping
 */
export interface WorkspaceContext {
  id: string; // Hashed workspace ID
  path: string; // Original path from header
  isDefault: boolean; // True if no header was provided
}

/**
 * Team role types for team management
 */
export type TeamRole = 'owner' | 'admin' | 'member' | 'viewer';

/**
 * Team context for team members
 */
export interface TeamContext {
  id: string;
  memberId: string;
  role: TeamRole;
}

/**
 * Tenant information attached to authenticated requests
 */
export interface TenantContext {
  tenantId: string;
  apiKey: string;
  apiKeyId: string; // Key ID for audit logging
  plan: 'free' | 'pro' | 'team' | 'enterprise';
  limits: {
    maxMemories: number;
    maxWorkspaces: number;      // Total = baseWorkspaces + addonWorkspaces
    baseWorkspaces: number;     // Plan limit only
    addonWorkspaces: number;    // Purchased add-ons
  };
  workspace: WorkspaceContext;
  team?: TeamContext;           // Present if user is part of a team
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
  id: string;              // Key ID for management (different from apiKey value)
  tenantId: string;
  apiKey: string;          // The actual bearer token (sk-xxx)
  plan: 'free' | 'pro' | 'team' | 'enterprise';
  createdAt: number;
  lastUsedAt?: number;
  name?: string;
  usageCount: number;      // Total API calls made with this key
  status: 'active' | 'revoked';
}

/**
 * Audit log action types
 */
export type AuditAction = 'create' | 'read' | 'update' | 'delete' | 'search' | 'list' | 'mcp_call';

/**
 * Audit log resource types
 */
export type AuditResource = 'memory' | 'session' | 'apikey' | 'stats' | 'mcp_tool';

/**
 * Audit log entry stored in Redis
 */
export interface AuditEntry {
  id: string;              // ULID
  timestamp: number;       // Unix ms
  action: AuditAction;
  resource: AuditResource;
  resourceId?: string;     // Memory ID, session ID, etc.
  apiKeyId: string;        // Which API key was used
  tenantId: string;
  ip?: string;             // Client IP address
  userAgent?: string;      // Client user agent
  method: string;          // HTTP method
  path: string;            // Request path
  statusCode: number;      // Response status code
  duration: number;        // Request duration in ms
  details?: Record<string, unknown>;  // Additional context
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
    maxTeamMembers: 1, // Owner only (can't create teams on free)
  },
  pro: {
    maxMemories: 5000,
    maxWorkspaces: 3,
    maxTeamMembers: 1, // Owner only (can't create teams on pro)
  },
  team: {
    maxMemories: 25000,
    maxWorkspaces: -1, // unlimited
    maxTeamMembers: 10, // 10 members included
  },
  enterprise: {
    maxMemories: -1, // unlimited
    maxWorkspaces: -1,
    maxTeamMembers: -1, // unlimited
  },
} as const;
