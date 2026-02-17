/**
 * Consolidation MCP Tools tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setConsolidationMemoryStore, consolidationTools } from './consolidation-tools.js';
import { MemoryStore } from '../persistence/memory-store.js';
import { MockStorageClient } from '../__mocks__/storage-client.mock.js';
import { StorageKeys, createWorkspaceId } from '../types.js';

const WORKSPACE_PATH = '/test/workspace';
const WORKSPACE_ID = createWorkspaceId(WORKSPACE_PATH);

function makeStore(): MemoryStore {
  const client = new MockStorageClient();
  return new MemoryStore(client, WORKSPACE_PATH);
}

function callTool(name: string, args: Record<string, unknown>) {
  const tool = consolidationTools.find(t => t.name === name);
  if (!tool) throw new Error(`Tool ${name} not found`);
  return tool.handler(args);
}

async function createMemoryWithEmbedding(
  store: MemoryStore,
  content: string,
  embedding: number[],
) {
  const mem = await store.createMemory({
    content,
    context_type: 'information',
    importance: 5,
    tags: [],
    is_global: false,
  });
  const key = StorageKeys.memory(WORKSPACE_ID, mem.id);
  await store.getStorageClient().hset(key, { embedding: JSON.stringify(embedding) });
  return mem;
}

describe('consolidationTools', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = makeStore();
    setConsolidationMemoryStore(store);
  });

  describe('auto_consolidate', () => {
    it('should return not needed when below threshold', async () => {
      const result = await callTool('auto_consolidate', {});
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.needed).toBe(false);
    });

    it('should run consolidation when above threshold', async () => {
      for (let i = 0; i < 5; i++) {
        await createMemoryWithEmbedding(store, `Memory ${i}`, [Math.random(), Math.random(), 0]);
      }
      const result = await callTool('auto_consolidate', { memory_count_threshold: 3 });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.needed).toBe(true);
      expect(parsed.result).toBeDefined();
    });
  });

  describe('force_consolidate', () => {
    it('should run consolidation regardless of threshold', async () => {
      await createMemoryWithEmbedding(store, 'Only one', [1, 0, 0]);
      const result = await callTool('force_consolidate', {});
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.result).toBeDefined();
      expect(parsed.result.clusters_found).toBeDefined();
    });
  });

  describe('consolidation_status', () => {
    it('should return status information', async () => {
      const result = await callTool('consolidation_status', {});
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.total_memories).toBeDefined();
      expect(parsed.should_consolidate).toBe(false);
    });
  });
});
