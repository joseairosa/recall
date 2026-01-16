/**
 * Audit Logging Service
 *
 * Tracks all API access for compliance and debugging.
 * Stores audit entries in Redis with configurable retention.
 */

import { ulid } from 'ulid';
import { StorageClient } from '../persistence/storage-client.js';
import { AuditEntry, AuditAction, AuditResource } from './types.js';

// Redis key patterns for audit logs
const AUDIT_KEYS = {
  // Sorted set of audit entry IDs by timestamp
  timeline: (tenantId: string) => `tenant:${tenantId}:audit:timeline`,
  // Individual audit entry hash
  entry: (tenantId: string, id: string) => `tenant:${tenantId}:audit:${id}`,
  // Index by action type
  byAction: (tenantId: string, action: AuditAction) => `tenant:${tenantId}:audit:action:${action}`,
  // Index by resource type
  byResource: (tenantId: string, resource: AuditResource) => `tenant:${tenantId}:audit:resource:${resource}`,
};

// Default retention: 30 days
const DEFAULT_RETENTION_SECONDS = 30 * 24 * 60 * 60;

export class AuditService {
  private storageClient: StorageClient;
  private retentionSeconds: number;

  constructor(storageClient: StorageClient, retentionSeconds?: number) {
    this.storageClient = storageClient;
    this.retentionSeconds = retentionSeconds ?? DEFAULT_RETENTION_SECONDS;
  }

  /**
   * Log an audit entry
   */
  async log(params: {
    tenantId: string;
    apiKeyId: string;
    action: AuditAction;
    resource: AuditResource;
    resourceId?: string;
    ip?: string;
    userAgent?: string;
    method: string;
    path: string;
    statusCode: number;
    duration: number;
    details?: Record<string, unknown>;
  }): Promise<AuditEntry> {
    const id = ulid();
    const timestamp = Date.now();

    const entry: AuditEntry = {
      id,
      timestamp,
      action: params.action,
      resource: params.resource,
      resourceId: params.resourceId,
      apiKeyId: params.apiKeyId,
      tenantId: params.tenantId,
      ip: params.ip,
      userAgent: params.userAgent,
      method: params.method,
      path: params.path,
      statusCode: params.statusCode,
      duration: params.duration,
      details: params.details,
    };

    const pipeline = this.storageClient.pipeline();

    // Store the audit entry
    pipeline.hset(
      AUDIT_KEYS.entry(params.tenantId, id),
      this.serializeEntry(entry)
    );

    // Set TTL on the entry
    // Note: Pipeline doesn't have expire, so we'll do it separately

    // Add to timeline sorted set (score = timestamp)
    pipeline.zadd(AUDIT_KEYS.timeline(params.tenantId), timestamp, id);

    // Add to action index
    pipeline.zadd(AUDIT_KEYS.byAction(params.tenantId, params.action), timestamp, id);

    // Add to resource index
    pipeline.zadd(AUDIT_KEYS.byResource(params.tenantId, params.resource), timestamp, id);

    await pipeline.exec();

    // Set TTL separately (pipeline may not support expire)
    await this.storageClient.expire(
      AUDIT_KEYS.entry(params.tenantId, id),
      this.retentionSeconds
    );

    return entry;
  }

  /**
   * Get audit entries with pagination and filtering
   */
  async getEntries(params: {
    tenantId: string;
    limit?: number;
    offset?: number;
    action?: AuditAction;
    resource?: AuditResource;
    startTime?: number;
    endTime?: number;
  }): Promise<{ entries: AuditEntry[]; total: number }> {
    const limit = params.limit ?? 50;
    const offset = params.offset ?? 0;
    const endTime = params.endTime ?? Date.now();
    const startTime = params.startTime ?? 0;

    // Determine which index to use
    let indexKey: string;
    if (params.action) {
      indexKey = AUDIT_KEYS.byAction(params.tenantId, params.action);
    } else if (params.resource) {
      indexKey = AUDIT_KEYS.byResource(params.tenantId, params.resource);
    } else {
      indexKey = AUDIT_KEYS.timeline(params.tenantId);
    }

    // Get total count
    const total = await this.storageClient.zcount(indexKey, startTime, endTime);

    // Get IDs with pagination (reverse order - newest first)
    const ids = await this.storageClient.zrevrangebyscore(
      indexKey,
      endTime,
      startTime,
      { offset, count: limit }
    );

    if (ids.length === 0) {
      return { entries: [], total };
    }

    // Fetch entries
    const entries = await this.getEntriesByIds(params.tenantId, ids);

    return { entries, total };
  }

  /**
   * Get a single audit entry by ID
   */
  async getEntry(tenantId: string, id: string): Promise<AuditEntry | null> {
    const data = await this.storageClient.hgetall(AUDIT_KEYS.entry(tenantId, id));
    if (!data || Object.keys(data).length === 0) {
      return null;
    }
    return this.deserializeEntry(data);
  }

  /**
   * Get multiple entries by IDs
   */
  private async getEntriesByIds(tenantId: string, ids: string[]): Promise<AuditEntry[]> {
    const entries: AuditEntry[] = [];

    for (const id of ids) {
      const entry = await this.getEntry(tenantId, id);
      if (entry) {
        entries.push(entry);
      }
    }

    return entries;
  }

  /**
   * Clean up old audit entries (run periodically)
   */
  async cleanup(tenantId: string): Promise<number> {
    const cutoff = Date.now() - (this.retentionSeconds * 1000);

    // Get old entry IDs
    const oldIds = await this.storageClient.zrangebyscore(
      AUDIT_KEYS.timeline(tenantId),
      0,
      cutoff
    );

    if (oldIds.length === 0) {
      return 0;
    }

    // Remove from all indexes and delete entries
    for (const id of oldIds) {
      const entry = await this.getEntry(tenantId, id);
      if (entry) {
        await this.storageClient.del(AUDIT_KEYS.entry(tenantId, id));
        await this.storageClient.zrem(AUDIT_KEYS.timeline(tenantId), id);
        await this.storageClient.zrem(AUDIT_KEYS.byAction(tenantId, entry.action), id);
        await this.storageClient.zrem(AUDIT_KEYS.byResource(tenantId, entry.resource), id);
      }
    }

    return oldIds.length;
  }

  /**
   * Serialize entry for Redis storage
   */
  private serializeEntry(entry: AuditEntry): Record<string, string> {
    return {
      id: entry.id,
      timestamp: entry.timestamp.toString(),
      action: entry.action,
      resource: entry.resource,
      resourceId: entry.resourceId ?? '',
      apiKeyId: entry.apiKeyId,
      tenantId: entry.tenantId,
      ip: entry.ip ?? '',
      userAgent: entry.userAgent ?? '',
      method: entry.method,
      path: entry.path,
      statusCode: entry.statusCode.toString(),
      duration: entry.duration.toString(),
      details: entry.details ? JSON.stringify(entry.details) : '',
    };
  }

  /**
   * Deserialize entry from Redis storage
   */
  private deserializeEntry(data: Record<string, string>): AuditEntry {
    return {
      id: data.id,
      timestamp: parseInt(data.timestamp, 10),
      action: data.action as AuditAction,
      resource: data.resource as AuditResource,
      resourceId: data.resourceId || undefined,
      apiKeyId: data.apiKeyId,
      tenantId: data.tenantId,
      ip: data.ip || undefined,
      userAgent: data.userAgent || undefined,
      method: data.method,
      path: data.path,
      statusCode: parseInt(data.statusCode, 10),
      duration: parseInt(data.duration, 10),
      details: data.details ? JSON.parse(data.details) : undefined,
    };
  }
}

/**
 * Helper to determine action and resource from HTTP request
 */
export function parseRequestForAudit(method: string, path: string): {
  action: AuditAction;
  resource: AuditResource;
  resourceId?: string;
} {
  // Default values
  let action: AuditAction = 'read';
  let resource: AuditResource = 'memory';
  let resourceId: string | undefined;

  // Determine action from HTTP method
  switch (method.toUpperCase()) {
    case 'POST':
      action = 'create';
      break;
    case 'PUT':
    case 'PATCH':
      action = 'update';
      break;
    case 'DELETE':
      action = 'delete';
      break;
    case 'GET':
    default:
      action = 'read';
      break;
  }

  // Parse path to determine resource
  const pathParts = path.split('/').filter(Boolean);

  if (path.includes('/api/memories/search')) {
    action = 'search';
    resource = 'memory';
  } else if (path.includes('/api/memories')) {
    resource = 'memory';
    // Extract memory ID if present (e.g., /api/memories/01ABCD...)
    const memoryIdMatch = path.match(/\/api\/memories\/([A-Z0-9]{26})/i);
    if (memoryIdMatch) {
      resourceId = memoryIdMatch[1];
    }
    // List endpoint
    if (method === 'GET' && !resourceId && !path.includes('/search') && !path.includes('/important') && !path.includes('/by-')) {
      action = 'list';
    }
  } else if (path.includes('/api/sessions')) {
    resource = 'session';
    const sessionIdMatch = path.match(/\/api\/sessions\/([A-Z0-9]{26})/i);
    if (sessionIdMatch) {
      resourceId = sessionIdMatch[1];
    }
    if (method === 'GET' && !resourceId) {
      action = 'list';
    }
  } else if (path.includes('/api/keys')) {
    resource = 'apikey';
    const keyIdMatch = path.match(/\/api\/keys\/([A-Z0-9]{26})/i);
    if (keyIdMatch) {
      resourceId = keyIdMatch[1];
    }
    if (method === 'GET' && !resourceId) {
      action = 'list';
    }
  } else if (path.includes('/api/stats') || path.includes('/api/me')) {
    resource = 'stats';
    action = 'read';
  }

  return { action, resource, resourceId };
}
