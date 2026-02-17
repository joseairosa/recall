/**
 * WorkflowStore tests
 *
 * Uses a mock StorageClient to test workflow CRUD operations.
 * Tests are designed to be run without Redis.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowStore } from './workflow-store.js';
import type { StorageClient } from './storage-client.js';

function createMockStorageClient(): StorageClient & {
  _store: Map<string, string | Map<string, string> | Set<string>>;
} {
  const _store = new Map<string, string | Map<string, string> | Set<string>>();

  const client = {
    _store,

    async get(key: string) {
      const v = _store.get(key);
      return typeof v === 'string' ? v : null;
    },
    async set(key: string, value: string) {
      _store.set(key, value);
    },
    async del(key: string) {
      _store.delete(key);
    },
    async exists(key: string) {
      return _store.has(key);
    },

    async setnx(key: string, value: string) {
      if (_store.has(key)) return false;
      _store.set(key, value);
      return true;
    },

    async hset(key: string, fields: Record<string, string>) {
      if (!_store.has(key)) _store.set(key, new Map());
      const hash = _store.get(key) as Map<string, string>;
      for (const [f, v] of Object.entries(fields)) hash.set(f, v);
      return Object.keys(fields).length;
    },
    async hgetall(key: string) {
      const hash = _store.get(key);
      if (!(hash instanceof Map)) return null;
      const result: Record<string, string> = {};
      for (const [k, v] of hash) result[k] = v;
      return result;
    },

    async sadd(key: string, ...members: string[]) {
      if (!_store.has(key)) _store.set(key, new Set());
      const s = _store.get(key) as Set<string>;
      let added = 0;
      for (const m of members) { if (!s.has(m)) { s.add(m); added++; } }
      return added;
    },
    async smembers(key: string) {
      const s = _store.get(key);
      if (!(s instanceof Set)) return [];
      return Array.from(s);
    },
    async scard(key: string) {
      const s = _store.get(key);
      if (!(s instanceof Set)) return 0;
      return s.size;
    },
    async srem(key: string, ...members: string[]) {
      const s = _store.get(key);
      if (!(s instanceof Set)) return 0;
      let removed = 0;
      for (const m of members) { if (s.delete(m)) removed++; }
      return removed;
    },

    async zadd(key: string, score: number, member: string) {
      if (!_store.has(key)) _store.set(key, new Map());
      const zset = _store.get(key) as Map<string, string>;
      zset.set(member, score.toString());
      return 1;
    },
    async zrange(key: string, start: number, stop: number) {
      const zset = _store.get(key);
      if (!(zset instanceof Map)) return [];
      return Array.from(zset.keys()).slice(start, stop === -1 ? undefined : stop + 1);
    },
    async zrevrange(key: string, start: number, stop: number) {
      const zset = _store.get(key);
      if (!(zset instanceof Map)) return [];
      return Array.from(zset.keys()).reverse().slice(start, stop === -1 ? undefined : stop + 1);
    },

    pipeline() {
      const ops: (() => Promise<unknown>)[] = [];
      const pipe = {
        get: (key: string) => { ops.push(() => client.get(key)); return pipe; },
        set: (key: string, value: string) => { ops.push(() => client.set(key, value)); return pipe; },
        del: (key: string) => { ops.push(() => client.del(key)); return pipe; },
        setnx: (key: string, value: string) => { ops.push(() => client.setnx(key, value)); return pipe; },
        hset: (key: string, fields: Record<string, string>) => { ops.push(() => client.hset(key, fields)); return pipe; },
        sadd: (key: string, ...members: string[]) => { ops.push(() => client.sadd(key, ...members)); return pipe; },
        srem: (key: string, ...members: string[]) => { ops.push(() => client.srem(key, ...members)); return pipe; },
        zadd: (key: string, score: number, member: string) => { ops.push(() => client.zadd(key, score, member)); return pipe; },
        zrevrange: (key: string, start: number, stop: number) => { ops.push(() => client.zrevrange(key, start, stop)); return pipe; },
        exec: async () => Promise.all(ops.map(op => op())),
      };
      return pipe;
    },

    async disconnect() {},
  } as unknown as StorageClient & { _store: Map<string, string | Map<string, string> | Set<string>> };

  return client;
}

describe('WorkflowStore', () => {
  let client: ReturnType<typeof createMockStorageClient>;
  let store: WorkflowStore;

  beforeEach(() => {
    client = createMockStorageClient();
    store = new WorkflowStore(client as unknown as StorageClient, 'test-workspace');
  });

  describe('createWorkflow', () => {
    it('should create a workflow and return WorkflowInfo', async () => {
      const wf = await store.createWorkflow({ name: 'Test workflow', description: 'A test' });
      expect(wf.id).toBeDefined();
      expect(wf.name).toBe('Test workflow');
      expect(wf.description).toBe('A test');
      expect(wf.status).toBe('active');
      expect(wf.memory_count).toBe(0);
      expect(wf.workspace_id).toBe('test-workspace');
    });
  });

  describe('getWorkflow', () => {
    it('should return workflow after creation', async () => {
      const created = await store.createWorkflow({ name: 'My workflow' });
      const fetched = await store.getWorkflow(created.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(created.id);
      expect(fetched!.name).toBe('My workflow');
    });

    it('should return null for nonexistent workflow ID', async () => {
      const result = await store.getWorkflow('nonexistent-id');
      expect(result).toBeNull();
    });
  });

  describe('getActiveWorkflowId', () => {
    it('should return null when no active workflow', async () => {
      const id = await store.getActiveWorkflowId();
      expect(id).toBeNull();
    });

    it('should return the active workflow ID after setActiveWorkflow', async () => {
      const wf = await store.createWorkflow({ name: 'Active wf' });
      const set = await store.setActiveWorkflow(wf.id);
      expect(set).toBe(true);
      const id = await store.getActiveWorkflowId();
      expect(id).toBe(wf.id);
    });
  });

  describe('setActiveWorkflow (SET NX)', () => {
    it('should return true when no active workflow exists', async () => {
      const wf = await store.createWorkflow({ name: 'First' });
      const result = await store.setActiveWorkflow(wf.id);
      expect(result).toBe(true);
    });

    it('should return false when another workflow is already active', async () => {
      const wf1 = await store.createWorkflow({ name: 'First' });
      const wf2 = await store.createWorkflow({ name: 'Second' });
      await store.setActiveWorkflow(wf1.id);
      const result = await store.setActiveWorkflow(wf2.id);
      expect(result).toBe(false);
    });
  });

  describe('clearActiveWorkflow', () => {
    it('should clear the active workflow', async () => {
      const wf = await store.createWorkflow({ name: 'Active' });
      await store.setActiveWorkflow(wf.id);
      await store.clearActiveWorkflow();
      const id = await store.getActiveWorkflowId();
      expect(id).toBeNull();
    });
  });

  describe('linkMemoryToWorkflow', () => {
    it('should link a memory to a workflow and increment count', async () => {
      const wf = await store.createWorkflow({ name: 'Wf' });
      await store.linkMemoryToWorkflow(wf.id, 'mem-1');
      const count = await store.getWorkflowMemoryCount(wf.id);
      expect(count).toBe(1);
    });

    it('should be idempotent — linking the same memory twice does not increase count', async () => {
      const wf = await store.createWorkflow({ name: 'Wf' });
      await store.linkMemoryToWorkflow(wf.id, 'mem-1');
      await store.linkMemoryToWorkflow(wf.id, 'mem-1');
      const count = await store.getWorkflowMemoryCount(wf.id);
      expect(count).toBe(1);
    });
  });

  describe('getWorkflowMemories', () => {
    it('should return all linked memory IDs', async () => {
      const wf = await store.createWorkflow({ name: 'Wf' });
      await store.linkMemoryToWorkflow(wf.id, 'mem-1');
      await store.linkMemoryToWorkflow(wf.id, 'mem-2');
      const ids = await store.getWorkflowMemories(wf.id);
      expect(ids).toHaveLength(2);
      expect(ids).toContain('mem-1');
      expect(ids).toContain('mem-2');
    });
  });

  describe('updateWorkflow', () => {
    it('should update workflow status', async () => {
      const wf = await store.createWorkflow({ name: 'Wf' });
      await store.updateWorkflow(wf.id, { status: 'completed', summary: 'Done!' });
      const updated = await store.getWorkflow(wf.id);
      expect(updated!.status).toBe('completed');
      expect(updated!.summary).toBe('Done!');
    });
  });

  describe('getAllWorkflows', () => {
    it('should return all workflows sorted by created_at desc', async () => {
      const wf1 = await store.createWorkflow({ name: 'First' });
      const wf2 = await store.createWorkflow({ name: 'Second' });
      const all = await store.getAllWorkflows();
      expect(all).toHaveLength(2);
      expect(all[0].created_at).toBeGreaterThanOrEqual(all[1].created_at);
    });

    it('should return empty array when no workflows exist', async () => {
      const all = await store.getAllWorkflows();
      expect(all).toHaveLength(0);
    });
  });
});
