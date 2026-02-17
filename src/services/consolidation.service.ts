/**
 * ConsolidationService - Auto-consolidation pipeline business logic
 *
 * Responsibilities:
 * - Find clusters of similar memories via greedy cosine-similarity
 * - Create consolidated memories and link originals via supersedes relationships
 * - Track consolidation runs and provide history
 * - Determine if consolidation should run based on thresholds
 *
 * Architecture:
 * - Takes MemoryStore in constructor (same pattern as WorkflowService)
 * - Stateless service; all state lives in Redis via MemoryStore
 * - No Claude API dependency — uses summaries and concatenation
 */

import { ulid } from 'ulid';
import { MemoryStore } from '../persistence/memory-store.js';
import { cosineSimilarity } from '../embeddings/generator.js';
import {
  ConsolidationStorageKeys,
  RelationshipType,
  type ConsolidationConfig,
  type ConsolidationResult,
  type ConsolidationRun,
  type MemoryEntry,
} from '../types.js';

const DEFAULT_CONFIG: ConsolidationConfig = {
  similarity_threshold: 0.75,
  min_cluster_size: 2,
  max_age_days: undefined,
  memory_count_threshold: 100,
  max_memories: 1000,
};

export class ConsolidationService {
  constructor(private readonly store: MemoryStore) {}

  /**
   * Run the consolidation pipeline.
   * 1. Fetch recent memories (capped by max_memories)
   * 2. Filter out memories without embeddings
   * 3. Greedy cluster by cosine similarity with cross-scope guard
   * 4. Create consolidated memory for each cluster
   * 5. Create supersedes relationships and tag originals
   * 6. Store run metadata
   */
  async runConsolidation(config?: Partial<ConsolidationConfig>): Promise<ConsolidationResult> {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const maxMem = cfg.max_memories ?? 1000;

    const wsMemories = await this.store.getRecentMemories(maxMem);
    const globalMemories = await this.store.getGlobalMemories(maxMem);
    const seenIds = new Set<string>();
    const allMemories: MemoryEntry[] = [];
    for (const mem of [...wsMemories, ...globalMemories]) {
      if (!seenIds.has(mem.id)) {
        seenIds.add(mem.id);
        allMemories.push(mem);
      }
    }

    const withEmbeddings: MemoryEntry[] = [];
    let skippedNoEmbedding = 0;

    for (const mem of allMemories) {
      if (mem.embedding && Array.isArray(mem.embedding) && mem.embedding.length > 0) {
        withEmbeddings.push(mem);
      } else {
        skippedNoEmbedding++;
      }
    }

    if (withEmbeddings.length < (cfg.min_cluster_size ?? 2)) {
      return {
        clusters_found: 0,
        memories_consolidated: 0,
        consolidated_memory_ids: [],
        skipped_no_embedding: skippedNoEmbedding,
        report: `No clusters found. ${withEmbeddings.length} memories with embeddings (${skippedNoEmbedding} skipped without embeddings).`,
      };
    }

    const clusters = this.greedyCluster(
      withEmbeddings,
      cfg.similarity_threshold ?? 0.75,
      cfg.min_cluster_size ?? 2,
    );

    const consolidatedIds: string[] = [];
    let totalConsolidated = 0;

    for (const cluster of clusters) {
      const consolidated = await this.createConsolidatedMemory(cluster);
      consolidatedIds.push(consolidated.id);
      totalConsolidated += cluster.length;
    }

    const runId = ulid();
    const run: ConsolidationRun = {
      id: runId,
      timestamp: Date.now(),
      config: cfg,
      result: {
        clusters_found: clusters.length,
        memories_consolidated: totalConsolidated,
        consolidated_memory_ids: consolidatedIds,
        skipped_no_embedding: skippedNoEmbedding,
        report: this.buildReport(clusters.length, totalConsolidated, skippedNoEmbedding, consolidatedIds),
      },
    };

    await this.storeRun(run);

    return run.result;
  }

  /**
   * Check if consolidation should run based on memory count threshold
   * and time since last run (24h cooldown).
   */
  async shouldConsolidate(threshold?: number): Promise<boolean> {
    const countThreshold = threshold ?? DEFAULT_CONFIG.memory_count_threshold ?? 100;

    const stats = await this.store.getSummaryStats();
    if (stats.total_memories < countThreshold) {
      return false;
    }

    const lastRunStr = await this.store.getStorageClient().get(
      ConsolidationStorageKeys.lastRun(this.store.getWorkspaceId()),
    );

    if (lastRunStr) {
      const lastRun = parseInt(lastRunStr, 10);
      const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
      if (lastRun > twentyFourHoursAgo) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get past consolidation runs, newest first.
   */
  async getConsolidationHistory(limit: number = 10): Promise<ConsolidationRun[]> {
    const client = this.store.getStorageClient();
    const workspace = this.store.getWorkspaceId();
    const ids = await client.zrevrange(
      ConsolidationStorageKeys.consolidations(workspace),
      0,
      limit - 1,
    );

    const runs: ConsolidationRun[] = [];
    for (const id of ids) {
      const data = await client.hgetall(
        ConsolidationStorageKeys.consolidation(workspace, id),
      );
      if (data && Object.keys(data).length > 0) {
        runs.push({
          id: data.id,
          timestamp: parseInt(data.timestamp, 10),
          config: JSON.parse(data.config),
          result: JSON.parse(data.result),
        });
      }
    }

    return runs;
  }

  /**
   * Greedy clustering: iterate memories, for each unvisited memory find all
   * others with similarity >= threshold and matching scope, form cluster.
   */
  private greedyCluster(
    memories: MemoryEntry[],
    threshold: number,
    minSize: number,
  ): MemoryEntry[][] {
    const visited = new Set<string>();
    const clusters: MemoryEntry[][] = [];

    for (const mem of memories) {
      if (visited.has(mem.id)) continue;

      const cluster: MemoryEntry[] = [mem];
      visited.add(mem.id);

      for (const other of memories) {
        if (visited.has(other.id)) continue;

        if (mem.is_global !== other.is_global) continue;

        const sim = cosineSimilarity(mem.embedding!, other.embedding!);
        if (sim >= threshold) {
          cluster.push(other);
          visited.add(other.id);
        }
      }

      if (cluster.length >= minSize) {
        clusters.push(cluster);
      }
    }

    return clusters;
  }

  /**
   * Create a consolidated memory from a cluster, set up supersedes
   * relationships, and tag originals.
   */
  private async createConsolidatedMemory(cluster: MemoryEntry[]): Promise<MemoryEntry> {
    const summaries = cluster.map(m => m.summary || m.content);
    const content = `## Consolidated from ${cluster.length} memories\n\n${summaries.join('\n\n')}`;

    const maxImportance = Math.max(...cluster.map(m => m.importance));

    const allTags = new Set<string>();
    allTags.add('consolidated');
    for (const mem of cluster) {
      for (const tag of mem.tags) {
        allTags.add(tag);
      }
    }

    const isGlobal = cluster[0].is_global;

    const consolidated = await this.store.createMemory({
      content,
      context_type: 'information',
      importance: maxImportance,
      tags: Array.from(allTags),
      is_global: isGlobal,
    });

    for (const original of cluster) {
      await this.store.createRelationship(
        consolidated.id,
        original.id,
        RelationshipType.SUPERSEDES,
      );

      if (!original.tags.includes('consolidated')) {
        await this.store.updateMemory(original.id, {
          tags: [...original.tags, 'consolidated'],
        });
      }
    }

    return consolidated;
  }

  private buildReport(
    clustersFound: number,
    memoriesConsolidated: number,
    skippedNoEmbedding: number,
    consolidatedIds: string[],
  ): string {
    const lines = [
      `Consolidation complete: ${clustersFound} cluster${clustersFound !== 1 ? 's' : ''} found, ${memoriesConsolidated} memories consolidated.`,
    ];
    if (skippedNoEmbedding > 0) {
      lines.push(`${skippedNoEmbedding} memories skipped (no embeddings).`);
    }
    if (consolidatedIds.length > 0) {
      lines.push(`New consolidated memory IDs: ${consolidatedIds.join(', ')}`);
    }
    return lines.join(' ');
  }

  private async storeRun(run: ConsolidationRun): Promise<void> {
    const client = this.store.getStorageClient();
    const workspace = this.store.getWorkspaceId();

    await client.hset(
      ConsolidationStorageKeys.consolidation(workspace, run.id),
      {
        id: run.id,
        timestamp: String(run.timestamp),
        config: JSON.stringify(run.config),
        result: JSON.stringify(run.result),
      },
    );

    await client.zadd(
      ConsolidationStorageKeys.consolidations(workspace),
      run.timestamp,
      run.id,
    );

    await client.set(
      ConsolidationStorageKeys.lastRun(workspace),
      String(run.timestamp),
    );
  }
}
