import { ulid } from 'ulid';
import type { Redis } from 'ioredis';
import { getRedisClient } from './client.js';
import { generateEmbedding, cosineSimilarity } from '../embeddings/generator.js';
import { RedisKeys, createWorkspaceId, type MemoryEntry, type CreateMemory, type SessionInfo, type ContextType } from '../types.js';

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
    };

    // Store in Redis with workspace isolation
    const pipeline = this.redis.pipeline();

    // Main memory hash
    pipeline.hset(RedisKeys.memory(this.workspaceId, id), this.serializeMemory(memory));

    // Set TTL on the hash if specified
    if (data.ttl_seconds) {
      pipeline.expire(RedisKeys.memory(this.workspaceId, id), data.ttl_seconds);
    }

    // Add to global set
    pipeline.sadd(RedisKeys.memories(this.workspaceId), id);

    // Add to timeline (sorted by timestamp)
    pipeline.zadd(RedisKeys.timeline(this.workspaceId), timestamp, id);

    // Add to type index
    pipeline.sadd(RedisKeys.byType(this.workspaceId, data.context_type), id);

    // Add to tag indexes
    for (const tag of data.tags) {
      pipeline.sadd(RedisKeys.byTag(this.workspaceId, tag), id);
    }

    // Add to important set if importance >= 8
    if (data.importance >= 8) {
      pipeline.zadd(RedisKeys.important(this.workspaceId), data.importance, id);
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

  // Get memory by ID
  async getMemory(id: string): Promise<MemoryEntry | null> {
    const data = await this.redis.hgetall(RedisKeys.memory(this.workspaceId, id));

    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    return this.deserializeMemory(data);
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

  // Get recent memories
  async getRecentMemories(limit: number = 50): Promise<MemoryEntry[]> {
    const ids = await this.redis.zrevrange(RedisKeys.timeline(this.workspaceId), 0, limit - 1);
    return this.getMemories(ids);
  }

  // Get memories by type
  async getMemoriesByType(type: ContextType, limit?: number): Promise<MemoryEntry[]> {
    const ids = await this.redis.smembers(RedisKeys.byType(this.workspaceId, type));
    const memories = await this.getMemories(ids);

    // Sort by timestamp descending
    memories.sort((a, b) => b.timestamp - a.timestamp);

    return limit ? memories.slice(0, limit) : memories;
  }

  // Get memories by tag
  async getMemoriesByTag(tag: string, limit?: number): Promise<MemoryEntry[]> {
    const ids = await this.redis.smembers(RedisKeys.byTag(this.workspaceId, tag));
    const memories = await this.getMemories(ids);

    // Sort by timestamp descending
    memories.sort((a, b) => b.timestamp - a.timestamp);

    return limit ? memories.slice(0, limit) : memories;
  }

  // Get important memories
  async getImportantMemories(minImportance: number = 8, limit?: number): Promise<MemoryEntry[]> {
    const results = await this.redis.zrevrangebyscore(
      RedisKeys.important(this.workspaceId),
      10,
      minImportance,
      'LIMIT',
      0,
      limit || 100
    );

    return this.getMemories(results);
  }

  // Update memory
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

    // Update hash
    pipeline.hset(RedisKeys.memory(this.workspaceId, id), this.serializeMemory(updated));

    // Update type index if changed
    if (updates.context_type && updates.context_type !== existing.context_type) {
      pipeline.srem(RedisKeys.byType(this.workspaceId, existing.context_type), id);
      pipeline.sadd(RedisKeys.byType(this.workspaceId, updates.context_type), id);
    }

    // Update tag indexes if changed
    if (updates.tags) {
      // Remove from old tags
      for (const tag of existing.tags) {
        if (!updates.tags.includes(tag)) {
          pipeline.srem(RedisKeys.byTag(this.workspaceId, tag), id);
        }
      }
      // Add to new tags
      for (const tag of updates.tags) {
        if (!existing.tags.includes(tag)) {
          pipeline.sadd(RedisKeys.byTag(this.workspaceId, tag), id);
        }
      }
    }

    // Update importance index if changed
    if (updates.importance !== undefined) {
      if (existing.importance >= 8) {
        pipeline.zrem(RedisKeys.important(this.workspaceId), id);
      }
      if (updates.importance >= 8) {
        pipeline.zadd(RedisKeys.important(this.workspaceId), updates.importance, id);
      }
    }

    await pipeline.exec();

    return updated;
  }

  // Delete memory
  async deleteMemory(id: string): Promise<boolean> {
    const memory = await this.getMemory(id);
    if (!memory) {
      return false;
    }

    const pipeline = this.redis.pipeline();

    // Remove from all indexes
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

    await pipeline.exec();

    return true;
  }

  // Semantic search
  async searchMemories(
    query: string,
    limit: number = 10,
    minImportance?: number,
    contextTypes?: ContextType[]
  ): Promise<Array<MemoryEntry & { similarity: number }>> {
    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(query);

    // Get all memories (or filter by context type)
    let ids: string[];
    if (contextTypes && contextTypes.length > 0) {
      const sets = contextTypes.map(type => RedisKeys.byType(this.workspaceId, type));
      ids = await this.redis.sunion(...sets);
    } else {
      ids = await this.redis.smembers(RedisKeys.memories(this.workspaceId));
    }

    const memories = await this.getMemories(ids);

    // Filter by importance if specified
    let filtered = memories;
    if (minImportance !== undefined) {
      filtered = memories.filter(m => m.importance >= minImportance);
    }

    // Calculate similarities
    const withSimilarity = filtered.map(memory => ({
      ...memory,
      similarity: memory.embedding ? cosineSimilarity(queryEmbedding, memory.embedding) : 0,
    }));

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
    };
  }
}
