import { z } from 'zod';

// Context types for different kinds of memory
export const ContextType = z.enum([
  'directive',      // Instructions or commands
  'information',    // General facts or knowledge
  'heading',        // Section headers or organizational markers
  'decision',       // Decisions made during work
  'code_pattern',   // Code patterns or conventions
  'requirement',    // Project requirements
  'error',          // Error encountered and solution
  'todo',           // Task or todo item
  'insight',        // Key insight or realization
  'preference',     // User preference
]);

export type ContextType = z.infer<typeof ContextType>;

// Memory entry schema
export const MemoryEntrySchema = z.object({
  id: z.string().describe('ULID identifier'),
  timestamp: z.number().describe('Unix timestamp in milliseconds'),
  context_type: ContextType,
  content: z.string().describe('The actual memory content'),
  summary: z.string().optional().describe('Short summary for quick scanning'),
  tags: z.array(z.string()).default([]).describe('Tags for categorization'),
  importance: z.number().min(1).max(10).default(5).describe('Importance score 1-10'),
  session_id: z.string().optional().describe('Optional session grouping'),
  embedding: z.array(z.number()).optional().describe('Vector embedding'),
  ttl_seconds: z.number().optional().describe('Time-to-live in seconds (auto-expires)'),
  expires_at: z.number().optional().describe('Unix timestamp when memory expires'),
});

export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;

// Input schema for creating memories
export const CreateMemorySchema = z.object({
  content: z.string().min(1).describe('The memory content to store'),
  context_type: ContextType.default('information'),
  tags: z.array(z.string()).default([]).describe('Tags for categorization'),
  importance: z.number().min(1).max(10).default(5).describe('Importance score 1-10'),
  summary: z.string().optional().describe('Optional summary'),
  session_id: z.string().optional().describe('Optional session ID'),
  ttl_seconds: z.number().min(60).optional().describe('Time-to-live in seconds (minimum 60s)'),
});

export type CreateMemory = z.infer<typeof CreateMemorySchema>;

// Batch create schema
export const BatchCreateMemoriesSchema = z.object({
  memories: z.array(CreateMemorySchema).min(1).describe('Array of memories to store'),
});

// Update memory schema
export const UpdateMemorySchema = z.object({
  memory_id: z.string().describe('ULID of memory to update'),
  content: z.string().optional(),
  context_type: ContextType.optional(),
  tags: z.array(z.string()).optional(),
  importance: z.number().min(1).max(10).optional(),
  summary: z.string().optional(),
  session_id: z.string().optional(),
});

// Delete memory schema
export const DeleteMemorySchema = z.object({
  memory_id: z.string().describe('ULID of memory to delete'),
});

// Search schema
export const SearchMemorySchema = z.object({
  query: z.string().describe('Search query'),
  limit: z.number().min(1).max(100).default(10).describe('Number of results'),
  min_importance: z.number().min(1).max(10).optional().describe('Filter by minimum importance'),
  context_types: z.array(ContextType).optional().describe('Filter by context types'),
});

// Session organization schema
export const OrganizeSessionSchema = z.object({
  session_name: z.string().describe('Name for the session'),
  memory_ids: z.array(z.string()).min(1).describe('Array of memory IDs to include'),
  summary: z.string().optional().describe('Optional session summary'),
});

// Session info
export interface SessionInfo {
  session_id: string;
  session_name: string;
  created_at: number;
  memory_count: number;
  summary?: string;
  memory_ids: string[];
}

// Workspace context
export interface WorkspaceContext {
  workspace_path: string;
  workspace_id: string; // Hash of the path for Redis keys
}

// Helper to create workspace ID from path
export function createWorkspaceId(path: string): string {
  // Simple hash function for workspace path
  let hash = 0;
  for (let i = 0; i < path.length; i++) {
    const char = path.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// Recall context schema (for proactive context retrieval)
export const RecallContextSchema = z.object({
  current_task: z.string().describe('Description of what I\'m currently working on'),
  query: z.string().optional().describe('Optional specific search query'),
  limit: z.number().min(1).max(20).default(5).describe('Number of results to return'),
  min_importance: z.number().min(1).max(10).default(6).describe('Minimum importance threshold'),
});

export type RecallContext = z.infer<typeof RecallContextSchema>;

// Analyze conversation schema (for extracting structured memories)
export const AnalyzeConversationSchema = z.object({
  conversation_text: z.string().min(1).describe('Conversation text to analyze and extract memories from'),
  auto_categorize: z.boolean().default(true).describe('Automatically categorize extracted memories'),
  auto_store: z.boolean().default(true).describe('Automatically store extracted memories'),
});

export type AnalyzeConversation = z.infer<typeof AnalyzeConversationSchema>;

// Summarize session schema
export const SummarizeSessionSchema = z.object({
  session_name: z.string().optional().describe('Optional name for the session'),
  auto_create_snapshot: z.boolean().default(true).describe('Automatically create session snapshot'),
  lookback_minutes: z.number().default(60).describe('How many minutes back to look for memories'),
});

export type SummarizeSession = z.infer<typeof SummarizeSessionSchema>;

// Extracted memory from conversation analysis
export interface ExtractedMemory {
  content: string;
  context_type: ContextType;
  importance: number;
  tags: string[];
  summary?: string;
}

// Analysis result
export interface AnalysisResult {
  extracted_memories: ExtractedMemory[];
  total_count: number;
  stored_ids?: string[];
}

// Export memories schema
export const ExportMemoriesSchema = z.object({
  format: z.enum(['json']).default('json').describe('Export format'),
  include_embeddings: z.boolean().default(false).describe('Include vector embeddings in export'),
  filter_by_type: z.array(ContextType).optional().describe('Only export specific types'),
  min_importance: z.number().min(1).max(10).optional().describe('Only export above this importance'),
});

export type ExportMemories = z.infer<typeof ExportMemoriesSchema>;

// Import memories schema
export const ImportMemoriesSchema = z.object({
  data: z.string().describe('JSON string of exported memories'),
  overwrite_existing: z.boolean().default(false).describe('Overwrite if memory ID already exists'),
  regenerate_embeddings: z.boolean().default(true).describe('Regenerate embeddings on import'),
});

export type ImportMemories = z.infer<typeof ImportMemoriesSchema>;

// Find duplicates schema
export const FindDuplicatesSchema = z.object({
  similarity_threshold: z.number().min(0).max(1).default(0.85).describe('Similarity threshold (0-1)'),
  auto_merge: z.boolean().default(false).describe('Automatically merge duplicates'),
  keep_highest_importance: z.boolean().default(true).describe('When merging, keep highest importance'),
});

export type FindDuplicates = z.infer<typeof FindDuplicatesSchema>;

// Consolidate memories schema
export const ConsolidateMemoriesSchema = z.object({
  memory_ids: z.array(z.string()).min(2).describe('Array of memory IDs to consolidate'),
  keep_id: z.string().optional().describe('Optional ID of memory to keep (default: highest importance)'),
});

export type ConsolidateMemories = z.infer<typeof ConsolidateMemoriesSchema>;

// Duplicate group interface
export interface DuplicateGroup {
  memories: MemoryEntry[];
  similarity_score: number;
}

// Redis keys helper with workspace isolation
export const RedisKeys = {
  memory: (workspace: string, id: string) => `ws:${workspace}:memory:${id}`,
  memories: (workspace: string) => `ws:${workspace}:memories:all`,
  byType: (workspace: string, type: ContextType) => `ws:${workspace}:memories:type:${type}`,
  byTag: (workspace: string, tag: string) => `ws:${workspace}:memories:tag:${tag}`,
  timeline: (workspace: string) => `ws:${workspace}:memories:timeline`,
  session: (workspace: string, id: string) => `ws:${workspace}:session:${id}`,
  sessions: (workspace: string) => `ws:${workspace}:sessions:all`,
  important: (workspace: string) => `ws:${workspace}:memories:important`,
} as const;
