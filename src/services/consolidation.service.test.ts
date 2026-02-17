/**
 * ConsolidationService tests
 *
 * Tests clustering, merging, relationship creation, scope matching,
 * embedding filtering, sampling caps, and edge cases.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../persistence/memory-store.js';
import { MockStorageClient } from '../__mocks__/storage-client.mock.js';
import { ConsolidationService } from './consolidation.service.js';
import { StorageKeys, createWorkspaceId } from '../types.js';

const WORKSPACE_PATH = '/test/workspace';
const WORKSPACE_ID = createWorkspaceId(WORKSPACE_PATH);

function makeStore(): MemoryStore {
  const client = new MockStorageClient();
  return new MemoryStore(client, WORKSPACE_PATH);
}

async function createMemoryWithEmbedding(
  store: MemoryStore,
  content: string,
  embedding: number[],
  opts: { is_global?: boolean; importance?: number; tags?: string[] } = {},
) {
  const mem = await store.createMemory({
    content,
    context_type: 'information',
    importance: opts.importance ?? 5,
    tags: opts.tags ?? [],
    is_global: opts.is_global ?? false,
  });
  const key = opts.is_global
    ? StorageKeys.globalMemory(mem.id)
    : StorageKeys.memory(WORKSPACE_ID, mem.id);
  await store.getStorageClient().hset(key, { embedding: JSON.stringify(embedding) });
  return mem;
}

describe('ConsolidationService', () => {
  let store: MemoryStore;
  let service: ConsolidationService;

  beforeEach(() => {
    store = makeStore();
    service = new ConsolidationService(store);
  });

  describe('runConsolidation()', () => {
    it('should return empty result when no memories exist', async () => {
      const result = await service.runConsolidation();
      expect(result.clusters_found).toBe(0);
      expect(result.memories_consolidated).toBe(0);
      expect(result.consolidated_memory_ids).toHaveLength(0);
    });

    it('should return empty result when only one memory exists', async () => {
      await createMemoryWithEmbedding(store, 'Only memory', [1, 0, 0]);
      const result = await service.runConsolidation();
      expect(result.clusters_found).toBe(0);
      expect(result.memories_consolidated).toBe(0);
    });

    it('should cluster similar memories together', async () => {
      await createMemoryWithEmbedding(store, 'Auth with JWT tokens', [1, 0, 0]);
      await createMemoryWithEmbedding(store, 'JWT auth implementation', [0.99, 0.1, 0]);
      await createMemoryWithEmbedding(store, 'Database schema design', [0, 0, 1]);

      const result = await service.runConsolidation({
        similarity_threshold: 0.9,
        min_cluster_size: 2,
      });

      expect(result.clusters_found).toBe(1);
      expect(result.memories_consolidated).toBe(2);
      expect(result.consolidated_memory_ids).toHaveLength(1);
    });

    it('should skip memories without embeddings', async () => {
      await createMemoryWithEmbedding(store, 'Has embedding', [1, 0, 0]);
      const noEmbed = await store.createMemory({
        content: 'No embedding',
        context_type: 'information',
        importance: 5,
        tags: [],
        is_global: false,
      });
      const key = StorageKeys.memory(WORKSPACE_ID, noEmbed.id);
      await store.getStorageClient().hset(key, { embedding: JSON.stringify([]) });

      const result = await service.runConsolidation();
      expect(result.skipped_no_embedding).toBeGreaterThanOrEqual(1);
    });

    it('should NOT cluster global with workspace memories (cross-scope guard)', async () => {
      await createMemoryWithEmbedding(store, 'Auth pattern', [1, 0, 0], { is_global: true });
      await createMemoryWithEmbedding(store, 'Auth pattern', [1, 0, 0], { is_global: false });

      const result = await service.runConsolidation({
        similarity_threshold: 0.9,
        min_cluster_size: 2,
      });

      expect(result.clusters_found).toBe(0);
    });

    it('should cluster global memories with other global memories', async () => {
      await createMemoryWithEmbedding(store, 'Global auth A', [1, 0, 0], { is_global: true });
      await createMemoryWithEmbedding(store, 'Global auth B', [0.99, 0.1, 0], { is_global: true });

      const result = await service.runConsolidation({
        similarity_threshold: 0.9,
        min_cluster_size: 2,
      });

      expect(result.clusters_found).toBe(1);
      expect(result.memories_consolidated).toBe(2);
    });

    it('should create supersedes relationships from consolidated to originals', async () => {
      const m1 = await createMemoryWithEmbedding(store, 'Auth A', [1, 0, 0]);
      const m2 = await createMemoryWithEmbedding(store, 'Auth B', [0.99, 0.1, 0]);

      const result = await service.runConsolidation({
        similarity_threshold: 0.9,
        min_cluster_size: 2,
      });

      expect(result.consolidated_memory_ids).toHaveLength(1);
      const consolidatedId = result.consolidated_memory_ids[0];

      const rels = await store.getMemoryRelationships(consolidatedId);
      expect(rels).toHaveLength(2);
      expect(rels.every(r => r.relationship_type === 'supersedes')).toBe(true);
      const targetIds = rels.map(r => r.to_memory_id);
      expect(targetIds).toContain(m1.id);
      expect(targetIds).toContain(m2.id);
    });

    it('should add consolidated tag to original memories', async () => {
      const m1 = await createMemoryWithEmbedding(store, 'Auth A', [1, 0, 0]);
      const m2 = await createMemoryWithEmbedding(store, 'Auth B', [0.99, 0.1, 0]);

      await service.runConsolidation({
        similarity_threshold: 0.9,
        min_cluster_size: 2,
      });

      const updated1 = await store.getMemory(m1.id);
      const updated2 = await store.getMemory(m2.id);
      expect(updated1?.tags).toContain('consolidated');
      expect(updated2?.tags).toContain('consolidated');
    });

    it('should take max importance from cluster members', async () => {
      await createMemoryWithEmbedding(store, 'Important auth', [1, 0, 0], { importance: 9 });
      await createMemoryWithEmbedding(store, 'Less important auth', [0.99, 0.1, 0], { importance: 3 });

      const result = await service.runConsolidation({
        similarity_threshold: 0.9,
        min_cluster_size: 2,
      });

      const consolidated = await store.getMemory(result.consolidated_memory_ids[0]);
      expect(consolidated?.importance).toBe(9);
    });

    it('should merge tags from all cluster members', async () => {
      await createMemoryWithEmbedding(store, 'Auth A', [1, 0, 0], { tags: ['auth', 'jwt'] });
      await createMemoryWithEmbedding(store, 'Auth B', [0.99, 0.1, 0], { tags: ['auth', 'security'] });

      const result = await service.runConsolidation({
        similarity_threshold: 0.9,
        min_cluster_size: 2,
      });

      const consolidated = await store.getMemory(result.consolidated_memory_ids[0]);
      expect(consolidated?.tags).toContain('auth');
      expect(consolidated?.tags).toContain('jwt');
      expect(consolidated?.tags).toContain('security');
      expect(consolidated?.tags).toContain('consolidated');
    });

    it('should respect min_cluster_size', async () => {
      await createMemoryWithEmbedding(store, 'Auth A', [1, 0, 0]);
      await createMemoryWithEmbedding(store, 'Auth B', [0.99, 0.1, 0]);

      const result = await service.runConsolidation({
        similarity_threshold: 0.9,
        min_cluster_size: 3,
      });

      expect(result.clusters_found).toBe(0);
      expect(result.memories_consolidated).toBe(0);
    });

    it('should generate a report string', async () => {
      await createMemoryWithEmbedding(store, 'Auth A', [1, 0, 0]);
      await createMemoryWithEmbedding(store, 'Auth B', [0.99, 0.1, 0]);

      const result = await service.runConsolidation({
        similarity_threshold: 0.9,
        min_cluster_size: 2,
      });

      expect(result.report).toContain('1 cluster');
      expect(result.report).toContain('2 memories');
    });
  });

  describe('shouldConsolidate()', () => {
    it('should return false when memory count is below threshold', async () => {
      await createMemoryWithEmbedding(store, 'Only one', [1, 0, 0]);
      const should = await service.shouldConsolidate(100);
      expect(should).toBe(false);
    });

    it('should return true when memory count meets threshold and no recent run', async () => {
      for (let i = 0; i < 5; i++) {
        await createMemoryWithEmbedding(store, `Memory ${i}`, [Math.random(), Math.random(), 0]);
      }
      const should = await service.shouldConsolidate(5);
      expect(should).toBe(true);
    });

    it('should return false if consolidation ran recently (within 24h)', async () => {
      for (let i = 0; i < 5; i++) {
        await createMemoryWithEmbedding(store, `Memory ${i}`, [Math.random(), Math.random(), 0]);
      }
      await service.runConsolidation();

      const should = await service.shouldConsolidate(1);
      expect(should).toBe(false);
    });
  });

  describe('getConsolidationHistory()', () => {
    it('should return empty array when no runs exist', async () => {
      const history = await service.getConsolidationHistory();
      expect(history).toHaveLength(0);
    });

    it('should return past consolidation runs', async () => {
      await createMemoryWithEmbedding(store, 'Auth A', [1, 0, 0]);
      await createMemoryWithEmbedding(store, 'Auth B', [0.99, 0.1, 0]);
      await service.runConsolidation({
        similarity_threshold: 0.9,
        min_cluster_size: 2,
      });

      const history = await service.getConsolidationHistory();
      expect(history).toHaveLength(1);
      expect(history[0].result.clusters_found).toBe(1);
    });
  });
});
