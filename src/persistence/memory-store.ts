import { ulid } from 'ulid';
import { generateEmbedding, cosineSimilarity } from '../embeddings/generator.js';
import { ContextType, StorageKeys, createWorkspaceId, getWorkspaceMode, WorkspaceMode, type MemoryEntry, type CreateMemory, type SessionInfo, type MemoryRelationship, type RelationshipType, type RelatedMemoryResult, type MemoryGraph, type MemoryGraphNode, type MemoryVersion } from '../types.js';
import { StorageClient } from './storage-client.js';
import { createStorageClient } from './storage-client.factory.js';



export class MemoryStore {
  private storageClient: StorageClient;
  private workspaceId: string;
  private workspacePath: string;

  /**
   * Create a MemoryStore with an existing storage client.
   * Use this constructor for HTTP server (multi-tenant) scenarios.
   */
  constructor(storageClient: StorageClient, workspacePath?: string) {
    this.workspacePath = workspacePath || process.cwd();
    this.workspaceId = createWorkspaceId(this.workspacePath);
    this.storageClient = storageClient;
    // Log workspace info for debugging
    console.error(`[MemoryStore] Workspace: ${this.workspacePath}`);
    console.error(`[MemoryStore] Workspace ID: ${this.workspaceId}`);
  }

  /**
   * Create a MemoryStore with a new storage client.
   * Use this factory method for stdio server (single-tenant) scenarios.
   */
  static async create(workspacePath?: string): Promise<MemoryStore> {
    const storageClient = await createStorageClient();
    return new MemoryStore(storageClient, workspacePath);
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
      category: data.category, // v1.5.0
    };

    
    // Store in Redis (workspace or global based on is_global flag)
    const pipeline = this.storageClient.pipeline();

    // Main memory hash
    const memoryKey = isGlobal
      ? StorageKeys.globalMemory(id)
      : StorageKeys.memory(this.workspaceId, id);


    let toBeSerializedMemory = this.serializeMemory(memory);
    pipeline.hset(memoryKey, toBeSerializedMemory);

    // Set TTL on the hash if specified
    if (data.ttl_seconds) {
      pipeline.expire(memoryKey, data.ttl_seconds);
    }

    // Add to global set
    if (isGlobal) {
      pipeline.sadd(StorageKeys.globalMemories(), id);
      pipeline.zadd(StorageKeys.globalTimeline(), timestamp, id);
      pipeline.sadd(StorageKeys.globalByType(data.context_type), id);

      for (const tag of data.tags) {
        pipeline.sadd(StorageKeys.globalByTag(tag), id);
      }

      if (data.importance >= 8) {
        pipeline.zadd(StorageKeys.globalImportant(), data.importance, id);
      }

      // Add to category index if specified (v1.5.0)
      if (data.category) {
        pipeline.set(StorageKeys.globalMemoryCategory(id), data.category);
        pipeline.sadd(StorageKeys.globalCategory(data.category), id);
        pipeline.zadd(StorageKeys.globalCategories(), timestamp, data.category);
      }
    } else {
      pipeline.sadd(StorageKeys.memories(this.workspaceId), id);
      pipeline.zadd(StorageKeys.timeline(this.workspaceId), timestamp, id);
      pipeline.sadd(StorageKeys.byType(this.workspaceId, data.context_type), id);

      for (const tag of data.tags) {
        pipeline.sadd(StorageKeys.byTag(this.workspaceId, tag), id);
      }

      if (data.importance >= 8) {
        pipeline.zadd(StorageKeys.important(this.workspaceId), data.importance, id);
      }

      // Add to category index if specified (v1.5.0)
      if (data.category) {
        pipeline.set(StorageKeys.memoryCategory(this.workspaceId, id), data.category);
        pipeline.sadd(StorageKeys.category(this.workspaceId, data.category), id);
        pipeline.zadd(StorageKeys.categories(this.workspaceId), timestamp, data.category);
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
      const globalData = await this.storageClient.hgetall(StorageKeys.globalMemory(id));
      if (globalData && Object.keys(globalData).length > 0) {
        return this.deserializeMemory(globalData);
      }
      return null;
    }

    // If we know it's workspace, check workspace only
    if (isGlobal === false) {
      const wsData = await this.storageClient.hgetall(StorageKeys.memory(this.workspaceId, id));
      if (wsData && Object.keys(wsData).length > 0) {
        return this.deserializeMemory(wsData);
      }
      return null;
    }

    // If unknown, check workspace first, then global
    const wsData = await this.storageClient.hgetall(StorageKeys.memory(this.workspaceId, id));
    if (wsData && Object.keys(wsData).length > 0) {
      return this.deserializeMemory(wsData);
    }
    const globalData = await this.storageClient.hgetall(StorageKeys.globalMemory(id));
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
      const ids = await this.storageClient.zrevrange(StorageKeys.globalTimeline(), 0, limit - 1);
      return this.getMemories(ids);
    } else if (mode === WorkspaceMode.ISOLATED) {
      // Isolated mode: only workspace memories
      const ids = await this.storageClient.zrevrange(StorageKeys.timeline(this.workspaceId), 0, limit - 1);
      return this.getMemories(ids);
    } else {
      // Hybrid mode: merge workspace + global
      const wsIds = await this.storageClient.zrevrange(StorageKeys.timeline(this.workspaceId), 0, limit - 1);
      const globalIds = await this.storageClient.zrevrange(StorageKeys.globalTimeline(), 0, limit - 1);

      const allMemories = await this.getMemories([...wsIds, ...globalIds]);

      // Sort by timestamp descending
      allMemories.sort((a, b) => b.timestamp - a.timestamp);

      return allMemories.slice(0, limit);
    }
  }

  // Get memories by time window (v1.6.0)
  async getMemoriesByTimeWindow(
    startTime: number,
    endTime: number,
    minImportance?: number,
    contextTypes?: ContextType[]
  ): Promise<MemoryEntry[]> {
    const mode = getWorkspaceMode();
    let ids: string[] = [];

    if (mode === WorkspaceMode.GLOBAL) {
      // Global mode: only global memories
      ids = await this.storageClient.zrangebyscore(StorageKeys.globalTimeline(), startTime, endTime);
    } else if (mode === WorkspaceMode.ISOLATED) {
      // Isolated mode: only workspace memories
      ids = await this.storageClient.zrangebyscore(StorageKeys.timeline(this.workspaceId), startTime, endTime);
    } else {
      // Hybrid mode: merge workspace + global
      const wsIds = await this.storageClient.zrangebyscore(StorageKeys.timeline(this.workspaceId), startTime, endTime);
      const globalIds = await this.storageClient.zrangebyscore(StorageKeys.globalTimeline(), startTime, endTime);
      ids = [...new Set([...wsIds, ...globalIds])]; // Deduplicate
    }

    let memories = await this.getMemories(ids);

    // Filter by importance if specified
    if (minImportance !== undefined) {
      memories = memories.filter(m => m.importance >= minImportance);
    }

    // Filter by context types if specified
    if (contextTypes && contextTypes.length > 0) {
      memories = memories.filter(m => contextTypes.includes(m.context_type));
    }

    // Sort by timestamp ascending (chronological order)
    memories.sort((a, b) => a.timestamp - b.timestamp);

    return memories;
  }

  // Get memories by type (respects workspace mode)
  async getMemoriesByType(type: ContextType, limit?: number): Promise<MemoryEntry[]> {
    const mode = getWorkspaceMode();
    let ids: string[] = [];

    if (mode === WorkspaceMode.GLOBAL) {
      ids = await this.storageClient.smembers(StorageKeys.globalByType(type));
    } else if (mode === WorkspaceMode.ISOLATED) {
      ids = await this.storageClient.smembers(StorageKeys.byType(this.workspaceId, type));
    } else {
      // Hybrid: merge both
      const wsIds = await this.storageClient.smembers(StorageKeys.byType(this.workspaceId, type));
      const globalIds = await this.storageClient.smembers(StorageKeys.globalByType(type));
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
      ids = await this.storageClient.smembers(StorageKeys.globalByTag(tag));
    } else if (mode === WorkspaceMode.ISOLATED) {
      ids = await this.storageClient.smembers(StorageKeys.byTag(this.workspaceId, tag));
    } else {
      // Hybrid: merge both
      const wsIds = await this.storageClient.smembers(StorageKeys.byTag(this.workspaceId, tag));
      const globalIds = await this.storageClient.smembers(StorageKeys.globalByTag(tag));
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
      results = await this.storageClient.zrevrangebyscore(
        StorageKeys.globalImportant(),
        10,
        minImportance,
        {
        offset: 0,
        count: limit || 100}
      );
    } else if (mode === WorkspaceMode.ISOLATED) {
      results = await this.storageClient.zrevrangebyscore(
        StorageKeys.important(this.workspaceId),
        10,
        minImportance,
        {
        offset: 0,
        count: limit || 100}
      );
    } else {
      // Hybrid: get from both and merge
      const wsResults = await this.storageClient.zrevrangebyscore(
        StorageKeys.important(this.workspaceId),
        10,
        minImportance,
        {
        offset: 0,
        count: limit || 100}
      );
      const globalResults = await this.storageClient.zrevrangebyscore(
        StorageKeys.globalImportant(),
        10,
        minImportance,
        {
        offset: 0,
        count: limit || 100}
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

    // Create version before updating (v1.5.0)
    await this.createVersion(existing, 'user', 'Memory updated');

    const pipeline = this.storageClient.pipeline();

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
      ? StorageKeys.globalMemory(id)
      : StorageKeys.memory(this.workspaceId, id);

    pipeline.hset(memoryKey, this.serializeMemory(updated));

    // Update type index if changed
    if (updates.context_type && updates.context_type !== existing.context_type) {
      if (isGlobal) {
        pipeline.srem(StorageKeys.globalByType(existing.context_type), id);
        pipeline.sadd(StorageKeys.globalByType(updates.context_type), id);
      } else {
        pipeline.srem(StorageKeys.byType(this.workspaceId, existing.context_type), id);
        pipeline.sadd(StorageKeys.byType(this.workspaceId, updates.context_type), id);
      }
    }

    // Update tag indexes if changed
    if (updates.tags) {
      // Remove from old tags
      for (const tag of existing.tags) {
        if (!updates.tags.includes(tag)) {
          if (isGlobal) {
            pipeline.srem(StorageKeys.globalByTag(tag), id);
          } else {
            pipeline.srem(StorageKeys.byTag(this.workspaceId, tag), id);
          }
        }
      }
      // Add to new tags
      for (const tag of updates.tags) {
        if (!existing.tags.includes(tag)) {
          if (isGlobal) {
            pipeline.sadd(StorageKeys.globalByTag(tag), id);
          } else {
            pipeline.sadd(StorageKeys.byTag(this.workspaceId, tag), id);
          }
        }
      }
    }

    // Update importance index if changed
    if (updates.importance !== undefined) {
      if (existing.importance >= 8) {
        if (isGlobal) {
          pipeline.zrem(StorageKeys.globalImportant(), id);
        } else {
          pipeline.zrem(StorageKeys.important(this.workspaceId), id);
        }
      }
      if (updates.importance >= 8) {
        if (isGlobal) {
          pipeline.zadd(StorageKeys.globalImportant(), updates.importance, id);
        } else {
          pipeline.zadd(StorageKeys.important(this.workspaceId), updates.importance, id);
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

    const pipeline = this.storageClient.pipeline();
    const isGlobal = memory.is_global;

    // Remove from all indexes (use appropriate keys based on is_global)
    if (isGlobal) {
      pipeline.del(StorageKeys.globalMemory(id));
      pipeline.srem(StorageKeys.globalMemories(), id);
      pipeline.zrem(StorageKeys.globalTimeline(), id);
      pipeline.srem(StorageKeys.globalByType(memory.context_type), id);

      for (const tag of memory.tags) {
        pipeline.srem(StorageKeys.globalByTag(tag), id);
      }

      if (memory.importance >= 8) {
        pipeline.zrem(StorageKeys.globalImportant(), id);
      }
    } else {
      pipeline.del(StorageKeys.memory(this.workspaceId, id));
      pipeline.srem(StorageKeys.memories(this.workspaceId), id);
      pipeline.zrem(StorageKeys.timeline(this.workspaceId), id);
      pipeline.srem(StorageKeys.byType(this.workspaceId, memory.context_type), id);

      for (const tag of memory.tags) {
        pipeline.srem(StorageKeys.byTag(this.workspaceId, tag), id);
      }

      if (memory.importance >= 8) {
        pipeline.zrem(StorageKeys.important(this.workspaceId), id);
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
    contextTypes?: ContextType[],
    category?: string,
    fuzzy: boolean = false,
    regex?: string
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
        const sets = contextTypes.map(type => StorageKeys.globalByType(type));
        ids = await this.storageClient.sunion(...sets);
      } else {
        ids = await this.storageClient.smembers(StorageKeys.globalMemories());
      }
      memories = await this.getMemories(ids);
    } else if (mode === WorkspaceMode.ISOLATED) {
      // Isolated mode: only workspace memories
      let ids: string[];
      if (contextTypes && contextTypes.length > 0) {
        const sets = contextTypes.map(type => StorageKeys.byType(this.workspaceId, type));
        ids = await this.storageClient.sunion(...sets);
      } else {
        ids = await this.storageClient.smembers(StorageKeys.memories(this.workspaceId));
      }
      memories = await this.getMemories(ids);
    } else {
      // Hybrid mode: merge workspace + global
      let wsIds: string[];
      let globalIds: string[];

      if (contextTypes && contextTypes.length > 0) {
        const wsSets = contextTypes.map(type => StorageKeys.byType(this.workspaceId, type));
        const globalSets = contextTypes.map(type => StorageKeys.globalByType(type));
        wsIds = await this.storageClient.sunion(...wsSets);
        globalIds = await this.storageClient.sunion(...globalSets);
      } else {
        wsIds = await this.storageClient.smembers(StorageKeys.memories(this.workspaceId));
        globalIds = await this.storageClient.smembers(StorageKeys.globalMemories());
      }
      
      memories = await this.getMemories([...wsIds, ...globalIds]);
    }

    // Filter by importance if specified
    let filtered = memories;
    if (minImportance !== undefined) {
      filtered = memories.filter(m => m.importance >= minImportance);
    }

    // Filter by category if specified (v1.5.0)
    if (category) {
      filtered = filtered.filter(m => m.category === category);
    }

    // Apply regex filter if specified (v1.5.0)
    if (regex) {
      try {
        const regexPattern = new RegExp(regex, 'i');
        filtered = filtered.filter(m => regexPattern.test(m.content));
      } catch (error) {
        // Invalid regex, skip filtering
        console.error('Invalid regex pattern:', error);
      }
    }

    // Calculate similarities
    const withSimilarity = filtered.map(memory => {
      let baseSimilarity = memory.embedding ? cosineSimilarity(queryEmbedding, memory.embedding) : 0;

      // Fuzzy search boost (v1.5.0) - boost exact word matches
      if (fuzzy) {
        const queryWords = query.toLowerCase().split(/\s+/);
        const contentWords = memory.content.toLowerCase().split(/\s+/);
        const matchCount = queryWords.filter(qw => contentWords.some(cw => cw.includes(qw))).length;
        const fuzzyBoost = (matchCount / queryWords.length) * 0.2; // Up to 20% boost
        baseSimilarity = Math.min(1, baseSimilarity + fuzzyBoost);
      }

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
      const exists = await this.storageClient.exists(StorageKeys.memory(this.workspaceId, id));
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
    await this.storageClient.hset(StorageKeys.session(this.workspaceId, sessionId), {
      session_id: sessionId,
      session_name: name,
      created_at: timestamp.toString(),
      memory_count: validIds.length.toString(),
      summary: summary || '',
      memory_ids: JSON.stringify(validIds),
    });

    await this.storageClient.sadd(StorageKeys.sessions(this.workspaceId), sessionId);

    return session;
  }

  // Get session
  async getSession(sessionId: string): Promise<SessionInfo | null> {
    const data = await this.storageClient.hgetall(StorageKeys.session(this.workspaceId, sessionId));

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
    const ids = await this.storageClient.smembers(StorageKeys.sessions(this.workspaceId));
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
    const totalMemories = await this.storageClient.scard(StorageKeys.memories(this.workspaceId));
    const totalSessions = await this.storageClient.scard(StorageKeys.sessions(this.workspaceId));
    const importantCount = await this.storageClient.zcard(StorageKeys.important(this.workspaceId));

    const byType: Record<string, number> = {};
    const types: ContextType[] = ['directive', 'information', 'heading', 'decision', 'code_pattern', 'requirement', 'error', 'todo', 'insight', 'preference'];

    for (const type of types) {
      byType[type] = await this.storageClient.scard(StorageKeys.byType(this.workspaceId, type));
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
      category: memory.category || '', // v1.5.0
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
      category: data.category || undefined, // v1.5.0
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

    const pipeline = this.storageClient.pipeline();

    // Delete from workspace indexes
    pipeline.del(StorageKeys.memory(this.workspaceId, memoryId));
    pipeline.srem(StorageKeys.memories(this.workspaceId), memoryId);
    pipeline.zrem(StorageKeys.timeline(this.workspaceId), memoryId);
    pipeline.srem(StorageKeys.byType(this.workspaceId, memory.context_type), memoryId);

    for (const tag of memory.tags) {
      pipeline.srem(StorageKeys.byTag(this.workspaceId, tag), memoryId);
    }

    if (memory.importance >= 8) {
      pipeline.zrem(StorageKeys.important(this.workspaceId), memoryId);
    }

    // Update memory to global
    const globalMemory: MemoryEntry = {
      ...memory,
      is_global: true,
      workspace_id: '',
    };

    // Add to global indexes
    pipeline.hset(StorageKeys.globalMemory(memoryId), this.serializeMemory(globalMemory));
    pipeline.sadd(StorageKeys.globalMemories(), memoryId);
    pipeline.zadd(StorageKeys.globalTimeline(), memory.timestamp, memoryId);
    pipeline.sadd(StorageKeys.globalByType(memory.context_type), memoryId);

    for (const tag of memory.tags) {
      pipeline.sadd(StorageKeys.globalByTag(tag), memoryId);
    }

    if (memory.importance >= 8) {
      pipeline.zadd(StorageKeys.globalImportant(), memory.importance, memoryId);
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
    const pipeline = this.storageClient.pipeline();

    // Delete from global indexes
    pipeline.del(StorageKeys.globalMemory(memoryId));
    pipeline.srem(StorageKeys.globalMemories(), memoryId);
    pipeline.zrem(StorageKeys.globalTimeline(), memoryId);
    pipeline.srem(StorageKeys.globalByType(memory.context_type), memoryId);

    for (const tag of memory.tags) {
      pipeline.srem(StorageKeys.globalByTag(tag), memoryId);
    }

    if (memory.importance >= 8) {
      pipeline.zrem(StorageKeys.globalImportant(), memoryId);
    }

    // Update memory to workspace-specific
    const workspaceMemory: MemoryEntry = {
      ...memory,
      is_global: false,
      workspace_id: workspaceId,
    };

    // Add to workspace indexes
    pipeline.hset(StorageKeys.memory(workspaceId, memoryId), this.serializeMemory(workspaceMemory));
    pipeline.sadd(StorageKeys.memories(workspaceId), memoryId);
    pipeline.zadd(StorageKeys.timeline(workspaceId), memory.timestamp, memoryId);
    pipeline.sadd(StorageKeys.byType(workspaceId, memory.context_type), memoryId);

    for (const tag of memory.tags) {
      pipeline.sadd(StorageKeys.byTag(workspaceId, tag), memoryId);
    }

    if (memory.importance >= 8) {
      pipeline.zadd(StorageKeys.important(workspaceId), memory.importance, memoryId);
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

    const pipeline = this.storageClient.pipeline();

    if (isGlobal) {
      pipeline.hset(StorageKeys.globalRelationship(id), this.serializeRelationship(relationship));
      pipeline.sadd(StorageKeys.globalRelationships(), id);
      pipeline.sadd(StorageKeys.globalMemoryRelationships(fromMemoryId), id);
      pipeline.sadd(StorageKeys.globalMemoryRelationshipsOut(fromMemoryId), id);
      pipeline.sadd(StorageKeys.globalMemoryRelationshipsIn(toMemoryId), id);
    } else {
      pipeline.hset(StorageKeys.relationship(this.workspaceId, id), this.serializeRelationship(relationship));
      pipeline.sadd(StorageKeys.relationships(this.workspaceId), id);
      pipeline.sadd(StorageKeys.memoryRelationships(this.workspaceId, fromMemoryId), id);
      pipeline.sadd(StorageKeys.memoryRelationshipsOut(this.workspaceId, fromMemoryId), id);
      pipeline.sadd(StorageKeys.memoryRelationshipsIn(this.workspaceId, toMemoryId), id);
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
    const wsData = await this.storageClient.hgetall(StorageKeys.relationship(this.workspaceId, relationshipId));
    if (wsData && Object.keys(wsData).length > 0) {
      return this.deserializeRelationship(wsData);
    }

    // Try global
    const globalData = await this.storageClient.hgetall(StorageKeys.globalRelationship(relationshipId));
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
      const keyIds = await this.storageClient.smembers(key);
      keyIds.forEach(id => ids.add(id));
    };

    // Workspace relationships
    if (mode === WorkspaceMode.ISOLATED || mode === WorkspaceMode.HYBRID) {
      if (direction === 'outgoing' || direction === 'both') {
        await addIds(StorageKeys.memoryRelationshipsOut(this.workspaceId, memoryId));
      }
      if (direction === 'incoming' || direction === 'both') {
        await addIds(StorageKeys.memoryRelationshipsIn(this.workspaceId, memoryId));
      }
    }

    // Global relationships
    if (mode === WorkspaceMode.GLOBAL || mode === WorkspaceMode.HYBRID) {
      if (direction === 'outgoing' || direction === 'both') {
        await addIds(StorageKeys.globalMemoryRelationshipsOut(memoryId));
      }
      if (direction === 'incoming' || direction === 'both') {
        await addIds(StorageKeys.globalMemoryRelationshipsIn(memoryId));
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

    const pipeline = this.storageClient.pipeline();

    if (isGlobal) {
      pipeline.del(StorageKeys.globalRelationship(relationshipId));
      pipeline.srem(StorageKeys.globalRelationships(), relationshipId);
      pipeline.srem(StorageKeys.globalMemoryRelationships(relationship.from_memory_id), relationshipId);
      pipeline.srem(StorageKeys.globalMemoryRelationshipsOut(relationship.from_memory_id), relationshipId);
      pipeline.srem(StorageKeys.globalMemoryRelationshipsIn(relationship.to_memory_id), relationshipId);
    } else {
      pipeline.del(StorageKeys.relationship(this.workspaceId, relationshipId));
      pipeline.srem(StorageKeys.relationships(this.workspaceId), relationshipId);
      pipeline.srem(StorageKeys.memoryRelationships(this.workspaceId, relationship.from_memory_id), relationshipId);
      pipeline.srem(StorageKeys.memoryRelationshipsOut(this.workspaceId, relationship.from_memory_id), relationshipId);
      pipeline.srem(StorageKeys.memoryRelationshipsIn(this.workspaceId, relationship.to_memory_id), relationshipId);
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

  // ============================================================================
  // Memory Versioning & History (v1.5.0)
  // ============================================================================
  private serializeVersion(version: MemoryVersion): Record<string, string> {
    return {
      version_id: version.version_id,
      memory_id: version.memory_id,
      content: version.content,
      context_type: version.context_type,
      importance: version.importance.toString(),
      tags: JSON.stringify(version.tags),
      summary: version.summary || '',
      created_at: version.created_at,
      created_by: version.created_by,
      change_reason: version.change_reason || '',
    };
  }



  private async createVersion(
    memory: MemoryEntry,
    createdBy: 'user' | 'system' = 'user',
    changeReason?: string
  ): Promise<string> {
    const versionId = ulid();
    const version: import('../types.js').MemoryVersion = {
      version_id: versionId,
      memory_id: memory.id,
      content: memory.content,
      context_type: memory.context_type,
      importance: memory.importance,
      tags: memory.tags,
      summary: memory.summary,
      created_at: new Date().toISOString(),
      created_by: createdBy,
      change_reason: changeReason,
    };

    const isGlobal = memory.is_global;
    const timestamp = Date.now();

    // Store version and add to sorted set
    const pipeline = this.storageClient.pipeline();

    if (isGlobal) {
      pipeline.hset(
        StorageKeys.globalMemoryVersion(memory.id, versionId),
        this.serializeVersion(version)
      );
      pipeline.zadd(StorageKeys.globalMemoryVersions(memory.id), timestamp, versionId);
    } else {
      pipeline.hset(
        StorageKeys.memoryVersion(this.workspaceId, memory.id, versionId),
        this.serializeVersion(version)
      );
      pipeline.zadd(StorageKeys.memoryVersions(this.workspaceId, memory.id), timestamp, versionId);
    }

    // Enforce version limit (keep 50 most recent)
    const versionsKey = isGlobal
      ? StorageKeys.globalMemoryVersions(memory.id)
      : StorageKeys.memoryVersions(this.workspaceId, memory.id);

    pipeline.zremrangebyrank(versionsKey, 0, -51); // Keep last 50

    await pipeline.exec();

    return versionId;
  }

  async getMemoryHistory(memoryId: string, limit: number = 50): Promise<import('../types.js').MemoryVersion[]> {
    const memory = await this.getMemory(memoryId);
    if (!memory) {
      return [];
    }

    const isGlobal = memory.is_global;
    const versionsKey = isGlobal
      ? StorageKeys.globalMemoryVersions(memoryId)
      : StorageKeys.memoryVersions(this.workspaceId, memoryId);

    // Get version IDs (most recent first)
    const versionIds = await this.storageClient.zrevrange(versionsKey, 0, limit - 1);

    if (versionIds.length === 0) {
      return [];
    }

    // Fetch all versions
    const versions: import('../types.js').MemoryVersion[] = [];
    for (const versionId of versionIds) {
      const versionKey = isGlobal
        ? StorageKeys.globalMemoryVersion(memoryId, versionId)
        : StorageKeys.memoryVersion(this.workspaceId, memoryId, versionId);

      const versionData = await this.storageClient.hgetall(versionKey);
      if (versionData && Object.keys(versionData).length > 0) {
        versions.push({
          version_id: versionData.version_id,
          memory_id: versionData.memory_id,
          content: versionData.content,
          context_type: versionData.context_type as import('../types.js').ContextType,
          importance: parseInt(versionData.importance, 10),
          tags: versionData.tags ? JSON.parse(versionData.tags) : [],
          summary: versionData.summary,
          created_at: versionData.created_at,
          created_by: versionData.created_by as 'user' | 'system',
          change_reason: versionData.change_reason,
        });
      }
    }

    return versions;
  }

  async rollbackMemory(
    memoryId: string,
    versionId: string,
    preserveRelationships: boolean = true
  ): Promise<MemoryEntry | null> {
    const memory = await this.getMemory(memoryId);
    if (!memory) {
      throw new Error('Memory not found');
    }

    // Get the target version
    const isGlobal = memory.is_global;
    const versionKey = isGlobal
      ? StorageKeys.globalMemoryVersion(memoryId, versionId)
      : StorageKeys.memoryVersion(this.workspaceId, memoryId, versionId);

    const versionData = await this.storageClient.hgetall(versionKey);
    if (!versionData || Object.keys(versionData).length === 0) {
      throw new Error('Version not found');
    }

    // Save current state as a version before rollback
    await this.createVersion(memory, 'system', `Before rollback to version ${versionId}`);

    // Prepare rollback updates
    const updates = {
      content: versionData.content,
      context_type: versionData.context_type as import('../types.js').ContextType,
      importance: parseInt(versionData.importance, 10),
      tags: versionData.tags ? JSON.parse(versionData.tags) : [],
      summary: versionData.summary,
    };

    // Update the memory
    const rolledBackMemory = await this.updateMemory(memoryId, updates);

    if (rolledBackMemory) {
      // Create a new version recording the rollback
      await this.createVersion(rolledBackMemory, 'system', `Rolled back to version ${versionId}`);
    }

    return rolledBackMemory;
  }

  // Helper: Serialize template for Redis/Valkey
  private serializeTemplate(template: import('../types.js').MemoryTemplate): Record<string, string> {
    return {
      template_id: template.template_id,
      name: template.name,
      description: template.description || '',
      context_type: template.context_type,
      content_template: template.content_template,
      default_tags: JSON.stringify(template.default_tags),
      default_importance: template.default_importance.toString(),
      is_builtin: template.is_builtin ? 'true' : 'false',
      created_at: template.created_at,
    };
  }

  // ============================================================================
  // Memory Templates (v1.5.0)
  // ============================================================================

   

  async createTemplate(data: import('../types.js').CreateTemplate): Promise<import('../types.js').MemoryTemplate> {
    const templateId = ulid();
    const template: import('../types.js').MemoryTemplate = {
      template_id: templateId,
      name: data.name,
      description: data.description,
      context_type: data.context_type,
      content_template: data.content_template,
      default_tags: data.default_tags,
      default_importance: data.default_importance ?? 5, // Ensure a default value
      is_builtin: false,
      created_at: new Date().toISOString(),
    };

    const pipeline = this.storageClient.pipeline();
    pipeline.hset(StorageKeys.template(this.workspaceId, templateId), this.serializeTemplate(template));
    pipeline.sadd(StorageKeys.templates(this.workspaceId), templateId);
    await pipeline.exec();

    return template;
  }

  async getTemplate(templateId: string): Promise<import('../types.js').MemoryTemplate | null> {
    // Check workspace templates first
    let templateData = await this.storageClient.hgetall(StorageKeys.template(this.workspaceId, templateId));

    // Check builtin templates if not found
    if (!templateData || Object.keys(templateData).length === 0) {
      templateData = await this.storageClient.hgetall(StorageKeys.builtinTemplate(templateId));
    }

    if (!templateData || Object.keys(templateData).length === 0) {
      return null;
    }

    return {
      template_id: templateData.template_id,
      name: templateData.name,
      description: templateData.description,
      context_type: templateData.context_type as import('../types.js').ContextType,
      content_template: templateData.content_template,
      default_tags: templateData.default_tags ? JSON.parse(templateData.default_tags) : [],
      default_importance: parseInt(templateData.default_importance, 10),
      is_builtin: templateData.is_builtin === 'true',
      created_at: templateData.created_at,
    };
  }

  async getAllTemplates(): Promise<import('../types.js').MemoryTemplate[]> {
    const workspaceIds = await this.storageClient.smembers(StorageKeys.templates(this.workspaceId));
    const builtinIds = await this.storageClient.smembers(StorageKeys.builtinTemplates());

    const allIds = [...new Set([...workspaceIds, ...builtinIds])];
    const templates: import('../types.js').MemoryTemplate[] = [];

    for (const id of allIds) {
      const template = await this.getTemplate(id);
      if (template) {
        templates.push(template);
      }
    }

    return templates;
  }

  async createFromTemplate(
    templateId: string,
    variables: Record<string, string>,
    additionalTags?: string[],
    customImportance?: number,
    isGlobal: boolean = false
  ): Promise<MemoryEntry> {
    const template = await this.getTemplate(templateId);
    if (!template) {
      throw new Error('Template not found');
    }

    // Replace variables in content template
    let content = template.content_template;
    for (const [key, value] of Object.entries(variables)) {
      content = content.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }

    // Check for unreplaced variables
    const unreplacedVars = content.match(/{{(\w+)}}/g);
    if (unreplacedVars) {
      throw new Error(`Missing variables: ${unreplacedVars.join(', ')}`);
    }

    // Create memory from template
    const memoryData: import('../types.js').CreateMemory = {
      content,
      context_type: template.context_type,
      tags: [...template.default_tags, ...(additionalTags || [])],
      importance: customImportance !== undefined ? customImportance : template.default_importance,
      is_global: isGlobal,
    };

    return this.createMemory(memoryData);
  }

  async deleteTemplate(templateId: string): Promise<boolean> {
    const template = await this.getTemplate(templateId);
    if (!template) {
      return false;
    }

    if (template.is_builtin) {
      throw new Error('Cannot delete builtin templates');
    }

    const pipeline = this.storageClient.pipeline();
    pipeline.del(StorageKeys.template(this.workspaceId, templateId));
    pipeline.srem(StorageKeys.templates(this.workspaceId), templateId);
    await pipeline.exec();

    return true;
  }

  // ============================================================================
  // Memory Categories (v1.5.0)
  // ============================================================================

  async setMemoryCategory(memoryId: string, category: string): Promise<MemoryEntry | null> {
    const memory = await this.getMemory(memoryId);
    if (!memory) {
      return null;
    }

    const isGlobal = memory.is_global;
    const categoryKey = isGlobal
      ? StorageKeys.globalMemoryCategory(memoryId)
      : StorageKeys.memoryCategory(this.workspaceId, memoryId);
    const categorySetKey = isGlobal
      ? StorageKeys.globalCategory(category)
      : StorageKeys.category(this.workspaceId, category);
    const categoriesKey = isGlobal ? StorageKeys.globalCategories() : StorageKeys.categories(this.workspaceId);

    // Remove from old category if exists
    const oldCategory = await this.storageClient.get(categoryKey);
    if (oldCategory) {
      const oldCategorySetKey = isGlobal
        ? StorageKeys.globalCategory(oldCategory)
        : StorageKeys.category(this.workspaceId, oldCategory);
      await this.storageClient.srem(oldCategorySetKey, memoryId);
    }

    const pipeline = this.storageClient.pipeline();

    // Set new category
    pipeline.set(categoryKey, category);
    pipeline.sadd(categorySetKey, memoryId);
    pipeline.zadd(categoriesKey, Date.now(), category); // Track last used

    await pipeline.exec();

    // Update memory object
    memory.category = category;

    // Also update the memory hash to include category
    const memoryKey = isGlobal ? StorageKeys.globalMemory(memoryId) : StorageKeys.memory(this.workspaceId, memoryId);
    await this.storageClient.hset(memoryKey, {'category': category});

    return memory;
  }

  async getMemoriesByCategory(category: string): Promise<MemoryEntry[]> {
    const mode = getWorkspaceMode();
    const memoryIds: string[] = [];

    if (mode === WorkspaceMode.ISOLATED || mode === WorkspaceMode.HYBRID) {
      const workspaceIds = await this.storageClient.smembers(StorageKeys.category(this.workspaceId, category));
      memoryIds.push(...workspaceIds);
    }

    if (mode === WorkspaceMode.GLOBAL || mode === WorkspaceMode.HYBRID) {
      const globalIds = await this.storageClient.smembers(StorageKeys.globalCategory(category));
      memoryIds.push(...globalIds);
    }
    return this.getMemories(memoryIds);
  }

  async getAllCategories(): Promise<import('../types.js').CategoryInfo[]> {
    const mode = getWorkspaceMode();
    const categoryNames: string[] = [];

    if (mode === WorkspaceMode.ISOLATED || mode === WorkspaceMode.HYBRID) {
      const workspaceCategories = await this.storageClient.zrange(StorageKeys.categories(this.workspaceId), 0, -1);
      categoryNames.push(...workspaceCategories);
    }

    if (mode === WorkspaceMode.GLOBAL || mode === WorkspaceMode.HYBRID) {
      const globalCategories = await this.storageClient.zrange(StorageKeys.globalCategories(), 0, -1);
      categoryNames.push(...globalCategories);
    }

    // Deduplicate
    const uniqueCategories = [...new Set(categoryNames)];

    const categories: import('../types.js').CategoryInfo[] = [];
    for (const category of uniqueCategories) {
      const memories = await this.getMemoriesByCategory(category);
      const lastUsed = await this.storageClient.zscore(
        mode === WorkspaceMode.GLOBAL
          ? StorageKeys.globalCategories()
          : StorageKeys.categories(this.workspaceId),
        category
      );

      categories.push({
        category,
        memory_count: memories.length,
        created_at: new Date(parseInt(lastUsed || '0', 10)).toISOString(),
        last_used: new Date(parseInt(lastUsed || '0', 10)).toISOString(),
      });
    }

    return categories;
  }

  // ============================================================================
  // RLM Execution Chains (v1.8.0)
  // Recursive Language Model support for handling large contexts
  // Based on MIT CSAIL paper: arxiv:2512.24601
  // ============================================================================

  /**
   * Create a new execution context for processing large contexts
   */
  async createExecutionContext(
    task: string,
    context: string,
    maxDepth: number = 3,
    parentChainId?: string
  ): Promise<import('../types.js').ExecutionContext> {
    const { RLMStorageKeys } = await import('../types.js');
    const chainId = ulid();
    const timestamp = Date.now();

    // Estimate token count (rough approximation: 4 chars per token)
    const estimatedTokens = Math.ceil(context.length / 4);

    // Auto-detect recommended strategy based on context characteristics
    const strategy = this.detectDecompositionStrategy(context, task, estimatedTokens);

    const executionContext: import('../types.js').ExecutionContext = {
      chain_id: chainId,
      parent_chain_id: parentChainId,
      depth: parentChainId ? (await this.getExecutionContext(parentChainId))?.depth ?? 0 + 1 : 0,
      status: 'active',
      original_task: task,
      context_ref: `context:${chainId}`,
      strategy,
      estimated_tokens: estimatedTokens,
      created_at: timestamp,
      updated_at: timestamp,
    };

    // Store execution context metadata
    const pipeline = this.storageClient.pipeline();

    pipeline.hset(RLMStorageKeys.execution(this.workspaceId, chainId), {
      chain_id: chainId,
      parent_chain_id: parentChainId || '',
      depth: executionContext.depth.toString(),
      status: executionContext.status,
      original_task: task,
      context_ref: executionContext.context_ref,
      strategy: strategy || '',
      estimated_tokens: estimatedTokens.toString(),
      created_at: timestamp.toString(),
      updated_at: timestamp.toString(),
    });

    // Store the large context separately
    pipeline.set(RLMStorageKeys.executionContext(this.workspaceId, chainId), context);

    // Add to active executions set
    pipeline.sadd(RLMStorageKeys.executionActive(this.workspaceId), chainId);
    pipeline.sadd(RLMStorageKeys.executions(this.workspaceId), chainId);

    await pipeline.exec();

    console.error(`[MemoryStore] Created execution chain ${chainId}, ~${estimatedTokens} tokens, strategy: ${strategy}`);

    return executionContext;
  }

  /**
   * Auto-detect the best decomposition strategy based on content
   */
  private detectDecompositionStrategy(
    context: string,
    task: string,
    estimatedTokens: number
  ): import('../types.js').DecompositionStrategy {
    const taskLower = task.toLowerCase();

    // Filter strategy: Task mentions specific patterns/keywords
    if (
      taskLower.includes('find') ||
      taskLower.includes('search') ||
      taskLower.includes('extract') ||
      taskLower.includes('error') ||
      taskLower.includes('warning')
    ) {
      return 'filter';
    }

    // Aggregate strategy: Task mentions combining/summarizing
    if (
      taskLower.includes('summarize') ||
      taskLower.includes('combine') ||
      taskLower.includes('aggregate') ||
      taskLower.includes('overview')
    ) {
      return 'aggregate';
    }

    // Recursive strategy: Very large context or complex analysis
    if (estimatedTokens > 50000 || taskLower.includes('analyze')) {
      return 'recursive';
    }

    // Default: Chunk for sequential processing
    return 'chunk';
  }

  /**
   * Get an execution context by chain ID
   */
  async getExecutionContext(chainId: string): Promise<import('../types.js').ExecutionContext | null> {
    const { RLMStorageKeys } = await import('../types.js');
    const data = await this.storageClient.hgetall(RLMStorageKeys.execution(this.workspaceId, chainId));

    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    return {
      chain_id: data.chain_id,
      parent_chain_id: data.parent_chain_id || undefined,
      depth: parseInt(data.depth, 10),
      status: data.status as import('../types.js').ExecutionStatus,
      original_task: data.original_task,
      context_ref: data.context_ref,
      strategy: data.strategy as import('../types.js').DecompositionStrategy || undefined,
      estimated_tokens: data.estimated_tokens ? parseInt(data.estimated_tokens, 10) : undefined,
      created_at: parseInt(data.created_at, 10),
      updated_at: parseInt(data.updated_at, 10),
      completed_at: data.completed_at ? parseInt(data.completed_at, 10) : undefined,
      error_message: data.error_message || undefined,
    };
  }

  /**
   * Update execution context status
   */
  async updateExecutionContext(
    chainId: string,
    updates: Partial<Pick<import('../types.js').ExecutionContext, 'status' | 'error_message'>>
  ): Promise<import('../types.js').ExecutionContext | null> {
    const { RLMStorageKeys } = await import('../types.js');
    const context = await this.getExecutionContext(chainId);

    if (!context) {
      return null;
    }

    const timestamp = Date.now();
    const updateData: Record<string, string> = {
      updated_at: timestamp.toString(),
    };

    if (updates.status) {
      updateData.status = updates.status;
      if (updates.status === 'completed' || updates.status === 'failed') {
        updateData.completed_at = timestamp.toString();
        // Remove from active set
        await this.storageClient.srem(RLMStorageKeys.executionActive(this.workspaceId), chainId);
      }
    }

    if (updates.error_message) {
      updateData.error_message = updates.error_message;
    }

    await this.storageClient.hset(RLMStorageKeys.execution(this.workspaceId, chainId), updateData);

    return {
      ...context,
      ...updates,
      updated_at: timestamp,
      completed_at: updates.status === 'completed' || updates.status === 'failed' ? timestamp : context.completed_at,
    };
  }

  /**
   * Create a subtask for an execution chain
   */
  async createSubtask(
    chainId: string,
    description: string,
    order: number,
    query?: string
  ): Promise<import('../types.js').Subtask> {
    const { RLMStorageKeys } = await import('../types.js');
    const subtaskId = ulid();
    const timestamp = Date.now();

    const subtask: import('../types.js').Subtask = {
      id: subtaskId,
      chain_id: chainId,
      order,
      description,
      status: 'pending',
      query,
      memory_ids: [],
      created_at: timestamp,
    };

    const pipeline = this.storageClient.pipeline();

    // Store subtask
    pipeline.hset(RLMStorageKeys.executionSubtask(this.workspaceId, chainId, subtaskId), {
      id: subtaskId,
      chain_id: chainId,
      order: order.toString(),
      description,
      status: 'pending',
      query: query || '',
      memory_ids: JSON.stringify([]),
      created_at: timestamp.toString(),
    });

    // Add to subtasks sorted set (ordered by 'order' field)
    pipeline.zadd(RLMStorageKeys.executionSubtasks(this.workspaceId, chainId), order, subtaskId);

    await pipeline.exec();

    return subtask;
  }

  /**
   * Create multiple subtasks at once
   */
  async createSubtasks(
    chainId: string,
    subtasks: Array<{ description: string; query?: string }>
  ): Promise<import('../types.js').Subtask[]> {
    const results: import('../types.js').Subtask[] = [];

    for (let i = 0; i < subtasks.length; i++) {
      const subtask = await this.createSubtask(chainId, subtasks[i].description, i, subtasks[i].query);
      results.push(subtask);
    }

    return results;
  }

  /**
   * Get a subtask by ID
   */
  async getSubtask(chainId: string, subtaskId: string): Promise<import('../types.js').Subtask | null> {
    const { RLMStorageKeys } = await import('../types.js');
    const data = await this.storageClient.hgetall(
      RLMStorageKeys.executionSubtask(this.workspaceId, chainId, subtaskId)
    );

    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    return {
      id: data.id,
      chain_id: data.chain_id,
      order: parseInt(data.order, 10),
      description: data.description,
      status: data.status as import('../types.js').SubtaskStatus,
      query: data.query || undefined,
      result: data.result || undefined,
      memory_ids: data.memory_ids ? JSON.parse(data.memory_ids) : [],
      tokens_used: data.tokens_used ? parseInt(data.tokens_used, 10) : undefined,
      created_at: parseInt(data.created_at, 10),
      completed_at: data.completed_at ? parseInt(data.completed_at, 10) : undefined,
    };
  }

  /**
   * Get all subtasks for an execution chain
   */
  async getSubtasks(chainId: string): Promise<import('../types.js').Subtask[]> {
    const { RLMStorageKeys } = await import('../types.js');
    const subtaskIds = await this.storageClient.zrange(
      RLMStorageKeys.executionSubtasks(this.workspaceId, chainId),
      0,
      -1
    );

    const subtasks: import('../types.js').Subtask[] = [];
    for (const subtaskId of subtaskIds) {
      const subtask = await this.getSubtask(chainId, subtaskId);
      if (subtask) {
        subtasks.push(subtask);
      }
    }

    return subtasks;
  }

  /**
   * Update a subtask with result
   */
  async updateSubtaskResult(
    chainId: string,
    subtaskId: string,
    result: string,
    status: import('../types.js').SubtaskStatus = 'completed',
    tokensUsed?: number,
    memoryIds?: string[]
  ): Promise<import('../types.js').Subtask | null> {
    const { RLMStorageKeys } = await import('../types.js');
    const subtask = await this.getSubtask(chainId, subtaskId);

    if (!subtask) {
      return null;
    }

    const timestamp = Date.now();
    const updateData: Record<string, string> = {
      result,
      status,
      completed_at: timestamp.toString(),
    };

    if (tokensUsed !== undefined) {
      updateData.tokens_used = tokensUsed.toString();
    }

    if (memoryIds) {
      updateData.memory_ids = JSON.stringify(memoryIds);
    }

    await this.storageClient.hset(
      RLMStorageKeys.executionSubtask(this.workspaceId, chainId, subtaskId),
      updateData
    );

    return {
      ...subtask,
      result,
      status,
      tokens_used: tokensUsed,
      memory_ids: memoryIds || subtask.memory_ids,
      completed_at: timestamp,
    };
  }

  /**
   * Get the stored context for an execution chain
   */
  async getExecutionContextData(chainId: string): Promise<string | null> {
    const { RLMStorageKeys } = await import('../types.js');
    return this.storageClient.get(RLMStorageKeys.executionContext(this.workspaceId, chainId));
  }

  /**
   * Extract a snippet from the stored context based on query
   * Uses simple pattern matching and windowing
   */
  async getContextSnippet(
    chainId: string,
    query: string,
    maxTokens: number = 4000
  ): Promise<import('../types.js').ContextSnippet | null> {
    const context = await this.getExecutionContextData(chainId);

    if (!context) {
      return null;
    }

    // Calculate max characters (rough: 4 chars per token)
    const maxChars = maxTokens * 4;

    // If query contains a regex pattern (e.g., ERROR|WARN), use it
    let matches: string[] = [];
    let relevanceScore = 0;

    try {
      const regexPattern = new RegExp(query, 'gi');
      const lines = context.split('\n');
      const matchingLines: string[] = [];

      for (const line of lines) {
        if (regexPattern.test(line)) {
          matchingLines.push(line);
        }
      }

      matches = matchingLines;
      relevanceScore = matchingLines.length / lines.length;
    } catch {
      // Not a valid regex, do simple text search
      const queryLower = query.toLowerCase();
      const lines = context.split('\n');
      const matchingLines = lines.filter(line => line.toLowerCase().includes(queryLower));
      matches = matchingLines;
      relevanceScore = matchingLines.length / lines.length;
    }

    // Build snippet from matches, respecting token limit
    let snippet = '';
    for (const match of matches) {
      if (snippet.length + match.length + 1 > maxChars) {
        break;
      }
      snippet += match + '\n';
    }

    // If no matches, return a chunked portion of the context
    if (snippet.length === 0) {
      snippet = context.substring(0, maxChars);
      relevanceScore = 0.1; // Low relevance for fallback
    }

    const tokensUsed = Math.ceil(snippet.length / 4);

    return {
      snippet: snippet.trim(),
      relevance_score: relevanceScore,
      tokens_used: tokensUsed,
    };
  }

  /**
   * Get execution chain summary with progress
   */
  async getExecutionChainSummary(chainId: string): Promise<import('../types.js').ExecutionChainSummary | null> {
    const context = await this.getExecutionContext(chainId);

    if (!context) {
      return null;
    }

    const subtasks = await this.getSubtasks(chainId);

    const progress = {
      total: subtasks.length,
      completed: subtasks.filter(s => s.status === 'completed').length,
      failed: subtasks.filter(s => s.status === 'failed').length,
      pending: subtasks.filter(s => s.status === 'pending').length,
      in_progress: subtasks.filter(s => s.status === 'in_progress').length,
    };

    // Estimate remaining tokens
    const completedTokens = subtasks
      .filter(s => s.status === 'completed' && s.tokens_used)
      .reduce((sum, s) => sum + (s.tokens_used || 0), 0);

    const avgTokensPerSubtask = progress.completed > 0 ? completedTokens / progress.completed : 4000;
    const estimatedRemainingTokens = (progress.pending + progress.in_progress) * avgTokensPerSubtask;

    return {
      context,
      subtasks,
      progress,
      estimated_remaining_tokens: Math.ceil(estimatedRemainingTokens),
    };
  }

  /**
   * Store merged results for an execution chain
   */
  async storeMergedResults(
    chainId: string,
    results: import('../types.js').MergedResults
  ): Promise<void> {
    const { RLMStorageKeys } = await import('../types.js');

    await this.storageClient.hset(RLMStorageKeys.executionResults(this.workspaceId, chainId), {
      aggregated_result: results.aggregated_result,
      confidence: results.confidence.toString(),
      source_coverage: results.source_coverage.toString(),
      subtasks_completed: results.subtasks_completed.toString(),
      subtasks_total: results.subtasks_total.toString(),
    });
  }

  /**
   * Get merged results for an execution chain
   */
  async getMergedResults(chainId: string): Promise<import('../types.js').MergedResults | null> {
    const { RLMStorageKeys } = await import('../types.js');
    const data = await this.storageClient.hgetall(RLMStorageKeys.executionResults(this.workspaceId, chainId));

    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    return {
      aggregated_result: data.aggregated_result,
      confidence: parseFloat(data.confidence),
      source_coverage: parseFloat(data.source_coverage),
      subtasks_completed: parseInt(data.subtasks_completed, 10),
      subtasks_total: parseInt(data.subtasks_total, 10),
    };
  }

  /**
   * List all execution chains (optionally filtered by status)
   */
  async listExecutionChains(
    status?: import('../types.js').ExecutionStatus,
    limit: number = 20
  ): Promise<import('../types.js').ExecutionContext[]> {
    const { RLMStorageKeys } = await import('../types.js');

    // Get chain IDs based on status filter
    let chainIds: string[];
    if (status === 'active') {
      chainIds = await this.storageClient.smembers(RLMStorageKeys.executionActive(this.workspaceId));
    } else {
      chainIds = await this.storageClient.smembers(RLMStorageKeys.executions(this.workspaceId));
    }

    const chains: import('../types.js').ExecutionContext[] = [];
    for (const chainId of chainIds.slice(0, limit)) {
      const chain = await this.getExecutionContext(chainId);
      if (chain && (!status || chain.status === status)) {
        chains.push(chain);
      }
    }

    // Sort by created_at descending
    chains.sort((a, b) => b.created_at - a.created_at);

    return chains;
  }

  /**
   * Delete an execution chain and all its data
   */
  async deleteExecutionChain(chainId: string): Promise<boolean> {
    const { RLMStorageKeys } = await import('../types.js');
    const context = await this.getExecutionContext(chainId);

    if (!context) {
      return false;
    }

    // Get all subtask IDs
    const subtaskIds = await this.storageClient.zrange(
      RLMStorageKeys.executionSubtasks(this.workspaceId, chainId),
      0,
      -1
    );

    const pipeline = this.storageClient.pipeline();

    // Delete all subtasks
    for (const subtaskId of subtaskIds) {
      pipeline.del(RLMStorageKeys.executionSubtask(this.workspaceId, chainId, subtaskId));
    }

    // Delete subtasks sorted set
    pipeline.del(RLMStorageKeys.executionSubtasks(this.workspaceId, chainId));

    // Delete context data
    pipeline.del(RLMStorageKeys.executionContext(this.workspaceId, chainId));

    // Delete results
    pipeline.del(RLMStorageKeys.executionResults(this.workspaceId, chainId));

    // Delete execution metadata
    pipeline.del(RLMStorageKeys.execution(this.workspaceId, chainId));

    // Remove from sets
    pipeline.srem(RLMStorageKeys.executions(this.workspaceId), chainId);
    pipeline.srem(RLMStorageKeys.executionActive(this.workspaceId), chainId);

    await pipeline.exec();

    return true;
  }
}
