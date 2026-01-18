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
  is_global: z.boolean().default(false).describe('If true, memory is accessible across all workspaces'),
  workspace_id: z.string().describe('Workspace identifier (empty for global memories)'),
  category: z.string().optional().describe('Category for organization (v1.5.0)'),
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
  is_global: z.boolean().default(false).describe('If true, memory is accessible across all workspaces'),
  category: z.string().optional().describe('Category for organization (v1.5.0)'),
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
  category: z.string().optional().describe('Category for organization (v1.5.0)'),
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
  category: z.string().optional().describe('Filter by category (v1.5.0)'),
  fuzzy: z.boolean().default(false).describe('Enable fuzzy search (v1.5.0)'),
  regex: z.string().optional().describe('Regex pattern for advanced search (v1.5.0)'),
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

// Workspace mode configuration
export enum WorkspaceMode {
  ISOLATED = 'isolated',  // Default: workspace-only (current behavior)
  GLOBAL = 'global',      // All memories shared across workspaces
  HYBRID = 'hybrid'       // Support both global + workspace memories
}

// Workspace context
export interface WorkspaceContext {
  workspace_path: string;
  workspace_id: string; // Hash of the path for Redis keys
  mode: WorkspaceMode;   // Workspace isolation mode
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

// Helper to get workspace mode from environment
export function getWorkspaceMode(): WorkspaceMode {
  const mode = process.env.WORKSPACE_MODE?.toLowerCase();

  switch (mode) {
    case 'global':
      return WorkspaceMode.GLOBAL;
    case 'hybrid':
      return WorkspaceMode.HYBRID;
    case 'isolated':
    default:
      return WorkspaceMode.ISOLATED;
  }
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

// Get time window context schema (v1.6.0)
export const GetTimeWindowContextSchema = z.object({
  hours: z.number().min(0.1).max(72).optional().describe('Number of hours to look back (mutually exclusive with minutes/timestamps)'),
  minutes: z.number().min(1).max(4320).optional().describe('Number of minutes to look back (mutually exclusive with hours/timestamps)'),
  start_timestamp: z.number().optional().describe('Unix timestamp in ms for start of window (requires end_timestamp)'),
  end_timestamp: z.number().optional().describe('Unix timestamp in ms for end of window (requires start_timestamp)'),
  format: z.enum(['json', 'markdown', 'text']).default('markdown').describe('Output format'),
  include_metadata: z.boolean().default(true).describe('Include metadata (tags, importance, type)'),
  group_by: z.enum(['type', 'importance', 'chronological', 'tags']).default('chronological').describe('How to group the output'),
  min_importance: z.number().min(1).max(10).optional().describe('Filter by minimum importance'),
  context_types: z.array(ContextType).optional().describe('Filter by specific context types'),
});

export type GetTimeWindowContext = z.infer<typeof GetTimeWindowContextSchema>;

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

// Storage keys helper with workspace isolation and global support
export const StorageKeys = {
  // Workspace-scoped keys
  memory: (workspace: string, id: string) => `ws:${workspace}:memory:${id}`,
  memories: (workspace: string) => `ws:${workspace}:memories:all`,
  byType: (workspace: string, type: ContextType) => `ws:${workspace}:memories:type:${type}`,
  byTag: (workspace: string, tag: string) => `ws:${workspace}:memories:tag:${tag}`,
  timeline: (workspace: string) => `ws:${workspace}:memories:timeline`,
  session: (workspace: string, id: string) => `ws:${workspace}:session:${id}`,
  sessions: (workspace: string) => `ws:${workspace}:sessions:all`,
  important: (workspace: string) => `ws:${workspace}:memories:important`,

  // Global keys (workspace-independent)
  globalMemory: (id: string) => `global:memory:${id}`,
  globalMemories: () => `global:memories:all`,
  globalByType: (type: ContextType) => `global:memories:type:${type}`,
  globalByTag: (tag: string) => `global:memories:tag:${tag}`,
  globalTimeline: () => `global:memories:timeline`,
  globalImportant: () => `global:memories:important`,

  // Relationship keys (v1.4.0)
  relationship: (workspace: string, id: string) => `ws:${workspace}:relationship:${id}`,
  relationships: (workspace: string) => `ws:${workspace}:relationships:all`,
  memoryRelationships: (workspace: string, memoryId: string) =>
    `ws:${workspace}:memory:${memoryId}:relationships`,
  memoryRelationshipsOut: (workspace: string, memoryId: string) =>
    `ws:${workspace}:memory:${memoryId}:relationships:out`,
  memoryRelationshipsIn: (workspace: string, memoryId: string) =>
    `ws:${workspace}:memory:${memoryId}:relationships:in`,

  // Global relationship keys
  globalRelationship: (id: string) => `global:relationship:${id}`,
  globalRelationships: () => `global:relationships:all`,
  globalMemoryRelationships: (memoryId: string) => `global:memory:${memoryId}:relationships`,
  globalMemoryRelationshipsOut: (memoryId: string) => `global:memory:${memoryId}:relationships:out`,
  globalMemoryRelationshipsIn: (memoryId: string) => `global:memory:${memoryId}:relationships:in`,

  // Version history keys (v1.5.0)
  memoryVersions: (workspace: string, memoryId: string) => `ws:${workspace}:memory:${memoryId}:versions`,
  memoryVersion: (workspace: string, memoryId: string, versionId: string) =>
    `ws:${workspace}:memory:${memoryId}:version:${versionId}`,
  globalMemoryVersions: (memoryId: string) => `global:memory:${memoryId}:versions`,
  globalMemoryVersion: (memoryId: string, versionId: string) => `global:memory:${memoryId}:version:${versionId}`,

  // Template keys (v1.5.0)
  template: (workspace: string, id: string) => `ws:${workspace}:template:${id}`,
  templates: (workspace: string) => `ws:${workspace}:templates:all`,
  builtinTemplates: () => `builtin:templates:all`,
  builtinTemplate: (id: string) => `builtin:template:${id}`,

  // Category keys (v1.5.0)
  memoryCategory: (workspace: string, memoryId: string) => `ws:${workspace}:memory:${memoryId}:category`,
  category: (workspace: string, category: string) => `ws:${workspace}:category:${category}`,
  categories: (workspace: string) => `ws:${workspace}:categories:all`,
  globalMemoryCategory: (memoryId: string) => `global:memory:${memoryId}:category`,
  globalCategory: (category: string) => `global:category:${category}`,
  globalCategories: () => `global:categories:all`,
} as const;

// Helper to get the appropriate key based on is_global flag
export function getMemoryKey(workspace: string, id: string, isGlobal: boolean): string {
  return isGlobal ? StorageKeys.globalMemory(id) : StorageKeys.memory(workspace, id);
}

// Convert memory to global schema
export const ConvertToGlobalSchema = z.object({
  memory_id: z.string().describe('ID of the memory to convert to global'),
});

export type ConvertToGlobal = z.infer<typeof ConvertToGlobalSchema>;

// Convert memory to workspace schema
export const ConvertToWorkspaceSchema = z.object({
  memory_id: z.string().describe('ID of the global memory to convert to workspace-specific'),
  workspace_id: z.string().optional().describe('Target workspace (default: current workspace)'),
});

export type ConvertToWorkspace = z.infer<typeof ConvertToWorkspaceSchema>;

// ============================================================================
// Memory Relationships (v1.4.0)
// ============================================================================

// Relationship types
export enum RelationshipType {
  RELATES_TO = 'relates_to',      // Generic connection
  PARENT_OF = 'parent_of',         // Hierarchical (from is parent)
  CHILD_OF = 'child_of',           // Hierarchical (from is child)
  REFERENCES = 'references',       // From references to
  SUPERSEDES = 'supersedes',       // From replaces to
  IMPLEMENTS = 'implements',       // From implements to
  EXAMPLE_OF = 'example_of',       // From is example of to
}

// Memory relationship schema
export const MemoryRelationshipSchema = z.object({
  id: z.string().describe('Unique relationship identifier (ULID)'),
  from_memory_id: z.string().describe('Source memory ID'),
  to_memory_id: z.string().describe('Target memory ID'),
  relationship_type: z.nativeEnum(RelationshipType).describe('Type of relationship'),
  created_at: z.string().describe('ISO 8601 timestamp'),
  metadata: z.record(z.unknown()).optional().describe('Optional metadata'),
});

export type MemoryRelationship = z.infer<typeof MemoryRelationshipSchema>;

// Link memories schema
export const LinkMemoriesSchema = z.object({
  from_memory_id: z.string().describe('Source memory ID'),
  to_memory_id: z.string().describe('Target memory ID'),
  relationship_type: z.nativeEnum(RelationshipType).describe('Type of relationship'),
  metadata: z.record(z.unknown()).optional().describe('Optional metadata'),
});

export type LinkMemories = z.infer<typeof LinkMemoriesSchema>;

// Get related memories schema
export const GetRelatedMemoriesSchema = z.object({
  memory_id: z.string().describe('Memory ID to get relationships for'),
  relationship_types: z.array(z.nativeEnum(RelationshipType)).optional().describe('Filter by relationship types'),
  depth: z.number().min(1).max(5).default(1).describe('Traversal depth (1-5)'),
  direction: z.enum(['outgoing', 'incoming', 'both']).default('both').describe('Relationship direction'),
});

export type GetRelatedMemories = z.infer<typeof GetRelatedMemoriesSchema>;

// Unlink memories schema
export const UnlinkMemoriesSchema = z.object({
  relationship_id: z.string().describe('Relationship ID to remove'),
});

export type UnlinkMemories = z.infer<typeof UnlinkMemoriesSchema>;

// Get memory graph schema
export const GetMemoryGraphSchema = z.object({
  memory_id: z.string().describe('Root memory ID for graph'),
  max_depth: z.number().min(1).max(3).default(2).describe('Maximum graph depth'),
  max_nodes: z.number().min(1).max(100).default(50).describe('Maximum nodes to return'),
});

export type GetMemoryGraph = z.infer<typeof GetMemoryGraphSchema>;

// Related memory result (with relationship context)
export interface RelatedMemoryResult {
  memory: MemoryEntry;
  relationship: MemoryRelationship;
  depth: number;
}

// Memory graph node
export interface MemoryGraphNode {
  memory: MemoryEntry;
  relationships: MemoryRelationship[];
  depth: number;
}

// Memory graph structure
export interface MemoryGraph {
  root_memory_id: string;
  nodes: Record<string, MemoryGraphNode>;
  total_nodes: number;
  max_depth_reached: number;
}

// ============================================================================
// Memory Versioning & History (v1.5.0)
// ============================================================================

// Memory version schema
export const MemoryVersionSchema = z.object({
  version_id: z.string().describe('Version identifier (ULID)'),
  memory_id: z.string().describe('Memory this version belongs to'),
  content: z.string().describe('Content at this version'),
  context_type: ContextType,
  importance: z.number().min(1).max(10),
  tags: z.array(z.string()).default([]),
  summary: z.string().optional(),
  created_at: z.string().describe('ISO 8601 timestamp'),
  created_by: z.enum(['user', 'system']).default('user').describe('Who created this version'),
  change_reason: z.string().optional().describe('Reason for the change'),
});

export type MemoryVersion = z.infer<typeof MemoryVersionSchema>;

// Get memory history schema
export const GetMemoryHistorySchema = z.object({
  memory_id: z.string().describe('Memory ID to get history for'),
  limit: z.number().min(1).max(100).default(50).describe('Maximum versions to return'),
});

export type GetMemoryHistory = z.infer<typeof GetMemoryHistorySchema>;

// Rollback memory schema
export const RollbackMemorySchema = z.object({
  memory_id: z.string().describe('Memory ID to rollback'),
  version_id: z.string().describe('Version ID to rollback to'),
  preserve_relationships: z.boolean().default(true).describe('Preserve current relationships after rollback'),
});

export type RollbackMemory = z.infer<typeof RollbackMemorySchema>;

// Memory diff result
export interface MemoryDiff {
  version_from: MemoryVersion;
  version_to: MemoryVersion;
  content_diff: {
    added: string[];
    removed: string[];
    unchanged: string[];
  };
  importance_change: number;
  tags_added: string[];
  tags_removed: string[];
  context_type_changed: boolean;
}

// ============================================================================
// Memory Templates (v1.5.0)
// ============================================================================

// Template schema
export const MemoryTemplateSchema = z.object({
  template_id: z.string().describe('Template identifier (ULID)'),
  name: z.string().describe('Template name'),
  description: z.string().optional().describe('Template description'),
  context_type: ContextType,
  content_template: z.string().describe('Template content with {{placeholders}}'),
  default_tags: z.array(z.string()).default([]),
  default_importance: z.number().min(1).max(10).default(5),
  is_builtin: z.boolean().default(false).describe('Built-in template (cannot be deleted)'),
  created_at: z.string().describe('ISO 8601 timestamp'),
});

export type MemoryTemplate = z.infer<typeof MemoryTemplateSchema>;

// Create from template schema
export const CreateFromTemplateSchema = z.object({
  template_id: z.string().describe('Template ID to use'),
  variables: z.record(z.string()).describe('Variables to fill in template (key-value pairs)'),
  tags: z.array(z.string()).optional().describe('Additional tags (merged with template defaults)'),
  importance: z.number().min(1).max(10).optional().describe('Override template importance'),
  is_global: z.boolean().default(false).describe('Create as global memory'),
});

export type CreateFromTemplate = z.infer<typeof CreateFromTemplateSchema>;

// Create template schema
export const CreateTemplateSchema = z.object({
  name: z.string().min(1).describe('Template name'),
  description: z.string().optional().describe('Template description'),
  context_type: ContextType.default('information'),
  content_template: z.string().min(1).describe('Template content with {{placeholders}}'),
  default_tags: z.array(z.string()).default([]),
  default_importance: z.number().min(1).max(10).default(5),
});

export type CreateTemplate = z.infer<typeof CreateTemplateSchema>;

// ============================================================================
// Memory Categories (v1.5.0)
// ============================================================================

// Add category to memory schema (extends UpdateMemorySchema)
export const SetMemoryCategorySchema = z.object({
  memory_id: z.string().describe('Memory ID'),
  category: z.string().describe('Category name'),
});

export type SetMemoryCategory = z.infer<typeof SetMemoryCategorySchema>;

// List categories schema
export const ListCategoriesSchema = z.object({
  include_counts: z.boolean().default(true).describe('Include memory counts per category'),
});

export type ListCategories = z.infer<typeof ListCategoriesSchema>;

// Category info
export interface CategoryInfo {
  category: string;
  memory_count?: number;
  created_at: string;
  last_used: string;
}

// ============================================================================
// RLM Execution Chains (v1.8.0)
// Recursive Language Model support for handling large contexts
// Based on MIT CSAIL paper: arxiv:2512.24601
// ============================================================================

// Execution chain status
export const ExecutionStatus = z.enum([
  'active',     // Chain is currently being processed
  'completed',  // Chain finished successfully
  'failed',     // Chain encountered an error
  'paused',     // Chain is paused (waiting for input)
]);

export type ExecutionStatus = z.infer<typeof ExecutionStatus>;

// Decomposition strategy
export const DecompositionStrategy = z.enum([
  'filter',     // Filter by regex/pattern (for targeted extraction)
  'chunk',      // Split into fixed-size chunks (for sequential processing)
  'recursive',  // Break into subtasks recursively (for complex tasks)
  'aggregate',  // Combine multiple sources (for synthesis)
]);

export type DecompositionStrategy = z.infer<typeof DecompositionStrategy>;

// Subtask status
export const SubtaskStatus = z.enum([
  'pending',      // Not yet started
  'in_progress',  // Currently being processed
  'completed',    // Finished successfully
  'failed',       // Encountered an error
  'skipped',      // Skipped (e.g., filtered out as irrelevant)
]);

export type SubtaskStatus = z.infer<typeof SubtaskStatus>;

// Execution context schema
export const ExecutionContextSchema = z.object({
  chain_id: z.string().describe('ULID identifier for this execution chain'),
  parent_chain_id: z.string().optional().describe('Parent chain ID for recursive calls'),
  depth: z.number().min(0).max(5).default(0).describe('Current recursion depth (max 5)'),
  status: ExecutionStatus,
  original_task: z.string().describe('The original task description'),
  context_ref: z.string().describe('Reference ID to the large context in storage'),
  strategy: DecompositionStrategy.optional().describe('Recommended decomposition strategy'),
  estimated_tokens: z.number().optional().describe('Estimated token count of context'),
  created_at: z.number().describe('Unix timestamp in milliseconds'),
  updated_at: z.number().describe('Unix timestamp of last update'),
  completed_at: z.number().optional().describe('Unix timestamp when completed'),
  error_message: z.string().optional().describe('Error message if failed'),
});

export type ExecutionContext = z.infer<typeof ExecutionContextSchema>;

// Subtask schema
export const SubtaskSchema = z.object({
  id: z.string().describe('ULID identifier for this subtask'),
  chain_id: z.string().describe('Parent execution chain ID'),
  order: z.number().min(0).describe('Order in the execution sequence'),
  description: z.string().describe('What this subtask should accomplish'),
  status: SubtaskStatus,
  query: z.string().optional().describe('Filter/search query for this subtask'),
  result: z.string().optional().describe('Result of this subtask'),
  memory_ids: z.array(z.string()).default([]).describe('Related memory IDs'),
  tokens_used: z.number().optional().describe('Tokens used for this subtask'),
  created_at: z.number().describe('Unix timestamp in milliseconds'),
  completed_at: z.number().optional().describe('Unix timestamp when completed'),
});

export type Subtask = z.infer<typeof SubtaskSchema>;

// Decomposition result
export interface DecompositionResult {
  strategy: DecompositionStrategy;
  subtasks: Subtask[];
  context_snippets: string[];
  next_action: 'execute_subtasks' | 'decompose_further' | 'inject_context' | 'aggregate';
}

// Context snippet with metadata
export interface ContextSnippet {
  snippet: string;
  relevance_score: number;
  tokens_used: number;
  source_range?: {
    start: number;
    end: number;
  };
}

// Merged results
export interface MergedResults {
  aggregated_result: string;
  confidence: number;
  source_coverage: number;  // Percentage of context examined (0-1)
  subtasks_completed: number;
  subtasks_total: number;
}

// Verification result
export interface VerificationResult {
  verified: boolean;
  confidence: number;
  corrections?: string[];
  discrepancies?: string[];
}

// Create execution context schema (tool input)
export const CreateExecutionContextSchema = z.object({
  task: z.string().min(1).describe('The task description'),
  context: z.string().min(1).describe('The large context to process (will be stored externally)'),
  max_depth: z.number().min(1).max(5).default(3).describe('Maximum recursion depth allowed'),
});

export type CreateExecutionContextInput = z.infer<typeof CreateExecutionContextSchema>;

// Decompose task schema (tool input)
export const DecomposeTaskSchema = z.object({
  chain_id: z.string().describe('Execution chain ID'),
  strategy: DecompositionStrategy.optional().describe('Decomposition strategy (auto-detected if not provided)'),
  num_chunks: z.number().min(2).max(20).optional().describe('Number of chunks for chunk strategy'),
});

export type DecomposeTaskInput = z.infer<typeof DecomposeTaskSchema>;

// Inject context snippet schema (tool input)
export const InjectContextSnippetSchema = z.object({
  chain_id: z.string().describe('Execution chain ID'),
  subtask_id: z.string().describe('Subtask ID to get context for'),
  query: z.string().describe('Filter/search query to extract relevant context'),
  max_tokens: z.number().min(100).max(8000).default(4000).describe('Maximum tokens for the snippet'),
});

export type InjectContextSnippetInput = z.infer<typeof InjectContextSnippetSchema>;

// Merge results schema (tool input)
export const MergeResultsSchema = z.object({
  chain_id: z.string().describe('Execution chain ID'),
  include_failed: z.boolean().default(false).describe('Include failed subtask results'),
});

export type MergeResultsInput = z.infer<typeof MergeResultsSchema>;

// Verify answer schema (tool input)
export const VerifyAnswerSchema = z.object({
  chain_id: z.string().describe('Execution chain ID'),
  answer: z.string().describe('The proposed answer to verify'),
  verification_queries: z.array(z.string()).min(1).describe('Queries to verify the answer against'),
});

export type VerifyAnswerInput = z.infer<typeof VerifyAnswerSchema>;

// Update subtask result schema (tool input)
export const UpdateSubtaskResultSchema = z.object({
  chain_id: z.string().describe('Execution chain ID'),
  subtask_id: z.string().describe('Subtask ID to update'),
  result: z.string().describe('Result of the subtask'),
  status: SubtaskStatus.optional().describe('New status (defaults to completed)'),
});

export type UpdateSubtaskResultInput = z.infer<typeof UpdateSubtaskResultSchema>;

// Get execution status schema (tool input)
export const GetExecutionStatusSchema = z.object({
  chain_id: z.string().describe('Execution chain ID'),
  include_subtasks: z.boolean().default(true).describe('Include subtask details'),
});

export type GetExecutionStatusInput = z.infer<typeof GetExecutionStatusSchema>;

// Execution chain summary (for status queries)
export interface ExecutionChainSummary {
  context: ExecutionContext;
  subtasks: Subtask[];
  progress: {
    total: number;
    completed: number;
    failed: number;
    pending: number;
    in_progress: number;
  };
  estimated_remaining_tokens: number;
}

// Add RLM keys to StorageKeys (extend at runtime)
export const RLMStorageKeys = {
  // Execution chain keys
  execution: (workspace: string, chainId: string) => `ws:${workspace}:execution:${chainId}`,
  executions: (workspace: string) => `ws:${workspace}:executions:all`,
  executionSubtasks: (workspace: string, chainId: string) => `ws:${workspace}:execution:${chainId}:subtasks`,
  executionSubtask: (workspace: string, chainId: string, subtaskId: string) =>
    `ws:${workspace}:execution:${chainId}:subtask:${subtaskId}`,
  executionResults: (workspace: string, chainId: string) => `ws:${workspace}:execution:${chainId}:results`,
  executionContext: (workspace: string, chainId: string) => `ws:${workspace}:execution:${chainId}:context`,
  executionActive: (workspace: string) => `ws:${workspace}:executions:active`,

  // Global execution keys (for cross-workspace operations)
  globalExecution: (chainId: string) => `global:execution:${chainId}`,
  globalExecutions: () => `global:executions:all`,
} as const;
