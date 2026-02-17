/**
 * WorkflowStore - Workflow persistence layer
 *
 * Extracted from MemoryStore (which is already 2268 lines) to keep
 * both files within the 500-line hard limit. Composed into MemoryStore.
 *
 * Responsibilities:
 * - CRUD operations for workflow hashes and sorted sets
 * - Atomic active-workflow management via SETNX
 * - Memory-to-workflow linking via Redis sets (single source of truth)
 */

import { ulid } from 'ulid';
import type { StorageClient } from './storage-client.js';
import {
  WorkflowStorageKeys,
  type WorkflowInfo,
  type WorkflowStatus,
} from '../types.js';

export interface CreateWorkflowInput {
  name: string;
  description?: string;
}

export interface UpdateWorkflowInput {
  status?: WorkflowStatus;
  summary?: string;
  completed_at?: number;
}

export class WorkflowStore {
  constructor(
    private readonly storageClient: StorageClient,
    private readonly workspaceId: string,
  ) {}

  /** Create a new workflow hash and add to the sorted-set index. */
  async createWorkflow(input: CreateWorkflowInput): Promise<WorkflowInfo> {
    const id = ulid();
    const now = Date.now();

    const workflow: WorkflowInfo = {
      id,
      name: input.name,
      description: input.description,
      status: 'active',
      created_at: now,
      updated_at: now,
      memory_count: 0,
      workspace_id: this.workspaceId,
    };

    const pipeline = this.storageClient.pipeline();
    pipeline.hset(WorkflowStorageKeys.workflow(this.workspaceId, id), this.serialize(workflow));
    pipeline.zadd(WorkflowStorageKeys.workflows(this.workspaceId), now, id);
    await pipeline.exec();

    return workflow;
  }

  /** Fetch a workflow by ID. Returns null if not found. */
  async getWorkflow(id: string): Promise<WorkflowInfo | null> {
    const data = await this.storageClient.hgetall(
      WorkflowStorageKeys.workflow(this.workspaceId, id),
    );
    if (!data || Object.keys(data).length === 0) return null;
    return this.deserialize(data);
  }

  /** Read just the active workflow ID string (O(1), no hash fetch). */
  async getActiveWorkflowId(): Promise<string | null> {
    return this.storageClient.get(WorkflowStorageKeys.workflowActive(this.workspaceId));
  }

  /** Get the full active WorkflowInfo, or null if none is active. */
  async getActiveWorkflow(): Promise<WorkflowInfo | null> {
    const id = await this.getActiveWorkflowId();
    if (!id) return null;
    return this.getWorkflow(id);
  }

  /**
   * Atomically set the active workflow using SETNX.
   * Returns true on success, false if another workflow is already active.
   */
  async setActiveWorkflow(id: string): Promise<boolean> {
    return this.storageClient.setnx(
      WorkflowStorageKeys.workflowActive(this.workspaceId),
      id,
    );
  }

  /** Clear the active workflow pointer. */
  async clearActiveWorkflow(): Promise<void> {
    await this.storageClient.del(WorkflowStorageKeys.workflowActive(this.workspaceId));
  }

  /** Update workflow fields (status, summary, completed_at, updated_at). */
  async updateWorkflow(id: string, update: UpdateWorkflowInput): Promise<void> {
    const existing = await this.getWorkflow(id);
    if (!existing) return;

    const updated: WorkflowInfo = {
      ...existing,
      ...update,
      updated_at: Date.now(),
    };

    await this.storageClient.hset(
      WorkflowStorageKeys.workflow(this.workspaceId, id),
      this.serialize(updated),
    );
  }

  /**
   * Link a memory ID to a workflow via Redis SADD.
   * Single source of truth — no JSON array in hash.
   * Idempotent: SADD is a no-op if member already exists.
   */
  async linkMemoryToWorkflow(workflowId: string, memoryId: string): Promise<void> {
    await this.storageClient.sadd(
      WorkflowStorageKeys.workflowMemories(this.workspaceId, workflowId),
      memoryId,
    );
  }

  /** Get all memory IDs linked to a workflow (from the Redis set). */
  async getWorkflowMemories(workflowId: string): Promise<string[]> {
    return this.storageClient.smembers(
      WorkflowStorageKeys.workflowMemories(this.workspaceId, workflowId),
    );
  }

  /** Get memory count for a workflow (SCARD — O(1)). */
  async getWorkflowMemoryCount(workflowId: string): Promise<number> {
    return this.storageClient.scard(
      WorkflowStorageKeys.workflowMemories(this.workspaceId, workflowId),
    );
  }

  /**
   * Get all workflows sorted by created_at descending.
   * Optionally filter by status.
   */
  async getAllWorkflows(status?: WorkflowStatus): Promise<WorkflowInfo[]> {
    const ids = await this.storageClient.zrevrange(
      WorkflowStorageKeys.workflows(this.workspaceId),
      0,
      -1,
    );

    const results: WorkflowInfo[] = [];
    for (const id of ids) {
      const wf = await this.getWorkflow(id);
      if (wf && (!status || wf.status === status)) {
        results.push(wf);
      }
    }
    return results;
  }


  private serialize(wf: WorkflowInfo): Record<string, string> {
    return {
      id: wf.id,
      name: wf.name,
      description: wf.description ?? '',
      status: wf.status,
      created_at: wf.created_at.toString(),
      updated_at: wf.updated_at.toString(),
      completed_at: wf.completed_at?.toString() ?? '',
      memory_count: wf.memory_count.toString(),
      summary: wf.summary ?? '',
      workspace_id: wf.workspace_id,
    };
  }

  private deserialize(data: Record<string, string>): WorkflowInfo {
    return {
      id: data.id,
      name: data.name,
      description: data.description || undefined,
      status: data.status as WorkflowStatus,
      created_at: parseInt(data.created_at, 10),
      updated_at: parseInt(data.updated_at, 10),
      completed_at: data.completed_at ? parseInt(data.completed_at, 10) : undefined,
      memory_count: parseInt(data.memory_count, 10) || 0,
      summary: data.summary || undefined,
      workspace_id: data.workspace_id,
    };
  }
}
