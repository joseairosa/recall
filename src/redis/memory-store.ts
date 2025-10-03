import { ulid } from 'ulid';
import type { Redis } from 'ioredis';
import { getRedisClient } from './client.js';
import { generateEmbedding, cosineSimilarity } from '../embeddings/generator.js';
import { RedisKeys, createWorkspaceId, getWorkspaceMode, WorkspaceMode, type MemoryEntry, type CreateMemory, type SessionInfo, type ContextType, type MemoryRelationship, type RelationshipType, type RelatedMemoryResult, type MemoryGraph, type MemoryGraphNode } from '../types.js';

export class MemoryStore {
  private redis: Redis;
  private workspaceId: string;
  private workspacePath: string;

  constructor(workspacePath?: string) {
    this.redis = getRedisClient();
    this.workspacePath = workspacePath || process.cwd();
    this.workspaceId = createWorkspaceId(this.workspacePath);

    // Log workspace info for debugging
    console.error(`[MemoryStore] Workspace: ${this.workspacePath}`);
    console.error(`[MemoryStore] Workspace ID: ${this.workspaceId}`);
  }

  // Store a new memory
  async createMemory(data: CreateMemory): Promise<MemoryEntry> {
    const id = ulid();
    const timestamp = Date.now();

    // Generate embedding for the content
    const embedding = await generateEmbedding(data.content);

    // Auto-generate summary if not provided
    const summary = data.summary || this.generateSummary(data.content);

    // Calculate expiration if TTL provided
    let expiresAt: number | undefined;
    if (data.ttl_seconds) {
      expiresAt = timestamp + (data.ttl_seconds * 1000);
    }

    const isGlobal = data.is_global || false;

    const memory: MemoryEntry = {
      id,
      timestamp,
      context_type: data.context_type,
      content: data.content,
      summary,
      tags: data.tags,
      importance: data.importance,
      session_id: data.session_id,
      embedding,
      ttl_seconds: data.ttl_seconds,
      expires_at: expiresAt,
      is_global: isGlobal,
      workspace_id: isGlobal ? '' : this.workspaceId,
    };

    // Store in Redis (workspace or global based on is_global flag)
    const pipeline = this.redis.pipeline();

    // Main memory hash
    const memoryKey = isGlobal
      ? RedisKeys.globalMemory(id)
      : RedisKeys.memory(this.workspaceId, id);

    pipeline.hset(memoryKey, this.serializeMemory(memory));

    // Set TTL on the hash if specified
    if (data.ttl_seconds) {
      pipeline.expire(memoryKey, data.ttl_seconds);
    }

    // Add to global set
    if (isGlobal) {
      pipeline.sadd(RedisKeys.globalMemories(), id);
      pipeline.zadd(RedisKeys.globalTimeline(), timestamp, id);
      pipeline.sadd(RedisKeys.globalByType(data.context_type), id);

      for (const tag of data.tags) {
        pipeline.sadd(RedisKeys.globalByTag(tag), id);
      }

      if (data.importance >= 8) {
        pipeline.zadd(RedisKeys.globalImportant(), data.importance, id);
      }
    } else {
      pipeline.sadd(RedisKeys.memories(this.workspaceId), id);
      pipeline.zadd(RedisKeys.timeline(this.workspaceId), timestamp, id);
      pipeline.sadd(RedisKeys.byType(this.workspaceId, data.context_type), id);

      for (const tag of data.tags) {
        pipeline.sadd(RedisKeys.byTag(this.workspaceId, tag), id);
      }

      if (data.importance >= 8) {
        pipeline.zadd(RedisKeys.important(this.workspaceId), data.importance, id);
      }
    }

    await pipeline.exec();

    return memory;
  }

  // Batch create memories
  async createMemories(memories: CreateMemory[]): Promise<MemoryEntry[]> {
    const results: MemoryEntry[] = [];

    for (const memoryData of memories) {
      const memory = await this.createMemory(memoryData);
      results.push(memory);
    }

    return results;
  }

  // Get memory by ID (checks both workspace and global)
  async getMemory(id: string, isGlobal?: boolean): Promise<MemoryEntry | null> {
    // If we know it's global, check global first
    if (isGlobal === true) {
      const globalData = await this.redis.hgetall(RedisKeys.globalMemory(id));
      if (globalData && Object.keys(globalData).length > 0) {
        return this.deserializeMemory(globalData);
      }
      return null;
    }

    // If we know it's workspace, check workspace only
    if (isGlobal === false) {
      const wsData = await this.redis.hgetall(RedisKeys.memory(this.workspaceId, id));
      if (wsData && Object.keys(wsData).length > 0) {
        return this.deserializeMemory(wsData);
      }
      return null;
    }

    // If unknown, check workspace first, then global
    const wsData = await this.redis.hgetall(RedisKeys.memory(this.workspaceId, id));
    if (wsData && Object.keys(wsData).length > 0) {
      return this.deserializeMemory(wsData);
    }

    const globalData = await this.redis.hgetall(RedisKeys.globalMemory(id));
    if (globalData && Object.keys(globalData).length > 0) {
      return this.deserializeMemory(globalData);
    }

    return null;
  }

  // Get multiple memories by IDs
  async getMemories(ids: string[]): Promise<MemoryEntry[]> {
    const memories: MemoryEntry[] = [];

    for (const id of ids) {
      const memory = await this.getMemory(id);
      if (memory) {
        memories.push(memory);
      }
    }

    return memories;
  }

  // Get recent memories (respects workspace mode)
  async getRecentMemories(limit: number = 50): Promise<MemoryEntry[]> {
    const mode = getWorkspaceMode();

    if (mode === WorkspaceMode.GLOBAL) {
      // Global mode: only global memories
      const ids = await this.redis.zrevrange(RedisKeys.globalTimeline(), 0, limit - 1);
      return this.getMemories(ids);
    } else if (mode === WorkspaceMode.ISOLATED) {
      // Isolated mode: only workspace memories
      const ids = await this.redis.zrevrange(RedisKeys.timeline(this.workspaceId), 0, limit - 1);
      return this.getMemories(ids);
    } else {
      // Hybrid mode: merge workspace + global
      const wsIds = await this.redis.zrevrange(RedisKeys.timeline(this.workspaceId), 0, limit - 1);
      const globalIds = await this.redis.zrevrange(RedisKeys.globalTimeline(), 0, limit - 1);

      const allMemories = await this.getMemories([...wsIds, ...globalIds]);

      // Sort by timestamp descending
      allMemories.sort((a, b) => b.timestamp - a.timestamp);

      return allMemories.slice(0, limit);
    }
  }

  // Get memories by type (respects workspace mode)
  async getMemoriesByType(type: ContextType, limit?: number): Promise<MemoryEntry[]> {
    const mode = getWorkspaceMode();
    let ids: string[] = [];

    if (mode === WorkspaceMode.GLOBAL) {
      ids = await this.redis.smembers(RedisKeys.globalByType(type));
    } else if (mode === WorkspaceMode.ISOLATED) {
      ids = await this.redis.smembers(RedisKeys.byType(this.workspaceId, type));
    } else {
      // Hybrid: merge both
      const wsIds = await this.redis.smembers(RedisKeys.byType(this.workspaceId, type));
      const globalIds = await this.redis.smembers(RedisKeys.globalByType(type));
      ids = [...new Set([...wsIds, ...globalIds])]; // Deduplicate
    }

    const memories = await this.getMemories(ids);

    // Sort by timestamp descending
    memories.sort((a, b) => b.timestamp - a.timestamp);

    return limit ? memories.slice(0, limit) : memories;
  }

  // Get memories by tag (respects workspace mode)
  async getMemoriesByTag(tag: string, limit?: number): Promise<MemoryEntry[]> {
    const mode = getWorkspaceMode();
    let ids: string[] = [];

    if (mode === WorkspaceMode.GLOBAL) {
      ids = await this.redis.smembers(RedisKeys.globalByTag(tag));
    } else if (mode === WorkspaceMode.ISOLATED) {
      ids = await this.redis.smembers(RedisKeys.byTag(this.workspaceId, tag));
    } else {
      // Hybrid: merge both
      const wsIds = await this.redis.smembers(RedisKeys.byTag(this.workspaceId, tag));
      const globalIds = await this.redis.smembers(RedisKeys.globalByTag(tag));
      ids = [...new Set([...wsIds, ...globalIds])]; // Deduplicate
    }

    const memories = await this.getMemories(ids);

    // Sort by timestamp descending
    memories.sort((a, b) => b.timestamp - a.timestamp);

    return limit ? memories.slice(0, limit) : memories;
  }

  // Get important memories (respects workspace mode)
  async getImportantMemories(minImportance: number = 8, limit?: number): Promise<MemoryEntry[]> {
    const mode = getWorkspaceMode();
    let results: string[] = [];

    if (mode === WorkspaceMode.GLOBAL) {
      results = await this.redis.zrevrangebyscore(
        RedisKeys.globalImportant(),
        10,
        minImportance,
        'LIMIT',
        0,
        limit || 100
      );
    } else if (mode === WorkspaceMode.ISOLATED) {
      results = await this.redis.zrevrangebyscore(
        RedisKeys.important(this.workspaceId),
        10,
        minImportance,
        'LIMIT',
        0,
        limit || 100
      );
    } else {
      // Hybrid: get from both and merge
      const wsResults = await this.redis.zrevrangebyscore(
        RedisKeys.important(this.workspaceId),
        10,
        minImportance,
        'LIMIT',
        0,
        limit || 100
      );
      const globalResults = await this.redis.zrevrangebyscore(
        RedisKeys.globalImportant(),
        10,
        minImportance,
        'LIMIT',
        0,
        limit || 100
      );

      const allMemories = await this.getMemories([...wsResults, ...globalResults]);
      // Sort by importance descending
      allMemories.sort((a, b) => b.importance - a.importance);
      return allMemories.slice(0, limit || 100);
    }

    return this.getMemories(results);
  }

  // Update memory (handles both workspace and global)
  async updateMemory(id: string, updates: Partial<CreateMemory>): Promise<MemoryEntry | null> {
    const existing = await this.getMemory(id);
    if (!existing) {
      return null;
    }

    const pipeline = this.redis.pipeline();

    // Update content and regenerate embedding if content changed
    let embedding = existing.embedding;
    if (updates.content && updates.content !== existing.content) {
      embedding = await generateEmbedding(updates.content);
    }

    const updated: MemoryEntry = {
      ...existing,
      ...updates,
      embedding,
      summary: updates.summary || (updates.content ? this.generateSummary(updates.content) : existing.summary),
    };

    const isGlobal = existing.is_global;

    // Update hash (use appropriate key based on is_global)
    const memoryKey = isGlobal
      ? RedisKeys.globalMemory(id)
      : RedisKeys.memory(this.workspaceId, id);

    pipeline.hset(memoryKey, this.serializeMemory(updated));

    // Update type index if changed
    if (updates.context_type && updates.context_type !== existing.context_type) {
      if (isGlobal) {
        pipeline.srem(RedisKeys.globalByType(existing.context_type), id);
        pipeline.sadd(RedisKeys.globalByType(updates.context_type), id);
      } else {
        pipeline.srem(RedisKeys.byType(this.workspaceId, existing.context_type), id);
        pipeline.sadd(RedisKeys.byType(this.workspaceId, updates.context_type), id);
      }
    }

    // Update tag indexes if changed
    if (updates.tags) {
      // Remove from old tags
      for (const tag of existing.tags) {
        if (!updates.tags.includes(tag)) {
          if (isGlobal) {
            pipeline.srem(RedisKeys.globalByTag(tag), id);
          } else {
            pipeline.srem(RedisKeys.byTag(this.workspaceId, tag), id);
          }
        }
      }
      // Add to new tags
      for (const tag of updates.tags) {
        if (!existing.tags.includes(tag)) {
          if (isGlobal) {
            pipeline.sadd(RedisKeys.globalByTag(tag), id);
          } else {
            pipeline.sadd(RedisKeys.byTag(this.workspaceId, tag), id);
          }
        }
      }
    }

    // Update importance index if changed
    if (updates.importance !== undefined) {
      if (existing.importance >= 8) {
        if (isGlobal) {
          pipeline.zrem(RedisKeys.globalImportant(), id);
        } else {
          pipeline.zrem(RedisKeys.important(this.workspaceId), id);
        }
      }
      if (updates.importance >= 8) {
        if (isGlobal) {
          pipeline.zadd(RedisKeys.globalImportant(), updates.importance, id);
        } else {
          pipeline.zadd(RedisKeys.important(this.workspaceId), updates.importance, id);
        }
      }
    }

    await pipeline.exec();

    return updated;
  }

  // Delete memory (handles both workspace and global)
  async deleteMemory(id: string): Promise<boolean> {
    const memory = await this.getMemory(id);
    if (!memory) {
      return false;
    }

    const pipeline = this.redis.pipeline();
    const isGlobal = memory.is_global;

    // Remove from all indexes (use appropriate keys based on is_global)
    if (isGlobal) {
      pipeline.del(RedisKeys.globalMemory(id));
      pipeline.srem(RedisKeys.globalMemories(), id);
      pipeline.zrem(RedisKeys.globalTimeline(), id);
      pipeline.srem(RedisKeys.globalByType(memory.context_type), id);

      for (const tag of memory.tags) {
        pipeline.srem(RedisKeys.globalByTag(tag), id);
      }

      if (memory.importance >= 8) {
        pipeline.zrem(RedisKeys.globalImportant(), id);
      }
    } else {
      pipeline.del(RedisKeys.memory(this.workspaceId, id));
      pipeline.srem(RedisKeys.memories(this.workspaceId), id);
      pipeline.zrem(RedisKeys.timeline(this.workspaceId), id);
      pipeline.srem(RedisKeys.byType(this.workspaceId, memory.context_type), id);

      for (const tag of memory.tags) {
        pipeline.srem(RedisKeys.byTag(this.workspaceId, tag), id);
      }

      if (memory.importance >= 8) {
        pipeline.zrem(RedisKeys.important(this.workspaceId), id);
      }
    }

    await pipeline.exec();

    return true;
  }

  // Semantic search (respects workspace mode with global memory weighting)
  async searchMemories(
    query: string,
    limit: number = 10,
    minImportance?: number,
    contextTypes?: ContextType[]
  ): Promise<Array<MemoryEntry & { similarity: number }>> {
    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(query);

    const mode = getWorkspaceMode();
    let memories: MemoryEntry[] = [];

    // Get all memories based on workspace mode
    if (mode === WorkspaceMode.GLOBAL) {
      // Global mode: only global memories
      let ids: string[];
      if (contextTypes && contextTypes.length > 0) {
        const sets = contextTypes.map(type => RedisKeys.globalByType(type));
        ids = await this.redis.sunion(...sets);
      } else {
        ids = await this.redis.smembers(RedisKeys.globalMemories());
      }
      memories = await this.getMemories(ids);
    } else if (mode === WorkspaceMode.ISOLATED) {
      // Isolated mode: only workspace memories
      let ids: string[];
      if (contextTypes && contextTypes.length > 0) {
        const sets = contextTypes.map(type => RedisKeys.byType(this.workspaceId, type));
        ids = await this.redis.sunion(...sets);
      } else {
        ids = await this.redis.smembers(RedisKeys.memories(this.workspaceId));
      }
      memories = await this.getMemories(ids);
    } else {
      // Hybrid mode: merge workspace + global
      let wsIds: string[];
      let globalIds: string[];

      if (contextTypes && contextTypes.length > 0) {
        const wsSets = contextTypes.map(type => RedisKeys.byType(this.workspaceId, type));
        const globalSets = contextTypes.map(type => RedisKeys.globalByType(type));
        wsIds = await this.redis.sunion(...wsSets);
        globalIds = await this.redis.sunion(...globalSets);
      } else {
        wsIds = await this.redis.smembers(RedisKeys.memories(this.workspaceId));
        globalIds = await this.redis.smembers(RedisKeys.globalMemories());
      }

      memories = await this.getMemories([...wsIds, ...globalIds]);
    }

    // Filter by importance if specified
    let filtered = memories;
    if (minImportance !== undefined) {
      filtered = memories.filter(m => m.importance >= minImportance);
    }

    // Calculate similarities
    const withSimilarity = filtered.map(memory => {
      const baseSimilarity = memory.embedding ? cosineSimilarity(queryEmbedding, memory.embedding) : 0;

      // In hybrid mode, weight global memories slightly lower (0.9x) to prefer local context
      const similarity = (mode === WorkspaceMode.HYBRID && memory.is_global)
        ? baseSimilarity * 0.9
        : baseSimilarity;

      return {
        ...memory,
        similarity,
      };
    });

    // Sort by similarity descending
    withSimilarity.sort((a, b) => b.similarity - a.similarity);

    return withSimilarity.slice(0, limit);
  }

  // Create session
  async createSession(name: string, memoryIds: string[], summary?: string): Promise<SessionInfo> {
    const sessionId = ulid();
    const timestamp = Date.now();

    // Verify all memory IDs exist
    const validIds: string[] = [];
    for (const id of memoryIds) {
      const exists = await this.redis.exists(RedisKeys.memory(this.workspaceId, id));
      if (exists) {
        validIds.push(id);
      }
    }

    const session: SessionInfo = {
      session_id: sessionId,
      session_name: name,
      created_at: timestamp,
      memory_count: validIds.length,
      summary,
      memory_ids: validIds,
    };

    // Store session
    await this.redis.hset(RedisKeys.session(this.workspaceId, sessionId), {
      session_id: sessionId,
      session_name: name,
      created_at: timestamp.toString(),
      memory_count: validIds.length.toString(),
      summary: summary || '',
      memory_ids: JSON.stringify(validIds),
    });

    await this.redis.sadd(RedisKeys.sessions(this.workspaceId), sessionId);

    return session;
  }

  // Get session
  async getSession(sessionId: string): Promise<SessionInfo | null> {
    const data = await this.redis.hgetall(RedisKeys.session(this.workspaceId, sessionId));

    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    return {
      session_id: data.session_id,
      session_name: data.session_name,
      created_at: parseInt(data.created_at, 10),
      memory_count: parseInt(data.memory_count, 10),
      summary: data.summary || undefined,
      memory_ids: JSON.parse(data.memory_ids),
    };
  }

  // Get all sessions
  async getAllSessions(): Promise<SessionInfo[]> {
    const ids = await this.redis.smembers(RedisKeys.sessions(this.workspaceId));
    const sessions: SessionInfo[] = [];

    for (const id of ids) {
      const session = await this.getSession(id);
      if (session) {
        sessions.push(session);
      }
    }

    return sessions.sort((a, b) => b.created_at - a.created_at);
  }

  // Get memories in session
  async getSessionMemories(sessionId: string): Promise<MemoryEntry[]> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return [];
    }

    return this.getMemories(session.memory_ids);
  }

  // Generate summary stats
  async getSummaryStats(): Promise<{
    total_memories: number;
    by_type: Record<ContextType, number>;
    total_sessions: number;
    important_count: number;
    workspace_path: string;
  }> {
    const totalMemories = await this.redis.scard(RedisKeys.memories(this.workspaceId));
    const totalSessions = await this.redis.scard(RedisKeys.sessions(this.workspaceId));
    const importantCount = await this.redis.zcard(RedisKeys.important(this.workspaceId));

    const byType: Record<string, number> = {};
    const types: ContextType[] = ['directive', 'information', 'heading', 'decision', 'code_pattern', 'requirement', 'error', 'todo', 'insight', 'preference'];

    for (const type of types) {
      byType[type] = await this.redis.scard(RedisKeys.byType(this.workspaceId, type));
    }

    return {
      total_memories: totalMemories,
      by_type: byType as Record<ContextType, number>,
      total_sessions: totalSessions,
      important_count: importantCount,
      workspace_path: this.workspacePath,
    };
  }

  // Merge multiple memories into one
  async mergeMemories(memoryIds: string[], keepId?: string): Promise<MemoryEntry | null> {
    // Get all memories to merge
    const memories = await this.getMemories(memoryIds);

    if (memories.length === 0) {
      return null;
    }

    // Determine which memory to keep
    const toKeep = keepId
      ? memories.find(m => m.id === keepId)
      : memories.reduce((prev, current) =>
          current.importance > prev.importance ? current : prev
        );

    if (!toKeep) {
      return null;
    }

    // Merge content, tags, and metadata
    const allTags = new Set<string>();
    const contentParts: string[] = [];

    for (const memory of memories) {
      if (memory.id !== toKeep.id) {
        contentParts.push(memory.content);
      }
      memory.tags.forEach(tag => allTags.add(tag));
    }

    // Create merged content
    const mergedContent = contentParts.length > 0
      ? `${toKeep.content}\n\n--- Merged content ---\n${contentParts.join('\n\n')}`
      : toKeep.content;

    // Update the memory to keep with merged data
    const updated = await this.updateMemory(toKeep.id, {
      content: mergedContent,
      tags: Array.from(allTags),
      importance: Math.max(...memories.map(m => m.importance)),
    });

    // Delete the other memories
    for (const memory of memories) {
      if (memory.id !== toKeep.id) {
        await this.deleteMemory(memory.id);
      }
    }

    return updated;
  }

  // Helper: Generate summary from content (first 100 chars)
  private generateSummary(content: string): string {
    return content.length > 100 ? content.substring(0, 100) + '...' : content;
  }

  // Helper: Serialize memory for Redis
  private serializeMemory(memory: MemoryEntry): Record<string, string> {
    return {
      id: memory.id,
      timestamp: memory.timestamp.toString(),
      context_type: memory.context_type,
      content: memory.content,
      summary: memory.summary || '',
      tags: JSON.stringify(memory.tags),
      importance: memory.importance.toString(),
      session_id: memory.session_id || '',
      embedding: JSON.stringify(memory.embedding || []),
      ttl_seconds: memory.ttl_seconds?.toString() || '',
      expires_at: memory.expires_at?.toString() || '',
      is_global: memory.is_global ? 'true' : 'false',
      workspace_id: memory.workspace_id || '',
    };
  }

  // Helper: Deserialize memory from Redis
  private deserializeMemory(data: Record<string, string>): MemoryEntry {
    return {
      id: data.id,
      timestamp: parseInt(data.timestamp, 10),
      context_type: data.context_type as ContextType,
      content: data.content,
      summary: data.summary || undefined,
      tags: JSON.parse(data.tags || '[]'),
      importance: parseInt(data.importance, 10),
      session_id: data.session_id || undefined,
      embedding: JSON.parse(data.embedding || '[]'),
      ttl_seconds: data.ttl_seconds ? parseInt(data.ttl_seconds, 10) : undefined,
      expires_at: data.expires_at ? parseInt(data.expires_at, 10) : undefined,
      is_global: data.is_global === 'true',
      workspace_id: data.workspace_id || '',
    };
  }

  // Convert workspace memory to global
  async convertToGlobal(memoryId: string): Promise<MemoryEntry | null> {
    const memory = await this.getMemory(memoryId);
    if (!memory) {
      return null;
    }

    // Already global
    if (memory.is_global) {
      return memory;
    }

    const pipeline = this.redis.pipeline();

    // Delete from workspace indexes
    pipeline.del(RedisKeys.memory(this.workspaceId, memoryId));
    pipeline.srem(RedisKeys.memories(this.workspaceId), memoryId);
    pipeline.zrem(RedisKeys.timeline(this.workspaceId), memoryId);
    pipeline.srem(RedisKeys.byType(this.workspaceId, memory.context_type), memoryId);

    for (const tag of memory.tags) {
      pipeline.srem(RedisKeys.byTag(this.workspaceId, tag), memoryId);
    }

    if (memory.importance >= 8) {
      pipeline.zrem(RedisKeys.important(this.workspaceId), memoryId);
    }

    // Update memory to global
    const globalMemory: MemoryEntry = {
      ...memory,
      is_global: true,
      workspace_id: '',
    };

    // Add to global indexes
    pipeline.hset(RedisKeys.globalMemory(memoryId), this.serializeMemory(globalMemory));
    pipeline.sadd(RedisKeys.globalMemories(), memoryId);
    pipeline.zadd(RedisKeys.globalTimeline(), memory.timestamp, memoryId);
    pipeline.sadd(RedisKeys.globalByType(memory.context_type), memoryId);

    for (const tag of memory.tags) {
      pipeline.sadd(RedisKeys.globalByTag(tag), memoryId);
    }

    if (memory.importance >= 8) {
      pipeline.zadd(RedisKeys.globalImportant(), memory.importance, memoryId);
    }

    await pipeline.exec();

    return globalMemory;
  }

  // Convert global memory to workspace
  async convertToWorkspace(memoryId: string, targetWorkspaceId?: string): Promise<MemoryEntry | null> {
    const memory = await this.getMemory(memoryId);
    if (!memory) {
      return null;
    }

    // Already workspace-specific
    if (!memory.is_global) {
      return memory;
    }

    const workspaceId = targetWorkspaceId || this.workspaceId;
    const pipeline = this.redis.pipeline();

    // Delete from global indexes
    pipeline.del(RedisKeys.globalMemory(memoryId));
    pipeline.srem(RedisKeys.globalMemories(), memoryId);
    pipeline.zrem(RedisKeys.globalTimeline(), memoryId);
    pipeline.srem(RedisKeys.globalByType(memory.context_type), memoryId);

    for (const tag of memory.tags) {
      pipeline.srem(RedisKeys.globalByTag(tag), memoryId);
    }

    if (memory.importance >= 8) {
      pipeline.zrem(RedisKeys.globalImportant(), memoryId);
    }

    // Update memory to workspace-specific
    const workspaceMemory: MemoryEntry = {
      ...memory,
      is_global: false,
      workspace_id: workspaceId,
    };

    // Add to workspace indexes
    pipeline.hset(RedisKeys.memory(workspaceId, memoryId), this.serializeMemory(workspaceMemory));
    pipeline.sadd(RedisKeys.memories(workspaceId), memoryId);
    pipeline.zadd(RedisKeys.timeline(workspaceId), memory.timestamp, memoryId);
    pipeline.sadd(RedisKeys.byType(workspaceId, memory.context_type), memoryId);

    for (const tag of memory.tags) {
      pipeline.sadd(RedisKeys.byTag(workspaceId, tag), memoryId);
    }

    if (memory.importance >= 8) {
      pipeline.zadd(RedisKeys.important(workspaceId), memory.importance, memoryId);
    }

    await pipeline.exec();

    return workspaceMemory;
  }

  // ============================================================================
  // Memory Relationships (v1.4.0)
  // ============================================================================

  // Serialize relationship for Redis storage
  private serializeRelationship(relationship: MemoryRelationship): Record<string, string> {
    return {
      id: relationship.id,
      from_memory_id: relationship.from_memory_id,
      to_memory_id: relationship.to_memory_id,
      relationship_type: relationship.relationship_type,
      created_at: relationship.created_at,
      metadata: relationship.metadata ? JSON.stringify(relationship.metadata) : '',
    };
  }

  // Deserialize relationship from Redis
  private deserializeRelationship(data: Record<string, string>): MemoryRelationship {
    return {
      id: data.id,
      from_memory_id: data.from_memory_id,
      to_memory_id: data.to_memory_id,
      relationship_type: data.relationship_type as RelationshipType,
      created_at: data.created_at,
      metadata: data.metadata ? JSON.parse(data.metadata) : undefined,
    };
  }

  // Create a relationship between two memories
  async createRelationship(
    fromMemoryId: string,
    toMemoryId: string,
    relationshipType: RelationshipType,
    metadata?: Record<string, unknown>
  ): Promise<MemoryRelationship> {
    // Validate both memories exist
    const fromMemory = await this.getMemory(fromMemoryId);
    const toMemory = await this.getMemory(toMemoryId);

    if (!fromMemory) {
      throw new Error(`Source memory not found: ${fromMemoryId}`);
    }
    if (!toMemory) {
      throw new Error(`Target memory not found: ${toMemoryId}`);
    }

    // Prevent self-references
    if (fromMemoryId === toMemoryId) {
      throw new Error('Cannot create relationship to self');
    }

    // Check if relationship already exists
    const existing = await this.findRelationship(fromMemoryId, toMemoryId, relationshipType);
    if (existing) {
      return existing; // Idempotent
    }

    const id = ulid();
    const relationship: MemoryRelationship = {
      id,
      from_memory_id: fromMemoryId,
      to_memory_id: toMemoryId,
      relationship_type: relationshipType,
      created_at: new Date().toISOString(),
      metadata,
    };

    // Determine if this is a global relationship (both memories are global)
    const isGlobal = fromMemory.is_global && toMemory.is_global;

    const pipeline = this.redis.pipeline();

    if (isGlobal) {
      pipeline.hset(RedisKeys.globalRelationship(id), this.serializeRelationship(relationship));
      pipeline.sadd(RedisKeys.globalRelationships(), id);
      pipeline.sadd(RedisKeys.globalMemoryRelationships(fromMemoryId), id);
      pipeline.sadd(RedisKeys.globalMemoryRelationshipsOut(fromMemoryId), id);
      pipeline.sadd(RedisKeys.globalMemoryRelationshipsIn(toMemoryId), id);
    } else {
      pipeline.hset(RedisKeys.relationship(this.workspaceId, id), this.serializeRelationship(relationship));
      pipeline.sadd(RedisKeys.relationships(this.workspaceId), id);
      pipeline.sadd(RedisKeys.memoryRelationships(this.workspaceId, fromMemoryId), id);
      pipeline.sadd(RedisKeys.memoryRelationshipsOut(this.workspaceId, fromMemoryId), id);
      pipeline.sadd(RedisKeys.memoryRelationshipsIn(this.workspaceId, toMemoryId), id);
    }

    await pipeline.exec();

    return relationship;
  }

  // Find existing relationship
  private async findRelationship(
    fromMemoryId: string,
    toMemoryId: string,
    relationshipType: RelationshipType
  ): Promise<MemoryRelationship | null> {
    // Get all relationships for from memory
    const relationshipIds = await this.getMemoryRelationshipIds(fromMemoryId, 'outgoing');

    for (const relId of relationshipIds) {
      const rel = await this.getRelationship(relId);
      if (
        rel &&
        rel.from_memory_id === fromMemoryId &&
        rel.to_memory_id === toMemoryId &&
        rel.relationship_type === relationshipType
      ) {
        return rel;
      }
    }

    return null;
  }

  // Get a single relationship by ID
  async getRelationship(relationshipId: string): Promise<MemoryRelationship | null> {
    // Try workspace first
    const wsData = await this.redis.hgetall(RedisKeys.relationship(this.workspaceId, relationshipId));
    if (wsData && Object.keys(wsData).length > 0) {
      return this.deserializeRelationship(wsData);
    }

    // Try global
    const globalData = await this.redis.hgetall(RedisKeys.globalRelationship(relationshipId));
    if (globalData && Object.keys(globalData).length > 0) {
      return this.deserializeRelationship(globalData);
    }

    return null;
  }

  // Get relationship IDs for a memory
  private async getMemoryRelationshipIds(
    memoryId: string,
    direction: 'outgoing' | 'incoming' | 'both' = 'both'
  ): Promise<string[]> {
    const mode = getWorkspaceMode();
    const ids = new Set<string>();

    // Helper to add IDs from a Redis key
    const addIds = async (key: string) => {
      const keyIds = await this.redis.smembers(key);
      keyIds.forEach(id => ids.add(id));
    };

    // Workspace relationships
    if (mode === WorkspaceMode.ISOLATED || mode === WorkspaceMode.HYBRID) {
      if (direction === 'outgoing' || direction === 'both') {
        await addIds(RedisKeys.memoryRelationshipsOut(this.workspaceId, memoryId));
      }
      if (direction === 'incoming' || direction === 'both') {
        await addIds(RedisKeys.memoryRelationshipsIn(this.workspaceId, memoryId));
      }
    }

    // Global relationships
    if (mode === WorkspaceMode.GLOBAL || mode === WorkspaceMode.HYBRID) {
      if (direction === 'outgoing' || direction === 'both') {
        await addIds(RedisKeys.globalMemoryRelationshipsOut(memoryId));
      }
      if (direction === 'incoming' || direction === 'both') {
        await addIds(RedisKeys.globalMemoryRelationshipsIn(memoryId));
      }
    }

    return Array.from(ids);
  }

  // Get all relationships for a memory
  async getMemoryRelationships(
    memoryId: string,
    direction: 'outgoing' | 'incoming' | 'both' = 'both'
  ): Promise<MemoryRelationship[]> {
    const relationshipIds = await this.getMemoryRelationshipIds(memoryId, direction);
    const relationships: MemoryRelationship[] = [];

    for (const relId of relationshipIds) {
      const rel = await this.getRelationship(relId);
      if (rel) {
        relationships.push(rel);
      }
    }

    return relationships;
  }

  // Get related memories with graph traversal
  async getRelatedMemories(
    memoryId: string,
    options: {
      relationshipTypes?: RelationshipType[];
      depth?: number;
      direction?: 'outgoing' | 'incoming' | 'both';
    } = {}
  ): Promise<RelatedMemoryResult[]> {
    const { relationshipTypes, depth = 1, direction = 'both' } = options;

    const results: RelatedMemoryResult[] = [];
    const visited = new Set<string>();

    await this.traverseGraph(memoryId, depth, visited, results, relationshipTypes, direction, 0);

    return results;
  }

  // Traverse relationship graph
  private async traverseGraph(
    memoryId: string,
    maxDepth: number,
    visited: Set<string>,
    results: RelatedMemoryResult[],
    relationshipTypes?: RelationshipType[],
    direction: 'outgoing' | 'incoming' | 'both' = 'both',
    currentDepth: number = 0
  ): Promise<void> {
    if (currentDepth >= maxDepth || visited.has(memoryId)) {
      return;
    }

    visited.add(memoryId);

    // Get relationships for this memory
    const relationships = await this.getMemoryRelationships(memoryId, direction);

    // Filter by type if specified
    const filtered = relationshipTypes
      ? relationships.filter(r => relationshipTypes.includes(r.relationship_type))
      : relationships;

    for (const relationship of filtered) {
      const relatedMemoryId =
        relationship.from_memory_id === memoryId
          ? relationship.to_memory_id
          : relationship.from_memory_id;

      if (!visited.has(relatedMemoryId)) {
        const memory = await this.getMemory(relatedMemoryId);
        if (memory) {
          results.push({
            memory,
            relationship,
            depth: currentDepth + 1,
          });

          // Recurse if not at max depth
          if (currentDepth + 1 < maxDepth) {
            await this.traverseGraph(
              relatedMemoryId,
              maxDepth,
              visited,
              results,
              relationshipTypes,
              direction,
              currentDepth + 1
            );
          }
        }
      }
    }
  }

  // Delete a relationship
  async deleteRelationship(relationshipId: string): Promise<boolean> {
    const relationship = await this.getRelationship(relationshipId);
    if (!relationship) {
      return false;
    }

    // Check if global based on memories
    const fromMemory = await this.getMemory(relationship.from_memory_id);
    const isGlobal = fromMemory?.is_global || false;

    const pipeline = this.redis.pipeline();

    if (isGlobal) {
      pipeline.del(RedisKeys.globalRelationship(relationshipId));
      pipeline.srem(RedisKeys.globalRelationships(), relationshipId);
      pipeline.srem(RedisKeys.globalMemoryRelationships(relationship.from_memory_id), relationshipId);
      pipeline.srem(RedisKeys.globalMemoryRelationshipsOut(relationship.from_memory_id), relationshipId);
      pipeline.srem(RedisKeys.globalMemoryRelationshipsIn(relationship.to_memory_id), relationshipId);
    } else {
      pipeline.del(RedisKeys.relationship(this.workspaceId, relationshipId));
      pipeline.srem(RedisKeys.relationships(this.workspaceId), relationshipId);
      pipeline.srem(RedisKeys.memoryRelationships(this.workspaceId, relationship.from_memory_id), relationshipId);
      pipeline.srem(RedisKeys.memoryRelationshipsOut(this.workspaceId, relationship.from_memory_id), relationshipId);
      pipeline.srem(RedisKeys.memoryRelationshipsIn(this.workspaceId, relationship.to_memory_id), relationshipId);
    }

    await pipeline.exec();

    return true;
  }

  // Get full memory graph
  async getMemoryGraph(
    rootMemoryId: string,
    maxDepth: number = 2,
    maxNodes: number = 50
  ): Promise<MemoryGraph> {
    const nodes: Record<string, MemoryGraphNode> = {};
    const visited = new Set<string>();
    let maxDepthReached = 0;

    await this.buildGraph(rootMemoryId, maxDepth, maxNodes, nodes, visited, 0);

    // Track max depth actually reached
    for (const node of Object.values(nodes)) {
      maxDepthReached = Math.max(maxDepthReached, node.depth);
    }

    return {
      root_memory_id: rootMemoryId,
      nodes,
      total_nodes: Object.keys(nodes).length,
      max_depth_reached: maxDepthReached,
    };
  }

  // Build graph recursively
  private async buildGraph(
    memoryId: string,
    maxDepth: number,
    maxNodes: number,
    nodes: Record<string, MemoryGraphNode>,
    visited: Set<string>,
    currentDepth: number
  ): Promise<void> {
    if (currentDepth > maxDepth || visited.has(memoryId) || Object.keys(nodes).length >= maxNodes) {
      return;
    }

    visited.add(memoryId);

    const memory = await this.getMemory(memoryId);
    if (!memory) {
      return;
    }

    const relationships = await this.getMemoryRelationships(memoryId, 'both');

    nodes[memoryId] = {
      memory,
      relationships,
      depth: currentDepth,
    };

    // Recurse for related memories
    for (const relationship of relationships) {
      const relatedId =
        relationship.from_memory_id === memoryId
          ? relationship.to_memory_id
          : relationship.from_memory_id;

      if (!visited.has(relatedId) && Object.keys(nodes).length < maxNodes) {
        await this.buildGraph(relatedId, maxDepth, maxNodes, nodes, visited, currentDepth + 1);
      }
    }
  }
}
