/**
 * Workspace Service
 *
 * Manages workspace registration, validation, and limit enforcement.
 * Tracks which workspaces a tenant has used for plan limit enforcement.
 */

import { createWorkspaceId } from '../types.js';
import { StorageClient } from '../persistence/storage-client.js';
import { PLAN_LIMITS } from './types.js';

/**
 * Workspace metadata stored in Redis
 */
export interface WorkspaceRecord {
  id: string; // Hashed workspace ID
  path: string; // Original path
  tenantId: string;
  createdAt: number;
  lastAccessedAt: number;
  memoryCount: number; // Cached count for dashboard
  name?: string; // User-friendly name (optional)
}

export class WorkspaceService {
  private storageClient: StorageClient;

  constructor(storageClient: StorageClient) {
    this.storageClient = storageClient;
  }

  /**
   * Generate workspace ID from path
   */
  generateWorkspaceId(path: string): string {
    return createWorkspaceId(path);
  }

  /**
   * Build the storage path for tenant + workspace
   */
  buildWorkspacePath(tenantId: string, workspaceId: string): string {
    return `tenant:${tenantId}:workspace:${workspaceId}`;
  }

  /**
   * Get or register a workspace for a tenant
   * Returns null if workspace limit exceeded
   */
  async getOrRegisterWorkspace(
    tenantId: string,
    workspacePath: string,
    plan: string
  ): Promise<{ workspace: WorkspaceRecord; isNew: boolean } | null> {
    const workspaceId = this.generateWorkspaceId(workspacePath);
    const key = `tenant:${tenantId}:workspace:${workspaceId}:meta`;

    // Check if workspace already exists
    const existing = await this.storageClient.hgetall(key);

    if (existing && Object.keys(existing).length > 0) {
      // Update last accessed
      await this.storageClient.hset(key, {
        lastAccessedAt: Date.now().toString(),
      });

      return {
        workspace: this.deserializeWorkspace(existing),
        isNew: false,
      };
    }

    // New workspace - check limit (including add-ons)
    const workspaceCount = await this.getWorkspaceCount(tenantId);
    const basePlanLimit =
      PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS]?.maxWorkspaces ?? 1;

    // Get workspace add-ons from customer record
    const customerData = await this.storageClient.hgetall(`customer:${tenantId}`);
    const addonWorkspaces = parseInt(customerData?.workspaceAddons || '0') || 0;
    const totalLimit = basePlanLimit === -1 ? -1 : basePlanLimit + addonWorkspaces;

    console.log(
      `[Workspace] Limit check: count=${workspaceCount}, basePlanLimit=${basePlanLimit}, ` +
        `addonWorkspaces=${addonWorkspaces}, totalLimit=${totalLimit}, plan=${plan}`
    );

    if (totalLimit !== -1 && workspaceCount >= totalLimit) {
      console.log(
        `[Workspace] LIMIT EXCEEDED: ${workspaceCount} >= ${totalLimit} for tenant ${tenantId}`
      );
      return null; // Limit exceeded
    }

    // Register new workspace
    const workspace: WorkspaceRecord = {
      id: workspaceId,
      path: workspacePath,
      tenantId,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      memoryCount: 0,
    };

    await this.storageClient.hset(key, this.serializeWorkspace(workspace));
    await this.storageClient.sadd(`tenant:${tenantId}:workspaces`, workspaceId);

    console.log(
      `[Workspace] Registered new workspace for tenant ${tenantId}: ${workspacePath} -> ${workspaceId}`
    );

    return { workspace, isNew: true };
  }

  /**
   * Get count of workspaces for a tenant
   * Only counts workspaces with valid metadata (auto-cleans orphaned IDs)
   */
  async getWorkspaceCount(tenantId: string): Promise<number> {
    // Get all workspace IDs in the set
    const workspaceIds = await this.storageClient.smembers(
      `tenant:${tenantId}:workspaces`
    );

    console.log(
      `[Workspace] getWorkspaceCount for tenant ${tenantId}: found ${workspaceIds.length} IDs in set: [${workspaceIds.join(', ')}]`
    );

    // Count only those with valid metadata
    let validCount = 0;
    const orphanedIds: string[] = [];
    const validWorkspaces: { id: string; path: string }[] = [];

    for (const wsId of workspaceIds) {
      const meta = await this.storageClient.hgetall(
        `tenant:${tenantId}:workspace:${wsId}:meta`
      );
      if (meta && Object.keys(meta).length > 0) {
        validCount++;
        validWorkspaces.push({ id: wsId, path: meta.path || 'unknown' });
        console.log(`[Workspace] Valid workspace: ${wsId} -> ${meta.path || 'unknown'}`);
      } else {
        orphanedIds.push(wsId);
        console.log(`[Workspace] Orphaned workspace ID (no metadata): ${wsId}`);
      }
    }

    // Auto-cleanup orphaned IDs
    if (orphanedIds.length > 0) {
      console.log(
        `[Workspace] Cleaning up ${orphanedIds.length} orphaned workspace IDs for tenant ${tenantId}`
      );
      for (const id of orphanedIds) {
        await this.storageClient.srem(`tenant:${tenantId}:workspaces`, id);
      }
    }

    console.log(
      `[Workspace] getWorkspaceCount result: ${validCount} valid workspaces: ${JSON.stringify(validWorkspaces)}, ${orphanedIds.length} orphaned (cleaned up)`
    );

    return validCount;
  }

  /**
   * List all workspaces for a tenant
   */
  async listWorkspaces(tenantId: string): Promise<WorkspaceRecord[]> {
    const workspaceIds = await this.storageClient.smembers(
      `tenant:${tenantId}:workspaces`
    );

    const workspaces: WorkspaceRecord[] = [];
    for (const wsId of workspaceIds) {
      const data = await this.storageClient.hgetall(
        `tenant:${tenantId}:workspace:${wsId}:meta`
      );
      if (data && Object.keys(data).length > 0) {
        workspaces.push(this.deserializeWorkspace(data));
      }
    }

    return workspaces.sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);
  }

  /**
   * Get a specific workspace by ID
   */
  async getWorkspace(
    tenantId: string,
    workspaceId: string
  ): Promise<WorkspaceRecord | null> {
    const data = await this.storageClient.hgetall(
      `tenant:${tenantId}:workspace:${workspaceId}:meta`
    );
    if (data && Object.keys(data).length > 0) {
      return this.deserializeWorkspace(data);
    }
    return null;
  }

  /**
   * Update memory count for a workspace
   */
  async updateMemoryCount(
    tenantId: string,
    workspaceId: string,
    delta: number
  ): Promise<void> {
    const key = `tenant:${tenantId}:workspace:${workspaceId}:meta`;
    const current = await this.storageClient.hget(key, 'memoryCount');
    const newCount = Math.max(0, parseInt(current || '0') + delta);
    await this.storageClient.hset(key, { memoryCount: newCount.toString() });
  }

  /**
   * Rename a workspace (set user-friendly name)
   */
  async renameWorkspace(
    tenantId: string,
    workspaceId: string,
    name: string
  ): Promise<boolean> {
    const key = `tenant:${tenantId}:workspace:${workspaceId}:meta`;
    const existing = await this.storageClient.hgetall(key);

    if (!existing || Object.keys(existing).length === 0) {
      return false;
    }

    await this.storageClient.hset(key, { name });
    return true;
  }

  /**
   * Delete a workspace (removes metadata, not memories)
   */
  async deleteWorkspace(
    tenantId: string,
    workspaceId: string
  ): Promise<boolean> {
    const key = `tenant:${tenantId}:workspace:${workspaceId}:meta`;
    const existing = await this.storageClient.hgetall(key);

    if (!existing || Object.keys(existing).length === 0) {
      return false;
    }

    await this.storageClient.del(key);
    await this.storageClient.srem(`tenant:${tenantId}:workspaces`, workspaceId);

    console.log(
      `[Workspace] Deleted workspace metadata for tenant ${tenantId}: ${workspaceId}`
    );
    return true;
  }

  // Serialization helpers
  private serializeWorkspace(ws: WorkspaceRecord): Record<string, string> {
    return {
      id: ws.id,
      path: ws.path,
      tenantId: ws.tenantId,
      createdAt: ws.createdAt.toString(),
      lastAccessedAt: ws.lastAccessedAt.toString(),
      memoryCount: ws.memoryCount.toString(),
      name: ws.name || '',
    };
  }

  private deserializeWorkspace(data: Record<string, string>): WorkspaceRecord {
    return {
      id: data.id,
      path: data.path,
      tenantId: data.tenantId,
      createdAt: parseInt(data.createdAt),
      lastAccessedAt: parseInt(data.lastAccessedAt),
      memoryCount: parseInt(data.memoryCount || '0'),
      name: data.name || undefined,
    };
  }
}
