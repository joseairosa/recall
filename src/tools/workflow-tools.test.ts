/**
 * Workflow MCP Tools tests
 *
 * Tests that tool handlers correctly call the service and
 * return properly formatted MCP responses.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setWorkflowMemoryStore, workflowTools } from './workflow-tools.js';
import { MemoryStore } from '../persistence/memory-store.js';
import { MockStorageClient } from '../__mocks__/storage-client.mock.js';

function makeStore(): MemoryStore {
  const client = new MockStorageClient();
  return new MemoryStore(client, '/test/workspace');
}

describe('workflowTools', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = makeStore();
    setWorkflowMemoryStore(store);
  });

  function callTool(name: string, args: Record<string, unknown>) {
    const tool = workflowTools.find(t => t.name === name);
    if (!tool) throw new Error(`Tool ${name} not found`);
    return tool.handler(args);
  }

  describe('start_workflow', () => {
    it('should create a workflow and return its info', async () => {
      const result = await callTool('start_workflow', { name: 'My task' });
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.id).toBeDefined();
      expect(data.name).toBe('My task');
      expect(data.status).toBe('active');
    });

    it('should return error when another workflow is active', async () => {
      await callTool('start_workflow', { name: 'First' });
      const result = await callTool('start_workflow', { name: 'Second' });
      expect(result.isError).toBe(true);
    });
  });

  describe('complete_workflow', () => {
    it('should complete the active workflow', async () => {
      await callTool('start_workflow', { name: 'Work' });
      const result = await callTool('complete_workflow', {});
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.status).toBe('completed');
    });

    it('should return error when no workflow is active', async () => {
      const result = await callTool('complete_workflow', {});
      expect(result.isError).toBe(true);
    });
  });

  describe('pause_workflow', () => {
    it('should pause the active workflow', async () => {
      await callTool('start_workflow', { name: 'Work' });
      const result = await callTool('pause_workflow', {});
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.status).toBe('paused');
    });

    it('should return error when no workflow is active', async () => {
      const result = await callTool('pause_workflow', {});
      expect(result.isError).toBe(true);
    });
  });

  describe('resume_workflow', () => {
    it('should resume a paused workflow', async () => {
      const startResult = await callTool('start_workflow', { name: 'Work' });
      const wfId = JSON.parse(startResult.content[0].text).id;
      await callTool('pause_workflow', {});
      const result = await callTool('resume_workflow', { workflow_id: wfId });
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.status).toBe('active');
    });
  });

  describe('get_active_workflow', () => {
    it('should return null when no workflow active', async () => {
      const result = await callTool('get_active_workflow', {});
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.active_workflow).toBeNull();
    });

    it('should return active workflow info', async () => {
      await callTool('start_workflow', { name: 'Active' });
      const result = await callTool('get_active_workflow', {});
      const data = JSON.parse(result.content[0].text);
      expect(data.active_workflow.name).toBe('Active');
    });
  });

  describe('list_workflows', () => {
    it('should return empty list when no workflows', async () => {
      const result = await callTool('list_workflows', {});
      const data = JSON.parse(result.content[0].text);
      expect(data.workflows).toHaveLength(0);
    });

    it('should list workflows after creation', async () => {
      await callTool('start_workflow', { name: 'One' });
      const result = await callTool('list_workflows', {});
      const data = JSON.parse(result.content[0].text);
      expect(data.workflows).toHaveLength(1);
    });
  });

  describe('get_workflow_context', () => {
    it('should return null context when no active workflow', async () => {
      const result = await callTool('get_workflow_context', {});
      const data = JSON.parse(result.content[0].text);
      expect(data.context).toBeNull();
    });

    it('should return context string when workflow is active', async () => {
      await callTool('start_workflow', { name: 'My work' });
      const result = await callTool('get_workflow_context', {});
      const data = JSON.parse(result.content[0].text);
      expect(data.context).toContain('My work');
    });
  });
});
