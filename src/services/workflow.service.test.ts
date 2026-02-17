/**
 * WorkflowService tests
 *
 * Tests workflow lifecycle: start, complete, pause, resume, context.
 * Uses MockStorageClient — no Redis dependency.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowService } from './workflow.service.js';
import { MemoryStore } from '../persistence/memory-store.js';
import { MockStorageClient } from '../__mocks__/storage-client.mock.js';

function makeStore(): MemoryStore {
  const client = new MockStorageClient();
  return new MemoryStore(client, '/test/workspace');
}

describe('WorkflowService', () => {
  let store: MemoryStore;
  let service: WorkflowService;

  beforeEach(() => {
    store = makeStore();
    service = new WorkflowService(store);
  });

  describe('startWorkflow', () => {
    it('should create and activate a workflow', async () => {
      const wf = await service.startWorkflow('Build auth system');
      expect(wf.id).toBeDefined();
      expect(wf.name).toBe('Build auth system');
      expect(wf.status).toBe('active');
    });

    it('should throw if another workflow is already active', async () => {
      await service.startWorkflow('First');
      await expect(service.startWorkflow('Second')).rejects.toThrow('already active');
    });

    it('should accept optional description', async () => {
      const wf = await service.startWorkflow('Task', 'A description');
      expect(wf.description).toBe('A description');
    });
  });

  describe('completeWorkflow', () => {
    it('should complete the active workflow', async () => {
      const wf = await service.startWorkflow('Work');
      const result = await service.completeWorkflow();
      expect(result.id).toBe(wf.id);
      expect(result.status).toBe('completed');
      expect(result.summary).toBeDefined();
    });

    it('should clear the active workflow pointer after completion', async () => {
      await service.startWorkflow('Work');
      await service.completeWorkflow();
      const activeId = await store.getActiveWorkflowId();
      expect(activeId).toBeNull();
    });

    it('should throw when no workflow is active', async () => {
      await expect(service.completeWorkflow()).rejects.toThrow('No active workflow');
    });

    it('should complete a specific workflow by id', async () => {
      const wf = await service.startWorkflow('Work');
      const result = await service.completeWorkflow(wf.id);
      expect(result.status).toBe('completed');
    });
  });

  describe('pauseWorkflow', () => {
    it('should set status to paused and clear active pointer', async () => {
      const wf = await service.startWorkflow('Work');
      const paused = await service.pauseWorkflow();
      expect(paused.id).toBe(wf.id);
      expect(paused.status).toBe('paused');
      const activeId = await store.getActiveWorkflowId();
      expect(activeId).toBeNull();
    });

    it('should allow starting a new workflow after pausing', async () => {
      await service.startWorkflow('First');
      await service.pauseWorkflow();
      const second = await service.startWorkflow('Second');
      expect(second.status).toBe('active');
    });

    it('should throw when no workflow is active', async () => {
      await expect(service.pauseWorkflow()).rejects.toThrow('No active workflow');
    });
  });

  describe('resumeWorkflow', () => {
    it('should resume a paused workflow', async () => {
      const wf = await service.startWorkflow('Work');
      await service.pauseWorkflow();
      const resumed = await service.resumeWorkflow(wf.id);
      expect(resumed.status).toBe('active');
      const activeId = await store.getActiveWorkflowId();
      expect(activeId).toBe(wf.id);
    });

    it('should throw if another workflow is already active', async () => {
      const wf1 = await service.startWorkflow('First');
      await service.pauseWorkflow();
      await service.startWorkflow('Second');
      await expect(service.resumeWorkflow(wf1.id)).rejects.toThrow('already active');
    });

    it('should throw if workflow not found', async () => {
      await expect(service.resumeWorkflow('nonexistent-id')).rejects.toThrow('not found');
    });
  });

  describe('getActiveWorkflowContext', () => {
    it('should return null when no active workflow', async () => {
      const ctx = await service.getActiveWorkflowContext();
      expect(ctx).toBeNull();
    });

    it('should return formatted context when workflow is active', async () => {
      await service.startWorkflow('Build feature', 'A long-running task');
      const ctx = await service.getActiveWorkflowContext();
      expect(ctx).not.toBeNull();
      expect(ctx).toContain('Build feature');
    });
  });
});
