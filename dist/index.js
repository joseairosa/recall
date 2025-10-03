#!/usr/bin/env node

// src/index.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

// src/redis/client.ts
import Redis from "ioredis";
var redisClient = null;
function getRedisClient() {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2e3);
        return delay;
      },
      reconnectOnError(err) {
        const targetError = "READONLY";
        if (err.message.includes(targetError)) {
          return true;
        }
        return false;
      }
    });
    redisClient.on("error", (err) => {
      console.error("Redis Client Error:", err);
    });
    redisClient.on("connect", () => {
      console.error("Redis Client Connected");
    });
    redisClient.on("ready", () => {
      console.error("Redis Client Ready");
    });
  }
  return redisClient;
}
async function closeRedisClient() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
async function checkRedisConnection() {
  try {
    const client = getRedisClient();
    const result = await client.ping();
    return result === "PONG";
  } catch (error) {
    console.error("Redis connection check failed:", error);
    return false;
  }
}

// src/tools/index.ts
import { z as z3 } from "zod";
import { McpError as McpError2, ErrorCode as ErrorCode2 } from "@modelcontextprotocol/sdk/types.js";

// src/redis/memory-store.ts
import { ulid } from "ulid";

// src/embeddings/generator.ts
import Anthropic from "@anthropic-ai/sdk";
var anthropicClient = null;
function getAnthropicClient() {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required");
    }
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}
async function generateSemanticFingerprint(text) {
  try {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: "claude-3-5-haiku-20241022",
      // Fast, cheap model for this task
      max_tokens: 200,
      messages: [{
        role: "user",
        content: `Extract 5-10 key concepts/keywords from this text. Return ONLY a comma-separated list, no explanations:

${text}`
      }]
    });
    const content = response.content[0];
    if (content.type === "text") {
      const keywords = content.text.split(",").map((k) => k.trim().toLowerCase()).filter((k) => k.length > 0);
      return keywords;
    }
    return [];
  } catch (error) {
    console.error("Error generating semantic fingerprint:", error);
    throw error;
  }
}
async function generateEmbedding(text) {
  try {
    const keywords = await generateSemanticFingerprint(text);
    const vector = createSimpleVector(text, keywords);
    return vector;
  } catch (error) {
    console.error("Error generating embedding:", error);
    throw error;
  }
}
function createSimpleVector(text, keywords) {
  const VECTOR_SIZE = 128;
  const vector = new Array(VECTOR_SIZE).fill(0);
  const normalized = text.toLowerCase();
  const trigrams = extractTrigrams(normalized);
  for (let i = 0; i < Math.min(trigrams.length, 64); i++) {
    const hash = simpleHash(trigrams[i]);
    const index = hash % 64;
    vector[index] += 1;
  }
  for (const keyword of keywords) {
    const hash = simpleHash(keyword);
    const index = 64 + hash % 64;
    vector[index] += 2;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < vector.length; i++) {
      vector[i] /= magnitude;
    }
  }
  return vector;
}
function extractTrigrams(text) {
  const trigrams = [];
  for (let i = 0; i < text.length - 2; i++) {
    trigrams.push(text.substring(i, i + 3));
  }
  return trigrams;
}
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}
function cosineSimilarity(a, b) {
  if (a.length !== b.length) {
    throw new Error("Vectors must have the same length");
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// src/types.ts
import { z } from "zod";
var ContextType = z.enum([
  "directive",
  // Instructions or commands
  "information",
  // General facts or knowledge
  "heading",
  // Section headers or organizational markers
  "decision",
  // Decisions made during work
  "code_pattern",
  // Code patterns or conventions
  "requirement",
  // Project requirements
  "error",
  // Error encountered and solution
  "todo",
  // Task or todo item
  "insight",
  // Key insight or realization
  "preference"
  // User preference
]);
var MemoryEntrySchema = z.object({
  id: z.string().describe("ULID identifier"),
  timestamp: z.number().describe("Unix timestamp in milliseconds"),
  context_type: ContextType,
  content: z.string().describe("The actual memory content"),
  summary: z.string().optional().describe("Short summary for quick scanning"),
  tags: z.array(z.string()).default([]).describe("Tags for categorization"),
  importance: z.number().min(1).max(10).default(5).describe("Importance score 1-10"),
  session_id: z.string().optional().describe("Optional session grouping"),
  embedding: z.array(z.number()).optional().describe("Vector embedding"),
  ttl_seconds: z.number().optional().describe("Time-to-live in seconds (auto-expires)"),
  expires_at: z.number().optional().describe("Unix timestamp when memory expires"),
  is_global: z.boolean().default(false).describe("If true, memory is accessible across all workspaces"),
  workspace_id: z.string().describe("Workspace identifier (empty for global memories)")
});
var CreateMemorySchema = z.object({
  content: z.string().min(1).describe("The memory content to store"),
  context_type: ContextType.default("information"),
  tags: z.array(z.string()).default([]).describe("Tags for categorization"),
  importance: z.number().min(1).max(10).default(5).describe("Importance score 1-10"),
  summary: z.string().optional().describe("Optional summary"),
  session_id: z.string().optional().describe("Optional session ID"),
  ttl_seconds: z.number().min(60).optional().describe("Time-to-live in seconds (minimum 60s)"),
  is_global: z.boolean().default(false).describe("If true, memory is accessible across all workspaces")
});
var BatchCreateMemoriesSchema = z.object({
  memories: z.array(CreateMemorySchema).min(1).describe("Array of memories to store")
});
var UpdateMemorySchema = z.object({
  memory_id: z.string().describe("ULID of memory to update"),
  content: z.string().optional(),
  context_type: ContextType.optional(),
  tags: z.array(z.string()).optional(),
  importance: z.number().min(1).max(10).optional(),
  summary: z.string().optional(),
  session_id: z.string().optional()
});
var DeleteMemorySchema = z.object({
  memory_id: z.string().describe("ULID of memory to delete")
});
var SearchMemorySchema = z.object({
  query: z.string().describe("Search query"),
  limit: z.number().min(1).max(100).default(10).describe("Number of results"),
  min_importance: z.number().min(1).max(10).optional().describe("Filter by minimum importance"),
  context_types: z.array(ContextType).optional().describe("Filter by context types")
});
var OrganizeSessionSchema = z.object({
  session_name: z.string().describe("Name for the session"),
  memory_ids: z.array(z.string()).min(1).describe("Array of memory IDs to include"),
  summary: z.string().optional().describe("Optional session summary")
});
function createWorkspaceId(path) {
  let hash = 0;
  for (let i = 0; i < path.length; i++) {
    const char = path.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}
function getWorkspaceMode() {
  const mode = process.env.WORKSPACE_MODE?.toLowerCase();
  switch (mode) {
    case "global":
      return "global" /* GLOBAL */;
    case "hybrid":
      return "hybrid" /* HYBRID */;
    case "isolated":
    default:
      return "isolated" /* ISOLATED */;
  }
}
var RecallContextSchema = z.object({
  current_task: z.string().describe("Description of what I'm currently working on"),
  query: z.string().optional().describe("Optional specific search query"),
  limit: z.number().min(1).max(20).default(5).describe("Number of results to return"),
  min_importance: z.number().min(1).max(10).default(6).describe("Minimum importance threshold")
});
var AnalyzeConversationSchema = z.object({
  conversation_text: z.string().min(1).describe("Conversation text to analyze and extract memories from"),
  auto_categorize: z.boolean().default(true).describe("Automatically categorize extracted memories"),
  auto_store: z.boolean().default(true).describe("Automatically store extracted memories")
});
var SummarizeSessionSchema = z.object({
  session_name: z.string().optional().describe("Optional name for the session"),
  auto_create_snapshot: z.boolean().default(true).describe("Automatically create session snapshot"),
  lookback_minutes: z.number().default(60).describe("How many minutes back to look for memories")
});
var ExportMemoriesSchema = z.object({
  format: z.enum(["json"]).default("json").describe("Export format"),
  include_embeddings: z.boolean().default(false).describe("Include vector embeddings in export"),
  filter_by_type: z.array(ContextType).optional().describe("Only export specific types"),
  min_importance: z.number().min(1).max(10).optional().describe("Only export above this importance")
});
var ImportMemoriesSchema = z.object({
  data: z.string().describe("JSON string of exported memories"),
  overwrite_existing: z.boolean().default(false).describe("Overwrite if memory ID already exists"),
  regenerate_embeddings: z.boolean().default(true).describe("Regenerate embeddings on import")
});
var FindDuplicatesSchema = z.object({
  similarity_threshold: z.number().min(0).max(1).default(0.85).describe("Similarity threshold (0-1)"),
  auto_merge: z.boolean().default(false).describe("Automatically merge duplicates"),
  keep_highest_importance: z.boolean().default(true).describe("When merging, keep highest importance")
});
var ConsolidateMemoriesSchema = z.object({
  memory_ids: z.array(z.string()).min(2).describe("Array of memory IDs to consolidate"),
  keep_id: z.string().optional().describe("Optional ID of memory to keep (default: highest importance)")
});
var RedisKeys = {
  // Workspace-scoped keys
  memory: (workspace, id) => `ws:${workspace}:memory:${id}`,
  memories: (workspace) => `ws:${workspace}:memories:all`,
  byType: (workspace, type) => `ws:${workspace}:memories:type:${type}`,
  byTag: (workspace, tag) => `ws:${workspace}:memories:tag:${tag}`,
  timeline: (workspace) => `ws:${workspace}:memories:timeline`,
  session: (workspace, id) => `ws:${workspace}:session:${id}`,
  sessions: (workspace) => `ws:${workspace}:sessions:all`,
  important: (workspace) => `ws:${workspace}:memories:important`,
  // Global keys (workspace-independent)
  globalMemory: (id) => `global:memory:${id}`,
  globalMemories: () => `global:memories:all`,
  globalByType: (type) => `global:memories:type:${type}`,
  globalByTag: (tag) => `global:memories:tag:${tag}`,
  globalTimeline: () => `global:memories:timeline`,
  globalImportant: () => `global:memories:important`
};
var ConvertToGlobalSchema = z.object({
  memory_id: z.string().describe("ID of the memory to convert to global")
});
var ConvertToWorkspaceSchema = z.object({
  memory_id: z.string().describe("ID of the global memory to convert to workspace-specific"),
  workspace_id: z.string().optional().describe("Target workspace (default: current workspace)")
});

// src/redis/memory-store.ts
var MemoryStore = class {
  redis;
  workspaceId;
  workspacePath;
  constructor(workspacePath) {
    this.redis = getRedisClient();
    this.workspacePath = workspacePath || process.cwd();
    this.workspaceId = createWorkspaceId(this.workspacePath);
    console.error(`[MemoryStore] Workspace: ${this.workspacePath}`);
    console.error(`[MemoryStore] Workspace ID: ${this.workspaceId}`);
  }
  // Store a new memory
  async createMemory(data) {
    const id = ulid();
    const timestamp = Date.now();
    const embedding = await generateEmbedding(data.content);
    const summary = data.summary || this.generateSummary(data.content);
    let expiresAt;
    if (data.ttl_seconds) {
      expiresAt = timestamp + data.ttl_seconds * 1e3;
    }
    const isGlobal = data.is_global || false;
    const memory = {
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
      workspace_id: isGlobal ? "" : this.workspaceId
    };
    const pipeline = this.redis.pipeline();
    const memoryKey = isGlobal ? RedisKeys.globalMemory(id) : RedisKeys.memory(this.workspaceId, id);
    pipeline.hset(memoryKey, this.serializeMemory(memory));
    if (data.ttl_seconds) {
      pipeline.expire(memoryKey, data.ttl_seconds);
    }
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
  async createMemories(memories) {
    const results = [];
    for (const memoryData of memories) {
      const memory = await this.createMemory(memoryData);
      results.push(memory);
    }
    return results;
  }
  // Get memory by ID (checks both workspace and global)
  async getMemory(id, isGlobal) {
    if (isGlobal === true) {
      const globalData2 = await this.redis.hgetall(RedisKeys.globalMemory(id));
      if (globalData2 && Object.keys(globalData2).length > 0) {
        return this.deserializeMemory(globalData2);
      }
      return null;
    }
    if (isGlobal === false) {
      const wsData2 = await this.redis.hgetall(RedisKeys.memory(this.workspaceId, id));
      if (wsData2 && Object.keys(wsData2).length > 0) {
        return this.deserializeMemory(wsData2);
      }
      return null;
    }
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
  async getMemories(ids) {
    const memories = [];
    for (const id of ids) {
      const memory = await this.getMemory(id);
      if (memory) {
        memories.push(memory);
      }
    }
    return memories;
  }
  // Get recent memories (respects workspace mode)
  async getRecentMemories(limit = 50) {
    const mode = getWorkspaceMode();
    if (mode === "global" /* GLOBAL */) {
      const ids = await this.redis.zrevrange(RedisKeys.globalTimeline(), 0, limit - 1);
      return this.getMemories(ids);
    } else if (mode === "isolated" /* ISOLATED */) {
      const ids = await this.redis.zrevrange(RedisKeys.timeline(this.workspaceId), 0, limit - 1);
      return this.getMemories(ids);
    } else {
      const wsIds = await this.redis.zrevrange(RedisKeys.timeline(this.workspaceId), 0, limit - 1);
      const globalIds = await this.redis.zrevrange(RedisKeys.globalTimeline(), 0, limit - 1);
      const allMemories = await this.getMemories([...wsIds, ...globalIds]);
      allMemories.sort((a, b) => b.timestamp - a.timestamp);
      return allMemories.slice(0, limit);
    }
  }
  // Get memories by type (respects workspace mode)
  async getMemoriesByType(type, limit) {
    const mode = getWorkspaceMode();
    let ids = [];
    if (mode === "global" /* GLOBAL */) {
      ids = await this.redis.smembers(RedisKeys.globalByType(type));
    } else if (mode === "isolated" /* ISOLATED */) {
      ids = await this.redis.smembers(RedisKeys.byType(this.workspaceId, type));
    } else {
      const wsIds = await this.redis.smembers(RedisKeys.byType(this.workspaceId, type));
      const globalIds = await this.redis.smembers(RedisKeys.globalByType(type));
      ids = [.../* @__PURE__ */ new Set([...wsIds, ...globalIds])];
    }
    const memories = await this.getMemories(ids);
    memories.sort((a, b) => b.timestamp - a.timestamp);
    return limit ? memories.slice(0, limit) : memories;
  }
  // Get memories by tag (respects workspace mode)
  async getMemoriesByTag(tag, limit) {
    const mode = getWorkspaceMode();
    let ids = [];
    if (mode === "global" /* GLOBAL */) {
      ids = await this.redis.smembers(RedisKeys.globalByTag(tag));
    } else if (mode === "isolated" /* ISOLATED */) {
      ids = await this.redis.smembers(RedisKeys.byTag(this.workspaceId, tag));
    } else {
      const wsIds = await this.redis.smembers(RedisKeys.byTag(this.workspaceId, tag));
      const globalIds = await this.redis.smembers(RedisKeys.globalByTag(tag));
      ids = [.../* @__PURE__ */ new Set([...wsIds, ...globalIds])];
    }
    const memories = await this.getMemories(ids);
    memories.sort((a, b) => b.timestamp - a.timestamp);
    return limit ? memories.slice(0, limit) : memories;
  }
  // Get important memories (respects workspace mode)
  async getImportantMemories(minImportance = 8, limit) {
    const mode = getWorkspaceMode();
    let results = [];
    if (mode === "global" /* GLOBAL */) {
      results = await this.redis.zrevrangebyscore(
        RedisKeys.globalImportant(),
        10,
        minImportance,
        "LIMIT",
        0,
        limit || 100
      );
    } else if (mode === "isolated" /* ISOLATED */) {
      results = await this.redis.zrevrangebyscore(
        RedisKeys.important(this.workspaceId),
        10,
        minImportance,
        "LIMIT",
        0,
        limit || 100
      );
    } else {
      const wsResults = await this.redis.zrevrangebyscore(
        RedisKeys.important(this.workspaceId),
        10,
        minImportance,
        "LIMIT",
        0,
        limit || 100
      );
      const globalResults = await this.redis.zrevrangebyscore(
        RedisKeys.globalImportant(),
        10,
        minImportance,
        "LIMIT",
        0,
        limit || 100
      );
      const allMemories = await this.getMemories([...wsResults, ...globalResults]);
      allMemories.sort((a, b) => b.importance - a.importance);
      return allMemories.slice(0, limit || 100);
    }
    return this.getMemories(results);
  }
  // Update memory (handles both workspace and global)
  async updateMemory(id, updates) {
    const existing = await this.getMemory(id);
    if (!existing) {
      return null;
    }
    const pipeline = this.redis.pipeline();
    let embedding = existing.embedding;
    if (updates.content && updates.content !== existing.content) {
      embedding = await generateEmbedding(updates.content);
    }
    const updated = {
      ...existing,
      ...updates,
      embedding,
      summary: updates.summary || (updates.content ? this.generateSummary(updates.content) : existing.summary)
    };
    const isGlobal = existing.is_global;
    const memoryKey = isGlobal ? RedisKeys.globalMemory(id) : RedisKeys.memory(this.workspaceId, id);
    pipeline.hset(memoryKey, this.serializeMemory(updated));
    if (updates.context_type && updates.context_type !== existing.context_type) {
      if (isGlobal) {
        pipeline.srem(RedisKeys.globalByType(existing.context_type), id);
        pipeline.sadd(RedisKeys.globalByType(updates.context_type), id);
      } else {
        pipeline.srem(RedisKeys.byType(this.workspaceId, existing.context_type), id);
        pipeline.sadd(RedisKeys.byType(this.workspaceId, updates.context_type), id);
      }
    }
    if (updates.tags) {
      for (const tag of existing.tags) {
        if (!updates.tags.includes(tag)) {
          if (isGlobal) {
            pipeline.srem(RedisKeys.globalByTag(tag), id);
          } else {
            pipeline.srem(RedisKeys.byTag(this.workspaceId, tag), id);
          }
        }
      }
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
    if (updates.importance !== void 0) {
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
  async deleteMemory(id) {
    const memory = await this.getMemory(id);
    if (!memory) {
      return false;
    }
    const pipeline = this.redis.pipeline();
    const isGlobal = memory.is_global;
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
  async searchMemories(query, limit = 10, minImportance, contextTypes) {
    const queryEmbedding = await generateEmbedding(query);
    const mode = getWorkspaceMode();
    let memories = [];
    if (mode === "global" /* GLOBAL */) {
      let ids;
      if (contextTypes && contextTypes.length > 0) {
        const sets = contextTypes.map((type) => RedisKeys.globalByType(type));
        ids = await this.redis.sunion(...sets);
      } else {
        ids = await this.redis.smembers(RedisKeys.globalMemories());
      }
      memories = await this.getMemories(ids);
    } else if (mode === "isolated" /* ISOLATED */) {
      let ids;
      if (contextTypes && contextTypes.length > 0) {
        const sets = contextTypes.map((type) => RedisKeys.byType(this.workspaceId, type));
        ids = await this.redis.sunion(...sets);
      } else {
        ids = await this.redis.smembers(RedisKeys.memories(this.workspaceId));
      }
      memories = await this.getMemories(ids);
    } else {
      let wsIds;
      let globalIds;
      if (contextTypes && contextTypes.length > 0) {
        const wsSets = contextTypes.map((type) => RedisKeys.byType(this.workspaceId, type));
        const globalSets = contextTypes.map((type) => RedisKeys.globalByType(type));
        wsIds = await this.redis.sunion(...wsSets);
        globalIds = await this.redis.sunion(...globalSets);
      } else {
        wsIds = await this.redis.smembers(RedisKeys.memories(this.workspaceId));
        globalIds = await this.redis.smembers(RedisKeys.globalMemories());
      }
      memories = await this.getMemories([...wsIds, ...globalIds]);
    }
    let filtered = memories;
    if (minImportance !== void 0) {
      filtered = memories.filter((m) => m.importance >= minImportance);
    }
    const withSimilarity = filtered.map((memory) => {
      const baseSimilarity = memory.embedding ? cosineSimilarity(queryEmbedding, memory.embedding) : 0;
      const similarity = mode === "hybrid" /* HYBRID */ && memory.is_global ? baseSimilarity * 0.9 : baseSimilarity;
      return {
        ...memory,
        similarity
      };
    });
    withSimilarity.sort((a, b) => b.similarity - a.similarity);
    return withSimilarity.slice(0, limit);
  }
  // Create session
  async createSession(name, memoryIds, summary) {
    const sessionId = ulid();
    const timestamp = Date.now();
    const validIds = [];
    for (const id of memoryIds) {
      const exists = await this.redis.exists(RedisKeys.memory(this.workspaceId, id));
      if (exists) {
        validIds.push(id);
      }
    }
    const session = {
      session_id: sessionId,
      session_name: name,
      created_at: timestamp,
      memory_count: validIds.length,
      summary,
      memory_ids: validIds
    };
    await this.redis.hset(RedisKeys.session(this.workspaceId, sessionId), {
      session_id: sessionId,
      session_name: name,
      created_at: timestamp.toString(),
      memory_count: validIds.length.toString(),
      summary: summary || "",
      memory_ids: JSON.stringify(validIds)
    });
    await this.redis.sadd(RedisKeys.sessions(this.workspaceId), sessionId);
    return session;
  }
  // Get session
  async getSession(sessionId) {
    const data = await this.redis.hgetall(RedisKeys.session(this.workspaceId, sessionId));
    if (!data || Object.keys(data).length === 0) {
      return null;
    }
    return {
      session_id: data.session_id,
      session_name: data.session_name,
      created_at: parseInt(data.created_at, 10),
      memory_count: parseInt(data.memory_count, 10),
      summary: data.summary || void 0,
      memory_ids: JSON.parse(data.memory_ids)
    };
  }
  // Get all sessions
  async getAllSessions() {
    const ids = await this.redis.smembers(RedisKeys.sessions(this.workspaceId));
    const sessions = [];
    for (const id of ids) {
      const session = await this.getSession(id);
      if (session) {
        sessions.push(session);
      }
    }
    return sessions.sort((a, b) => b.created_at - a.created_at);
  }
  // Get memories in session
  async getSessionMemories(sessionId) {
    const session = await this.getSession(sessionId);
    if (!session) {
      return [];
    }
    return this.getMemories(session.memory_ids);
  }
  // Generate summary stats
  async getSummaryStats() {
    const totalMemories = await this.redis.scard(RedisKeys.memories(this.workspaceId));
    const totalSessions = await this.redis.scard(RedisKeys.sessions(this.workspaceId));
    const importantCount = await this.redis.zcard(RedisKeys.important(this.workspaceId));
    const byType = {};
    const types = ["directive", "information", "heading", "decision", "code_pattern", "requirement", "error", "todo", "insight", "preference"];
    for (const type of types) {
      byType[type] = await this.redis.scard(RedisKeys.byType(this.workspaceId, type));
    }
    return {
      total_memories: totalMemories,
      by_type: byType,
      total_sessions: totalSessions,
      important_count: importantCount,
      workspace_path: this.workspacePath
    };
  }
  // Merge multiple memories into one
  async mergeMemories(memoryIds, keepId) {
    const memories = await this.getMemories(memoryIds);
    if (memories.length === 0) {
      return null;
    }
    const toKeep = keepId ? memories.find((m) => m.id === keepId) : memories.reduce(
      (prev, current) => current.importance > prev.importance ? current : prev
    );
    if (!toKeep) {
      return null;
    }
    const allTags = /* @__PURE__ */ new Set();
    const contentParts = [];
    for (const memory of memories) {
      if (memory.id !== toKeep.id) {
        contentParts.push(memory.content);
      }
      memory.tags.forEach((tag) => allTags.add(tag));
    }
    const mergedContent = contentParts.length > 0 ? `${toKeep.content}

--- Merged content ---
${contentParts.join("\n\n")}` : toKeep.content;
    const updated = await this.updateMemory(toKeep.id, {
      content: mergedContent,
      tags: Array.from(allTags),
      importance: Math.max(...memories.map((m) => m.importance))
    });
    for (const memory of memories) {
      if (memory.id !== toKeep.id) {
        await this.deleteMemory(memory.id);
      }
    }
    return updated;
  }
  // Helper: Generate summary from content (first 100 chars)
  generateSummary(content) {
    return content.length > 100 ? content.substring(0, 100) + "..." : content;
  }
  // Helper: Serialize memory for Redis
  serializeMemory(memory) {
    return {
      id: memory.id,
      timestamp: memory.timestamp.toString(),
      context_type: memory.context_type,
      content: memory.content,
      summary: memory.summary || "",
      tags: JSON.stringify(memory.tags),
      importance: memory.importance.toString(),
      session_id: memory.session_id || "",
      embedding: JSON.stringify(memory.embedding || []),
      ttl_seconds: memory.ttl_seconds?.toString() || "",
      expires_at: memory.expires_at?.toString() || "",
      is_global: memory.is_global ? "true" : "false",
      workspace_id: memory.workspace_id || ""
    };
  }
  // Helper: Deserialize memory from Redis
  deserializeMemory(data) {
    return {
      id: data.id,
      timestamp: parseInt(data.timestamp, 10),
      context_type: data.context_type,
      content: data.content,
      summary: data.summary || void 0,
      tags: JSON.parse(data.tags || "[]"),
      importance: parseInt(data.importance, 10),
      session_id: data.session_id || void 0,
      embedding: JSON.parse(data.embedding || "[]"),
      ttl_seconds: data.ttl_seconds ? parseInt(data.ttl_seconds, 10) : void 0,
      expires_at: data.expires_at ? parseInt(data.expires_at, 10) : void 0,
      is_global: data.is_global === "true",
      workspace_id: data.workspace_id || ""
    };
  }
  // Convert workspace memory to global
  async convertToGlobal(memoryId) {
    const memory = await this.getMemory(memoryId);
    if (!memory) {
      return null;
    }
    if (memory.is_global) {
      return memory;
    }
    const pipeline = this.redis.pipeline();
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
    const globalMemory = {
      ...memory,
      is_global: true,
      workspace_id: ""
    };
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
  async convertToWorkspace(memoryId, targetWorkspaceId) {
    const memory = await this.getMemory(memoryId);
    if (!memory) {
      return null;
    }
    if (!memory.is_global) {
      return memory;
    }
    const workspaceId = targetWorkspaceId || this.workspaceId;
    const pipeline = this.redis.pipeline();
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
    const workspaceMemory = {
      ...memory,
      is_global: false,
      workspace_id: workspaceId
    };
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
};

// src/tools/context-tools.ts
import { z as z2 } from "zod";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

// src/analysis/conversation-analyzer.ts
import Anthropic2 from "@anthropic-ai/sdk";
var ConversationAnalyzer = class {
  client;
  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required");
    }
    this.client = new Anthropic2({ apiKey });
  }
  /**
   * Analyze conversation and extract structured memories
   */
  async analyzeConversation(conversationText) {
    try {
      const response = await this.client.messages.create({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 2e3,
        messages: [{
          role: "user",
          content: `Analyze this conversation and extract important information that should be remembered long-term.

For each important piece of information, output EXACTLY in this JSON format (one per line):
{"content":"the information","type":"directive|information|decision|code_pattern|requirement|error|todo|insight|preference","importance":1-10,"tags":["tag1","tag2"],"summary":"brief summary"}

Guidelines:
- Extract directives (instructions to follow)
- Extract decisions (choices made)
- Extract code_patterns (coding conventions)
- Extract requirements (project specs)
- Extract errors (problems and solutions)
- Extract insights (key realizations)
- Extract preferences (user preferences)
- Importance: 10=critical, 8-9=very important, 6-7=important, 1-5=nice to have
- Tags: relevant keywords for categorization
- Summary: max 50 chars

Conversation:
${conversationText}

Output ONLY the JSON objects, one per line, no other text:`
        }]
      });
      const content = response.content[0];
      if (content.type !== "text") {
        return [];
      }
      const lines = content.text.split("\n").filter((line) => line.trim().startsWith("{"));
      const extracted = [];
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line.trim());
          if (parsed.content && parsed.type && parsed.importance) {
            extracted.push({
              content: parsed.content,
              context_type: this.normalizeContextType(parsed.type),
              importance: Math.min(10, Math.max(1, parseInt(parsed.importance))),
              tags: Array.isArray(parsed.tags) ? parsed.tags : [],
              summary: parsed.summary || void 0
            });
          }
        } catch (e) {
          console.error("Failed to parse line:", line, e);
        }
      }
      return extracted;
    } catch (error) {
      console.error("Error analyzing conversation:", error);
      throw error;
    }
  }
  /**
   * Generate a summary of a session
   */
  async summarizeSession(memories) {
    try {
      const memoriesText = memories.sort((a, b) => b.importance - a.importance).map((m) => `[${m.context_type}] ${m.content}`).join("\n");
      const response = await this.client.messages.create({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 500,
        messages: [{
          role: "user",
          content: `Summarize this work session in 2-3 sentences. Focus on what was accomplished, decided, or learned.

Session memories:
${memoriesText}

Summary (2-3 sentences):`
        }]
      });
      const content = response.content[0];
      if (content.type === "text") {
        return content.text.trim();
      }
      return "Session completed with multiple activities";
    } catch (error) {
      console.error("Error summarizing session:", error);
      return "Session summary unavailable";
    }
  }
  /**
   * Enhance a search query for better semantic matching
   */
  async enhanceQuery(currentTask, query) {
    const combined = query ? `${currentTask} ${query}` : currentTask;
    return combined;
  }
  /**
   * Normalize context type strings from Claude
   */
  normalizeContextType(type) {
    const normalized = type.toLowerCase().trim();
    const mapping = {
      "directive": "directive",
      "instruction": "directive",
      "command": "directive",
      "information": "information",
      "info": "information",
      "fact": "information",
      "heading": "heading",
      "section": "heading",
      "title": "heading",
      "decision": "decision",
      "choice": "decision",
      "code_pattern": "code_pattern",
      "pattern": "code_pattern",
      "convention": "code_pattern",
      "requirement": "requirement",
      "req": "requirement",
      "spec": "requirement",
      "error": "error",
      "bug": "error",
      "issue": "error",
      "todo": "todo",
      "task": "todo",
      "insight": "insight",
      "realization": "insight",
      "learning": "insight",
      "preference": "preference",
      "pref": "preference",
      "setting": "preference"
    };
    return mapping[normalized] || "information";
  }
};

// src/tools/context-tools.ts
var memoryStore = new MemoryStore();
var analyzer = new ConversationAnalyzer();
var recall_relevant_context = {
  description: "Proactively search memory for context relevant to current task. Use this when you need to recall patterns, decisions, or conventions.",
  inputSchema: zodToJsonSchema(RecallContextSchema),
  handler: async (args) => {
    try {
      const enhancedQuery = await analyzer.enhanceQuery(args.current_task, args.query);
      const results = await memoryStore.searchMemories(
        enhancedQuery,
        args.limit,
        args.min_importance
      );
      const formattedResults = results.map((r) => ({
        content: r.content,
        summary: r.summary,
        context_type: r.context_type,
        importance: r.importance,
        tags: r.tags,
        similarity: Math.round(r.similarity * 100) / 100
      }));
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              current_task: args.current_task,
              found: results.length,
              relevant_memories: formattedResults
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to recall context: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
};
var analyze_and_remember = {
  description: "Analyze conversation text and automatically extract and store important information (decisions, patterns, directives, etc.). Use this after important discussions.",
  inputSchema: zodToJsonSchema(AnalyzeConversationSchema),
  handler: async (args) => {
    try {
      const extracted = await analyzer.analyzeConversation(args.conversation_text);
      const result = {
        extracted_memories: extracted,
        total_count: extracted.length
      };
      if (args.auto_store && extracted.length > 0) {
        const memories = await memoryStore.createMemories(
          extracted.map((e) => ({
            content: e.content,
            context_type: e.context_type,
            importance: e.importance,
            tags: e.tags,
            summary: e.summary
          }))
        );
        result.stored_ids = memories.map((m) => m.id);
      }
      const response = {
        success: true,
        analyzed: result.total_count,
        stored: result.stored_ids?.length || 0,
        breakdown: {
          directives: extracted.filter((e) => e.context_type === "directive").length,
          decisions: extracted.filter((e) => e.context_type === "decision").length,
          patterns: extracted.filter((e) => e.context_type === "code_pattern").length,
          requirements: extracted.filter((e) => e.context_type === "requirement").length,
          errors: extracted.filter((e) => e.context_type === "error").length,
          insights: extracted.filter((e) => e.context_type === "insight").length,
          other: extracted.filter((e) => !["directive", "decision", "code_pattern", "requirement", "error", "insight"].includes(e.context_type)).length
        },
        memories: extracted.map((e) => ({
          content: e.content.substring(0, 100) + (e.content.length > 100 ? "..." : ""),
          type: e.context_type,
          importance: e.importance
        }))
      };
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to analyze conversation: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
};
var summarize_session = {
  description: "Summarize the current work session and create a snapshot. Use this at the end of a work session to preserve context.",
  inputSchema: zodToJsonSchema(SummarizeSessionSchema),
  handler: async (args) => {
    try {
      const lookbackMs = args.lookback_minutes * 60 * 1e3;
      const cutoffTime = Date.now() - lookbackMs;
      const allRecent = await memoryStore.getRecentMemories(100);
      const sessionMemories = allRecent.filter((m) => m.timestamp >= cutoffTime);
      if (sessionMemories.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                message: "No memories found in the specified lookback period",
                lookback_minutes: args.lookback_minutes
              }, null, 2)
            }
          ]
        };
      }
      const summary = await analyzer.summarizeSession(
        sessionMemories.map((m) => ({
          content: m.content,
          context_type: m.context_type,
          importance: m.importance
        }))
      );
      let sessionInfo = null;
      if (args.auto_create_snapshot) {
        const sessionName = args.session_name || `Session ${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}`;
        sessionInfo = await memoryStore.createSession(
          sessionName,
          sessionMemories.map((m) => m.id),
          summary
        );
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              summary,
              session_id: sessionInfo?.session_id,
              session_name: sessionInfo?.session_name,
              memory_count: sessionMemories.length,
              lookback_minutes: args.lookback_minutes,
              breakdown: {
                directives: sessionMemories.filter((m) => m.context_type === "directive").length,
                decisions: sessionMemories.filter((m) => m.context_type === "decision").length,
                patterns: sessionMemories.filter((m) => m.context_type === "code_pattern").length,
                insights: sessionMemories.filter((m) => m.context_type === "insight").length
              }
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to summarize session: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
};
function zodToJsonSchema(schema) {
  if (schema instanceof z2.ZodObject) {
    const shape = schema._def.shape();
    const properties = {};
    const required = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchemaInner(value);
      if (!value.isOptional()) {
        required.push(key);
      }
    }
    return {
      type: "object",
      properties,
      required
    };
  }
  return zodToJsonSchemaInner(schema);
}
function zodToJsonSchemaInner(schema) {
  if (schema instanceof z2.ZodString) {
    const result = { type: "string" };
    if (schema.description) result.description = schema.description;
    return result;
  }
  if (schema instanceof z2.ZodNumber) {
    const result = { type: "number" };
    if (schema.description) result.description = schema.description;
    return result;
  }
  if (schema instanceof z2.ZodBoolean) {
    const result = { type: "boolean" };
    if (schema.description) result.description = schema.description;
    return result;
  }
  if (schema instanceof z2.ZodArray) {
    const result = {
      type: "array",
      items: zodToJsonSchemaInner(schema.element)
    };
    if (schema.description) result.description = schema.description;
    return result;
  }
  if (schema instanceof z2.ZodEnum) {
    const result = {
      type: "string",
      enum: schema.options
    };
    if (schema.description) result.description = schema.description;
    return result;
  }
  if (schema instanceof z2.ZodOptional) {
    return zodToJsonSchemaInner(schema.unwrap());
  }
  if (schema instanceof z2.ZodDefault) {
    const inner = zodToJsonSchemaInner(schema._def.innerType);
    inner.default = schema._def.defaultValue();
    return inner;
  }
  if (schema instanceof z2.ZodObject) {
    return zodToJsonSchema(schema);
  }
  return { type: "string" };
}

// src/tools/export-import-tools.ts
async function exportMemories(args, workspacePath) {
  const store = new MemoryStore(workspacePath);
  let memories;
  if (args.filter_by_type && args.filter_by_type.length > 0) {
    const memoriesByType = [];
    for (const type of args.filter_by_type) {
      const typeMemories = await store.getMemoriesByType(type);
      memoriesByType.push(...typeMemories);
    }
    const uniqueMap = /* @__PURE__ */ new Map();
    for (const memory of memoriesByType) {
      uniqueMap.set(memory.id, memory);
    }
    memories = Array.from(uniqueMap.values());
  } else {
    memories = await store.getRecentMemories(1e4);
  }
  if (args.min_importance !== void 0) {
    memories = memories.filter((m) => m.importance >= args.min_importance);
  }
  const exportData = memories.map((memory) => {
    if (!args.include_embeddings) {
      const { embedding, ...rest } = memory;
      return rest;
    }
    return memory;
  });
  const exportObject = {
    version: "1.2.0",
    exported_at: Date.now(),
    memory_count: exportData.length,
    memories: exportData
  };
  const jsonString = JSON.stringify(exportObject, null, 2);
  return {
    content: [
      {
        type: "text",
        text: `Successfully exported ${exportData.length} memories

${jsonString}`
      }
    ]
  };
}
async function importMemories(args, workspacePath) {
  const store = new MemoryStore(workspacePath);
  let importData;
  try {
    importData = JSON.parse(args.data);
  } catch (error) {
    throw new Error(`Invalid JSON data: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
  if (!importData.memories || !Array.isArray(importData.memories)) {
    throw new Error("Invalid import format: missing memories array");
  }
  const results = {
    imported: 0,
    skipped: 0,
    overwritten: 0,
    errors: []
  };
  for (const memoryData of importData.memories) {
    try {
      const existing = await store.getMemory(memoryData.id);
      if (existing && !args.overwrite_existing) {
        results.skipped++;
        continue;
      }
      const createData = {
        content: memoryData.content,
        context_type: memoryData.context_type,
        tags: memoryData.tags || [],
        importance: memoryData.importance || 5,
        summary: memoryData.summary,
        session_id: memoryData.session_id,
        ttl_seconds: memoryData.ttl_seconds
      };
      if (existing && args.overwrite_existing) {
        await store.updateMemory(memoryData.id, createData);
        results.overwritten++;
      } else {
        const importedMemory = {
          id: memoryData.id,
          timestamp: memoryData.timestamp || Date.now(),
          context_type: memoryData.context_type,
          content: memoryData.content,
          summary: memoryData.summary,
          tags: memoryData.tags || [],
          importance: memoryData.importance || 5,
          session_id: memoryData.session_id,
          embedding: args.regenerate_embeddings ? void 0 : memoryData.embedding,
          ttl_seconds: memoryData.ttl_seconds,
          expires_at: memoryData.expires_at
        };
        if (args.regenerate_embeddings) {
          await store.createMemory(createData);
        } else {
          await store.createMemory(createData);
        }
        results.imported++;
      }
    } catch (error) {
      results.errors.push(`Failed to import memory ${memoryData.id}: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
  const summary = [
    `Import completed:`,
    `- Imported: ${results.imported}`,
    `- Overwritten: ${results.overwritten}`,
    `- Skipped: ${results.skipped}`,
    `- Errors: ${results.errors.length}`
  ];
  if (results.errors.length > 0) {
    summary.push("", "Errors:", ...results.errors.slice(0, 10));
    if (results.errors.length > 10) {
      summary.push(`... and ${results.errors.length - 10} more errors`);
    }
  }
  return {
    content: [
      {
        type: "text",
        text: summary.join("\n")
      }
    ]
  };
}
async function findDuplicates(args, workspacePath) {
  const store = new MemoryStore(workspacePath);
  const memories = await store.getRecentMemories(1e4);
  const duplicateGroups = [];
  const processed = /* @__PURE__ */ new Set();
  for (let i = 0; i < memories.length; i++) {
    const memory1 = memories[i];
    if (processed.has(memory1.id)) {
      continue;
    }
    const similarMemories = [memory1];
    let maxSimilarity = 0;
    for (let j = i + 1; j < memories.length; j++) {
      const memory2 = memories[j];
      if (processed.has(memory2.id)) {
        continue;
      }
      if (memory1.embedding && memory2.embedding) {
        const similarity = cosineSimilarity(memory1.embedding, memory2.embedding);
        if (similarity >= args.similarity_threshold) {
          similarMemories.push(memory2);
          maxSimilarity = Math.max(maxSimilarity, similarity);
          processed.add(memory2.id);
        }
      }
    }
    if (similarMemories.length > 1) {
      duplicateGroups.push({
        memories: similarMemories,
        similarity_score: maxSimilarity
      });
      processed.add(memory1.id);
    }
  }
  if (args.auto_merge && duplicateGroups.length > 0) {
    let mergedCount = 0;
    for (const group of duplicateGroups) {
      try {
        const toKeep = args.keep_highest_importance ? group.memories.reduce(
          (prev, current) => current.importance > prev.importance ? current : prev
        ) : group.memories[0];
        const allTags = /* @__PURE__ */ new Set();
        for (const memory of group.memories) {
          memory.tags.forEach((tag) => allTags.add(tag));
        }
        await store.updateMemory(toKeep.id, {
          tags: Array.from(allTags)
        });
        for (const memory of group.memories) {
          if (memory.id !== toKeep.id) {
            await store.deleteMemory(memory.id);
            mergedCount++;
          }
        }
      } catch (error) {
        console.error(`Failed to merge duplicate group: ${error}`);
      }
    }
    return {
      content: [
        {
          type: "text",
          text: `Found ${duplicateGroups.length} duplicate groups and merged ${mergedCount} duplicate memories.`
        }
      ]
    };
  }
  if (duplicateGroups.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: "No duplicate memories found."
        }
      ]
    };
  }
  const report = [
    `Found ${duplicateGroups.length} duplicate groups:
`
  ];
  for (let i = 0; i < duplicateGroups.length; i++) {
    const group = duplicateGroups[i];
    report.push(`Group ${i + 1} (similarity: ${group.similarity_score.toFixed(3)}):`);
    for (const memory of group.memories) {
      report.push(`  - ID: ${memory.id} | Importance: ${memory.importance} | Summary: ${memory.summary || memory.content.substring(0, 50)}`);
    }
    report.push("");
  }
  return {
    content: [
      {
        type: "text",
        text: report.join("\n")
      }
    ]
  };
}
async function consolidateMemories(args, workspacePath) {
  const store = new MemoryStore(workspacePath);
  const result = await store.mergeMemories(args.memory_ids, args.keep_id);
  if (!result) {
    return {
      content: [
        {
          type: "text",
          text: "Failed to consolidate memories. Check that all memory IDs exist."
        }
      ]
    };
  }
  return {
    content: [
      {
        type: "text",
        text: `Successfully consolidated ${args.memory_ids.length} memories into ID: ${result.id}

Merged Memory:
- Content: ${result.summary || result.content.substring(0, 100)}
- Tags: ${result.tags.join(", ")}
- Importance: ${result.importance}`
      }
    ]
  };
}

// src/tools/index.ts
var memoryStore2 = new MemoryStore();
var tools = {
  // Context management tools
  recall_relevant_context,
  analyze_and_remember,
  summarize_session,
  // Export/Import tools
  export_memories: {
    description: "Export memories to JSON format with optional filtering",
    inputSchema: zodToJsonSchema2(ExportMemoriesSchema),
    handler: async (args) => {
      try {
        return await exportMemories(args);
      } catch (error) {
        throw new McpError2(
          ErrorCode2.InternalError,
          `Failed to export memories: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  },
  import_memories: {
    description: "Import memories from JSON export data",
    inputSchema: zodToJsonSchema2(ImportMemoriesSchema),
    handler: async (args) => {
      try {
        return await importMemories(args);
      } catch (error) {
        throw new McpError2(
          ErrorCode2.InternalError,
          `Failed to import memories: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  },
  find_duplicates: {
    description: "Find and optionally merge duplicate memories based on similarity",
    inputSchema: zodToJsonSchema2(FindDuplicatesSchema),
    handler: async (args) => {
      try {
        return await findDuplicates(args);
      } catch (error) {
        throw new McpError2(
          ErrorCode2.InternalError,
          `Failed to find duplicates: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  },
  consolidate_memories: {
    description: "Manually consolidate multiple memories into one",
    inputSchema: zodToJsonSchema2(ConsolidateMemoriesSchema),
    handler: async (args) => {
      try {
        return await consolidateMemories(args);
      } catch (error) {
        throw new McpError2(
          ErrorCode2.InternalError,
          `Failed to consolidate memories: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  },
  // Original memory tools
  store_memory: {
    description: "Store a new memory/context entry for long-term persistence",
    inputSchema: zodToJsonSchema2(CreateMemorySchema),
    handler: async (args) => {
      try {
        const memory = await memoryStore2.createMemory(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                memory_id: memory.id,
                timestamp: memory.timestamp,
                summary: memory.summary
              }, null, 2)
            }
          ]
        };
      } catch (error) {
        throw new McpError2(
          ErrorCode2.InternalError,
          `Failed to store memory: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  },
  store_batch_memories: {
    description: "Store multiple memories in a batch operation",
    inputSchema: zodToJsonSchema2(BatchCreateMemoriesSchema),
    handler: async (args) => {
      try {
        const memories = await memoryStore2.createMemories(args.memories);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                count: memories.length,
                memory_ids: memories.map((m) => m.id)
              }, null, 2)
            }
          ]
        };
      } catch (error) {
        throw new McpError2(
          ErrorCode2.InternalError,
          `Failed to store memories: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  },
  update_memory: {
    description: "Update an existing memory entry",
    inputSchema: zodToJsonSchema2(UpdateMemorySchema),
    handler: async (args) => {
      try {
        const { memory_id, ...updates } = args;
        const memory = await memoryStore2.updateMemory(memory_id, updates);
        if (!memory) {
          throw new McpError2(ErrorCode2.InvalidRequest, `Memory ${memory_id} not found`);
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                memory_id: memory.id,
                updated_at: Date.now()
              }, null, 2)
            }
          ]
        };
      } catch (error) {
        if (error instanceof McpError2) throw error;
        throw new McpError2(
          ErrorCode2.InternalError,
          `Failed to update memory: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  },
  delete_memory: {
    description: "Delete a memory entry",
    inputSchema: zodToJsonSchema2(DeleteMemorySchema),
    handler: async (args) => {
      try {
        const success = await memoryStore2.deleteMemory(args.memory_id);
        if (!success) {
          throw new McpError2(ErrorCode2.InvalidRequest, `Memory ${args.memory_id} not found`);
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                memory_id: args.memory_id,
                deleted_at: Date.now()
              }, null, 2)
            }
          ]
        };
      } catch (error) {
        if (error instanceof McpError2) throw error;
        throw new McpError2(
          ErrorCode2.InternalError,
          `Failed to delete memory: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  },
  search_memories: {
    description: "Search memories using semantic similarity",
    inputSchema: zodToJsonSchema2(SearchMemorySchema),
    handler: async (args) => {
      try {
        const results = await memoryStore2.searchMemories(
          args.query,
          args.limit,
          args.min_importance,
          args.context_types
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                query: args.query,
                count: results.length,
                results: results.map((r) => ({
                  memory_id: r.id,
                  content: r.content,
                  summary: r.summary,
                  context_type: r.context_type,
                  importance: r.importance,
                  tags: r.tags,
                  similarity: r.similarity,
                  timestamp: r.timestamp
                }))
              }, null, 2)
            }
          ]
        };
      } catch (error) {
        throw new McpError2(
          ErrorCode2.InternalError,
          `Failed to search memories: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  },
  organize_session: {
    description: "Create a session snapshot grouping related memories",
    inputSchema: zodToJsonSchema2(OrganizeSessionSchema),
    handler: async (args) => {
      try {
        const session = await memoryStore2.createSession(
          args.session_name,
          args.memory_ids,
          args.summary
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                session_id: session.session_id,
                session_name: session.session_name,
                memory_count: session.memory_count,
                created_at: session.created_at
              }, null, 2)
            }
          ]
        };
      } catch (error) {
        throw new McpError2(
          ErrorCode2.InternalError,
          `Failed to organize session: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  },
  // Global memory conversion tools
  convert_to_global: {
    description: "Convert a workspace-specific memory to global (accessible across all workspaces)",
    inputSchema: zodToJsonSchema2(ConvertToGlobalSchema),
    handler: async (args) => {
      try {
        const result = await memoryStore2.convertToGlobal(args.memory_id);
        if (!result) {
          throw new McpError2(
            ErrorCode2.InvalidRequest,
            `Memory not found: ${args.memory_id}`
          );
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                memory_id: result.id,
                is_global: result.is_global,
                content: result.content,
                message: "Memory converted to global successfully"
              }, null, 2)
            }
          ]
        };
      } catch (error) {
        if (error instanceof McpError2) throw error;
        throw new McpError2(
          ErrorCode2.InternalError,
          `Failed to convert memory to global: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  },
  convert_to_workspace: {
    description: "Convert a global memory to workspace-specific",
    inputSchema: zodToJsonSchema2(ConvertToWorkspaceSchema),
    handler: async (args) => {
      try {
        const result = await memoryStore2.convertToWorkspace(
          args.memory_id,
          args.workspace_id
        );
        if (!result) {
          throw new McpError2(
            ErrorCode2.InvalidRequest,
            `Memory not found: ${args.memory_id}`
          );
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                memory_id: result.id,
                is_global: result.is_global,
                workspace_id: result.workspace_id,
                content: result.content,
                message: "Memory converted to workspace-specific successfully"
              }, null, 2)
            }
          ]
        };
      } catch (error) {
        if (error instanceof McpError2) throw error;
        throw new McpError2(
          ErrorCode2.InternalError,
          `Failed to convert memory to workspace: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }
};
function zodToJsonSchema2(schema) {
  if (schema instanceof z3.ZodObject) {
    const shape = schema._def.shape();
    const properties = {};
    const required = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchemaInner2(value);
      if (!value.isOptional()) {
        required.push(key);
      }
    }
    return {
      type: "object",
      properties,
      required
    };
  }
  return zodToJsonSchemaInner2(schema);
}
function zodToJsonSchemaInner2(schema) {
  if (schema instanceof z3.ZodString) {
    const result = { type: "string" };
    if (schema.description) result.description = schema.description;
    return result;
  }
  if (schema instanceof z3.ZodNumber) {
    const result = { type: "number" };
    if (schema.description) result.description = schema.description;
    return result;
  }
  if (schema instanceof z3.ZodBoolean) {
    const result = { type: "boolean" };
    if (schema.description) result.description = schema.description;
    return result;
  }
  if (schema instanceof z3.ZodArray) {
    const result = {
      type: "array",
      items: zodToJsonSchemaInner2(schema.element)
    };
    if (schema.description) result.description = schema.description;
    return result;
  }
  if (schema instanceof z3.ZodEnum) {
    const result = {
      type: "string",
      enum: schema.options
    };
    if (schema.description) result.description = schema.description;
    return result;
  }
  if (schema instanceof z3.ZodOptional) {
    return zodToJsonSchemaInner2(schema.unwrap());
  }
  if (schema instanceof z3.ZodDefault) {
    const inner = zodToJsonSchemaInner2(schema._def.innerType);
    inner.default = schema._def.defaultValue();
    return inner;
  }
  if (schema instanceof z3.ZodObject) {
    return zodToJsonSchema2(schema);
  }
  return { type: "string" };
}

// src/resources/index.ts
import { McpError as McpError3, ErrorCode as ErrorCode3 } from "@modelcontextprotocol/sdk/types.js";

// src/resources/analytics.ts
async function getAnalytics(workspacePath) {
  const store = new MemoryStore(workspacePath);
  const stats = await store.getSummaryStats();
  const recentMemories = await store.getRecentMemories(1e3);
  const now = Date.now();
  const day24h = now - 24 * 60 * 60 * 1e3;
  const day7d = now - 7 * 24 * 60 * 60 * 1e3;
  const day30d = now - 30 * 24 * 60 * 60 * 1e3;
  const memories24h = recentMemories.filter((m) => m.timestamp >= day24h);
  const memories7d = recentMemories.filter((m) => m.timestamp >= day7d);
  const memories30d = recentMemories.filter((m) => m.timestamp >= day30d);
  const typeCount24h = /* @__PURE__ */ new Map();
  for (const memory of memories24h) {
    typeCount24h.set(memory.context_type, (typeCount24h.get(memory.context_type) || 0) + 1);
  }
  const mostActiveTypes24h = Array.from(typeCount24h.entries()).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count).slice(0, 5);
  const tagCount = /* @__PURE__ */ new Map();
  for (const memory of recentMemories) {
    for (const tag of memory.tags) {
      tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
    }
  }
  const topTags = Array.from(tagCount.entries()).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count).slice(0, 10);
  const importanceDist = {
    critical: recentMemories.filter((m) => m.importance >= 9).length,
    high: recentMemories.filter((m) => m.importance >= 7 && m.importance < 9).length,
    medium: recentMemories.filter((m) => m.importance >= 5 && m.importance < 7).length,
    low: recentMemories.filter((m) => m.importance < 5).length
  };
  const activityByDay = /* @__PURE__ */ new Map();
  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now - i * 24 * 60 * 60 * 1e3);
    const dateStr = date.toISOString().split("T")[0];
    last7Days.push(dateStr);
    activityByDay.set(dateStr, { count: 0, types: /* @__PURE__ */ new Map() });
  }
  for (const memory of memories7d) {
    const dateStr = new Date(memory.timestamp).toISOString().split("T")[0];
    const activity = activityByDay.get(dateStr);
    if (activity) {
      activity.count++;
      activity.types.set(memory.context_type, (activity.types.get(memory.context_type) || 0) + 1);
    }
  }
  const recentActivity = last7Days.map((date) => {
    const activity = activityByDay.get(date);
    return {
      date,
      count: activity.count,
      types: Object.fromEntries(activity.types)
    };
  });
  const analytics = {
    overview: stats,
    trends: {
      memories_last_24h: memories24h.length,
      memories_last_7d: memories7d.length,
      memories_last_30d: memories30d.length,
      most_active_types_24h: mostActiveTypes24h
    },
    top_tags: topTags,
    importance_distribution: importanceDist,
    recent_activity: recentActivity
  };
  return formatAnalytics(analytics);
}
function formatAnalytics(data) {
  const lines = [
    "# Memory Analytics Dashboard",
    "",
    `**Workspace**: ${data.overview.workspace_path}`,
    "",
    "## Overview",
    `- Total Memories: ${data.overview.total_memories}`,
    `- Sessions: ${data.overview.total_sessions}`,
    `- Important Memories (\u22658): ${data.overview.important_count}`,
    "",
    "### Memories by Type"
  ];
  for (const [type, count] of Object.entries(data.overview.by_type)) {
    if (count > 0) {
      lines.push(`- ${type}: ${count}`);
    }
  }
  lines.push("", "## Recent Activity Trends");
  lines.push(`- Last 24 hours: ${data.trends.memories_last_24h} memories`);
  lines.push(`- Last 7 days: ${data.trends.memories_last_7d} memories`);
  lines.push(`- Last 30 days: ${data.trends.memories_last_30d} memories`);
  if (data.trends.most_active_types_24h.length > 0) {
    lines.push("", "### Most Active Types (24h)");
    for (const { type, count } of data.trends.most_active_types_24h) {
      lines.push(`- ${type}: ${count}`);
    }
  }
  if (data.top_tags.length > 0) {
    lines.push("", "## Top Tags");
    for (const { tag, count } of data.top_tags) {
      lines.push(`- ${tag}: ${count}`);
    }
  }
  lines.push("", "## Importance Distribution");
  lines.push(`- Critical (9-10): ${data.importance_distribution.critical}`);
  lines.push(`- High (7-8): ${data.importance_distribution.high}`);
  lines.push(`- Medium (5-6): ${data.importance_distribution.medium}`);
  lines.push(`- Low (1-4): ${data.importance_distribution.low}`);
  lines.push("", "## Activity Last 7 Days");
  for (const activity of data.recent_activity) {
    const typeSummary = Object.entries(activity.types).map(([type, count]) => `${type}:${count}`).join(", ");
    lines.push(`- ${activity.date}: ${activity.count} memories ${typeSummary ? `(${typeSummary})` : ""}`);
  }
  return lines.join("\n");
}

// src/resources/index.ts
var memoryStore3 = new MemoryStore();
var redis = getRedisClient();
var resources = {
  "memory://recent": {
    name: "Recent Memories",
    description: "Get the most recent memories (default: 50)",
    mimeType: "application/json",
    handler: async (uri) => {
      const limit = parseInt(uri.searchParams.get("limit") || "50", 10);
      const memories = await memoryStore3.getRecentMemories(limit);
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(
              {
                count: memories.length,
                memories: memories.map((m) => ({
                  memory_id: m.id,
                  content: m.content,
                  summary: m.summary,
                  context_type: m.context_type,
                  importance: m.importance,
                  tags: m.tags,
                  timestamp: m.timestamp,
                  session_id: m.session_id
                }))
              },
              null,
              2
            )
          }
        ]
      };
    }
  },
  "memory://by-type/{type}": {
    name: "Memories by Type",
    description: "Get memories filtered by context type",
    mimeType: "application/json",
    handler: async (uri, params) => {
      const type = params.type;
      const limit = uri.searchParams.get("limit") ? parseInt(uri.searchParams.get("limit"), 10) : void 0;
      const memories = await memoryStore3.getMemoriesByType(type, limit);
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(
              {
                context_type: type,
                count: memories.length,
                memories: memories.map((m) => ({
                  memory_id: m.id,
                  content: m.content,
                  summary: m.summary,
                  importance: m.importance,
                  tags: m.tags,
                  timestamp: m.timestamp
                }))
              },
              null,
              2
            )
          }
        ]
      };
    }
  },
  "memory://by-tag/{tag}": {
    name: "Memories by Tag",
    description: "Get memories filtered by tag",
    mimeType: "application/json",
    handler: async (uri, params) => {
      const { tag } = params;
      const limit = uri.searchParams.get("limit") ? parseInt(uri.searchParams.get("limit"), 10) : void 0;
      const memories = await memoryStore3.getMemoriesByTag(tag, limit);
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(
              {
                tag,
                count: memories.length,
                memories: memories.map((m) => ({
                  memory_id: m.id,
                  content: m.content,
                  summary: m.summary,
                  context_type: m.context_type,
                  importance: m.importance,
                  tags: m.tags,
                  timestamp: m.timestamp
                }))
              },
              null,
              2
            )
          }
        ]
      };
    }
  },
  "memory://important": {
    name: "Important Memories",
    description: "Get high-importance memories (importance >= 8)",
    mimeType: "application/json",
    handler: async (uri) => {
      const minImportance = parseInt(uri.searchParams.get("min") || "8", 10);
      const limit = uri.searchParams.get("limit") ? parseInt(uri.searchParams.get("limit"), 10) : void 0;
      const memories = await memoryStore3.getImportantMemories(minImportance, limit);
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(
              {
                min_importance: minImportance,
                count: memories.length,
                memories: memories.map((m) => ({
                  memory_id: m.id,
                  content: m.content,
                  summary: m.summary,
                  context_type: m.context_type,
                  importance: m.importance,
                  tags: m.tags,
                  timestamp: m.timestamp
                }))
              },
              null,
              2
            )
          }
        ]
      };
    }
  },
  "memory://session/{session_id}": {
    name: "Session Memories",
    description: "Get all memories in a specific session",
    mimeType: "application/json",
    handler: async (uri, params) => {
      const { session_id } = params;
      const session = await memoryStore3.getSession(session_id);
      if (!session) {
        throw new McpError3(ErrorCode3.InvalidRequest, `Session ${session_id} not found`);
      }
      const memories = await memoryStore3.getSessionMemories(session_id);
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(
              {
                session_id: session.session_id,
                session_name: session.session_name,
                created_at: session.created_at,
                summary: session.summary,
                count: memories.length,
                memories: memories.map((m) => ({
                  memory_id: m.id,
                  content: m.content,
                  summary: m.summary,
                  context_type: m.context_type,
                  importance: m.importance,
                  tags: m.tags,
                  timestamp: m.timestamp
                }))
              },
              null,
              2
            )
          }
        ]
      };
    }
  },
  "memory://sessions": {
    name: "All Sessions",
    description: "Get list of all sessions",
    mimeType: "application/json",
    handler: async (uri) => {
      const sessions = await memoryStore3.getAllSessions();
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(
              {
                count: sessions.length,
                sessions: sessions.map((s) => ({
                  session_id: s.session_id,
                  session_name: s.session_name,
                  created_at: s.created_at,
                  memory_count: s.memory_count,
                  summary: s.summary
                }))
              },
              null,
              2
            )
          }
        ]
      };
    }
  },
  "memory://summary": {
    name: "Memory Summary",
    description: "Get overall summary statistics of stored memories",
    mimeType: "application/json",
    handler: async (uri) => {
      const stats = await memoryStore3.getSummaryStats();
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(stats, null, 2)
          }
        ]
      };
    }
  },
  "memory://search": {
    name: "Search Memories",
    description: "Search memories using semantic similarity",
    mimeType: "application/json",
    handler: async (uri) => {
      const query = uri.searchParams.get("q");
      if (!query) {
        throw new McpError3(ErrorCode3.InvalidRequest, 'Query parameter "q" is required');
      }
      const limit = parseInt(uri.searchParams.get("limit") || "10", 10);
      const minImportance = uri.searchParams.get("min_importance") ? parseInt(uri.searchParams.get("min_importance"), 10) : void 0;
      const results = await memoryStore3.searchMemories(query, limit, minImportance);
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(
              {
                query,
                count: results.length,
                results: results.map((r) => ({
                  memory_id: r.id,
                  content: r.content,
                  summary: r.summary,
                  context_type: r.context_type,
                  importance: r.importance,
                  tags: r.tags,
                  similarity: r.similarity,
                  timestamp: r.timestamp
                }))
              },
              null,
              2
            )
          }
        ]
      };
    }
  },
  "memory://analytics": {
    name: "Memory Analytics",
    description: "Get detailed analytics about memory usage and trends",
    mimeType: "text/markdown",
    handler: async (uri) => {
      const analytics = await getAnalytics();
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "text/markdown",
            text: analytics
          }
        ]
      };
    }
  },
  // Global memory resources (v1.3.0)
  "memory://global/recent": {
    name: "Recent Global Memories",
    description: "Get the most recent global memories (cross-workspace)",
    mimeType: "application/json",
    handler: async (uri) => {
      const mode = getWorkspaceMode();
      if (mode === "isolated" /* ISOLATED */) {
        throw new McpError3(
          ErrorCode3.InvalidRequest,
          "Global memories are not available in isolated mode. Set WORKSPACE_MODE=hybrid or global to access global memories."
        );
      }
      const limit = parseInt(uri.searchParams.get("limit") || "50", 10);
      const ids = await redis.zrevrange(RedisKeys.globalTimeline(), 0, limit - 1);
      const memories = await memoryStore3.getMemories(ids);
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(
              {
                count: memories.length,
                workspace_mode: mode,
                memories: memories.map((m) => ({
                  memory_id: m.id,
                  content: m.content,
                  summary: m.summary,
                  context_type: m.context_type,
                  importance: m.importance,
                  tags: m.tags,
                  timestamp: m.timestamp,
                  is_global: m.is_global
                }))
              },
              null,
              2
            )
          }
        ]
      };
    }
  },
  "memory://global/by-type/{type}": {
    name: "Global Memories by Type",
    description: "Get global memories filtered by context type",
    mimeType: "application/json",
    handler: async (uri, params) => {
      const mode = getWorkspaceMode();
      if (mode === "isolated" /* ISOLATED */) {
        throw new McpError3(
          ErrorCode3.InvalidRequest,
          "Global memories are not available in isolated mode. Set WORKSPACE_MODE=hybrid or global to access global memories."
        );
      }
      const type = params.type;
      const limit = uri.searchParams.get("limit") ? parseInt(uri.searchParams.get("limit"), 10) : void 0;
      const ids = await redis.smembers(RedisKeys.globalByType(type));
      const allMemories = await memoryStore3.getMemories(ids);
      allMemories.sort((a, b) => b.timestamp - a.timestamp);
      const memories = limit ? allMemories.slice(0, limit) : allMemories;
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(
              {
                context_type: type,
                count: memories.length,
                workspace_mode: mode,
                memories: memories.map((m) => ({
                  memory_id: m.id,
                  content: m.content,
                  summary: m.summary,
                  importance: m.importance,
                  tags: m.tags,
                  timestamp: m.timestamp,
                  is_global: m.is_global
                }))
              },
              null,
              2
            )
          }
        ]
      };
    }
  },
  "memory://global/by-tag/{tag}": {
    name: "Global Memories by Tag",
    description: "Get global memories filtered by tag",
    mimeType: "application/json",
    handler: async (uri, params) => {
      const mode = getWorkspaceMode();
      if (mode === "isolated" /* ISOLATED */) {
        throw new McpError3(
          ErrorCode3.InvalidRequest,
          "Global memories are not available in isolated mode. Set WORKSPACE_MODE=hybrid or global to access global memories."
        );
      }
      const { tag } = params;
      const limit = uri.searchParams.get("limit") ? parseInt(uri.searchParams.get("limit"), 10) : void 0;
      const ids = await redis.smembers(RedisKeys.globalByTag(tag));
      const allMemories = await memoryStore3.getMemories(ids);
      allMemories.sort((a, b) => b.timestamp - a.timestamp);
      const memories = limit ? allMemories.slice(0, limit) : allMemories;
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(
              {
                tag,
                count: memories.length,
                workspace_mode: mode,
                memories: memories.map((m) => ({
                  memory_id: m.id,
                  content: m.content,
                  summary: m.summary,
                  context_type: m.context_type,
                  importance: m.importance,
                  tags: m.tags,
                  timestamp: m.timestamp,
                  is_global: m.is_global
                }))
              },
              null,
              2
            )
          }
        ]
      };
    }
  },
  "memory://global/important": {
    name: "Important Global Memories",
    description: "Get high-importance global memories (importance >= 8)",
    mimeType: "application/json",
    handler: async (uri) => {
      const mode = getWorkspaceMode();
      if (mode === "isolated" /* ISOLATED */) {
        throw new McpError3(
          ErrorCode3.InvalidRequest,
          "Global memories are not available in isolated mode. Set WORKSPACE_MODE=hybrid or global to access global memories."
        );
      }
      const minImportance = parseInt(uri.searchParams.get("min") || "8", 10);
      const limit = uri.searchParams.get("limit") ? parseInt(uri.searchParams.get("limit"), 10) : void 0;
      const results = await redis.zrevrangebyscore(
        RedisKeys.globalImportant(),
        10,
        minImportance,
        "LIMIT",
        0,
        limit || 100
      );
      const memories = await memoryStore3.getMemories(results);
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(
              {
                min_importance: minImportance,
                count: memories.length,
                workspace_mode: mode,
                memories: memories.map((m) => ({
                  memory_id: m.id,
                  content: m.content,
                  summary: m.summary,
                  context_type: m.context_type,
                  importance: m.importance,
                  tags: m.tags,
                  timestamp: m.timestamp,
                  is_global: m.is_global
                }))
              },
              null,
              2
            )
          }
        ]
      };
    }
  },
  "memory://global/search": {
    name: "Search Global Memories",
    description: "Search global memories using semantic similarity",
    mimeType: "application/json",
    handler: async (uri) => {
      const mode = getWorkspaceMode();
      if (mode === "isolated" /* ISOLATED */) {
        throw new McpError3(
          ErrorCode3.InvalidRequest,
          "Global memories are not available in isolated mode. Set WORKSPACE_MODE=hybrid or global to access global memories."
        );
      }
      const query = uri.searchParams.get("q");
      if (!query) {
        throw new McpError3(ErrorCode3.InvalidRequest, 'Query parameter "q" is required');
      }
      const limit = parseInt(uri.searchParams.get("limit") || "10", 10);
      const originalMode = process.env.WORKSPACE_MODE;
      process.env.WORKSPACE_MODE = "global";
      try {
        const results = await memoryStore3.searchMemories(query, limit);
        return {
          contents: [
            {
              uri: uri.toString(),
              mimeType: "application/json",
              text: JSON.stringify(
                {
                  query,
                  count: results.length,
                  workspace_mode: mode,
                  results: results.map((r) => ({
                    memory_id: r.id,
                    content: r.content,
                    summary: r.summary,
                    context_type: r.context_type,
                    importance: r.importance,
                    tags: r.tags,
                    similarity: r.similarity,
                    timestamp: r.timestamp,
                    is_global: r.is_global
                  }))
                },
                null,
                2
              )
            }
          ]
        };
      } finally {
        if (originalMode) {
          process.env.WORKSPACE_MODE = originalMode;
        } else {
          delete process.env.WORKSPACE_MODE;
        }
      }
    }
  }
};

// src/prompts/formatters.ts
function formatWorkspaceContext(workspacePath, directives, decisions, patterns) {
  const sections = [];
  sections.push(`# Workspace Context: ${workspacePath}`);
  sections.push("");
  sections.push("*Critical information to remember for this project*");
  sections.push("");
  if (directives.length > 0) {
    sections.push("## \u{1F3AF} Critical Directives");
    sections.push("");
    const sorted = directives.sort((a, b) => b.importance - a.importance);
    for (const dir of sorted.slice(0, 10)) {
      sections.push(`- **[Importance: ${dir.importance}/10]** ${dir.content}`);
      if (dir.tags.length > 0) {
        sections.push(`  *Tags: ${dir.tags.join(", ")}*`);
      }
    }
    sections.push("");
  }
  if (decisions.length > 0) {
    sections.push("## \u{1F4A1} Key Decisions");
    sections.push("");
    const sorted = decisions.sort((a, b) => b.importance - a.importance);
    for (const dec of sorted.slice(0, 8)) {
      const age = getAgeString(dec.timestamp);
      sections.push(`- **[${age}]** ${dec.content}`);
    }
    sections.push("");
  }
  if (patterns.length > 0) {
    sections.push("## \u{1F527} Code Patterns & Conventions");
    sections.push("");
    const sorted = patterns.sort((a, b) => b.importance - a.importance);
    for (const pat of sorted.slice(0, 8)) {
      sections.push(`- ${pat.content}`);
      if (pat.tags.length > 0) {
        sections.push(`  *Applies to: ${pat.tags.join(", ")}*`);
      }
    }
    sections.push("");
  }
  if (directives.length === 0 && decisions.length === 0 && patterns.length === 0) {
    sections.push("*No critical context stored yet. As we work, I'll remember important patterns and decisions.*");
  }
  sections.push("");
  sections.push("---");
  sections.push("*This context is automatically injected to help me remember important project conventions and decisions.*");
  return sections.join("\n");
}
function getAgeString(timestamp) {
  const ageMs = Date.now() - timestamp;
  const ageMinutes = Math.floor(ageMs / (1e3 * 60));
  const ageHours = Math.floor(ageMs / (1e3 * 60 * 60));
  const ageDays = Math.floor(ageMs / (1e3 * 60 * 60 * 24));
  if (ageDays > 0) {
    return `${ageDays}d ago`;
  } else if (ageHours > 0) {
    return `${ageHours}h ago`;
  } else if (ageMinutes > 0) {
    return `${ageMinutes}m ago`;
  } else {
    return "just now";
  }
}

// src/prompts/index.ts
var memoryStore4 = new MemoryStore();
var prompts = {
  workspace_context: {
    name: "workspace_context",
    description: "Critical workspace context: directives, decisions, and code patterns",
    arguments: [],
    handler: async () => {
      const directives = await memoryStore4.getMemoriesByType("directive");
      const decisions = await memoryStore4.getMemoriesByType("decision");
      const patterns = await memoryStore4.getMemoriesByType("code_pattern");
      const importantDirectives = directives.filter((d) => d.importance >= 8);
      const importantDecisions = decisions.filter((d) => d.importance >= 7);
      const importantPatterns = patterns.filter((p) => p.importance >= 7);
      const stats = await memoryStore4.getSummaryStats();
      const workspacePath = stats.workspace_path;
      const contextText = formatWorkspaceContext(
        workspacePath,
        importantDirectives,
        importantDecisions,
        importantPatterns
      );
      return {
        description: "Workspace-specific context and conventions",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: contextText
            }
          }
        ]
      };
    }
  }
};
async function listPrompts() {
  return Object.values(prompts).map((p) => ({
    name: p.name,
    description: p.description,
    arguments: p.arguments
  }));
}
async function getPrompt(name) {
  const prompt = prompts[name];
  if (!prompt) {
    throw new Error(`Unknown prompt: ${name}`);
  }
  return await prompt.handler();
}

// src/index.ts
var server = new Server(
  {
    name: "@joseairosa/recall",
    version: "1.3.0"
  },
  {
    capabilities: {
      resources: {},
      tools: {},
      prompts: {}
    }
  }
);
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: Object.entries(tools).map(([name, tool]) => ({
      name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }))
  };
});
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const tool = tools[name];
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return await tool.handler(args);
});
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "memory://recent",
        name: "Recent Memories",
        description: "Get the most recent memories (default: 50)",
        mimeType: "application/json"
      },
      {
        uri: "memory://by-type/{type}",
        name: "Memories by Type",
        description: "Get memories filtered by context type (directive, information, heading, decision, code_pattern, requirement, error, todo, insight, preference)",
        mimeType: "application/json"
      },
      {
        uri: "memory://by-tag/{tag}",
        name: "Memories by Tag",
        description: "Get memories filtered by tag",
        mimeType: "application/json"
      },
      {
        uri: "memory://important",
        name: "Important Memories",
        description: "Get high-importance memories (importance >= 8)",
        mimeType: "application/json"
      },
      {
        uri: "memory://session/{session_id}",
        name: "Session Memories",
        description: "Get all memories in a specific session",
        mimeType: "application/json"
      },
      {
        uri: "memory://sessions",
        name: "All Sessions",
        description: "Get list of all sessions",
        mimeType: "application/json"
      },
      {
        uri: "memory://summary",
        name: "Memory Summary",
        description: "Get overall summary statistics",
        mimeType: "application/json"
      },
      {
        uri: "memory://search",
        name: "Search Memories",
        description: 'Search memories using semantic similarity. Requires query parameter "q"',
        mimeType: "application/json"
      }
    ]
  };
});
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uriString = request.params.uri;
  const uri = new URL(uriString);
  const resourcePath = uri.hostname + uri.pathname;
  if (resourcePath === "recent") {
    return await resources["memory://recent"].handler(uri);
  }
  if (resourcePath === "important") {
    return await resources["memory://important"].handler(uri);
  }
  if (resourcePath === "sessions") {
    return await resources["memory://sessions"].handler(uri);
  }
  if (resourcePath === "summary") {
    return await resources["memory://summary"].handler(uri);
  }
  if (resourcePath === "search") {
    return await resources["memory://search"].handler(uri);
  }
  if (resourcePath === "analytics") {
    return await resources["memory://analytics"].handler(uri);
  }
  const typeMatch = resourcePath.match(/^by-type\/(.+)$/);
  if (typeMatch) {
    return await resources["memory://by-type/{type}"].handler(uri, { type: typeMatch[1] });
  }
  const tagMatch = resourcePath.match(/^by-tag\/(.+)$/);
  if (tagMatch) {
    return await resources["memory://by-tag/{tag}"].handler(uri, { tag: tagMatch[1] });
  }
  const sessionMatch = resourcePath.match(/^session\/(.+)$/);
  if (sessionMatch) {
    return await resources["memory://session/{session_id}"].handler(uri, { session_id: sessionMatch[1] });
  }
  throw new Error(`Unknown resource: ${request.params.uri}`);
});
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  const promptsList = await listPrompts();
  return {
    prompts: promptsList
  };
});
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const promptResult = await getPrompt(request.params.name);
  return promptResult;
});
async function main() {
  console.error("Checking Redis connection...");
  const isConnected = await checkRedisConnection();
  if (!isConnected) {
    console.error("ERROR: Failed to connect to Redis");
    console.error("Please ensure Redis is running and REDIS_URL is set correctly");
    process.exit(1);
  }
  console.error("Redis connection successful");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Recall MCP Server started successfully");
  console.error("Listening on stdio...");
}
process.on("SIGINT", async () => {
  console.error("\nShutting down...");
  await closeRedisClient();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  console.error("\nShutting down...");
  await closeRedisClient();
  process.exit(0);
});
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
//# sourceMappingURL=index.js.map