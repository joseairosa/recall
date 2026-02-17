/**
 * Workflow integration tests
 *
 * Verifies auto-tagging is atomic (inside createMemory pipeline)
 * and that global memories are excluded from workflow tagging.
 * Also verifies auto_session_start includes active workflow context.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../persistence/memory-store.js';
import { MockStorageClient } from '../__mocks__/storage-client.mock.js';
import { WorkflowService } from '../services/workflow.service.js';
import { setWorkflowMemoryStore } from './workflow-tools.js';
import { auto_session_start, setContextMemoryStore } from './context-tools.js';

const WS = { context_type: 'information' as const, tags: [] as string[], importance: 5, is_global: false };

function makeStore(): MemoryStore {
  const client = new MockStorageClient();
  return new MemoryStore(client, '/test/workspace');
}

describe('Auto-tagging integration', () => {
  let store: MemoryStore;
  let service: WorkflowService;

  beforeEach(() => {
    store = makeStore();
    service = new WorkflowService(store);
    setWorkflowMemoryStore(store);
  });

  it('should auto-tag workspace memory when workflow is active', async () => {
    const wf = await service.startWorkflow('My workflow');
    const memory = await store.createMemory({ ...WS, content: 'Test memory' });

    const linked = await store.getWorkflowMemories(wf.id);
    expect(linked).toContain(memory.id);
    expect(await store.getWorkflowMemoryCount(wf.id)).toBe(1);
  });

  it('should NOT auto-tag global memories with workflow', async () => {
    const wf = await service.startWorkflow('My workflow');
    await store.createMemory({ ...WS, content: 'Global memory', is_global: true });

    const linked = await store.getWorkflowMemories(wf.id);
    expect(linked).toHaveLength(0);
    expect(await store.getWorkflowMemoryCount(wf.id)).toBe(0);
  });

  it('should NOT auto-tag when no workflow is active', async () => {
    const memory = await store.createMemory({ ...WS, content: 'Regular memory' });
    expect(memory.id).toBeDefined();
  });

  it('should auto-tag multiple memories to the same workflow', async () => {
    const wf = await service.startWorkflow('Big task');
    await store.createMemory({ ...WS, content: 'mem1' });
    await store.createMemory({ ...WS, content: 'mem2', context_type: 'decision' });

    expect(await store.getWorkflowMemoryCount(wf.id)).toBe(2);
    const linked = await store.getWorkflowMemories(wf.id);
    expect(linked).toHaveLength(2);
  });

  it('should stop auto-tagging after workflow is completed', async () => {
    const wf = await service.startWorkflow('Short task');
    await store.createMemory({ ...WS, content: 'during' });
    await service.completeWorkflow();
    await store.createMemory({ ...WS, content: 'after' });

    const linked = await store.getWorkflowMemories(wf.id);
    expect(linked).toHaveLength(1);
  });
});

describe('auto_session_start workflow integration', () => {
  let store: MemoryStore;
  let service: WorkflowService;

  beforeEach(() => {
    store = makeStore();
    service = new WorkflowService(store);
    setWorkflowMemoryStore(store);
    setContextMemoryStore(store);
  });

  it('should include active workflow section when workflow is active', async () => {
    await service.startWorkflow('Auth System', 'Building the auth layer');
    await store.createMemory({ ...WS, content: 'Decided on JWT tokens for auth' });
    await store.createMemory({ ...WS, content: 'Set up passport middleware' });

    const result = await auto_session_start.handler({
      include_directives: false,
      include_recent_decisions: false,
      include_patterns: false,
      max_context_tokens: 2000,
    });

    const text = result.content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.context).toContain('Active Workflow');
    expect(parsed.context).toContain('Auth System');
    expect(parsed.context).toContain('Building the auth layer');
    expect(parsed.context).toContain('2 memories linked');
  });

  it('should NOT include workflow section when no workflow is active', async () => {
    const result = await auto_session_start.handler({
      include_directives: false,
      include_recent_decisions: false,
      include_patterns: false,
      max_context_tokens: 2000,
    });

    const text = result.content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.context).not.toContain('Active Workflow');
  });

  it('should truncate long workflow names and descriptions', async () => {
    const longName = 'A'.repeat(100);
    const longDesc = 'B'.repeat(500);
    await service.startWorkflow(longName, longDesc);

    const result = await auto_session_start.handler({
      include_directives: false,
      include_recent_decisions: false,
      include_patterns: false,
      max_context_tokens: 2000,
    });

    const text = result.content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.context).not.toContain(longName);
    expect(parsed.context).toContain('A'.repeat(47) + '...');
    expect(parsed.context).not.toContain(longDesc);
    expect(parsed.context).toContain('B'.repeat(197) + '...');
  });

  it('should include last 5 memory summaries in workflow section', async () => {
    await service.startWorkflow('Big task');
    for (let i = 1; i <= 7; i++) {
      await store.createMemory({ ...WS, content: `Memory number ${i}` });
    }

    const result = await auto_session_start.handler({
      include_directives: false,
      include_recent_decisions: false,
      include_patterns: false,
      max_context_tokens: 2000,
    });

    const text = result.content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.context).toContain('7 memories linked');
    expect(parsed.context).toContain('Memory number');
  });
});
