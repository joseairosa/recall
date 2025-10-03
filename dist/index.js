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
import { McpError as McpError3, ErrorCode as ErrorCode3 } from "@modelcontextprotocol/sdk/types.js";

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
  globalImportant: () => `global:memories:important`,
  // Relationship keys (v1.4.0)
  relationship: (workspace, id) => `ws:${workspace}:relationship:${id}`,
  relationships: (workspace) => `ws:${workspace}:relationships:all`,
  memoryRelationships: (workspace, memoryId) => `ws:${workspace}:memory:${memoryId}:relationships`,
  memoryRelationshipsOut: (workspace, memoryId) => `ws:${workspace}:memory:${memoryId}:relationships:out`,
  memoryRelationshipsIn: (workspace, memoryId) => `ws:${workspace}:memory:${memoryId}:relationships:in`,
  // Global relationship keys
  globalRelationship: (id) => `global:relationship:${id}`,
  globalRelationships: () => `global:relationships:all`,
  globalMemoryRelationships: (memoryId) => `global:memory:${memoryId}:relationships`,
  globalMemoryRelationshipsOut: (memoryId) => `global:memory:${memoryId}:relationships:out`,
  globalMemoryRelationshipsIn: (memoryId) => `global:memory:${memoryId}:relationships:in`
};
var ConvertToGlobalSchema = z.object({
  memory_id: z.string().describe("ID of the memory to convert to global")
});
var ConvertToWorkspaceSchema = z.object({
  memory_id: z.string().describe("ID of the global memory to convert to workspace-specific"),
  workspace_id: z.string().optional().describe("Target workspace (default: current workspace)")
});
var RelationshipType = /* @__PURE__ */ ((RelationshipType2) => {
  RelationshipType2["RELATES_TO"] = "relates_to";
  RelationshipType2["PARENT_OF"] = "parent_of";
  RelationshipType2["CHILD_OF"] = "child_of";
  RelationshipType2["REFERENCES"] = "references";
  RelationshipType2["SUPERSEDES"] = "supersedes";
  RelationshipType2["IMPLEMENTS"] = "implements";
  RelationshipType2["EXAMPLE_OF"] = "example_of";
  return RelationshipType2;
})(RelationshipType || {});
var MemoryRelationshipSchema = z.object({
  id: z.string().describe("Unique relationship identifier (ULID)"),
  from_memory_id: z.string().describe("Source memory ID"),
  to_memory_id: z.string().describe("Target memory ID"),
  relationship_type: z.nativeEnum(RelationshipType).describe("Type of relationship"),
  created_at: z.string().describe("ISO 8601 timestamp"),
  metadata: z.record(z.unknown()).optional().describe("Optional metadata")
});
var LinkMemoriesSchema = z.object({
  from_memory_id: z.string().describe("Source memory ID"),
  to_memory_id: z.string().describe("Target memory ID"),
  relationship_type: z.nativeEnum(RelationshipType).describe("Type of relationship"),
  metadata: z.record(z.unknown()).optional().describe("Optional metadata")
});
var GetRelatedMemoriesSchema = z.object({
  memory_id: z.string().describe("Memory ID to get relationships for"),
  relationship_types: z.array(z.nativeEnum(RelationshipType)).optional().describe("Filter by relationship types"),
  depth: z.number().min(1).max(5).default(1).describe("Traversal depth (1-5)"),
  direction: z.enum(["outgoing", "incoming", "both"]).default("both").describe("Relationship direction")
});
var UnlinkMemoriesSchema = z.object({
  relationship_id: z.string().describe("Relationship ID to remove")
});
var GetMemoryGraphSchema = z.object({
  memory_id: z.string().describe("Root memory ID for graph"),
  max_depth: z.number().min(1).max(3).default(2).describe("Maximum graph depth"),
  max_nodes: z.number().min(1).max(100).default(50).describe("Maximum nodes to return")
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
  // ============================================================================
  // Memory Relationships (v1.4.0)
  // ============================================================================
  // Serialize relationship for Redis storage
  serializeRelationship(relationship) {
    return {
      id: relationship.id,
      from_memory_id: relationship.from_memory_id,
      to_memory_id: relationship.to_memory_id,
      relationship_type: relationship.relationship_type,
      created_at: relationship.created_at,
      metadata: relationship.metadata ? JSON.stringify(relationship.metadata) : ""
    };
  }
  // Deserialize relationship from Redis
  deserializeRelationship(data) {
    return {
      id: data.id,
      from_memory_id: data.from_memory_id,
      to_memory_id: data.to_memory_id,
      relationship_type: data.relationship_type,
      created_at: data.created_at,
      metadata: data.metadata ? JSON.parse(data.metadata) : void 0
    };
  }
  // Create a relationship between two memories
  async createRelationship(fromMemoryId, toMemoryId, relationshipType, metadata) {
    const fromMemory = await this.getMemory(fromMemoryId);
    const toMemory = await this.getMemory(toMemoryId);
    if (!fromMemory) {
      throw new Error(`Source memory not found: ${fromMemoryId}`);
    }
    if (!toMemory) {
      throw new Error(`Target memory not found: ${toMemoryId}`);
    }
    if (fromMemoryId === toMemoryId) {
      throw new Error("Cannot create relationship to self");
    }
    const existing = await this.findRelationship(fromMemoryId, toMemoryId, relationshipType);
    if (existing) {
      return existing;
    }
    const id = ulid();
    const relationship = {
      id,
      from_memory_id: fromMemoryId,
      to_memory_id: toMemoryId,
      relationship_type: relationshipType,
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      metadata
    };
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
  async findRelationship(fromMemoryId, toMemoryId, relationshipType) {
    const relationshipIds = await this.getMemoryRelationshipIds(fromMemoryId, "outgoing");
    for (const relId of relationshipIds) {
      const rel = await this.getRelationship(relId);
      if (rel && rel.from_memory_id === fromMemoryId && rel.to_memory_id === toMemoryId && rel.relationship_type === relationshipType) {
        return rel;
      }
    }
    return null;
  }
  // Get a single relationship by ID
  async getRelationship(relationshipId) {
    const wsData = await this.redis.hgetall(RedisKeys.relationship(this.workspaceId, relationshipId));
    if (wsData && Object.keys(wsData).length > 0) {
      return this.deserializeRelationship(wsData);
    }
    const globalData = await this.redis.hgetall(RedisKeys.globalRelationship(relationshipId));
    if (globalData && Object.keys(globalData).length > 0) {
      return this.deserializeRelationship(globalData);
    }
    return null;
  }
  // Get relationship IDs for a memory
  async getMemoryRelationshipIds(memoryId, direction = "both") {
    const mode = getWorkspaceMode();
    const ids = /* @__PURE__ */ new Set();
    const addIds = async (key) => {
      const keyIds = await this.redis.smembers(key);
      keyIds.forEach((id) => ids.add(id));
    };
    if (mode === "isolated" /* ISOLATED */ || mode === "hybrid" /* HYBRID */) {
      if (direction === "outgoing" || direction === "both") {
        await addIds(RedisKeys.memoryRelationshipsOut(this.workspaceId, memoryId));
      }
      if (direction === "incoming" || direction === "both") {
        await addIds(RedisKeys.memoryRelationshipsIn(this.workspaceId, memoryId));
      }
    }
    if (mode === "global" /* GLOBAL */ || mode === "hybrid" /* HYBRID */) {
      if (direction === "outgoing" || direction === "both") {
        await addIds(RedisKeys.globalMemoryRelationshipsOut(memoryId));
      }
      if (direction === "incoming" || direction === "both") {
        await addIds(RedisKeys.globalMemoryRelationshipsIn(memoryId));
      }
    }
    return Array.from(ids);
  }
  // Get all relationships for a memory
  async getMemoryRelationships(memoryId, direction = "both") {
    const relationshipIds = await this.getMemoryRelationshipIds(memoryId, direction);
    const relationships = [];
    for (const relId of relationshipIds) {
      const rel = await this.getRelationship(relId);
      if (rel) {
        relationships.push(rel);
      }
    }
    return relationships;
  }
  // Get related memories with graph traversal
  async getRelatedMemories(memoryId, options = {}) {
    const { relationshipTypes, depth = 1, direction = "both" } = options;
    const results = [];
    const visited = /* @__PURE__ */ new Set();
    await this.traverseGraph(memoryId, depth, visited, results, relationshipTypes, direction, 0);
    return results;
  }
  // Traverse relationship graph
  async traverseGraph(memoryId, maxDepth, visited, results, relationshipTypes, direction = "both", currentDepth = 0) {
    if (currentDepth >= maxDepth || visited.has(memoryId)) {
      return;
    }
    visited.add(memoryId);
    const relationships = await this.getMemoryRelationships(memoryId, direction);
    const filtered = relationshipTypes ? relationships.filter((r) => relationshipTypes.includes(r.relationship_type)) : relationships;
    for (const relationship of filtered) {
      const relatedMemoryId = relationship.from_memory_id === memoryId ? relationship.to_memory_id : relationship.from_memory_id;
      if (!visited.has(relatedMemoryId)) {
        const memory = await this.getMemory(relatedMemoryId);
        if (memory) {
          results.push({
            memory,
            relationship,
            depth: currentDepth + 1
          });
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
  async deleteRelationship(relationshipId) {
    const relationship = await this.getRelationship(relationshipId);
    if (!relationship) {
      return false;
    }
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
  async getMemoryGraph(rootMemoryId, maxDepth = 2, maxNodes = 50) {
    const nodes = {};
    const visited = /* @__PURE__ */ new Set();
    let maxDepthReached = 0;
    await this.buildGraph(rootMemoryId, maxDepth, maxNodes, nodes, visited, 0);
    for (const node of Object.values(nodes)) {
      maxDepthReached = Math.max(maxDepthReached, node.depth);
    }
    return {
      root_memory_id: rootMemoryId,
      nodes,
      total_nodes: Object.keys(nodes).length,
      max_depth_reached: maxDepthReached
    };
  }
  // Build graph recursively
  async buildGraph(memoryId, maxDepth, maxNodes, nodes, visited, currentDepth) {
    if (currentDepth > maxDepth || visited.has(memoryId) || Object.keys(nodes).length >= maxNodes) {
      return;
    }
    visited.add(memoryId);
    const memory = await this.getMemory(memoryId);
    if (!memory) {
      return;
    }
    const relationships = await this.getMemoryRelationships(memoryId, "both");
    nodes[memoryId] = {
      memory,
      relationships,
      depth: currentDepth
    };
    for (const relationship of relationships) {
      const relatedId = relationship.from_memory_id === memoryId ? relationship.to_memory_id : relationship.from_memory_id;
      if (!visited.has(relatedId) && Object.keys(nodes).length < maxNodes) {
        await this.buildGraph(relatedId, maxDepth, maxNodes, nodes, visited, currentDepth + 1);
      }
    }
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

// node_modules/zod-to-json-schema/dist/esm/Options.js
var ignoreOverride = Symbol("Let zodToJsonSchema decide on which parser to use");
var defaultOptions = {
  name: void 0,
  $refStrategy: "root",
  basePath: ["#"],
  effectStrategy: "input",
  pipeStrategy: "all",
  dateStrategy: "format:date-time",
  mapStrategy: "entries",
  removeAdditionalStrategy: "passthrough",
  allowedAdditionalProperties: true,
  rejectedAdditionalProperties: false,
  definitionPath: "definitions",
  target: "jsonSchema7",
  strictUnions: false,
  definitions: {},
  errorMessages: false,
  markdownDescription: false,
  patternStrategy: "escape",
  applyRegexFlags: false,
  emailStrategy: "format:email",
  base64Strategy: "contentEncoding:base64",
  nameStrategy: "ref",
  openAiAnyTypeName: "OpenAiAnyType"
};
var getDefaultOptions = (options) => typeof options === "string" ? {
  ...defaultOptions,
  name: options
} : {
  ...defaultOptions,
  ...options
};

// node_modules/zod-to-json-schema/dist/esm/Refs.js
var getRefs = (options) => {
  const _options = getDefaultOptions(options);
  const currentPath = _options.name !== void 0 ? [..._options.basePath, _options.definitionPath, _options.name] : _options.basePath;
  return {
    ..._options,
    flags: { hasReferencedOpenAiAnyType: false },
    currentPath,
    propertyPath: void 0,
    seen: new Map(Object.entries(_options.definitions).map(([name, def]) => [
      def._def,
      {
        def: def._def,
        path: [..._options.basePath, _options.definitionPath, name],
        // Resolution of references will be forced even though seen, so it's ok that the schema is undefined here for now.
        jsonSchema: void 0
      }
    ]))
  };
};

// node_modules/zod-to-json-schema/dist/esm/errorMessages.js
function addErrorMessage(res, key, errorMessage, refs) {
  if (!refs?.errorMessages)
    return;
  if (errorMessage) {
    res.errorMessage = {
      ...res.errorMessage,
      [key]: errorMessage
    };
  }
}
function setResponseValueAndErrors(res, key, value, errorMessage, refs) {
  res[key] = value;
  addErrorMessage(res, key, errorMessage, refs);
}

// node_modules/zod-to-json-schema/dist/esm/getRelativePath.js
var getRelativePath = (pathA, pathB) => {
  let i = 0;
  for (; i < pathA.length && i < pathB.length; i++) {
    if (pathA[i] !== pathB[i])
      break;
  }
  return [(pathA.length - i).toString(), ...pathB.slice(i)].join("/");
};

// node_modules/zod-to-json-schema/dist/esm/selectParser.js
import { ZodFirstPartyTypeKind as ZodFirstPartyTypeKind3 } from "zod";

// node_modules/zod-to-json-schema/dist/esm/parsers/any.js
function parseAnyDef(refs) {
  if (refs.target !== "openAi") {
    return {};
  }
  const anyDefinitionPath = [
    ...refs.basePath,
    refs.definitionPath,
    refs.openAiAnyTypeName
  ];
  refs.flags.hasReferencedOpenAiAnyType = true;
  return {
    $ref: refs.$refStrategy === "relative" ? getRelativePath(anyDefinitionPath, refs.currentPath) : anyDefinitionPath.join("/")
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/array.js
import { ZodFirstPartyTypeKind } from "zod";
function parseArrayDef(def, refs) {
  const res = {
    type: "array"
  };
  if (def.type?._def && def.type?._def?.typeName !== ZodFirstPartyTypeKind.ZodAny) {
    res.items = parseDef(def.type._def, {
      ...refs,
      currentPath: [...refs.currentPath, "items"]
    });
  }
  if (def.minLength) {
    setResponseValueAndErrors(res, "minItems", def.minLength.value, def.minLength.message, refs);
  }
  if (def.maxLength) {
    setResponseValueAndErrors(res, "maxItems", def.maxLength.value, def.maxLength.message, refs);
  }
  if (def.exactLength) {
    setResponseValueAndErrors(res, "minItems", def.exactLength.value, def.exactLength.message, refs);
    setResponseValueAndErrors(res, "maxItems", def.exactLength.value, def.exactLength.message, refs);
  }
  return res;
}

// node_modules/zod-to-json-schema/dist/esm/parsers/bigint.js
function parseBigintDef(def, refs) {
  const res = {
    type: "integer",
    format: "int64"
  };
  if (!def.checks)
    return res;
  for (const check of def.checks) {
    switch (check.kind) {
      case "min":
        if (refs.target === "jsonSchema7") {
          if (check.inclusive) {
            setResponseValueAndErrors(res, "minimum", check.value, check.message, refs);
          } else {
            setResponseValueAndErrors(res, "exclusiveMinimum", check.value, check.message, refs);
          }
        } else {
          if (!check.inclusive) {
            res.exclusiveMinimum = true;
          }
          setResponseValueAndErrors(res, "minimum", check.value, check.message, refs);
        }
        break;
      case "max":
        if (refs.target === "jsonSchema7") {
          if (check.inclusive) {
            setResponseValueAndErrors(res, "maximum", check.value, check.message, refs);
          } else {
            setResponseValueAndErrors(res, "exclusiveMaximum", check.value, check.message, refs);
          }
        } else {
          if (!check.inclusive) {
            res.exclusiveMaximum = true;
          }
          setResponseValueAndErrors(res, "maximum", check.value, check.message, refs);
        }
        break;
      case "multipleOf":
        setResponseValueAndErrors(res, "multipleOf", check.value, check.message, refs);
        break;
    }
  }
  return res;
}

// node_modules/zod-to-json-schema/dist/esm/parsers/boolean.js
function parseBooleanDef() {
  return {
    type: "boolean"
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/branded.js
function parseBrandedDef(_def, refs) {
  return parseDef(_def.type._def, refs);
}

// node_modules/zod-to-json-schema/dist/esm/parsers/catch.js
var parseCatchDef = (def, refs) => {
  return parseDef(def.innerType._def, refs);
};

// node_modules/zod-to-json-schema/dist/esm/parsers/date.js
function parseDateDef(def, refs, overrideDateStrategy) {
  const strategy = overrideDateStrategy ?? refs.dateStrategy;
  if (Array.isArray(strategy)) {
    return {
      anyOf: strategy.map((item, i) => parseDateDef(def, refs, item))
    };
  }
  switch (strategy) {
    case "string":
    case "format:date-time":
      return {
        type: "string",
        format: "date-time"
      };
    case "format:date":
      return {
        type: "string",
        format: "date"
      };
    case "integer":
      return integerDateParser(def, refs);
  }
}
var integerDateParser = (def, refs) => {
  const res = {
    type: "integer",
    format: "unix-time"
  };
  if (refs.target === "openApi3") {
    return res;
  }
  for (const check of def.checks) {
    switch (check.kind) {
      case "min":
        setResponseValueAndErrors(
          res,
          "minimum",
          check.value,
          // This is in milliseconds
          check.message,
          refs
        );
        break;
      case "max":
        setResponseValueAndErrors(
          res,
          "maximum",
          check.value,
          // This is in milliseconds
          check.message,
          refs
        );
        break;
    }
  }
  return res;
};

// node_modules/zod-to-json-schema/dist/esm/parsers/default.js
function parseDefaultDef(_def, refs) {
  return {
    ...parseDef(_def.innerType._def, refs),
    default: _def.defaultValue()
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/effects.js
function parseEffectsDef(_def, refs) {
  return refs.effectStrategy === "input" ? parseDef(_def.schema._def, refs) : parseAnyDef(refs);
}

// node_modules/zod-to-json-schema/dist/esm/parsers/enum.js
function parseEnumDef(def) {
  return {
    type: "string",
    enum: Array.from(def.values)
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/intersection.js
var isJsonSchema7AllOfType = (type) => {
  if ("type" in type && type.type === "string")
    return false;
  return "allOf" in type;
};
function parseIntersectionDef(def, refs) {
  const allOf = [
    parseDef(def.left._def, {
      ...refs,
      currentPath: [...refs.currentPath, "allOf", "0"]
    }),
    parseDef(def.right._def, {
      ...refs,
      currentPath: [...refs.currentPath, "allOf", "1"]
    })
  ].filter((x) => !!x);
  let unevaluatedProperties = refs.target === "jsonSchema2019-09" ? { unevaluatedProperties: false } : void 0;
  const mergedAllOf = [];
  allOf.forEach((schema) => {
    if (isJsonSchema7AllOfType(schema)) {
      mergedAllOf.push(...schema.allOf);
      if (schema.unevaluatedProperties === void 0) {
        unevaluatedProperties = void 0;
      }
    } else {
      let nestedSchema = schema;
      if ("additionalProperties" in schema && schema.additionalProperties === false) {
        const { additionalProperties, ...rest } = schema;
        nestedSchema = rest;
      } else {
        unevaluatedProperties = void 0;
      }
      mergedAllOf.push(nestedSchema);
    }
  });
  return mergedAllOf.length ? {
    allOf: mergedAllOf,
    ...unevaluatedProperties
  } : void 0;
}

// node_modules/zod-to-json-schema/dist/esm/parsers/literal.js
function parseLiteralDef(def, refs) {
  const parsedType = typeof def.value;
  if (parsedType !== "bigint" && parsedType !== "number" && parsedType !== "boolean" && parsedType !== "string") {
    return {
      type: Array.isArray(def.value) ? "array" : "object"
    };
  }
  if (refs.target === "openApi3") {
    return {
      type: parsedType === "bigint" ? "integer" : parsedType,
      enum: [def.value]
    };
  }
  return {
    type: parsedType === "bigint" ? "integer" : parsedType,
    const: def.value
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/record.js
import { ZodFirstPartyTypeKind as ZodFirstPartyTypeKind2 } from "zod";

// node_modules/zod-to-json-schema/dist/esm/parsers/string.js
var emojiRegex = void 0;
var zodPatterns = {
  /**
   * `c` was changed to `[cC]` to replicate /i flag
   */
  cuid: /^[cC][^\s-]{8,}$/,
  cuid2: /^[0-9a-z]+$/,
  ulid: /^[0-9A-HJKMNP-TV-Z]{26}$/,
  /**
   * `a-z` was added to replicate /i flag
   */
  email: /^(?!\.)(?!.*\.\.)([a-zA-Z0-9_'+\-\.]*)[a-zA-Z0-9_+-]@([a-zA-Z0-9][a-zA-Z0-9\-]*\.)+[a-zA-Z]{2,}$/,
  /**
   * Constructed a valid Unicode RegExp
   *
   * Lazily instantiate since this type of regex isn't supported
   * in all envs (e.g. React Native).
   *
   * See:
   * https://github.com/colinhacks/zod/issues/2433
   * Fix in Zod:
   * https://github.com/colinhacks/zod/commit/9340fd51e48576a75adc919bff65dbc4a5d4c99b
   */
  emoji: () => {
    if (emojiRegex === void 0) {
      emojiRegex = RegExp("^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$", "u");
    }
    return emojiRegex;
  },
  /**
   * Unused
   */
  uuid: /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/,
  /**
   * Unused
   */
  ipv4: /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/,
  ipv4Cidr: /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/,
  /**
   * Unused
   */
  ipv6: /^(([a-f0-9]{1,4}:){7}|::([a-f0-9]{1,4}:){0,6}|([a-f0-9]{1,4}:){1}:([a-f0-9]{1,4}:){0,5}|([a-f0-9]{1,4}:){2}:([a-f0-9]{1,4}:){0,4}|([a-f0-9]{1,4}:){3}:([a-f0-9]{1,4}:){0,3}|([a-f0-9]{1,4}:){4}:([a-f0-9]{1,4}:){0,2}|([a-f0-9]{1,4}:){5}:([a-f0-9]{1,4}:){0,1})([a-f0-9]{1,4}|(((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2}))\.){3}((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2})))$/,
  ipv6Cidr: /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/,
  base64: /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/,
  base64url: /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/,
  nanoid: /^[a-zA-Z0-9_-]{21}$/,
  jwt: /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/
};
function parseStringDef(def, refs) {
  const res = {
    type: "string"
  };
  if (def.checks) {
    for (const check of def.checks) {
      switch (check.kind) {
        case "min":
          setResponseValueAndErrors(res, "minLength", typeof res.minLength === "number" ? Math.max(res.minLength, check.value) : check.value, check.message, refs);
          break;
        case "max":
          setResponseValueAndErrors(res, "maxLength", typeof res.maxLength === "number" ? Math.min(res.maxLength, check.value) : check.value, check.message, refs);
          break;
        case "email":
          switch (refs.emailStrategy) {
            case "format:email":
              addFormat(res, "email", check.message, refs);
              break;
            case "format:idn-email":
              addFormat(res, "idn-email", check.message, refs);
              break;
            case "pattern:zod":
              addPattern(res, zodPatterns.email, check.message, refs);
              break;
          }
          break;
        case "url":
          addFormat(res, "uri", check.message, refs);
          break;
        case "uuid":
          addFormat(res, "uuid", check.message, refs);
          break;
        case "regex":
          addPattern(res, check.regex, check.message, refs);
          break;
        case "cuid":
          addPattern(res, zodPatterns.cuid, check.message, refs);
          break;
        case "cuid2":
          addPattern(res, zodPatterns.cuid2, check.message, refs);
          break;
        case "startsWith":
          addPattern(res, RegExp(`^${escapeLiteralCheckValue(check.value, refs)}`), check.message, refs);
          break;
        case "endsWith":
          addPattern(res, RegExp(`${escapeLiteralCheckValue(check.value, refs)}$`), check.message, refs);
          break;
        case "datetime":
          addFormat(res, "date-time", check.message, refs);
          break;
        case "date":
          addFormat(res, "date", check.message, refs);
          break;
        case "time":
          addFormat(res, "time", check.message, refs);
          break;
        case "duration":
          addFormat(res, "duration", check.message, refs);
          break;
        case "length":
          setResponseValueAndErrors(res, "minLength", typeof res.minLength === "number" ? Math.max(res.minLength, check.value) : check.value, check.message, refs);
          setResponseValueAndErrors(res, "maxLength", typeof res.maxLength === "number" ? Math.min(res.maxLength, check.value) : check.value, check.message, refs);
          break;
        case "includes": {
          addPattern(res, RegExp(escapeLiteralCheckValue(check.value, refs)), check.message, refs);
          break;
        }
        case "ip": {
          if (check.version !== "v6") {
            addFormat(res, "ipv4", check.message, refs);
          }
          if (check.version !== "v4") {
            addFormat(res, "ipv6", check.message, refs);
          }
          break;
        }
        case "base64url":
          addPattern(res, zodPatterns.base64url, check.message, refs);
          break;
        case "jwt":
          addPattern(res, zodPatterns.jwt, check.message, refs);
          break;
        case "cidr": {
          if (check.version !== "v6") {
            addPattern(res, zodPatterns.ipv4Cidr, check.message, refs);
          }
          if (check.version !== "v4") {
            addPattern(res, zodPatterns.ipv6Cidr, check.message, refs);
          }
          break;
        }
        case "emoji":
          addPattern(res, zodPatterns.emoji(), check.message, refs);
          break;
        case "ulid": {
          addPattern(res, zodPatterns.ulid, check.message, refs);
          break;
        }
        case "base64": {
          switch (refs.base64Strategy) {
            case "format:binary": {
              addFormat(res, "binary", check.message, refs);
              break;
            }
            case "contentEncoding:base64": {
              setResponseValueAndErrors(res, "contentEncoding", "base64", check.message, refs);
              break;
            }
            case "pattern:zod": {
              addPattern(res, zodPatterns.base64, check.message, refs);
              break;
            }
          }
          break;
        }
        case "nanoid": {
          addPattern(res, zodPatterns.nanoid, check.message, refs);
        }
        case "toLowerCase":
        case "toUpperCase":
        case "trim":
          break;
        default:
          /* @__PURE__ */ ((_) => {
          })(check);
      }
    }
  }
  return res;
}
function escapeLiteralCheckValue(literal, refs) {
  return refs.patternStrategy === "escape" ? escapeNonAlphaNumeric(literal) : literal;
}
var ALPHA_NUMERIC = new Set("ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvxyz0123456789");
function escapeNonAlphaNumeric(source) {
  let result = "";
  for (let i = 0; i < source.length; i++) {
    if (!ALPHA_NUMERIC.has(source[i])) {
      result += "\\";
    }
    result += source[i];
  }
  return result;
}
function addFormat(schema, value, message, refs) {
  if (schema.format || schema.anyOf?.some((x) => x.format)) {
    if (!schema.anyOf) {
      schema.anyOf = [];
    }
    if (schema.format) {
      schema.anyOf.push({
        format: schema.format,
        ...schema.errorMessage && refs.errorMessages && {
          errorMessage: { format: schema.errorMessage.format }
        }
      });
      delete schema.format;
      if (schema.errorMessage) {
        delete schema.errorMessage.format;
        if (Object.keys(schema.errorMessage).length === 0) {
          delete schema.errorMessage;
        }
      }
    }
    schema.anyOf.push({
      format: value,
      ...message && refs.errorMessages && { errorMessage: { format: message } }
    });
  } else {
    setResponseValueAndErrors(schema, "format", value, message, refs);
  }
}
function addPattern(schema, regex, message, refs) {
  if (schema.pattern || schema.allOf?.some((x) => x.pattern)) {
    if (!schema.allOf) {
      schema.allOf = [];
    }
    if (schema.pattern) {
      schema.allOf.push({
        pattern: schema.pattern,
        ...schema.errorMessage && refs.errorMessages && {
          errorMessage: { pattern: schema.errorMessage.pattern }
        }
      });
      delete schema.pattern;
      if (schema.errorMessage) {
        delete schema.errorMessage.pattern;
        if (Object.keys(schema.errorMessage).length === 0) {
          delete schema.errorMessage;
        }
      }
    }
    schema.allOf.push({
      pattern: stringifyRegExpWithFlags(regex, refs),
      ...message && refs.errorMessages && { errorMessage: { pattern: message } }
    });
  } else {
    setResponseValueAndErrors(schema, "pattern", stringifyRegExpWithFlags(regex, refs), message, refs);
  }
}
function stringifyRegExpWithFlags(regex, refs) {
  if (!refs.applyRegexFlags || !regex.flags) {
    return regex.source;
  }
  const flags = {
    i: regex.flags.includes("i"),
    m: regex.flags.includes("m"),
    s: regex.flags.includes("s")
    // `.` matches newlines
  };
  const source = flags.i ? regex.source.toLowerCase() : regex.source;
  let pattern = "";
  let isEscaped = false;
  let inCharGroup = false;
  let inCharRange = false;
  for (let i = 0; i < source.length; i++) {
    if (isEscaped) {
      pattern += source[i];
      isEscaped = false;
      continue;
    }
    if (flags.i) {
      if (inCharGroup) {
        if (source[i].match(/[a-z]/)) {
          if (inCharRange) {
            pattern += source[i];
            pattern += `${source[i - 2]}-${source[i]}`.toUpperCase();
            inCharRange = false;
          } else if (source[i + 1] === "-" && source[i + 2]?.match(/[a-z]/)) {
            pattern += source[i];
            inCharRange = true;
          } else {
            pattern += `${source[i]}${source[i].toUpperCase()}`;
          }
          continue;
        }
      } else if (source[i].match(/[a-z]/)) {
        pattern += `[${source[i]}${source[i].toUpperCase()}]`;
        continue;
      }
    }
    if (flags.m) {
      if (source[i] === "^") {
        pattern += `(^|(?<=[\r
]))`;
        continue;
      } else if (source[i] === "$") {
        pattern += `($|(?=[\r
]))`;
        continue;
      }
    }
    if (flags.s && source[i] === ".") {
      pattern += inCharGroup ? `${source[i]}\r
` : `[${source[i]}\r
]`;
      continue;
    }
    pattern += source[i];
    if (source[i] === "\\") {
      isEscaped = true;
    } else if (inCharGroup && source[i] === "]") {
      inCharGroup = false;
    } else if (!inCharGroup && source[i] === "[") {
      inCharGroup = true;
    }
  }
  try {
    new RegExp(pattern);
  } catch {
    console.warn(`Could not convert regex pattern at ${refs.currentPath.join("/")} to a flag-independent form! Falling back to the flag-ignorant source`);
    return regex.source;
  }
  return pattern;
}

// node_modules/zod-to-json-schema/dist/esm/parsers/record.js
function parseRecordDef(def, refs) {
  if (refs.target === "openAi") {
    console.warn("Warning: OpenAI may not support records in schemas! Try an array of key-value pairs instead.");
  }
  if (refs.target === "openApi3" && def.keyType?._def.typeName === ZodFirstPartyTypeKind2.ZodEnum) {
    return {
      type: "object",
      required: def.keyType._def.values,
      properties: def.keyType._def.values.reduce((acc, key) => ({
        ...acc,
        [key]: parseDef(def.valueType._def, {
          ...refs,
          currentPath: [...refs.currentPath, "properties", key]
        }) ?? parseAnyDef(refs)
      }), {}),
      additionalProperties: refs.rejectedAdditionalProperties
    };
  }
  const schema = {
    type: "object",
    additionalProperties: parseDef(def.valueType._def, {
      ...refs,
      currentPath: [...refs.currentPath, "additionalProperties"]
    }) ?? refs.allowedAdditionalProperties
  };
  if (refs.target === "openApi3") {
    return schema;
  }
  if (def.keyType?._def.typeName === ZodFirstPartyTypeKind2.ZodString && def.keyType._def.checks?.length) {
    const { type, ...keyType } = parseStringDef(def.keyType._def, refs);
    return {
      ...schema,
      propertyNames: keyType
    };
  } else if (def.keyType?._def.typeName === ZodFirstPartyTypeKind2.ZodEnum) {
    return {
      ...schema,
      propertyNames: {
        enum: def.keyType._def.values
      }
    };
  } else if (def.keyType?._def.typeName === ZodFirstPartyTypeKind2.ZodBranded && def.keyType._def.type._def.typeName === ZodFirstPartyTypeKind2.ZodString && def.keyType._def.type._def.checks?.length) {
    const { type, ...keyType } = parseBrandedDef(def.keyType._def, refs);
    return {
      ...schema,
      propertyNames: keyType
    };
  }
  return schema;
}

// node_modules/zod-to-json-schema/dist/esm/parsers/map.js
function parseMapDef(def, refs) {
  if (refs.mapStrategy === "record") {
    return parseRecordDef(def, refs);
  }
  const keys = parseDef(def.keyType._def, {
    ...refs,
    currentPath: [...refs.currentPath, "items", "items", "0"]
  }) || parseAnyDef(refs);
  const values = parseDef(def.valueType._def, {
    ...refs,
    currentPath: [...refs.currentPath, "items", "items", "1"]
  }) || parseAnyDef(refs);
  return {
    type: "array",
    maxItems: 125,
    items: {
      type: "array",
      items: [keys, values],
      minItems: 2,
      maxItems: 2
    }
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/nativeEnum.js
function parseNativeEnumDef(def) {
  const object = def.values;
  const actualKeys = Object.keys(def.values).filter((key) => {
    return typeof object[object[key]] !== "number";
  });
  const actualValues = actualKeys.map((key) => object[key]);
  const parsedTypes = Array.from(new Set(actualValues.map((values) => typeof values)));
  return {
    type: parsedTypes.length === 1 ? parsedTypes[0] === "string" ? "string" : "number" : ["string", "number"],
    enum: actualValues
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/never.js
function parseNeverDef(refs) {
  return refs.target === "openAi" ? void 0 : {
    not: parseAnyDef({
      ...refs,
      currentPath: [...refs.currentPath, "not"]
    })
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/null.js
function parseNullDef(refs) {
  return refs.target === "openApi3" ? {
    enum: ["null"],
    nullable: true
  } : {
    type: "null"
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/union.js
var primitiveMappings = {
  ZodString: "string",
  ZodNumber: "number",
  ZodBigInt: "integer",
  ZodBoolean: "boolean",
  ZodNull: "null"
};
function parseUnionDef(def, refs) {
  if (refs.target === "openApi3")
    return asAnyOf(def, refs);
  const options = def.options instanceof Map ? Array.from(def.options.values()) : def.options;
  if (options.every((x) => x._def.typeName in primitiveMappings && (!x._def.checks || !x._def.checks.length))) {
    const types = options.reduce((types2, x) => {
      const type = primitiveMappings[x._def.typeName];
      return type && !types2.includes(type) ? [...types2, type] : types2;
    }, []);
    return {
      type: types.length > 1 ? types : types[0]
    };
  } else if (options.every((x) => x._def.typeName === "ZodLiteral" && !x.description)) {
    const types = options.reduce((acc, x) => {
      const type = typeof x._def.value;
      switch (type) {
        case "string":
        case "number":
        case "boolean":
          return [...acc, type];
        case "bigint":
          return [...acc, "integer"];
        case "object":
          if (x._def.value === null)
            return [...acc, "null"];
        case "symbol":
        case "undefined":
        case "function":
        default:
          return acc;
      }
    }, []);
    if (types.length === options.length) {
      const uniqueTypes = types.filter((x, i, a) => a.indexOf(x) === i);
      return {
        type: uniqueTypes.length > 1 ? uniqueTypes : uniqueTypes[0],
        enum: options.reduce((acc, x) => {
          return acc.includes(x._def.value) ? acc : [...acc, x._def.value];
        }, [])
      };
    }
  } else if (options.every((x) => x._def.typeName === "ZodEnum")) {
    return {
      type: "string",
      enum: options.reduce((acc, x) => [
        ...acc,
        ...x._def.values.filter((x2) => !acc.includes(x2))
      ], [])
    };
  }
  return asAnyOf(def, refs);
}
var asAnyOf = (def, refs) => {
  const anyOf = (def.options instanceof Map ? Array.from(def.options.values()) : def.options).map((x, i) => parseDef(x._def, {
    ...refs,
    currentPath: [...refs.currentPath, "anyOf", `${i}`]
  })).filter((x) => !!x && (!refs.strictUnions || typeof x === "object" && Object.keys(x).length > 0));
  return anyOf.length ? { anyOf } : void 0;
};

// node_modules/zod-to-json-schema/dist/esm/parsers/nullable.js
function parseNullableDef(def, refs) {
  if (["ZodString", "ZodNumber", "ZodBigInt", "ZodBoolean", "ZodNull"].includes(def.innerType._def.typeName) && (!def.innerType._def.checks || !def.innerType._def.checks.length)) {
    if (refs.target === "openApi3") {
      return {
        type: primitiveMappings[def.innerType._def.typeName],
        nullable: true
      };
    }
    return {
      type: [
        primitiveMappings[def.innerType._def.typeName],
        "null"
      ]
    };
  }
  if (refs.target === "openApi3") {
    const base2 = parseDef(def.innerType._def, {
      ...refs,
      currentPath: [...refs.currentPath]
    });
    if (base2 && "$ref" in base2)
      return { allOf: [base2], nullable: true };
    return base2 && { ...base2, nullable: true };
  }
  const base = parseDef(def.innerType._def, {
    ...refs,
    currentPath: [...refs.currentPath, "anyOf", "0"]
  });
  return base && { anyOf: [base, { type: "null" }] };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/number.js
function parseNumberDef(def, refs) {
  const res = {
    type: "number"
  };
  if (!def.checks)
    return res;
  for (const check of def.checks) {
    switch (check.kind) {
      case "int":
        res.type = "integer";
        addErrorMessage(res, "type", check.message, refs);
        break;
      case "min":
        if (refs.target === "jsonSchema7") {
          if (check.inclusive) {
            setResponseValueAndErrors(res, "minimum", check.value, check.message, refs);
          } else {
            setResponseValueAndErrors(res, "exclusiveMinimum", check.value, check.message, refs);
          }
        } else {
          if (!check.inclusive) {
            res.exclusiveMinimum = true;
          }
          setResponseValueAndErrors(res, "minimum", check.value, check.message, refs);
        }
        break;
      case "max":
        if (refs.target === "jsonSchema7") {
          if (check.inclusive) {
            setResponseValueAndErrors(res, "maximum", check.value, check.message, refs);
          } else {
            setResponseValueAndErrors(res, "exclusiveMaximum", check.value, check.message, refs);
          }
        } else {
          if (!check.inclusive) {
            res.exclusiveMaximum = true;
          }
          setResponseValueAndErrors(res, "maximum", check.value, check.message, refs);
        }
        break;
      case "multipleOf":
        setResponseValueAndErrors(res, "multipleOf", check.value, check.message, refs);
        break;
    }
  }
  return res;
}

// node_modules/zod-to-json-schema/dist/esm/parsers/object.js
function parseObjectDef(def, refs) {
  const forceOptionalIntoNullable = refs.target === "openAi";
  const result = {
    type: "object",
    properties: {}
  };
  const required = [];
  const shape = def.shape();
  for (const propName in shape) {
    let propDef = shape[propName];
    if (propDef === void 0 || propDef._def === void 0) {
      continue;
    }
    let propOptional = safeIsOptional(propDef);
    if (propOptional && forceOptionalIntoNullable) {
      if (propDef._def.typeName === "ZodOptional") {
        propDef = propDef._def.innerType;
      }
      if (!propDef.isNullable()) {
        propDef = propDef.nullable();
      }
      propOptional = false;
    }
    const parsedDef = parseDef(propDef._def, {
      ...refs,
      currentPath: [...refs.currentPath, "properties", propName],
      propertyPath: [...refs.currentPath, "properties", propName]
    });
    if (parsedDef === void 0) {
      continue;
    }
    result.properties[propName] = parsedDef;
    if (!propOptional) {
      required.push(propName);
    }
  }
  if (required.length) {
    result.required = required;
  }
  const additionalProperties = decideAdditionalProperties(def, refs);
  if (additionalProperties !== void 0) {
    result.additionalProperties = additionalProperties;
  }
  return result;
}
function decideAdditionalProperties(def, refs) {
  if (def.catchall._def.typeName !== "ZodNever") {
    return parseDef(def.catchall._def, {
      ...refs,
      currentPath: [...refs.currentPath, "additionalProperties"]
    });
  }
  switch (def.unknownKeys) {
    case "passthrough":
      return refs.allowedAdditionalProperties;
    case "strict":
      return refs.rejectedAdditionalProperties;
    case "strip":
      return refs.removeAdditionalStrategy === "strict" ? refs.allowedAdditionalProperties : refs.rejectedAdditionalProperties;
  }
}
function safeIsOptional(schema) {
  try {
    return schema.isOptional();
  } catch {
    return true;
  }
}

// node_modules/zod-to-json-schema/dist/esm/parsers/optional.js
var parseOptionalDef = (def, refs) => {
  if (refs.currentPath.toString() === refs.propertyPath?.toString()) {
    return parseDef(def.innerType._def, refs);
  }
  const innerSchema = parseDef(def.innerType._def, {
    ...refs,
    currentPath: [...refs.currentPath, "anyOf", "1"]
  });
  return innerSchema ? {
    anyOf: [
      {
        not: parseAnyDef(refs)
      },
      innerSchema
    ]
  } : parseAnyDef(refs);
};

// node_modules/zod-to-json-schema/dist/esm/parsers/pipeline.js
var parsePipelineDef = (def, refs) => {
  if (refs.pipeStrategy === "input") {
    return parseDef(def.in._def, refs);
  } else if (refs.pipeStrategy === "output") {
    return parseDef(def.out._def, refs);
  }
  const a = parseDef(def.in._def, {
    ...refs,
    currentPath: [...refs.currentPath, "allOf", "0"]
  });
  const b = parseDef(def.out._def, {
    ...refs,
    currentPath: [...refs.currentPath, "allOf", a ? "1" : "0"]
  });
  return {
    allOf: [a, b].filter((x) => x !== void 0)
  };
};

// node_modules/zod-to-json-schema/dist/esm/parsers/promise.js
function parsePromiseDef(def, refs) {
  return parseDef(def.type._def, refs);
}

// node_modules/zod-to-json-schema/dist/esm/parsers/set.js
function parseSetDef(def, refs) {
  const items = parseDef(def.valueType._def, {
    ...refs,
    currentPath: [...refs.currentPath, "items"]
  });
  const schema = {
    type: "array",
    uniqueItems: true,
    items
  };
  if (def.minSize) {
    setResponseValueAndErrors(schema, "minItems", def.minSize.value, def.minSize.message, refs);
  }
  if (def.maxSize) {
    setResponseValueAndErrors(schema, "maxItems", def.maxSize.value, def.maxSize.message, refs);
  }
  return schema;
}

// node_modules/zod-to-json-schema/dist/esm/parsers/tuple.js
function parseTupleDef(def, refs) {
  if (def.rest) {
    return {
      type: "array",
      minItems: def.items.length,
      items: def.items.map((x, i) => parseDef(x._def, {
        ...refs,
        currentPath: [...refs.currentPath, "items", `${i}`]
      })).reduce((acc, x) => x === void 0 ? acc : [...acc, x], []),
      additionalItems: parseDef(def.rest._def, {
        ...refs,
        currentPath: [...refs.currentPath, "additionalItems"]
      })
    };
  } else {
    return {
      type: "array",
      minItems: def.items.length,
      maxItems: def.items.length,
      items: def.items.map((x, i) => parseDef(x._def, {
        ...refs,
        currentPath: [...refs.currentPath, "items", `${i}`]
      })).reduce((acc, x) => x === void 0 ? acc : [...acc, x], [])
    };
  }
}

// node_modules/zod-to-json-schema/dist/esm/parsers/undefined.js
function parseUndefinedDef(refs) {
  return {
    not: parseAnyDef(refs)
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/unknown.js
function parseUnknownDef(refs) {
  return parseAnyDef(refs);
}

// node_modules/zod-to-json-schema/dist/esm/parsers/readonly.js
var parseReadonlyDef = (def, refs) => {
  return parseDef(def.innerType._def, refs);
};

// node_modules/zod-to-json-schema/dist/esm/selectParser.js
var selectParser = (def, typeName, refs) => {
  switch (typeName) {
    case ZodFirstPartyTypeKind3.ZodString:
      return parseStringDef(def, refs);
    case ZodFirstPartyTypeKind3.ZodNumber:
      return parseNumberDef(def, refs);
    case ZodFirstPartyTypeKind3.ZodObject:
      return parseObjectDef(def, refs);
    case ZodFirstPartyTypeKind3.ZodBigInt:
      return parseBigintDef(def, refs);
    case ZodFirstPartyTypeKind3.ZodBoolean:
      return parseBooleanDef();
    case ZodFirstPartyTypeKind3.ZodDate:
      return parseDateDef(def, refs);
    case ZodFirstPartyTypeKind3.ZodUndefined:
      return parseUndefinedDef(refs);
    case ZodFirstPartyTypeKind3.ZodNull:
      return parseNullDef(refs);
    case ZodFirstPartyTypeKind3.ZodArray:
      return parseArrayDef(def, refs);
    case ZodFirstPartyTypeKind3.ZodUnion:
    case ZodFirstPartyTypeKind3.ZodDiscriminatedUnion:
      return parseUnionDef(def, refs);
    case ZodFirstPartyTypeKind3.ZodIntersection:
      return parseIntersectionDef(def, refs);
    case ZodFirstPartyTypeKind3.ZodTuple:
      return parseTupleDef(def, refs);
    case ZodFirstPartyTypeKind3.ZodRecord:
      return parseRecordDef(def, refs);
    case ZodFirstPartyTypeKind3.ZodLiteral:
      return parseLiteralDef(def, refs);
    case ZodFirstPartyTypeKind3.ZodEnum:
      return parseEnumDef(def);
    case ZodFirstPartyTypeKind3.ZodNativeEnum:
      return parseNativeEnumDef(def);
    case ZodFirstPartyTypeKind3.ZodNullable:
      return parseNullableDef(def, refs);
    case ZodFirstPartyTypeKind3.ZodOptional:
      return parseOptionalDef(def, refs);
    case ZodFirstPartyTypeKind3.ZodMap:
      return parseMapDef(def, refs);
    case ZodFirstPartyTypeKind3.ZodSet:
      return parseSetDef(def, refs);
    case ZodFirstPartyTypeKind3.ZodLazy:
      return () => def.getter()._def;
    case ZodFirstPartyTypeKind3.ZodPromise:
      return parsePromiseDef(def, refs);
    case ZodFirstPartyTypeKind3.ZodNaN:
    case ZodFirstPartyTypeKind3.ZodNever:
      return parseNeverDef(refs);
    case ZodFirstPartyTypeKind3.ZodEffects:
      return parseEffectsDef(def, refs);
    case ZodFirstPartyTypeKind3.ZodAny:
      return parseAnyDef(refs);
    case ZodFirstPartyTypeKind3.ZodUnknown:
      return parseUnknownDef(refs);
    case ZodFirstPartyTypeKind3.ZodDefault:
      return parseDefaultDef(def, refs);
    case ZodFirstPartyTypeKind3.ZodBranded:
      return parseBrandedDef(def, refs);
    case ZodFirstPartyTypeKind3.ZodReadonly:
      return parseReadonlyDef(def, refs);
    case ZodFirstPartyTypeKind3.ZodCatch:
      return parseCatchDef(def, refs);
    case ZodFirstPartyTypeKind3.ZodPipeline:
      return parsePipelineDef(def, refs);
    case ZodFirstPartyTypeKind3.ZodFunction:
    case ZodFirstPartyTypeKind3.ZodVoid:
    case ZodFirstPartyTypeKind3.ZodSymbol:
      return void 0;
    default:
      return /* @__PURE__ */ ((_) => void 0)(typeName);
  }
};

// node_modules/zod-to-json-schema/dist/esm/parseDef.js
function parseDef(def, refs, forceResolution = false) {
  const seenItem = refs.seen.get(def);
  if (refs.override) {
    const overrideResult = refs.override?.(def, refs, seenItem, forceResolution);
    if (overrideResult !== ignoreOverride) {
      return overrideResult;
    }
  }
  if (seenItem && !forceResolution) {
    const seenSchema = get$ref(seenItem, refs);
    if (seenSchema !== void 0) {
      return seenSchema;
    }
  }
  const newItem = { def, path: refs.currentPath, jsonSchema: void 0 };
  refs.seen.set(def, newItem);
  const jsonSchemaOrGetter = selectParser(def, def.typeName, refs);
  const jsonSchema = typeof jsonSchemaOrGetter === "function" ? parseDef(jsonSchemaOrGetter(), refs) : jsonSchemaOrGetter;
  if (jsonSchema) {
    addMeta(def, refs, jsonSchema);
  }
  if (refs.postProcess) {
    const postProcessResult = refs.postProcess(jsonSchema, def, refs);
    newItem.jsonSchema = jsonSchema;
    return postProcessResult;
  }
  newItem.jsonSchema = jsonSchema;
  return jsonSchema;
}
var get$ref = (item, refs) => {
  switch (refs.$refStrategy) {
    case "root":
      return { $ref: item.path.join("/") };
    case "relative":
      return { $ref: getRelativePath(refs.currentPath, item.path) };
    case "none":
    case "seen": {
      if (item.path.length < refs.currentPath.length && item.path.every((value, index) => refs.currentPath[index] === value)) {
        console.warn(`Recursive reference detected at ${refs.currentPath.join("/")}! Defaulting to any`);
        return parseAnyDef(refs);
      }
      return refs.$refStrategy === "seen" ? parseAnyDef(refs) : void 0;
    }
  }
};
var addMeta = (def, refs, jsonSchema) => {
  if (def.description) {
    jsonSchema.description = def.description;
    if (refs.markdownDescription) {
      jsonSchema.markdownDescription = def.description;
    }
  }
  return jsonSchema;
};

// node_modules/zod-to-json-schema/dist/esm/zodToJsonSchema.js
var zodToJsonSchema2 = (schema, options) => {
  const refs = getRefs(options);
  let definitions = typeof options === "object" && options.definitions ? Object.entries(options.definitions).reduce((acc, [name2, schema2]) => ({
    ...acc,
    [name2]: parseDef(schema2._def, {
      ...refs,
      currentPath: [...refs.basePath, refs.definitionPath, name2]
    }, true) ?? parseAnyDef(refs)
  }), {}) : void 0;
  const name = typeof options === "string" ? options : options?.nameStrategy === "title" ? void 0 : options?.name;
  const main2 = parseDef(schema._def, name === void 0 ? refs : {
    ...refs,
    currentPath: [...refs.basePath, refs.definitionPath, name]
  }, false) ?? parseAnyDef(refs);
  const title = typeof options === "object" && options.name !== void 0 && options.nameStrategy === "title" ? options.name : void 0;
  if (title !== void 0) {
    main2.title = title;
  }
  if (refs.flags.hasReferencedOpenAiAnyType) {
    if (!definitions) {
      definitions = {};
    }
    if (!definitions[refs.openAiAnyTypeName]) {
      definitions[refs.openAiAnyTypeName] = {
        // Skipping "object" as no properties can be defined and additionalProperties must be "false"
        type: ["string", "number", "integer", "boolean", "array", "null"],
        items: {
          $ref: refs.$refStrategy === "relative" ? "1" : [
            ...refs.basePath,
            refs.definitionPath,
            refs.openAiAnyTypeName
          ].join("/")
        }
      };
    }
  }
  const combined = name === void 0 ? definitions ? {
    ...main2,
    [refs.definitionPath]: definitions
  } : main2 : {
    $ref: [
      ...refs.$refStrategy === "relative" ? [] : refs.basePath,
      refs.definitionPath,
      name
    ].join("/"),
    [refs.definitionPath]: {
      ...definitions,
      [name]: main2
    }
  };
  if (refs.target === "jsonSchema7") {
    combined.$schema = "http://json-schema.org/draft-07/schema#";
  } else if (refs.target === "jsonSchema2019-09" || refs.target === "openAi") {
    combined.$schema = "https://json-schema.org/draft/2019-09/schema#";
  }
  if (refs.target === "openAi" && ("anyOf" in combined || "oneOf" in combined || "allOf" in combined || "type" in combined && Array.isArray(combined.type))) {
    console.warn("Warning: OpenAI may not support schemas with unions as roots! Try wrapping it in an object property.");
  }
  return combined;
};

// src/tools/relationship-tools.ts
import { ErrorCode as ErrorCode2, McpError as McpError2 } from "@modelcontextprotocol/sdk/types.js";
var memoryStore2 = new MemoryStore();
var relationshipTools = {
  link_memories: {
    description: "Create a relationship between two memories",
    inputSchema: zodToJsonSchema2(LinkMemoriesSchema),
    handler: async (args) => {
      try {
        const relationship = await memoryStore2.createRelationship(
          args.from_memory_id,
          args.to_memory_id,
          args.relationship_type,
          args.metadata
        );
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              relationship_id: relationship.id,
              from_memory_id: relationship.from_memory_id,
              to_memory_id: relationship.to_memory_id,
              relationship_type: relationship.relationship_type,
              created_at: relationship.created_at,
              message: `Successfully linked memories with ${relationship.relationship_type} relationship`
            }, null, 2)
          }]
        };
      } catch (error) {
        if (error instanceof McpError2) throw error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new McpError2(ErrorCode2.InternalError, `Failed to link memories: ${errorMessage}`);
      }
    }
  },
  get_related_memories: {
    description: "Get memories related to a given memory with graph traversal",
    inputSchema: zodToJsonSchema2(GetRelatedMemoriesSchema),
    handler: async (args) => {
      try {
        const results = await memoryStore2.getRelatedMemories(args.memory_id, {
          relationshipTypes: args.relationship_types,
          depth: args.depth,
          direction: args.direction
        });
        const formatted = results.map((result) => ({
          memory_id: result.memory.id,
          content: result.memory.content,
          summary: result.memory.summary,
          context_type: result.memory.context_type,
          importance: result.memory.importance,
          tags: result.memory.tags,
          is_global: result.memory.is_global,
          relationship: {
            id: result.relationship.id,
            type: result.relationship.relationship_type,
            from: result.relationship.from_memory_id,
            to: result.relationship.to_memory_id
          },
          depth: result.depth
        }));
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              root_memory_id: args.memory_id,
              total_related: results.length,
              max_depth: args.depth,
              direction: args.direction,
              related_memories: formatted
            }, null, 2)
          }]
        };
      } catch (error) {
        if (error instanceof McpError2) throw error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new McpError2(ErrorCode2.InternalError, `Failed to get related memories: ${errorMessage}`);
      }
    }
  },
  unlink_memories: {
    description: "Remove a relationship between memories",
    inputSchema: zodToJsonSchema2(UnlinkMemoriesSchema),
    handler: async (args) => {
      try {
        const deleted = await memoryStore2.deleteRelationship(args.relationship_id);
        if (!deleted) {
          throw new McpError2(ErrorCode2.InvalidRequest, `Relationship not found: ${args.relationship_id}`);
        }
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              relationship_id: args.relationship_id,
              message: "Relationship removed successfully"
            }, null, 2)
          }]
        };
      } catch (error) {
        if (error instanceof McpError2) throw error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new McpError2(ErrorCode2.InternalError, `Failed to unlink memories: ${errorMessage}`);
      }
    }
  },
  get_memory_graph: {
    description: "Get a graph of related memories starting from a root memory",
    inputSchema: zodToJsonSchema2(GetMemoryGraphSchema),
    handler: async (args) => {
      try {
        const graph = await memoryStore2.getMemoryGraph(
          args.memory_id,
          args.max_depth,
          args.max_nodes
        );
        const formattedNodes = Object.fromEntries(
          Object.entries(graph.nodes).map(([memoryId, node]) => [
            memoryId,
            {
              memory_id: node.memory.id,
              content: node.memory.content,
              summary: node.memory.summary,
              context_type: node.memory.context_type,
              importance: node.memory.importance,
              tags: node.memory.tags,
              is_global: node.memory.is_global,
              depth: node.depth,
              relationships: node.relationships.map((rel) => ({
                id: rel.id,
                type: rel.relationship_type,
                from: rel.from_memory_id,
                to: rel.to_memory_id
              }))
            }
          ])
        );
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              root_memory_id: graph.root_memory_id,
              total_nodes: graph.total_nodes,
              max_depth_reached: graph.max_depth_reached,
              nodes: formattedNodes
            }, null, 2)
          }]
        };
      } catch (error) {
        if (error instanceof McpError2) throw error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new McpError2(ErrorCode2.InternalError, `Failed to get memory graph: ${errorMessage}`);
      }
    }
  }
};

// src/tools/index.ts
var memoryStore3 = new MemoryStore();
var tools = {
  // Context management tools
  recall_relevant_context,
  analyze_and_remember,
  summarize_session,
  // Export/Import tools
  export_memories: {
    description: "Export memories to JSON format with optional filtering",
    inputSchema: zodToJsonSchema3(ExportMemoriesSchema),
    handler: async (args) => {
      try {
        return await exportMemories(args);
      } catch (error) {
        throw new McpError3(
          ErrorCode3.InternalError,
          `Failed to export memories: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  },
  import_memories: {
    description: "Import memories from JSON export data",
    inputSchema: zodToJsonSchema3(ImportMemoriesSchema),
    handler: async (args) => {
      try {
        return await importMemories(args);
      } catch (error) {
        throw new McpError3(
          ErrorCode3.InternalError,
          `Failed to import memories: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  },
  find_duplicates: {
    description: "Find and optionally merge duplicate memories based on similarity",
    inputSchema: zodToJsonSchema3(FindDuplicatesSchema),
    handler: async (args) => {
      try {
        return await findDuplicates(args);
      } catch (error) {
        throw new McpError3(
          ErrorCode3.InternalError,
          `Failed to find duplicates: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  },
  consolidate_memories: {
    description: "Manually consolidate multiple memories into one",
    inputSchema: zodToJsonSchema3(ConsolidateMemoriesSchema),
    handler: async (args) => {
      try {
        return await consolidateMemories(args);
      } catch (error) {
        throw new McpError3(
          ErrorCode3.InternalError,
          `Failed to consolidate memories: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  },
  // Original memory tools
  store_memory: {
    description: "Store a new memory/context entry for long-term persistence",
    inputSchema: zodToJsonSchema3(CreateMemorySchema),
    handler: async (args) => {
      try {
        const memory = await memoryStore3.createMemory(args);
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
        throw new McpError3(
          ErrorCode3.InternalError,
          `Failed to store memory: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  },
  store_batch_memories: {
    description: "Store multiple memories in a batch operation",
    inputSchema: zodToJsonSchema3(BatchCreateMemoriesSchema),
    handler: async (args) => {
      try {
        const memories = await memoryStore3.createMemories(args.memories);
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
        throw new McpError3(
          ErrorCode3.InternalError,
          `Failed to store memories: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  },
  update_memory: {
    description: "Update an existing memory entry",
    inputSchema: zodToJsonSchema3(UpdateMemorySchema),
    handler: async (args) => {
      try {
        const { memory_id, ...updates } = args;
        const memory = await memoryStore3.updateMemory(memory_id, updates);
        if (!memory) {
          throw new McpError3(ErrorCode3.InvalidRequest, `Memory ${memory_id} not found`);
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
        if (error instanceof McpError3) throw error;
        throw new McpError3(
          ErrorCode3.InternalError,
          `Failed to update memory: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  },
  delete_memory: {
    description: "Delete a memory entry",
    inputSchema: zodToJsonSchema3(DeleteMemorySchema),
    handler: async (args) => {
      try {
        const success = await memoryStore3.deleteMemory(args.memory_id);
        if (!success) {
          throw new McpError3(ErrorCode3.InvalidRequest, `Memory ${args.memory_id} not found`);
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
        if (error instanceof McpError3) throw error;
        throw new McpError3(
          ErrorCode3.InternalError,
          `Failed to delete memory: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  },
  search_memories: {
    description: "Search memories using semantic similarity",
    inputSchema: zodToJsonSchema3(SearchMemorySchema),
    handler: async (args) => {
      try {
        const results = await memoryStore3.searchMemories(
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
        throw new McpError3(
          ErrorCode3.InternalError,
          `Failed to search memories: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  },
  organize_session: {
    description: "Create a session snapshot grouping related memories",
    inputSchema: zodToJsonSchema3(OrganizeSessionSchema),
    handler: async (args) => {
      try {
        const session = await memoryStore3.createSession(
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
        throw new McpError3(
          ErrorCode3.InternalError,
          `Failed to organize session: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  },
  // Global memory conversion tools
  convert_to_global: {
    description: "Convert a workspace-specific memory to global (accessible across all workspaces)",
    inputSchema: zodToJsonSchema3(ConvertToGlobalSchema),
    handler: async (args) => {
      try {
        const result = await memoryStore3.convertToGlobal(args.memory_id);
        if (!result) {
          throw new McpError3(
            ErrorCode3.InvalidRequest,
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
        if (error instanceof McpError3) throw error;
        throw new McpError3(
          ErrorCode3.InternalError,
          `Failed to convert memory to global: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  },
  convert_to_workspace: {
    description: "Convert a global memory to workspace-specific",
    inputSchema: zodToJsonSchema3(ConvertToWorkspaceSchema),
    handler: async (args) => {
      try {
        const result = await memoryStore3.convertToWorkspace(
          args.memory_id,
          args.workspace_id
        );
        if (!result) {
          throw new McpError3(
            ErrorCode3.InvalidRequest,
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
        if (error instanceof McpError3) throw error;
        throw new McpError3(
          ErrorCode3.InternalError,
          `Failed to convert memory to workspace: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  },
  // Relationship tools (v1.4.0)
  ...relationshipTools
};
function zodToJsonSchema3(schema) {
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
    return zodToJsonSchema3(schema);
  }
  return { type: "string" };
}

// src/resources/index.ts
import { McpError as McpError4, ErrorCode as ErrorCode4 } from "@modelcontextprotocol/sdk/types.js";

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
var memoryStore4 = new MemoryStore();
var redis = getRedisClient();
var resources = {
  "memory://recent": {
    name: "Recent Memories",
    description: "Get the most recent memories (default: 50)",
    mimeType: "application/json",
    handler: async (uri) => {
      const limit = parseInt(uri.searchParams.get("limit") || "50", 10);
      const memories = await memoryStore4.getRecentMemories(limit);
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
      const memories = await memoryStore4.getMemoriesByType(type, limit);
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
      const memories = await memoryStore4.getMemoriesByTag(tag, limit);
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
      const memories = await memoryStore4.getImportantMemories(minImportance, limit);
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
      const session = await memoryStore4.getSession(session_id);
      if (!session) {
        throw new McpError4(ErrorCode4.InvalidRequest, `Session ${session_id} not found`);
      }
      const memories = await memoryStore4.getSessionMemories(session_id);
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
      const sessions = await memoryStore4.getAllSessions();
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
      const stats = await memoryStore4.getSummaryStats();
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
        throw new McpError4(ErrorCode4.InvalidRequest, 'Query parameter "q" is required');
      }
      const limit = parseInt(uri.searchParams.get("limit") || "10", 10);
      const minImportance = uri.searchParams.get("min_importance") ? parseInt(uri.searchParams.get("min_importance"), 10) : void 0;
      const results = await memoryStore4.searchMemories(query, limit, minImportance);
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
        throw new McpError4(
          ErrorCode4.InvalidRequest,
          "Global memories are not available in isolated mode. Set WORKSPACE_MODE=hybrid or global to access global memories."
        );
      }
      const limit = parseInt(uri.searchParams.get("limit") || "50", 10);
      const ids = await redis.zrevrange(RedisKeys.globalTimeline(), 0, limit - 1);
      const memories = await memoryStore4.getMemories(ids);
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
        throw new McpError4(
          ErrorCode4.InvalidRequest,
          "Global memories are not available in isolated mode. Set WORKSPACE_MODE=hybrid or global to access global memories."
        );
      }
      const type = params.type;
      const limit = uri.searchParams.get("limit") ? parseInt(uri.searchParams.get("limit"), 10) : void 0;
      const ids = await redis.smembers(RedisKeys.globalByType(type));
      const allMemories = await memoryStore4.getMemories(ids);
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
        throw new McpError4(
          ErrorCode4.InvalidRequest,
          "Global memories are not available in isolated mode. Set WORKSPACE_MODE=hybrid or global to access global memories."
        );
      }
      const { tag } = params;
      const limit = uri.searchParams.get("limit") ? parseInt(uri.searchParams.get("limit"), 10) : void 0;
      const ids = await redis.smembers(RedisKeys.globalByTag(tag));
      const allMemories = await memoryStore4.getMemories(ids);
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
        throw new McpError4(
          ErrorCode4.InvalidRequest,
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
      const memories = await memoryStore4.getMemories(results);
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
        throw new McpError4(
          ErrorCode4.InvalidRequest,
          "Global memories are not available in isolated mode. Set WORKSPACE_MODE=hybrid or global to access global memories."
        );
      }
      const query = uri.searchParams.get("q");
      if (!query) {
        throw new McpError4(ErrorCode4.InvalidRequest, 'Query parameter "q" is required');
      }
      const limit = parseInt(uri.searchParams.get("limit") || "10", 10);
      const originalMode = process.env.WORKSPACE_MODE;
      process.env.WORKSPACE_MODE = "global";
      try {
        const results = await memoryStore4.searchMemories(query, limit);
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
  },
  // ============================================================================
  // Relationship Resources (v1.4.0)
  // ============================================================================
  "memory://relationships": {
    name: "All Memory Relationships",
    description: "List all memory relationships in the current workspace",
    mimeType: "application/json",
    handler: async (uri) => {
      const limit = parseInt(uri.searchParams.get("limit") || "100", 10);
      const mode = getWorkspaceMode();
      let relationshipIds = [];
      if (mode === "isolated" /* ISOLATED */ || mode === "hybrid" /* HYBRID */) {
        const workspaceIds = await redis.smembers(RedisKeys.relationships(memoryStore4["workspaceId"]));
        relationshipIds.push(...workspaceIds);
      }
      if (mode === "global" /* GLOBAL */ || mode === "hybrid" /* HYBRID */) {
        const globalIds = await redis.smembers(RedisKeys.globalRelationships());
        relationshipIds.push(...globalIds);
      }
      relationshipIds = relationshipIds.slice(0, limit);
      const relationships = await Promise.all(
        relationshipIds.map(async (id) => {
          const rel = await memoryStore4.getRelationship(id);
          return rel;
        })
      );
      const validRelationships = relationships.filter((r) => r !== null);
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(
              {
                count: validRelationships.length,
                workspace_mode: mode,
                relationships: validRelationships.map((r) => ({
                  id: r.id,
                  from_memory_id: r.from_memory_id,
                  to_memory_id: r.to_memory_id,
                  relationship_type: r.relationship_type,
                  created_at: r.created_at,
                  metadata: r.metadata
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
  "memory://memory/{id}/related": {
    name: "Related Memories",
    description: "Get memories related to a specific memory",
    mimeType: "application/json",
    handler: async (uri) => {
      const memoryId = uri.pathname.split("/")[2];
      if (!memoryId) {
        throw new McpError4(ErrorCode4.InvalidRequest, "Memory ID is required");
      }
      const depth = parseInt(uri.searchParams.get("depth") || "1", 10);
      const direction = uri.searchParams.get("direction") || "both";
      const results = await memoryStore4.getRelatedMemories(memoryId, {
        depth,
        direction
      });
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(
              {
                root_memory_id: memoryId,
                total_related: results.length,
                depth,
                direction,
                related_memories: results.map((r) => ({
                  memory_id: r.memory.id,
                  content: r.memory.content,
                  summary: r.memory.summary,
                  context_type: r.memory.context_type,
                  importance: r.memory.importance,
                  tags: r.memory.tags,
                  is_global: r.memory.is_global,
                  relationship: {
                    id: r.relationship.id,
                    type: r.relationship.relationship_type,
                    from: r.relationship.from_memory_id,
                    to: r.relationship.to_memory_id
                  },
                  depth: r.depth
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
  "memory://graph/{id}": {
    name: "Memory Graph",
    description: "Get a graph of related memories starting from a root memory",
    mimeType: "application/json",
    handler: async (uri) => {
      const memoryId = uri.pathname.split("/")[2];
      if (!memoryId) {
        throw new McpError4(ErrorCode4.InvalidRequest, "Memory ID is required");
      }
      const maxDepth = parseInt(uri.searchParams.get("depth") || "2", 10);
      const maxNodes = parseInt(uri.searchParams.get("max_nodes") || "50", 10);
      const graph = await memoryStore4.getMemoryGraph(memoryId, maxDepth, maxNodes);
      const formattedNodes = Object.fromEntries(
        Object.entries(graph.nodes).map(([nodeId, node]) => [
          nodeId,
          {
            memory_id: node.memory.id,
            content: node.memory.content,
            summary: node.memory.summary,
            context_type: node.memory.context_type,
            importance: node.memory.importance,
            tags: node.memory.tags,
            is_global: node.memory.is_global,
            depth: node.depth,
            relationships: node.relationships.map((rel) => ({
              id: rel.id,
              type: rel.relationship_type,
              from: rel.from_memory_id,
              to: rel.to_memory_id
            }))
          }
        ])
      );
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(
              {
                root_memory_id: graph.root_memory_id,
                total_nodes: graph.total_nodes,
                max_depth_reached: graph.max_depth_reached,
                nodes: formattedNodes
              },
              null,
              2
            )
          }
        ]
      };
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
var memoryStore5 = new MemoryStore();
var prompts = {
  workspace_context: {
    name: "workspace_context",
    description: "Critical workspace context: directives, decisions, and code patterns",
    arguments: [],
    handler: async () => {
      const directives = await memoryStore5.getMemoriesByType("directive");
      const decisions = await memoryStore5.getMemoriesByType("decision");
      const patterns = await memoryStore5.getMemoriesByType("code_pattern");
      const importantDirectives = directives.filter((d) => d.importance >= 8);
      const importantDecisions = decisions.filter((d) => d.importance >= 7);
      const importantPatterns = patterns.filter((p) => p.importance >= 7);
      const stats = await memoryStore5.getSummaryStats();
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
    version: "1.4.0"
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