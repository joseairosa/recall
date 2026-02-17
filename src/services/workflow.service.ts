/**
 * WorkflowService - Workflow lifecycle business logic
 *
 * Responsibilities:
 * - Start/complete/pause/resume workflow lifecycle
 * - Generate summaries from linked memories (no Claude API dependency)
 * - Provide formatted context for auto_session_start injection
 *
 * Architecture:
 * - Takes MemoryStore in constructor (same pattern as RLMService)
 * - Stateless service; all state lives in Redis via MemoryStore/WorkflowStore
 */

import { MemoryStore } from '../persistence/memory-store.js';
import type { WorkflowInfo } from '../types.js';

export class WorkflowService {
  constructor(private readonly store: MemoryStore) {}

  /**
   * Start a new named workflow and set it as active (atomic SET NX).
   * Throws if another workflow is already active.
   */
  async startWorkflow(name: string, description?: string): Promise<WorkflowInfo> {
    const workflow = await this.store.createWorkflow({ name, description });
    const acquired = await this.store.setActiveWorkflow(workflow.id);
    if (!acquired) {
      await this.store.updateWorkflow(workflow.id, { status: 'completed', completed_at: Date.now() });
      throw new Error('A workflow is already active. Pause or complete it before starting a new one.');
    }
    return workflow;
  }

  /**
   * Complete the active (or specified) workflow.
   * Generates a summary from linked memory summaries.
   * Clears the active workflow pointer.
   */
  async completeWorkflow(workflowId?: string): Promise<WorkflowInfo> {
    const id = workflowId ?? await this.store.getActiveWorkflowId();
    if (!id) throw new Error('No active workflow to complete.');

    const memoryIds = await this.store.getWorkflowMemories(id);
    const summary = await this.buildSummary(id, memoryIds);

    await this.store.updateWorkflow(id, {
      status: 'completed',
      summary,
      completed_at: Date.now(),
    });
    await this.store.clearActiveWorkflow();

    const updated = await this.store.getWorkflow(id);
    return updated!;
  }

  /**
   * Pause the active workflow, freeing the active slot.
   * A paused workflow can be resumed later.
   */
  async pauseWorkflow(workflowId?: string): Promise<WorkflowInfo> {
    const id = workflowId ?? await this.store.getActiveWorkflowId();
    if (!id) throw new Error('No active workflow to pause.');

    await this.store.updateWorkflow(id, { status: 'paused' });
    await this.store.clearActiveWorkflow();

    const updated = await this.store.getWorkflow(id);
    return updated!;
  }

  /**
   * Resume a paused workflow, setting it as active.
   * Throws if another workflow is already active.
   */
  async resumeWorkflow(workflowId: string): Promise<WorkflowInfo> {
    const workflow = await this.store.getWorkflow(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found.`);

    const acquired = await this.store.setActiveWorkflow(workflowId);
    if (!acquired) {
      throw new Error('A workflow is already active. Pause or complete it before resuming another.');
    }

    await this.store.updateWorkflow(workflowId, { status: 'active' });
    const updated = await this.store.getWorkflow(workflowId);
    return updated!;
  }

  /** Return the full active WorkflowInfo, or null. */
  async getActiveWorkflow() { return this.store.getActiveWorkflow(); }

  /** List all workflows, optionally filtered by status. */
  async listWorkflows(status?: import('../types.js').WorkflowStatus) { return this.store.getAllWorkflows(status); }

  /**
   * Get formatted context string for the active workflow.
   * Returns null if no workflow is active.
   * @param maxTokens Approximate token budget (4 chars ≈ 1 token).
   */
  async getActiveWorkflowContext(maxTokens: number = 2000): Promise<string | null> {
    const workflow = await this.store.getActiveWorkflow();
    if (!workflow) return null;

    const memoryIds = await this.store.getWorkflowMemories(workflow.id);
    const lines: string[] = [
      `## Active Workflow: ${workflow.name}`,
      workflow.description ? `Description: ${workflow.description}` : '',
      `Status: ${workflow.status} | Memories linked: ${memoryIds.length}`,
      workflow.summary ? `Summary so far: ${workflow.summary}` : '',
    ].filter(Boolean);

    const budget = maxTokens * 4;
    let result = lines.join('\n');
    if (result.length > budget) {
      result = result.substring(0, budget);
    }
    return result;
  }

  /** Build a plain-text summary from linked memory summaries. No AI required. */
  private async buildSummary(workflowId: string, memoryIds: string[]): Promise<string> {
    if (memoryIds.length === 0) {
      return `Workflow completed with no linked memories.`;
    }

    const summaries: string[] = [];
    for (const id of memoryIds.slice(0, 20)) {
      const memory = await this.store.getMemory(id);
      if (memory?.summary) summaries.push(`- ${memory.summary}`);
    }

    const header = `Workflow summary (${memoryIds.length} memories):`;
    const body = summaries.join('\n');
    const full = `${header}\n${body}`;
    return full.length > 500 ? full.substring(0, 500) + '...' : full;
  }
}
