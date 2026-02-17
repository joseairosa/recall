import { z } from 'zod';

export const ContextType = z.enum([
  'directive',
  'information',
  'heading',
  'decision',
  'code_pattern',
  'requirement',
  'error',
  'todo',
  'insight',
  'preference',
]);

export type ContextType = z.infer<typeof ContextType>;

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

export const BatchCreateMemoriesSchema = z.object({
  memories: z.array(CreateMemorySchema).min(1).describe('Array of memories to store'),
});

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

export const DeleteMemorySchema = z.object({
  memory_id: z.string().describe('ULID of memory to delete'),
});

export const SearchOutputMode = z.enum(['full', 'summary', 'compact']);
export type SearchOutputMode = z.infer<typeof SearchOutputMode>;

export const SearchMemorySchema = z.object({
  query: z.string().describe('Search query'),
  limit: z.number().min(1).max(100).default(10).describe('Number of results'),
  min_importance: z.number().min(1).max(10).optional().describe('Filter by minimum importance'),
  context_types: z.array(ContextType).optional().describe('Filter by context types'),
  category: z.string().optional().describe('Filter by category (v1.5.0)'),
  fuzzy: z.boolean().default(false).describe('Enable fuzzy search (v1.5.0)'),
  regex: z.string().optional().describe('Regex pattern for advanced search (v1.5.0)'),
  output_mode: SearchOutputMode.default('summary').describe(
    'Output mode for context efficiency (v1.8.1): ' +
    'full=all fields including content, ' +
    'summary=no content field (default, recommended), ' +
    'compact=minimal fields (id, summary, type, similarity only)'
  ),
});

export const OrganizeSessionSchema = z.object({
  session_name: z.string().describe('Name for the session'),
  memory_ids: z.array(z.string()).min(1).describe('Array of memory IDs to include'),
  summary: z.string().optional().describe('Optional session summary'),
});

export interface SessionInfo {
  session_id: string;
  session_name: string;
  created_at: number;
  memory_count: number;
  summary?: string;
  memory_ids: string[];
}

export enum WorkspaceMode {
  ISOLATED = 'isolated',
  GLOBAL = 'global',
  HYBRID = 'hybrid'
}

export interface WorkspaceContext {
  workspace_path: string;
  workspace_id: string;
  mode: WorkspaceMode;
}

export function createWorkspaceId(path: string): string {
  let hash = 0;
  for (let i = 0; i < path.length; i++) {
    const char = path.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

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

export const RecallContextSchema = z.object({
  current_task: z.string().describe('Description of what I\'m currently working on'),
  query: z.string().optional().describe('Optional specific search query'),
  limit: z.number().min(1).max(20).default(5).describe('Number of results to return'),
  min_importance: z.number().min(1).max(10).default(6).describe('Minimum importance threshold'),
});

export type RecallContext = z.infer<typeof RecallContextSchema>;

export const AnalyzeConversationSchema = z.object({
  conversation_text: z.string().min(1).describe('Conversation text to analyze and extract memories from'),
  auto_categorize: z.boolean().default(true).describe('Automatically categorize extracted memories'),
  auto_store: z.boolean().default(true).describe('Automatically store extracted memories'),
});

export type AnalyzeConversation = z.infer<typeof AnalyzeConversationSchema>;

export const SummarizeSessionSchema = z.object({
  session_name: z.string().optional().describe('Optional name for the session'),
  auto_create_snapshot: z.boolean().default(true).describe('Automatically create session snapshot'),
  lookback_minutes: z.number().default(60).describe('How many minutes back to look for memories'),
});

export type SummarizeSession = z.infer<typeof SummarizeSessionSchema>;

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

export interface ExtractedMemory {
  content: string;
  context_type: ContextType;
  importance: number;
  tags: string[];
  summary?: string;
}

export interface AnalysisResult {
  extracted_memories: ExtractedMemory[];
  total_count: number;
  stored_ids?: string[];
}

export const ExportMemoriesSchema = z.object({
  format: z.enum(['json']).default('json').describe('Export format'),
  include_embeddings: z.boolean().default(false).describe('Include vector embeddings in export'),
  filter_by_type: z.array(ContextType).optional().describe('Only export specific types'),
  min_importance: z.number().min(1).max(10).optional().describe('Only export above this importance'),
});

export type ExportMemories = z.infer<typeof ExportMemoriesSchema>;

export const ImportMemoriesSchema = z.object({
  data: z.string().describe('JSON string of exported memories'),
  overwrite_existing: z.boolean().default(false).describe('Overwrite if memory ID already exists'),
  regenerate_embeddings: z.boolean().default(true).describe('Regenerate embeddings on import'),
});

export type ImportMemories = z.infer<typeof ImportMemoriesSchema>;

export const FindDuplicatesSchema = z.object({
  similarity_threshold: z.number().min(0).max(1).default(0.85).describe('Similarity threshold (0-1)'),
  auto_merge: z.boolean().default(false).describe('Automatically merge duplicates'),
  keep_highest_importance: z.boolean().default(true).describe('When merging, keep highest importance'),
});

export type FindDuplicates = z.infer<typeof FindDuplicatesSchema>;

export const ConsolidateMemoriesSchema = z.object({
  memory_ids: z.array(z.string()).min(2).describe('Array of memory IDs to consolidate'),
  keep_id: z.string().optional().describe('Optional ID of memory to keep (default: highest importance)'),
});

export type ConsolidateMemories = z.infer<typeof ConsolidateMemoriesSchema>;

export interface DuplicateGroup {
  memories: MemoryEntry[];
  similarity_score: number;
}

export const StorageKeys = {
  memory: (workspace: string, id: string) => `ws:${workspace}:memory:${id}`,
  memories: (workspace: string) => `ws:${workspace}:memories:all`,
  byType: (workspace: string, type: ContextType) => `ws:${workspace}:memories:type:${type}`,
  byTag: (workspace: string, tag: string) => `ws:${workspace}:memories:tag:${tag}`,
  timeline: (workspace: string) => `ws:${workspace}:memories:timeline`,
  session: (workspace: string, id: string) => `ws:${workspace}:session:${id}`,
  sessions: (workspace: string) => `ws:${workspace}:sessions:all`,
  important: (workspace: string) => `ws:${workspace}:memories:important`,

  globalMemory: (id: string) => `global:memory:${id}`,
  globalMemories: () => `global:memories:all`,
  globalByType: (type: ContextType) => `global:memories:type:${type}`,
  globalByTag: (tag: string) => `global:memories:tag:${tag}`,
  globalTimeline: () => `global:memories:timeline`,
  globalImportant: () => `global:memories:important`,

  relationship: (workspace: string, id: string) => `ws:${workspace}:relationship:${id}`,
  relationships: (workspace: string) => `ws:${workspace}:relationships:all`,
  memoryRelationships: (workspace: string, memoryId: string) =>
    `ws:${workspace}:memory:${memoryId}:relationships`,
  memoryRelationshipsOut: (workspace: string, memoryId: string) =>
    `ws:${workspace}:memory:${memoryId}:relationships:out`,
  memoryRelationshipsIn: (workspace: string, memoryId: string) =>
    `ws:${workspace}:memory:${memoryId}:relationships:in`,

  globalRelationship: (id: string) => `global:relationship:${id}`,
  globalRelationships: () => `global:relationships:all`,
  globalMemoryRelationships: (memoryId: string) => `global:memory:${memoryId}:relationships`,
  globalMemoryRelationshipsOut: (memoryId: string) => `global:memory:${memoryId}:relationships:out`,
  globalMemoryRelationshipsIn: (memoryId: string) => `global:memory:${memoryId}:relationships:in`,

  memoryVersions: (workspace: string, memoryId: string) => `ws:${workspace}:memory:${memoryId}:versions`,
  memoryVersion: (workspace: string, memoryId: string, versionId: string) =>
    `ws:${workspace}:memory:${memoryId}:version:${versionId}`,
  globalMemoryVersions: (memoryId: string) => `global:memory:${memoryId}:versions`,
  globalMemoryVersion: (memoryId: string, versionId: string) => `global:memory:${memoryId}:version:${versionId}`,

  template: (workspace: string, id: string) => `ws:${workspace}:template:${id}`,
  templates: (workspace: string) => `ws:${workspace}:templates:all`,
  builtinTemplates: () => `builtin:templates:all`,
  builtinTemplate: (id: string) => `builtin:template:${id}`,

  memoryCategory: (workspace: string, memoryId: string) => `ws:${workspace}:memory:${memoryId}:category`,
  category: (workspace: string, category: string) => `ws:${workspace}:category:${category}`,
  categories: (workspace: string) => `ws:${workspace}:categories:all`,
  globalMemoryCategory: (memoryId: string) => `global:memory:${memoryId}:category`,
  globalCategory: (category: string) => `global:category:${category}`,
  globalCategories: () => `global:categories:all`,
} as const;

export function getMemoryKey(workspace: string, id: string, isGlobal: boolean): string {
  return isGlobal ? StorageKeys.globalMemory(id) : StorageKeys.memory(workspace, id);
}

export const ConvertToGlobalSchema = z.object({
  memory_id: z.string().describe('ID of the memory to convert to global'),
});

export type ConvertToGlobal = z.infer<typeof ConvertToGlobalSchema>;

export const ConvertToWorkspaceSchema = z.object({
  memory_id: z.string().describe('ID of the global memory to convert to workspace-specific'),
  workspace_id: z.string().optional().describe('Target workspace (default: current workspace)'),
});

export type ConvertToWorkspace = z.infer<typeof ConvertToWorkspaceSchema>;


export enum RelationshipType {
  RELATES_TO = 'relates_to',
  PARENT_OF = 'parent_of',
  CHILD_OF = 'child_of',
  REFERENCES = 'references',
  SUPERSEDES = 'supersedes',
  IMPLEMENTS = 'implements',
  EXAMPLE_OF = 'example_of',
}

export const MemoryRelationshipSchema = z.object({
  id: z.string().describe('Unique relationship identifier (ULID)'),
  from_memory_id: z.string().describe('Source memory ID'),
  to_memory_id: z.string().describe('Target memory ID'),
  relationship_type: z.nativeEnum(RelationshipType).describe('Type of relationship'),
  created_at: z.string().describe('ISO 8601 timestamp'),
  metadata: z.record(z.unknown()).optional().describe('Optional metadata'),
});

export type MemoryRelationship = z.infer<typeof MemoryRelationshipSchema>;

export const LinkMemoriesSchema = z.object({
  from_memory_id: z.string().describe('Source memory ID'),
  to_memory_id: z.string().describe('Target memory ID'),
  relationship_type: z.nativeEnum(RelationshipType).describe('Type of relationship'),
  metadata: z.record(z.unknown()).optional().describe('Optional metadata'),
});

export type LinkMemories = z.infer<typeof LinkMemoriesSchema>;

export const GetRelatedMemoriesSchema = z.object({
  memory_id: z.string().describe('Memory ID to get relationships for'),
  relationship_types: z.array(z.nativeEnum(RelationshipType)).optional().describe('Filter by relationship types'),
  depth: z.number().min(1).max(5).default(1).describe('Traversal depth (1-5)'),
  direction: z.enum(['outgoing', 'incoming', 'both']).default('both').describe('Relationship direction'),
});

export type GetRelatedMemories = z.infer<typeof GetRelatedMemoriesSchema>;

export const UnlinkMemoriesSchema = z.object({
  relationship_id: z.string().describe('Relationship ID to remove'),
});

export type UnlinkMemories = z.infer<typeof UnlinkMemoriesSchema>;

export const GetMemoryGraphSchema = z.object({
  memory_id: z.string().describe('Root memory ID for graph'),
  max_depth: z.number().min(1).max(3).default(2).describe('Maximum graph depth'),
  max_nodes: z.number().min(1).max(100).default(50).describe('Maximum nodes to return'),
});

export type GetMemoryGraph = z.infer<typeof GetMemoryGraphSchema>;

export interface RelatedMemoryResult {
  memory: MemoryEntry;
  relationship: MemoryRelationship;
  depth: number;
}

export interface MemoryGraphNode {
  memory: MemoryEntry;
  relationships: MemoryRelationship[];
  depth: number;
}

export interface MemoryGraph {
  root_memory_id: string;
  nodes: Record<string, MemoryGraphNode>;
  total_nodes: number;
  max_depth_reached: number;
}


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

export const GetMemoryHistorySchema = z.object({
  memory_id: z.string().describe('Memory ID to get history for'),
  limit: z.number().min(1).max(100).default(50).describe('Maximum versions to return'),
});

export type GetMemoryHistory = z.infer<typeof GetMemoryHistorySchema>;

export const RollbackMemorySchema = z.object({
  memory_id: z.string().describe('Memory ID to rollback'),
  version_id: z.string().describe('Version ID to rollback to'),
  preserve_relationships: z.boolean().default(true).describe('Preserve current relationships after rollback'),
});

export type RollbackMemory = z.infer<typeof RollbackMemorySchema>;

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

export const CreateFromTemplateSchema = z.object({
  template_id: z.string().describe('Template ID to use'),
  variables: z.record(z.string()).describe('Variables to fill in template (key-value pairs)'),
  tags: z.array(z.string()).optional().describe('Additional tags (merged with template defaults)'),
  importance: z.number().min(1).max(10).optional().describe('Override template importance'),
  is_global: z.boolean().default(false).describe('Create as global memory'),
});

export type CreateFromTemplate = z.infer<typeof CreateFromTemplateSchema>;

export const CreateTemplateSchema = z.object({
  name: z.string().min(1).describe('Template name'),
  description: z.string().optional().describe('Template description'),
  context_type: ContextType.default('information'),
  content_template: z.string().min(1).describe('Template content with {{placeholders}}'),
  default_tags: z.array(z.string()).default([]),
  default_importance: z.number().min(1).max(10).default(5),
});

export type CreateTemplate = z.infer<typeof CreateTemplateSchema>;


export const SetMemoryCategorySchema = z.object({
  memory_id: z.string().describe('Memory ID'),
  category: z.string().describe('Category name'),
});

export type SetMemoryCategory = z.infer<typeof SetMemoryCategorySchema>;

export const ListCategoriesSchema = z.object({
  include_counts: z.boolean().default(true).describe('Include memory counts per category'),
});

export type ListCategories = z.infer<typeof ListCategoriesSchema>;

export interface CategoryInfo {
  category: string;
  memory_count?: number;
  created_at: string;
  last_used: string;
}


export const ExecutionStatus = z.enum([
  'active',
  'completed',
  'failed',
  'paused',
]);

export type ExecutionStatus = z.infer<typeof ExecutionStatus>;

export const DecompositionStrategy = z.enum([
  'filter',
  'chunk',
  'recursive',
  'aggregate',
]);

export type DecompositionStrategy = z.infer<typeof DecompositionStrategy>;

export const SubtaskStatus = z.enum([
  'pending',
  'in_progress',
  'completed',
  'failed',
  'skipped',
]);

export type SubtaskStatus = z.infer<typeof SubtaskStatus>;

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

export interface DecompositionResult {
  strategy: DecompositionStrategy;
  subtasks: Subtask[];
  context_snippets: string[];
  next_action: 'execute_subtasks' | 'decompose_further' | 'inject_context' | 'aggregate';
}

export interface ContextSnippet {
  snippet: string;
  relevance_score: number;
  tokens_used: number;
  source_range?: {
    start: number;
    end: number;
  };
}

export interface MergedResults {
  aggregated_result: string;
  confidence: number;
  source_coverage: number;
  subtasks_completed: number;
  subtasks_total: number;
}

export interface VerificationResult {
  verified: boolean;
  confidence: number;
  corrections?: string[];
  discrepancies?: string[];
}

export const CreateExecutionContextSchema = z.object({
  task: z.string().min(1).describe('The task description'),
  context: z.string().min(1).describe('The large context to process (will be stored externally)'),
  max_depth: z.number().min(1).max(5).default(3).describe('Maximum recursion depth allowed'),
});

export type CreateExecutionContextInput = z.infer<typeof CreateExecutionContextSchema>;

export const DecomposeTaskSchema = z.object({
  chain_id: z.string().describe('Execution chain ID'),
  strategy: DecompositionStrategy.optional().describe('Decomposition strategy (auto-detected if not provided)'),
  num_chunks: z.number().min(2).max(20).optional().describe('Number of chunks for chunk strategy'),
});

export type DecomposeTaskInput = z.infer<typeof DecomposeTaskSchema>;

export const InjectContextSnippetSchema = z.object({
  chain_id: z.string().describe('Execution chain ID'),
  subtask_id: z.string().describe('Subtask ID to get context for'),
  query: z.string().describe('Filter/search query to extract relevant context'),
  max_tokens: z.number().min(100).max(8000).default(4000).describe('Maximum tokens for the snippet'),
});

export type InjectContextSnippetInput = z.infer<typeof InjectContextSnippetSchema>;

export const MergeResultsSchema = z.object({
  chain_id: z.string().describe('Execution chain ID'),
  include_failed: z.boolean().default(false).describe('Include failed subtask results'),
});

export type MergeResultsInput = z.infer<typeof MergeResultsSchema>;

export const VerifyAnswerSchema = z.object({
  chain_id: z.string().describe('Execution chain ID'),
  answer: z.string().describe('The proposed answer to verify'),
  verification_queries: z.array(z.string()).min(1).describe('Queries to verify the answer against'),
});

export type VerifyAnswerInput = z.infer<typeof VerifyAnswerSchema>;

export const UpdateSubtaskResultSchema = z.object({
  chain_id: z.string().describe('Execution chain ID'),
  subtask_id: z.string().describe('Subtask ID to update'),
  result: z.string().describe('Result of the subtask'),
  status: SubtaskStatus.optional().describe('New status (defaults to completed)'),
});

export type UpdateSubtaskResultInput = z.infer<typeof UpdateSubtaskResultSchema>;

export const GetExecutionStatusSchema = z.object({
  chain_id: z.string().describe('Execution chain ID'),
  include_subtasks: z.boolean().default(true).describe('Include subtask details'),
});

export type GetExecutionStatusInput = z.infer<typeof GetExecutionStatusSchema>;

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


export const WorkflowStatus = z.enum(['active', 'paused', 'completed'])
  .describe('Workflow lifecycle state');
export type WorkflowStatus = z.infer<typeof WorkflowStatus>;

export const WorkflowInfoSchema = z.object({
  id: z.string().describe('ULID identifier for the workflow'),
  name: z.string().describe('Short name for the workflow (e.g., "Implementing auth system")'),
  description: z.string().optional().describe('Detailed description of the workflow goal'),
  status: WorkflowStatus.describe('Current workflow state'),
  created_at: z.number().describe('Unix timestamp when workflow was created'),
  updated_at: z.number().describe('Unix timestamp when workflow was last updated'),
  completed_at: z.number().optional().describe('Unix timestamp when workflow was completed'),
  memory_count: z.number().default(0).describe('Number of memories linked to this workflow'),
  summary: z.string().optional().describe('Auto-generated summary created on completion'),
  workspace_id: z.string().describe('Workspace this workflow belongs to'),
});
export type WorkflowInfo = z.infer<typeof WorkflowInfoSchema>;

export const StartWorkflowSchema = z.object({
  name: z.string().min(1).max(200).describe('Short descriptive name for the workflow thread'),
  description: z.string().max(1000).optional().describe('Detailed description of what this workflow will accomplish'),
});
export type StartWorkflow = z.infer<typeof StartWorkflowSchema>;

export const CompleteWorkflowSchema = z.object({
  workflow_id: z.string().optional().describe('Workflow ID to complete (defaults to active workflow)'),
});
export type CompleteWorkflow = z.infer<typeof CompleteWorkflowSchema>;

export const PauseWorkflowSchema = z.object({
  workflow_id: z.string().optional().describe('Workflow ID to pause (defaults to active workflow)'),
});
export type PauseWorkflow = z.infer<typeof PauseWorkflowSchema>;

export const ResumeWorkflowSchema = z.object({
  workflow_id: z.string().describe('Workflow ID to resume'),
});
export type ResumeWorkflow = z.infer<typeof ResumeWorkflowSchema>;

export const GetWorkflowSchema = z.object({
  workflow_id: z.string().optional().describe('Workflow ID to retrieve (defaults to active workflow)'),
});
export type GetWorkflow = z.infer<typeof GetWorkflowSchema>;

export const ListWorkflowsSchema = z.object({
  status: WorkflowStatus.optional().describe('Filter by workflow status'),
  limit: z.number().min(1).max(100).default(20).describe('Maximum number of workflows to return'),
});
export type ListWorkflows = z.infer<typeof ListWorkflowsSchema>;

export const GetWorkflowContextSchema = z.object({
  workflow_id: z.string().optional().describe('Workflow ID (defaults to active workflow)'),
  max_tokens: z.number().min(100).max(2000).default(500).describe('Maximum tokens for context output'),
});
export type GetWorkflowContext = z.infer<typeof GetWorkflowContextSchema>;

export const WorkflowStorageKeys = {
  workflow: (workspace: string, id: string) => `ws:${workspace}:workflow:${id}`,
  workflows: (workspace: string) => `ws:${workspace}:workflows:all`,
  workflowActive: (workspace: string) => `ws:${workspace}:workflow:active`,
  workflowMemories: (workspace: string, id: string) => `ws:${workspace}:workflow:${id}:memories`,
} as const;


export const ConsolidationConfigSchema = z.object({
  similarity_threshold: z.number().min(0).max(1).default(0.75)
    .describe('Minimum cosine similarity to cluster two memories together (0.0-1.0, default 0.75)'),
  min_cluster_size: z.number().min(2).max(50).default(2)
    .describe('Minimum number of memories in a cluster to consolidate (default 2)'),
  max_age_days: z.number().min(1).optional()
    .describe('Only consider memories older than this many days (optional)'),
  memory_count_threshold: z.number().min(10).default(100)
    .describe('Minimum total memory count before auto-consolidation triggers (default 100)'),
  max_memories: z.number().min(10).max(10000).default(1000)
    .describe('Maximum memories to load for clustering. Prevents OOM on large stores (default 1000)'),
});
export type ConsolidationConfig = z.infer<typeof ConsolidationConfigSchema>;

export const ConsolidationResultSchema = z.object({
  clusters_found: z.number().describe('Number of clusters identified'),
  memories_consolidated: z.number().describe('Total memories merged into consolidated summaries'),
  consolidated_memory_ids: z.array(z.string()).describe('IDs of newly created consolidated memories'),
  skipped_no_embedding: z.number().describe('Memories skipped due to missing embeddings'),
  report: z.string().describe('Human-readable consolidation report'),
});
export type ConsolidationResult = z.infer<typeof ConsolidationResultSchema>;

export const ConsolidationRunSchema = z.object({
  id: z.string().describe('ULID identifier for the consolidation run'),
  timestamp: z.number().describe('Unix timestamp when the run occurred'),
  config: ConsolidationConfigSchema.describe('Configuration used for this run'),
  result: ConsolidationResultSchema.describe('Results of the consolidation run'),
});
export type ConsolidationRun = z.infer<typeof ConsolidationRunSchema>;

export const TriggerConsolidationSchema = z.object({
  similarity_threshold: z.number().min(0).max(1).optional()
    .describe('Override default similarity threshold (0.0-1.0)'),
  min_cluster_size: z.number().min(2).optional()
    .describe('Override minimum cluster size'),
  max_age_days: z.number().min(1).optional()
    .describe('Only consolidate memories older than N days'),
  max_memories: z.number().min(10).max(10000).optional()
    .describe('Override maximum memories to sample for clustering'),
});
export type TriggerConsolidation = z.infer<typeof TriggerConsolidationSchema>;

export const GetConsolidationStatusSchema = z.object({
  memory_count_threshold: z.number().min(10).optional()
    .describe('Override default threshold for triggering consolidation (default 100)'),
});
export type GetConsolidationStatus = z.infer<typeof GetConsolidationStatusSchema>;

export const ConsolidationStorageKeys = {
  consolidation: (workspace: string, id: string) => `ws:${workspace}:consolidation:${id}`,
  consolidations: (workspace: string) => `ws:${workspace}:consolidations:all`,
  lastRun: (workspace: string) => `ws:${workspace}:consolidations:last_run`,
} as const;

export const RLMStorageKeys = {
  execution: (workspace: string, chainId: string) => `ws:${workspace}:execution:${chainId}`,
  executions: (workspace: string) => `ws:${workspace}:executions:all`,
  executionSubtasks: (workspace: string, chainId: string) => `ws:${workspace}:execution:${chainId}:subtasks`,
  executionSubtask: (workspace: string, chainId: string, subtaskId: string) =>
    `ws:${workspace}:execution:${chainId}:subtask:${subtaskId}`,
  executionResults: (workspace: string, chainId: string) => `ws:${workspace}:execution:${chainId}:results`,
  executionContext: (workspace: string, chainId: string) => `ws:${workspace}:execution:${chainId}:context`,
  executionActive: (workspace: string) => `ws:${workspace}:executions:active`,

  globalExecution: (chainId: string) => `global:execution:${chainId}`,
  globalExecutions: () => `global:executions:all`,
} as const;
