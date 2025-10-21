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
import { z as z5 } from "zod";
import { McpError as McpError6, ErrorCode as ErrorCode6 } from "@modelcontextprotocol/sdk/types.js";

// src/redis/memory-store.ts
import { ulid } from "ulid";

// src/embeddings/generator.ts
import { query } from "@anthropic-ai/claude-agent-sdk";
async function generateSemanticFingerprint(text) {
  try {
    const prompt = `Extract 5-10 key concepts/keywords from this text. Return ONLY a comma-separated list, no explanations:

${text}`;
    const q = query({ prompt });
    let responseText = "";
    for await (const message of q) {
      if (message.type === "assistant" && message.content) {
        for (const block of message.content) {
          if (block.type === "text") {
            responseText += block.text;
          }
        }
      }
    }
    const keywords = responseText.split(",").map((k) => k.trim().toLowerCase()).filter((k) => k.length > 0);
    return keywords;
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
  workspace_id: z.string().describe("Workspace identifier (empty for global memories)"),
  category: z.string().optional().describe("Category for organization (v1.5.0)")
});
var CreateMemorySchema = z.object({
  content: z.string().min(1).describe("The memory content to store"),
  context_type: ContextType.default("information"),
  tags: z.array(z.string()).default([]).describe("Tags for categorization"),
  importance: z.number().min(1).max(10).default(5).describe("Importance score 1-10"),
  summary: z.string().optional().describe("Optional summary"),
  session_id: z.string().optional().describe("Optional session ID"),
  ttl_seconds: z.number().min(60).optional().describe("Time-to-live in seconds (minimum 60s)"),
  is_global: z.boolean().default(false).describe("If true, memory is accessible across all workspaces"),
  category: z.string().optional().describe("Category for organization (v1.5.0)")
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
  session_id: z.string().optional(),
  category: z.string().optional().describe("Category for organization (v1.5.0)")
});
var DeleteMemorySchema = z.object({
  memory_id: z.string().describe("ULID of memory to delete")
});
var SearchMemorySchema = z.object({
  query: z.string().describe("Search query"),
  limit: z.number().min(1).max(100).default(10).describe("Number of results"),
  min_importance: z.number().min(1).max(10).optional().describe("Filter by minimum importance"),
  context_types: z.array(ContextType).optional().describe("Filter by context types"),
  category: z.string().optional().describe("Filter by category (v1.5.0)"),
  fuzzy: z.boolean().default(false).describe("Enable fuzzy search (v1.5.0)"),
  regex: z.string().optional().describe("Regex pattern for advanced search (v1.5.0)")
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
var GetTimeWindowContextSchema = z.object({
  hours: z.number().min(0.1).max(72).optional().describe("Number of hours to look back (mutually exclusive with minutes/timestamps)"),
  minutes: z.number().min(1).max(4320).optional().describe("Number of minutes to look back (mutually exclusive with hours/timestamps)"),
  start_timestamp: z.number().optional().describe("Unix timestamp in ms for start of window (requires end_timestamp)"),
  end_timestamp: z.number().optional().describe("Unix timestamp in ms for end of window (requires start_timestamp)"),
  format: z.enum(["json", "markdown", "text"]).default("markdown").describe("Output format"),
  include_metadata: z.boolean().default(true).describe("Include metadata (tags, importance, type)"),
  group_by: z.enum(["type", "importance", "chronological", "tags"]).default("chronological").describe("How to group the output"),
  min_importance: z.number().min(1).max(10).optional().describe("Filter by minimum importance"),
  context_types: z.array(ContextType).optional().describe("Filter by specific context types")
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
  globalMemoryRelationshipsIn: (memoryId) => `global:memory:${memoryId}:relationships:in`,
  // Version history keys (v1.5.0)
  memoryVersions: (workspace, memoryId) => `ws:${workspace}:memory:${memoryId}:versions`,
  memoryVersion: (workspace, memoryId, versionId) => `ws:${workspace}:memory:${memoryId}:version:${versionId}`,
  globalMemoryVersions: (memoryId) => `global:memory:${memoryId}:versions`,
  globalMemoryVersion: (memoryId, versionId) => `global:memory:${memoryId}:version:${versionId}`,
  // Template keys (v1.5.0)
  template: (workspace, id) => `ws:${workspace}:template:${id}`,
  templates: (workspace) => `ws:${workspace}:templates:all`,
  builtinTemplates: () => `builtin:templates:all`,
  builtinTemplate: (id) => `builtin:template:${id}`,
  // Category keys (v1.5.0)
  memoryCategory: (workspace, memoryId) => `ws:${workspace}:memory:${memoryId}:category`,
  category: (workspace, category) => `ws:${workspace}:category:${category}`,
  categories: (workspace) => `ws:${workspace}:categories:all`,
  globalMemoryCategory: (memoryId) => `global:memory:${memoryId}:category`,
  globalCategory: (category) => `global:category:${category}`,
  globalCategories: () => `global:categories:all`
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
var MemoryVersionSchema = z.object({
  version_id: z.string().describe("Version identifier (ULID)"),
  memory_id: z.string().describe("Memory this version belongs to"),
  content: z.string().describe("Content at this version"),
  context_type: ContextType,
  importance: z.number().min(1).max(10),
  tags: z.array(z.string()).default([]),
  summary: z.string().optional(),
  created_at: z.string().describe("ISO 8601 timestamp"),
  created_by: z.enum(["user", "system"]).default("user").describe("Who created this version"),
  change_reason: z.string().optional().describe("Reason for the change")
});
var GetMemoryHistorySchema = z.object({
  memory_id: z.string().describe("Memory ID to get history for"),
  limit: z.number().min(1).max(100).default(50).describe("Maximum versions to return")
});
var RollbackMemorySchema = z.object({
  memory_id: z.string().describe("Memory ID to rollback"),
  version_id: z.string().describe("Version ID to rollback to"),
  preserve_relationships: z.boolean().default(true).describe("Preserve current relationships after rollback")
});
var MemoryTemplateSchema = z.object({
  template_id: z.string().describe("Template identifier (ULID)"),
  name: z.string().describe("Template name"),
  description: z.string().optional().describe("Template description"),
  context_type: ContextType,
  content_template: z.string().describe("Template content with {{placeholders}}"),
  default_tags: z.array(z.string()).default([]),
  default_importance: z.number().min(1).max(10).default(5),
  is_builtin: z.boolean().default(false).describe("Built-in template (cannot be deleted)"),
  created_at: z.string().describe("ISO 8601 timestamp")
});
var CreateFromTemplateSchema = z.object({
  template_id: z.string().describe("Template ID to use"),
  variables: z.record(z.string()).describe("Variables to fill in template (key-value pairs)"),
  tags: z.array(z.string()).optional().describe("Additional tags (merged with template defaults)"),
  importance: z.number().min(1).max(10).optional().describe("Override template importance"),
  is_global: z.boolean().default(false).describe("Create as global memory")
});
var CreateTemplateSchema = z.object({
  name: z.string().min(1).describe("Template name"),
  description: z.string().optional().describe("Template description"),
  context_type: ContextType.default("information"),
  content_template: z.string().min(1).describe("Template content with {{placeholders}}"),
  default_tags: z.array(z.string()).default([]),
  default_importance: z.number().min(1).max(10).default(5)
});
var SetMemoryCategorySchema = z.object({
  memory_id: z.string().describe("Memory ID"),
  category: z.string().describe("Category name")
});
var ListCategoriesSchema = z.object({
  include_counts: z.boolean().default(true).describe("Include memory counts per category")
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
      workspace_id: isGlobal ? "" : this.workspaceId,
      category: data.category
      // v1.5.0
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
      if (data.category) {
        pipeline.set(RedisKeys.globalMemoryCategory(id), data.category);
        pipeline.sadd(RedisKeys.globalCategory(data.category), id);
        pipeline.zadd(RedisKeys.globalCategories(), timestamp, data.category);
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
      if (data.category) {
        pipeline.set(RedisKeys.memoryCategory(this.workspaceId, id), data.category);
        pipeline.sadd(RedisKeys.category(this.workspaceId, data.category), id);
        pipeline.zadd(RedisKeys.categories(this.workspaceId), timestamp, data.category);
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
  // Get memories by time window (v1.6.0)
  async getMemoriesByTimeWindow(startTime, endTime, minImportance, contextTypes) {
    const mode = getWorkspaceMode();
    let ids = [];
    if (mode === "global" /* GLOBAL */) {
      ids = await this.redis.zrangebyscore(RedisKeys.globalTimeline(), startTime, endTime);
    } else if (mode === "isolated" /* ISOLATED */) {
      ids = await this.redis.zrangebyscore(RedisKeys.timeline(this.workspaceId), startTime, endTime);
    } else {
      const wsIds = await this.redis.zrangebyscore(RedisKeys.timeline(this.workspaceId), startTime, endTime);
      const globalIds = await this.redis.zrangebyscore(RedisKeys.globalTimeline(), startTime, endTime);
      ids = [.../* @__PURE__ */ new Set([...wsIds, ...globalIds])];
    }
    let memories = await this.getMemories(ids);
    if (minImportance !== void 0) {
      memories = memories.filter((m) => m.importance >= minImportance);
    }
    if (contextTypes && contextTypes.length > 0) {
      memories = memories.filter((m) => contextTypes.includes(m.context_type));
    }
    memories.sort((a, b) => a.timestamp - b.timestamp);
    return memories;
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
    await this.createVersion(existing, "user", "Memory updated");
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
  async searchMemories(query3, limit = 10, minImportance, contextTypes, category, fuzzy = false, regex) {
    const queryEmbedding = await generateEmbedding(query3);
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
    if (category) {
      filtered = filtered.filter((m) => m.category === category);
    }
    if (regex) {
      try {
        const regexPattern = new RegExp(regex, "i");
        filtered = filtered.filter((m) => regexPattern.test(m.content));
      } catch (error) {
        console.error("Invalid regex pattern:", error);
      }
    }
    const withSimilarity = filtered.map((memory) => {
      let baseSimilarity = memory.embedding ? cosineSimilarity(queryEmbedding, memory.embedding) : 0;
      if (fuzzy) {
        const queryWords = query3.toLowerCase().split(/\s+/);
        const contentWords = memory.content.toLowerCase().split(/\s+/);
        const matchCount = queryWords.filter((qw) => contentWords.some((cw) => cw.includes(qw))).length;
        const fuzzyBoost = matchCount / queryWords.length * 0.2;
        baseSimilarity = Math.min(1, baseSimilarity + fuzzyBoost);
      }
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
      workspace_id: memory.workspace_id || "",
      category: memory.category || ""
      // v1.5.0
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
      workspace_id: data.workspace_id || "",
      category: data.category || void 0
      // v1.5.0
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
  // ============================================================================
  // Memory Versioning & History (v1.5.0)
  // ============================================================================
  async createVersion(memory, createdBy = "user", changeReason) {
    const versionId = ulid();
    const version = {
      version_id: versionId,
      memory_id: memory.id,
      content: memory.content,
      context_type: memory.context_type,
      importance: memory.importance,
      tags: memory.tags,
      summary: memory.summary,
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      created_by: createdBy,
      change_reason: changeReason
    };
    const isGlobal = memory.is_global;
    const timestamp = Date.now();
    const pipeline = this.redis.pipeline();
    if (isGlobal) {
      pipeline.hset(
        RedisKeys.globalMemoryVersion(memory.id, versionId),
        version
      );
      pipeline.zadd(RedisKeys.globalMemoryVersions(memory.id), timestamp, versionId);
    } else {
      pipeline.hset(
        RedisKeys.memoryVersion(this.workspaceId, memory.id, versionId),
        version
      );
      pipeline.zadd(RedisKeys.memoryVersions(this.workspaceId, memory.id), timestamp, versionId);
    }
    const versionsKey = isGlobal ? RedisKeys.globalMemoryVersions(memory.id) : RedisKeys.memoryVersions(this.workspaceId, memory.id);
    pipeline.zremrangebyrank(versionsKey, 0, -51);
    await pipeline.exec();
    return versionId;
  }
  async getMemoryHistory(memoryId, limit = 50) {
    const memory = await this.getMemory(memoryId);
    if (!memory) {
      return [];
    }
    const isGlobal = memory.is_global;
    const versionsKey = isGlobal ? RedisKeys.globalMemoryVersions(memoryId) : RedisKeys.memoryVersions(this.workspaceId, memoryId);
    const versionIds = await this.redis.zrevrange(versionsKey, 0, limit - 1);
    if (versionIds.length === 0) {
      return [];
    }
    const versions = [];
    for (const versionId of versionIds) {
      const versionKey = isGlobal ? RedisKeys.globalMemoryVersion(memoryId, versionId) : RedisKeys.memoryVersion(this.workspaceId, memoryId, versionId);
      const versionData = await this.redis.hgetall(versionKey);
      if (versionData && Object.keys(versionData).length > 0) {
        versions.push({
          version_id: versionData.version_id,
          memory_id: versionData.memory_id,
          content: versionData.content,
          context_type: versionData.context_type,
          importance: parseInt(versionData.importance, 10),
          tags: versionData.tags ? JSON.parse(versionData.tags) : [],
          summary: versionData.summary,
          created_at: versionData.created_at,
          created_by: versionData.created_by,
          change_reason: versionData.change_reason
        });
      }
    }
    return versions;
  }
  async rollbackMemory(memoryId, versionId, preserveRelationships = true) {
    const memory = await this.getMemory(memoryId);
    if (!memory) {
      throw new Error("Memory not found");
    }
    const isGlobal = memory.is_global;
    const versionKey = isGlobal ? RedisKeys.globalMemoryVersion(memoryId, versionId) : RedisKeys.memoryVersion(this.workspaceId, memoryId, versionId);
    const versionData = await this.redis.hgetall(versionKey);
    if (!versionData || Object.keys(versionData).length === 0) {
      throw new Error("Version not found");
    }
    await this.createVersion(memory, "system", `Before rollback to version ${versionId}`);
    const updates = {
      content: versionData.content,
      context_type: versionData.context_type,
      importance: parseInt(versionData.importance, 10),
      tags: versionData.tags ? JSON.parse(versionData.tags) : [],
      summary: versionData.summary
    };
    const rolledBackMemory = await this.updateMemory(memoryId, updates);
    if (rolledBackMemory) {
      await this.createVersion(rolledBackMemory, "system", `Rolled back to version ${versionId}`);
    }
    return rolledBackMemory;
  }
  // ============================================================================
  // Memory Templates (v1.5.0)
  // ============================================================================
  async createTemplate(data) {
    const templateId = ulid();
    const template = {
      template_id: templateId,
      name: data.name,
      description: data.description,
      context_type: data.context_type,
      content_template: data.content_template,
      default_tags: data.default_tags,
      default_importance: data.default_importance,
      is_builtin: false,
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    const pipeline = this.redis.pipeline();
    pipeline.hset(RedisKeys.template(this.workspaceId, templateId), template);
    pipeline.sadd(RedisKeys.templates(this.workspaceId), templateId);
    await pipeline.exec();
    return template;
  }
  async getTemplate(templateId) {
    let templateData = await this.redis.hgetall(RedisKeys.template(this.workspaceId, templateId));
    if (!templateData || Object.keys(templateData).length === 0) {
      templateData = await this.redis.hgetall(RedisKeys.builtinTemplate(templateId));
    }
    if (!templateData || Object.keys(templateData).length === 0) {
      return null;
    }
    return {
      template_id: templateData.template_id,
      name: templateData.name,
      description: templateData.description,
      context_type: templateData.context_type,
      content_template: templateData.content_template,
      default_tags: templateData.default_tags ? JSON.parse(templateData.default_tags) : [],
      default_importance: parseInt(templateData.default_importance, 10),
      is_builtin: templateData.is_builtin === "true",
      created_at: templateData.created_at
    };
  }
  async getAllTemplates() {
    const workspaceIds = await this.redis.smembers(RedisKeys.templates(this.workspaceId));
    const builtinIds = await this.redis.smembers(RedisKeys.builtinTemplates());
    const allIds = [.../* @__PURE__ */ new Set([...workspaceIds, ...builtinIds])];
    const templates = [];
    for (const id of allIds) {
      const template = await this.getTemplate(id);
      if (template) {
        templates.push(template);
      }
    }
    return templates;
  }
  async createFromTemplate(templateId, variables, additionalTags, customImportance, isGlobal = false) {
    const template = await this.getTemplate(templateId);
    if (!template) {
      throw new Error("Template not found");
    }
    let content = template.content_template;
    for (const [key, value] of Object.entries(variables)) {
      content = content.replace(new RegExp(`{{${key}}}`, "g"), value);
    }
    const unreplacedVars = content.match(/{{(\w+)}}/g);
    if (unreplacedVars) {
      throw new Error(`Missing variables: ${unreplacedVars.join(", ")}`);
    }
    const memoryData = {
      content,
      context_type: template.context_type,
      tags: [...template.default_tags, ...additionalTags || []],
      importance: customImportance !== void 0 ? customImportance : template.default_importance,
      is_global: isGlobal
    };
    return this.createMemory(memoryData);
  }
  async deleteTemplate(templateId) {
    const template = await this.getTemplate(templateId);
    if (!template) {
      return false;
    }
    if (template.is_builtin) {
      throw new Error("Cannot delete builtin templates");
    }
    const pipeline = this.redis.pipeline();
    pipeline.del(RedisKeys.template(this.workspaceId, templateId));
    pipeline.srem(RedisKeys.templates(this.workspaceId), templateId);
    await pipeline.exec();
    return true;
  }
  // ============================================================================
  // Memory Categories (v1.5.0)
  // ============================================================================
  async setMemoryCategory(memoryId, category) {
    const memory = await this.getMemory(memoryId);
    if (!memory) {
      return null;
    }
    const isGlobal = memory.is_global;
    const categoryKey = isGlobal ? RedisKeys.globalMemoryCategory(memoryId) : RedisKeys.memoryCategory(this.workspaceId, memoryId);
    const categorySetKey = isGlobal ? RedisKeys.globalCategory(category) : RedisKeys.category(this.workspaceId, category);
    const categoriesKey = isGlobal ? RedisKeys.globalCategories() : RedisKeys.categories(this.workspaceId);
    const oldCategory = await this.redis.get(categoryKey);
    if (oldCategory) {
      const oldCategorySetKey = isGlobal ? RedisKeys.globalCategory(oldCategory) : RedisKeys.category(this.workspaceId, oldCategory);
      await this.redis.srem(oldCategorySetKey, memoryId);
    }
    const pipeline = this.redis.pipeline();
    pipeline.set(categoryKey, category);
    pipeline.sadd(categorySetKey, memoryId);
    pipeline.zadd(categoriesKey, Date.now(), category);
    await pipeline.exec();
    memory.category = category;
    const memoryKey = isGlobal ? RedisKeys.globalMemory(memoryId) : RedisKeys.memory(this.workspaceId, memoryId);
    await this.redis.hset(memoryKey, "category", category);
    return memory;
  }
  async getMemoriesByCategory(category) {
    const mode = getWorkspaceMode();
    const memoryIds = [];
    if (mode === "isolated" /* ISOLATED */ || mode === "hybrid" /* HYBRID */) {
      const workspaceIds = await this.redis.smembers(RedisKeys.category(this.workspaceId, category));
      memoryIds.push(...workspaceIds);
    }
    if (mode === "global" /* GLOBAL */ || mode === "hybrid" /* HYBRID */) {
      const globalIds = await this.redis.smembers(RedisKeys.globalCategory(category));
      memoryIds.push(...globalIds);
    }
    return this.getMemories(memoryIds);
  }
  async getAllCategories() {
    const mode = getWorkspaceMode();
    const categoryNames = [];
    if (mode === "isolated" /* ISOLATED */ || mode === "hybrid" /* HYBRID */) {
      const workspaceCategories = await this.redis.zrange(RedisKeys.categories(this.workspaceId), 0, -1);
      categoryNames.push(...workspaceCategories);
    }
    if (mode === "global" /* GLOBAL */ || mode === "hybrid" /* HYBRID */) {
      const globalCategories = await this.redis.zrange(RedisKeys.globalCategories(), 0, -1);
      categoryNames.push(...globalCategories);
    }
    const uniqueCategories = [...new Set(categoryNames)];
    const categories = [];
    for (const category of uniqueCategories) {
      const memories = await this.getMemoriesByCategory(category);
      const lastUsed = await this.redis.zscore(
        mode === "global" /* GLOBAL */ ? RedisKeys.globalCategories() : RedisKeys.categories(this.workspaceId),
        category
      );
      categories.push({
        category,
        memory_count: memories.length,
        created_at: new Date(parseInt(lastUsed || "0", 10)).toISOString(),
        last_used: new Date(parseInt(lastUsed || "0", 10)).toISOString()
      });
    }
    return categories;
  }
};

// src/tools/context-tools.ts
import { z as z2 } from "zod";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

// src/analysis/conversation-analyzer.ts
import { query as query2 } from "@anthropic-ai/claude-agent-sdk";
var ConversationAnalyzer = class {
  constructor() {
  }
  /**
   * Analyze conversation and extract structured memories
   */
  async analyzeConversation(conversationText) {
    try {
      const prompt = `Analyze this conversation and extract important information that should be remembered long-term.

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

Output ONLY the JSON objects, one per line, no other text:`;
      const q = query2({ prompt });
      let responseText = "";
      for await (const message of q) {
        if (message.type === "assistant" && message.content) {
          for (const block of message.content) {
            if (block.type === "text") {
              responseText += block.text;
            }
          }
        }
      }
      const lines = responseText.split("\n").filter((line) => line.trim().startsWith("{"));
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
      const prompt = `Summarize this work session in 2-3 sentences. Focus on what was accomplished, decided, or learned.

Session memories:
${memoriesText}

Summary (2-3 sentences):`;
      const q = query2({ prompt });
      let responseText = "";
      for await (const message of q) {
        if (message.type === "assistant" && message.content) {
          for (const block of message.content) {
            if (block.type === "text") {
              responseText += block.text;
            }
          }
        }
      }
      return responseText.trim() || "Session completed with multiple activities";
    } catch (error) {
      console.error("Error summarizing session:", error);
      return "Session summary unavailable";
    }
  }
  /**
   * Enhance a search query for better semantic matching
   */
  async enhanceQuery(currentTask, query3) {
    const combined = query3 ? `${currentTask} ${query3}` : currentTask;
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
var get_time_window_context = {
  description: 'Get all memories from a specific time window and build consolidated context output. Perfect for retrieving "everything from the last 2 hours" or specific time ranges.',
  inputSchema: zodToJsonSchema(GetTimeWindowContextSchema),
  handler: async (args) => {
    try {
      let startTime;
      let endTime;
      if (args.start_timestamp && args.end_timestamp) {
        startTime = args.start_timestamp;
        endTime = args.end_timestamp;
      } else if (args.hours !== void 0) {
        endTime = Date.now();
        startTime = endTime - args.hours * 60 * 60 * 1e3;
      } else if (args.minutes !== void 0) {
        endTime = Date.now();
        startTime = endTime - args.minutes * 60 * 1e3;
      } else {
        endTime = Date.now();
        startTime = endTime - 60 * 60 * 1e3;
      }
      const memories = await memoryStore.getMemoriesByTimeWindow(
        startTime,
        endTime,
        args.min_importance,
        args.context_types
      );
      if (memories.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                message: "No memories found in the specified time window",
                start_time: new Date(startTime).toISOString(),
                end_time: new Date(endTime).toISOString()
              }, null, 2)
            }
          ]
        };
      }
      const groupedMemories = groupMemories(memories, args.group_by);
      let output;
      if (args.format === "json") {
        output = formatAsJSON(groupedMemories, memories, startTime, endTime, args.include_metadata);
      } else if (args.format === "markdown") {
        output = formatAsMarkdown(groupedMemories, memories, startTime, endTime, args.include_metadata);
      } else {
        output = formatAsText(groupedMemories, memories, startTime, endTime, args.include_metadata);
      }
      return {
        content: [
          {
            type: "text",
            text: output
          }
        ]
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get time window context: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
};
function groupMemories(memories, groupBy) {
  const groups = /* @__PURE__ */ new Map();
  if (groupBy === "chronological") {
    groups.set("all", memories);
  } else if (groupBy === "type") {
    memories.forEach((m) => {
      const key = m.context_type;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m);
    });
  } else if (groupBy === "importance") {
    memories.forEach((m) => {
      const key = m.importance >= 8 ? "High (8-10)" : m.importance >= 5 ? "Medium (5-7)" : "Low (1-4)";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m);
    });
  } else if (groupBy === "tags") {
    memories.forEach((m) => {
      if (m.tags.length === 0) {
        if (!groups.has("untagged")) groups.set("untagged", []);
        groups.get("untagged").push(m);
      } else {
        m.tags.forEach((tag) => {
          if (!groups.has(tag)) groups.set(tag, []);
          groups.get(tag).push(m);
        });
      }
    });
  }
  return groups;
}
function formatAsJSON(groups, allMemories, startTime, endTime, includeMetadata) {
  const data = {
    time_window: {
      start: new Date(startTime).toISOString(),
      end: new Date(endTime).toISOString(),
      duration_hours: ((endTime - startTime) / (1e3 * 60 * 60)).toFixed(2)
    },
    total_memories: allMemories.length,
    memories: allMemories.map((m) => ({
      content: m.content,
      ...includeMetadata && {
        type: m.context_type,
        importance: m.importance,
        tags: m.tags,
        timestamp: new Date(m.timestamp).toISOString(),
        summary: m.summary
      }
    }))
  };
  return JSON.stringify(data, null, 2);
}
function formatAsMarkdown(groups, allMemories, startTime, endTime, includeMetadata) {
  const lines = [];
  const duration = ((endTime - startTime) / (1e3 * 60 * 60)).toFixed(1);
  lines.push(`# Context from ${new Date(startTime).toLocaleString()} to ${new Date(endTime).toLocaleString()}`);
  lines.push("");
  lines.push(`**Duration:** ${duration} hours`);
  lines.push(`**Total Memories:** ${allMemories.length}`);
  lines.push("");
  lines.push("---");
  lines.push("");
  for (const [groupName, memories] of groups) {
    if (groupName !== "all") {
      lines.push(`## ${groupName.charAt(0).toUpperCase() + groupName.slice(1)}`);
      lines.push("");
    }
    memories.forEach((m) => {
      lines.push(`### ${m.summary || m.content.substring(0, 50)}`);
      lines.push("");
      lines.push(m.content);
      lines.push("");
      if (includeMetadata) {
        lines.push(`**Type:** ${m.context_type} | **Importance:** ${m.importance}/10 | **Time:** ${new Date(m.timestamp).toLocaleTimeString()}`);
        if (m.tags.length > 0) {
          lines.push(`**Tags:** ${m.tags.join(", ")}`);
        }
        lines.push("");
      }
      lines.push("---");
      lines.push("");
    });
  }
  return lines.join("\n");
}
function formatAsText(groups, allMemories, startTime, endTime, includeMetadata) {
  const lines = [];
  const duration = ((endTime - startTime) / (1e3 * 60 * 60)).toFixed(1);
  lines.push(`Context from ${new Date(startTime).toLocaleString()} to ${new Date(endTime).toLocaleString()}`);
  lines.push(`Duration: ${duration} hours`);
  lines.push(`Total: ${allMemories.length} memories`);
  lines.push("");
  lines.push("=".repeat(80));
  lines.push("");
  for (const [groupName, memories] of groups) {
    if (groupName !== "all") {
      lines.push(`[${groupName.toUpperCase()}]`);
      lines.push("");
    }
    memories.forEach((m, index) => {
      lines.push(`${index + 1}. ${m.content}`);
      if (includeMetadata) {
        lines.push(`   [${m.context_type} | importance: ${m.importance}/10 | ${new Date(m.timestamp).toLocaleTimeString()}]`);
        if (m.tags.length > 0) {
          lines.push(`   tags: ${m.tags.join(", ")}`);
        }
      }
      lines.push("");
    });
  }
  return lines.join("\n");
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

// src/tools/version-tools.ts
import { ErrorCode as ErrorCode3, McpError as McpError3 } from "@modelcontextprotocol/sdk/types.js";
var memoryStore3 = new MemoryStore();
var versionTools = {
  get_memory_history: {
    description: "Get the version history of a memory",
    inputSchema: zodToJsonSchema2(GetMemoryHistorySchema),
    handler: async (args) => {
      try {
        const versions = await memoryStore3.getMemoryHistory(args.memory_id, args.limit);
        if (versions.length === 0) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                memory_id: args.memory_id,
                versions: [],
                total_versions: 0,
                message: "No version history found for this memory"
              }, null, 2)
            }]
          };
        }
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              memory_id: args.memory_id,
              versions,
              total_versions: versions.length,
              oldest_version: versions[versions.length - 1]?.created_at,
              newest_version: versions[0]?.created_at
            }, null, 2)
          }]
        };
      } catch (error) {
        if (error instanceof McpError3) throw error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new McpError3(ErrorCode3.InternalError, `Failed to get memory history: ${errorMessage}`);
      }
    }
  },
  rollback_memory: {
    description: "Rollback a memory to a previous version",
    inputSchema: zodToJsonSchema2(RollbackMemorySchema),
    handler: async (args) => {
      try {
        const rolledBackMemory = await memoryStore3.rollbackMemory(
          args.memory_id,
          args.version_id,
          args.preserve_relationships
        );
        if (!rolledBackMemory) {
          throw new McpError3(ErrorCode3.InternalError, "Failed to rollback memory");
        }
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              memory: {
                id: rolledBackMemory.id,
                content: rolledBackMemory.content,
                context_type: rolledBackMemory.context_type,
                importance: rolledBackMemory.importance,
                tags: rolledBackMemory.tags,
                summary: rolledBackMemory.summary,
                category: rolledBackMemory.category
              },
              rolled_back_to: args.version_id,
              preserve_relationships: args.preserve_relationships,
              message: `Successfully rolled back memory to version ${args.version_id}`
            }, null, 2)
          }]
        };
      } catch (error) {
        if (error instanceof McpError3) throw error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new McpError3(ErrorCode3.InternalError, `Failed to rollback memory: ${errorMessage}`);
      }
    }
  }
};

// src/tools/template-tools.ts
import { z as z3 } from "zod";
import { ErrorCode as ErrorCode4, McpError as McpError4 } from "@modelcontextprotocol/sdk/types.js";
var memoryStore4 = new MemoryStore();
var templateTools = {
  create_template: {
    description: "Create a new memory template with placeholders",
    inputSchema: zodToJsonSchema2(CreateTemplateSchema),
    handler: async (args) => {
      try {
        const template = await memoryStore4.createTemplate(args);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              template: {
                template_id: template.template_id,
                name: template.name,
                description: template.description,
                context_type: template.context_type,
                content_template: template.content_template,
                default_tags: template.default_tags,
                default_importance: template.default_importance,
                created_at: template.created_at
              },
              message: `Successfully created template "${template.name}"`
            }, null, 2)
          }]
        };
      } catch (error) {
        if (error instanceof McpError4) throw error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new McpError4(ErrorCode4.InternalError, `Failed to create template: ${errorMessage}`);
      }
    }
  },
  create_from_template: {
    description: "Create a new memory from a template by filling in variables",
    inputSchema: zodToJsonSchema2(CreateFromTemplateSchema),
    handler: async (args) => {
      try {
        const memory = await memoryStore4.createFromTemplate(
          args.template_id,
          args.variables,
          args.tags,
          args.importance,
          args.is_global
        );
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              memory: {
                id: memory.id,
                content: memory.content,
                context_type: memory.context_type,
                importance: memory.importance,
                tags: memory.tags,
                summary: memory.summary,
                category: memory.category,
                is_global: memory.is_global
              },
              template_id: args.template_id,
              message: "Successfully created memory from template"
            }, null, 2)
          }]
        };
      } catch (error) {
        if (error instanceof McpError4) throw error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new McpError4(ErrorCode4.InternalError, `Failed to create from template: ${errorMessage}`);
      }
    }
  },
  list_templates: {
    description: "List all available memory templates (workspace + builtin)",
    inputSchema: zodToJsonSchema2(z3.object({})),
    handler: async () => {
      try {
        const templates = await memoryStore4.getAllTemplates();
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              templates: templates.map((t) => ({
                template_id: t.template_id,
                name: t.name,
                description: t.description,
                context_type: t.context_type,
                content_template: t.content_template,
                default_tags: t.default_tags,
                default_importance: t.default_importance,
                is_builtin: t.is_builtin,
                created_at: t.created_at
              })),
              total: templates.length,
              builtin_count: templates.filter((t) => t.is_builtin).length,
              workspace_count: templates.filter((t) => !t.is_builtin).length
            }, null, 2)
          }]
        };
      } catch (error) {
        if (error instanceof McpError4) throw error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new McpError4(ErrorCode4.InternalError, `Failed to list templates: ${errorMessage}`);
      }
    }
  }
};

// src/tools/category-tools.ts
import { z as z4 } from "zod";
import { ErrorCode as ErrorCode5, McpError as McpError5 } from "@modelcontextprotocol/sdk/types.js";
var memoryStore5 = new MemoryStore();
var categoryTools = {
  set_memory_category: {
    description: "Set or update the category of a memory",
    inputSchema: zodToJsonSchema2(SetMemoryCategorySchema),
    handler: async (args) => {
      try {
        const memory = await memoryStore5.setMemoryCategory(args.memory_id, args.category);
        if (!memory) {
          throw new McpError5(ErrorCode5.InvalidRequest, "Memory not found");
        }
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              memory: {
                id: memory.id,
                category: memory.category,
                content: memory.content.substring(0, 100) + "..."
              },
              message: `Successfully set category to "${args.category}"`
            }, null, 2)
          }]
        };
      } catch (error) {
        if (error instanceof McpError5) throw error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new McpError5(ErrorCode5.InternalError, `Failed to set category: ${errorMessage}`);
      }
    }
  },
  list_categories: {
    description: "List all categories with memory counts",
    inputSchema: zodToJsonSchema2(ListCategoriesSchema),
    handler: async (args) => {
      try {
        const categories = await memoryStore5.getAllCategories();
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              categories: categories.map((c) => ({
                category: c.category,
                memory_count: args.include_counts ? c.memory_count : void 0,
                last_used: c.last_used
              })),
              total_categories: categories.length,
              total_memories: categories.reduce((sum, c) => sum + (c.memory_count || 0), 0)
            }, null, 2)
          }]
        };
      } catch (error) {
        if (error instanceof McpError5) throw error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new McpError5(ErrorCode5.InternalError, `Failed to list categories: ${errorMessage}`);
      }
    }
  },
  get_memories_by_category: {
    description: "Get all memories in a specific category",
    inputSchema: zodToJsonSchema2(z4.object({
      category: z4.string().describe("Category name"),
      limit: z4.number().min(1).max(100).default(50).describe("Maximum memories to return")
    })),
    handler: async (args) => {
      try {
        const memories = await memoryStore5.getMemoriesByCategory(args.category);
        const limited = memories.slice(0, args.limit);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              category: args.category,
              memories: limited.map((m) => ({
                id: m.id,
                content: m.content.substring(0, 100) + (m.content.length > 100 ? "..." : ""),
                context_type: m.context_type,
                importance: m.importance,
                tags: m.tags,
                summary: m.summary,
                is_global: m.is_global
              })),
              total_in_category: memories.length,
              returned: limited.length
            }, null, 2)
          }]
        };
      } catch (error) {
        if (error instanceof McpError5) throw error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new McpError5(ErrorCode5.InternalError, `Failed to get memories by category: ${errorMessage}`);
      }
    }
  }
};

// src/tools/index.ts
var memoryStore6 = new MemoryStore();
var tools = {
  // Context management tools
  recall_relevant_context,
  analyze_and_remember,
  summarize_session,
  get_time_window_context,
  // Export/Import tools
  export_memories: {
    description: "Export memories to JSON format with optional filtering",
    inputSchema: zodToJsonSchema3(ExportMemoriesSchema),
    handler: async (args) => {
      try {
        return await exportMemories(args);
      } catch (error) {
        throw new McpError6(
          ErrorCode6.InternalError,
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
        throw new McpError6(
          ErrorCode6.InternalError,
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
        throw new McpError6(
          ErrorCode6.InternalError,
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
        throw new McpError6(
          ErrorCode6.InternalError,
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
        const memory = await memoryStore6.createMemory(args);
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
        throw new McpError6(
          ErrorCode6.InternalError,
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
        const memories = await memoryStore6.createMemories(args.memories);
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
        throw new McpError6(
          ErrorCode6.InternalError,
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
        const memory = await memoryStore6.updateMemory(memory_id, updates);
        if (!memory) {
          throw new McpError6(ErrorCode6.InvalidRequest, `Memory ${memory_id} not found`);
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
        if (error instanceof McpError6) throw error;
        throw new McpError6(
          ErrorCode6.InternalError,
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
        const success = await memoryStore6.deleteMemory(args.memory_id);
        if (!success) {
          throw new McpError6(ErrorCode6.InvalidRequest, `Memory ${args.memory_id} not found`);
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
        if (error instanceof McpError6) throw error;
        throw new McpError6(
          ErrorCode6.InternalError,
          `Failed to delete memory: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  },
  search_memories: {
    description: "Search memories using semantic similarity with advanced filters (v1.5.0: category, fuzzy, regex)",
    inputSchema: zodToJsonSchema3(SearchMemorySchema),
    handler: async (args) => {
      try {
        const results = await memoryStore6.searchMemories(
          args.query,
          args.limit,
          args.min_importance,
          args.context_types,
          args.category,
          args.fuzzy,
          args.regex
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                query: args.query,
                count: results.length,
                filters: {
                  category: args.category,
                  fuzzy: args.fuzzy,
                  regex: args.regex,
                  min_importance: args.min_importance,
                  context_types: args.context_types
                },
                results: results.map((r) => ({
                  memory_id: r.id,
                  content: r.content,
                  summary: r.summary,
                  context_type: r.context_type,
                  importance: r.importance,
                  tags: r.tags,
                  category: r.category,
                  similarity: r.similarity,
                  timestamp: r.timestamp
                }))
              }, null, 2)
            }
          ]
        };
      } catch (error) {
        throw new McpError6(
          ErrorCode6.InternalError,
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
        const session = await memoryStore6.createSession(
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
        throw new McpError6(
          ErrorCode6.InternalError,
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
        const result = await memoryStore6.convertToGlobal(args.memory_id);
        if (!result) {
          throw new McpError6(
            ErrorCode6.InvalidRequest,
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
        if (error instanceof McpError6) throw error;
        throw new McpError6(
          ErrorCode6.InternalError,
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
        const result = await memoryStore6.convertToWorkspace(
          args.memory_id,
          args.workspace_id
        );
        if (!result) {
          throw new McpError6(
            ErrorCode6.InvalidRequest,
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
        if (error instanceof McpError6) throw error;
        throw new McpError6(
          ErrorCode6.InternalError,
          `Failed to convert memory to workspace: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  },
  // Relationship tools (v1.4.0)
  ...relationshipTools,
  // Version history tools (v1.5.0)
  ...versionTools,
  // Template tools (v1.5.0)
  ...templateTools,
  // Category tools (v1.5.0)
  ...categoryTools
};
function zodToJsonSchema3(schema) {
  if (schema instanceof z5.ZodObject) {
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
  if (schema instanceof z5.ZodString) {
    const result = { type: "string" };
    if (schema.description) result.description = schema.description;
    return result;
  }
  if (schema instanceof z5.ZodNumber) {
    const result = { type: "number" };
    if (schema.description) result.description = schema.description;
    return result;
  }
  if (schema instanceof z5.ZodBoolean) {
    const result = { type: "boolean" };
    if (schema.description) result.description = schema.description;
    return result;
  }
  if (schema instanceof z5.ZodArray) {
    const result = {
      type: "array",
      items: zodToJsonSchemaInner2(schema.element)
    };
    if (schema.description) result.description = schema.description;
    return result;
  }
  if (schema instanceof z5.ZodEnum) {
    const result = {
      type: "string",
      enum: schema.options
    };
    if (schema.description) result.description = schema.description;
    return result;
  }
  if (schema instanceof z5.ZodOptional) {
    return zodToJsonSchemaInner2(schema.unwrap());
  }
  if (schema instanceof z5.ZodDefault) {
    const inner = zodToJsonSchemaInner2(schema._def.innerType);
    inner.default = schema._def.defaultValue();
    return inner;
  }
  if (schema instanceof z5.ZodObject) {
    return zodToJsonSchema3(schema);
  }
  return { type: "string" };
}

// src/resources/index.ts
import { McpError as McpError7, ErrorCode as ErrorCode7 } from "@modelcontextprotocol/sdk/types.js";

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
var memoryStore7 = new MemoryStore();
var redis = getRedisClient();
var resources = {
  "memory://recent": {
    name: "Recent Memories",
    description: "Get the most recent memories (default: 50)",
    mimeType: "application/json",
    handler: async (uri) => {
      const limit = parseInt(uri.searchParams.get("limit") || "50", 10);
      const memories = await memoryStore7.getRecentMemories(limit);
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
      const memories = await memoryStore7.getMemoriesByType(type, limit);
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
      const memories = await memoryStore7.getMemoriesByTag(tag, limit);
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
      const memories = await memoryStore7.getImportantMemories(minImportance, limit);
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
      const session = await memoryStore7.getSession(session_id);
      if (!session) {
        throw new McpError7(ErrorCode7.InvalidRequest, `Session ${session_id} not found`);
      }
      const memories = await memoryStore7.getSessionMemories(session_id);
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
      const sessions = await memoryStore7.getAllSessions();
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
      const stats = await memoryStore7.getSummaryStats();
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
      const query3 = uri.searchParams.get("q");
      if (!query3) {
        throw new McpError7(ErrorCode7.InvalidRequest, 'Query parameter "q" is required');
      }
      const limit = parseInt(uri.searchParams.get("limit") || "10", 10);
      const minImportance = uri.searchParams.get("min_importance") ? parseInt(uri.searchParams.get("min_importance"), 10) : void 0;
      const results = await memoryStore7.searchMemories(query3, limit, minImportance);
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(
              {
                query: query3,
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
        throw new McpError7(
          ErrorCode7.InvalidRequest,
          "Global memories are not available in isolated mode. Set WORKSPACE_MODE=hybrid or global to access global memories."
        );
      }
      const limit = parseInt(uri.searchParams.get("limit") || "50", 10);
      const ids = await redis.zrevrange(RedisKeys.globalTimeline(), 0, limit - 1);
      const memories = await memoryStore7.getMemories(ids);
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
        throw new McpError7(
          ErrorCode7.InvalidRequest,
          "Global memories are not available in isolated mode. Set WORKSPACE_MODE=hybrid or global to access global memories."
        );
      }
      const type = params.type;
      const limit = uri.searchParams.get("limit") ? parseInt(uri.searchParams.get("limit"), 10) : void 0;
      const ids = await redis.smembers(RedisKeys.globalByType(type));
      const allMemories = await memoryStore7.getMemories(ids);
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
        throw new McpError7(
          ErrorCode7.InvalidRequest,
          "Global memories are not available in isolated mode. Set WORKSPACE_MODE=hybrid or global to access global memories."
        );
      }
      const { tag } = params;
      const limit = uri.searchParams.get("limit") ? parseInt(uri.searchParams.get("limit"), 10) : void 0;
      const ids = await redis.smembers(RedisKeys.globalByTag(tag));
      const allMemories = await memoryStore7.getMemories(ids);
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
        throw new McpError7(
          ErrorCode7.InvalidRequest,
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
      const memories = await memoryStore7.getMemories(results);
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
        throw new McpError7(
          ErrorCode7.InvalidRequest,
          "Global memories are not available in isolated mode. Set WORKSPACE_MODE=hybrid or global to access global memories."
        );
      }
      const query3 = uri.searchParams.get("q");
      if (!query3) {
        throw new McpError7(ErrorCode7.InvalidRequest, 'Query parameter "q" is required');
      }
      const limit = parseInt(uri.searchParams.get("limit") || "10", 10);
      const originalMode = process.env.WORKSPACE_MODE;
      process.env.WORKSPACE_MODE = "global";
      try {
        const results = await memoryStore7.searchMemories(query3, limit);
        return {
          contents: [
            {
              uri: uri.toString(),
              mimeType: "application/json",
              text: JSON.stringify(
                {
                  query: query3,
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
        const workspaceIds = await redis.smembers(RedisKeys.relationships(memoryStore7["workspaceId"]));
        relationshipIds.push(...workspaceIds);
      }
      if (mode === "global" /* GLOBAL */ || mode === "hybrid" /* HYBRID */) {
        const globalIds = await redis.smembers(RedisKeys.globalRelationships());
        relationshipIds.push(...globalIds);
      }
      relationshipIds = relationshipIds.slice(0, limit);
      const relationships = await Promise.all(
        relationshipIds.map(async (id) => {
          const rel = await memoryStore7.getRelationship(id);
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
        throw new McpError7(ErrorCode7.InvalidRequest, "Memory ID is required");
      }
      const depth = parseInt(uri.searchParams.get("depth") || "1", 10);
      const direction = uri.searchParams.get("direction") || "both";
      const results = await memoryStore7.getRelatedMemories(memoryId, {
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
        throw new McpError7(ErrorCode7.InvalidRequest, "Memory ID is required");
      }
      const maxDepth = parseInt(uri.searchParams.get("depth") || "2", 10);
      const maxNodes = parseInt(uri.searchParams.get("max_nodes") || "50", 10);
      const graph = await memoryStore7.getMemoryGraph(memoryId, maxDepth, maxNodes);
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
var memoryStore8 = new MemoryStore();
var prompts = {
  workspace_context: {
    name: "workspace_context",
    description: "Critical workspace context: directives, decisions, and code patterns",
    arguments: [],
    handler: async () => {
      const directives = await memoryStore8.getMemoriesByType("directive");
      const decisions = await memoryStore8.getMemoriesByType("decision");
      const patterns = await memoryStore8.getMemoriesByType("code_pattern");
      const importantDirectives = directives.filter((d) => d.importance >= 8);
      const importantDecisions = decisions.filter((d) => d.importance >= 7);
      const importantPatterns = patterns.filter((p) => p.importance >= 7);
      const stats = await memoryStore8.getSummaryStats();
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
    version: "1.6.0"
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