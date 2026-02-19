import { z } from "zod";
import { ContextType } from "./types-core.js";
import { RelationshipType } from "./types-relationship.js";
import { DecompositionStrategy, SubtaskStatus } from "./types-rlm.js";
import { WorkflowStatus } from "./types-workflow.js";

/**
 * MemoryGraphActionSchema — consolidates link_memories, get_related_memories, unlink_memories,
 * get_memory_graph, get_memory_history, rollback_memory into a single tool.
 */
export const MemoryGraphActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("link"),
    from_memory_id: z.string().describe("Source memory ID"),
    to_memory_id: z.string().describe("Target memory ID"),
    relationship_type: z
      .nativeEnum(RelationshipType)
      .describe("Type of relationship"),
    metadata: z.record(z.unknown()).optional().describe("Optional metadata"),
  }),
  z.object({
    action: z.literal("unlink"),
    relationship_id: z.string().describe("Relationship ID to remove"),
  }),
  z.object({
    action: z.literal("related"),
    memory_id: z.string().describe("Memory ID to get relationships for"),
    relationship_types: z
      .array(z.nativeEnum(RelationshipType))
      .optional()
      .describe("Filter by relationship types"),
    depth: z
      .number()
      .min(1)
      .max(5)
      .default(1)
      .describe("Traversal depth (1-5)"),
    direction: z
      .enum(["outgoing", "incoming", "both"])
      .default("both")
      .describe("Relationship direction"),
  }),
  z.object({
    action: z.literal("graph"),
    memory_id: z.string().describe("Root memory ID for graph"),
    max_depth: z
      .number()
      .min(1)
      .max(3)
      .default(2)
      .describe("Maximum graph depth"),
    max_nodes: z
      .number()
      .min(1)
      .max(100)
      .default(50)
      .describe("Maximum nodes to return"),
  }),
  z.object({
    action: z.literal("history"),
    memory_id: z.string().describe("Memory ID to get history for"),
    limit: z
      .number()
      .min(1)
      .max(100)
      .default(50)
      .describe("Maximum versions to return"),
  }),
  z.object({
    action: z.literal("rollback"),
    memory_id: z.string().describe("Memory ID to rollback"),
    version_id: z.string().describe("Version ID to rollback to"),
    preserve_relationships: z
      .boolean()
      .default(true)
      .describe("Preserve current relationships after rollback"),
  }),
]);
export type MemoryGraphAction = z.infer<typeof MemoryGraphActionSchema>;

/**
 * MemoryTemplateActionSchema — consolidates create_template, create_from_template, list_templates.
 */
export const MemoryTemplateActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    name: z.string().min(1).describe("Template name"),
    description: z.string().optional().describe("Template description"),
    context_type: ContextType.default("information"),
    content_template: z
      .string()
      .min(1)
      .describe("Template content with {{placeholders}}"),
    default_tags: z.array(z.string()).default([]),
    default_importance: z.number().min(1).max(10).default(5),
  }),
  z.object({
    action: z.literal("use"),
    template_id: z.string().describe("Template ID to use"),
    variables: z.record(z.string()).describe("Variables to fill in template"),
    tags: z.array(z.string()).optional().describe("Additional tags"),
    importance: z
      .number()
      .min(1)
      .max(10)
      .optional()
      .describe("Override template importance"),
    is_global: z.boolean().default(false).describe("Create as global memory"),
  }),
  z.object({
    action: z.literal("list"),
  }),
]);
export type MemoryTemplateAction = z.infer<typeof MemoryTemplateActionSchema>;

/**
 * MemoryCategoryActionSchema — consolidates set_memory_category, list_categories, get_memories_by_category.
 */
export const MemoryCategoryActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("set"),
    memory_id: z.string().describe("Memory ID"),
    category: z.string().describe("Category name"),
  }),
  z.object({
    action: z.literal("list"),
    include_counts: z
      .boolean()
      .default(true)
      .describe("Include memory counts per category"),
  }),
  z.object({
    action: z.literal("get"),
    category: z.string().describe("Category name"),
    limit: z
      .number()
      .min(1)
      .max(100)
      .default(50)
      .describe("Maximum memories to return"),
  }),
]);
export type MemoryCategoryAction = z.infer<typeof MemoryCategoryActionSchema>;

/**
 * RLMProcessActionSchema — consolidates should_use_rlm, create_execution_context, decompose_task,
 * inject_context_snippet, update_subtask_result, merge_results, verify_answer, get_execution_status.
 */
export const RLMProcessActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("check"),
    content: z.string().describe("Content to analyze for RLM suitability"),
    task: z.string().describe("What you want to do with this content"),
  }),
  z.object({
    action: z.literal("create"),
    task: z.string().min(1).describe("Task to decompose and execute"),
    context: z.string().min(1).describe("Full context/content to process"),
    max_depth: z
      .number()
      .min(1)
      .max(5)
      .default(3)
      .describe("Maximum recursion depth"),
  }),
  z.object({
    action: z.literal("decompose"),
    chain_id: z.string().describe("Execution chain ID"),
    strategy: DecompositionStrategy.optional().describe(
      "Decomposition strategy",
    ),
    num_chunks: z
      .number()
      .min(2)
      .max(20)
      .optional()
      .describe("Number of chunks"),
  }),
  z.object({
    action: z.literal("inject"),
    chain_id: z.string().describe("Execution chain ID"),
    subtask_id: z.string().describe("Subtask ID to inject context for"),
    query: z.string().describe("Query to extract relevant context"),
    max_tokens: z
      .number()
      .min(100)
      .max(8000)
      .default(4000)
      .describe("Maximum tokens for context"),
  }),
  z.object({
    action: z.literal("update"),
    chain_id: z.string().describe("Execution chain ID"),
    subtask_id: z.string().describe("Subtask ID to update"),
    result: z.string().describe("Result of the subtask"),
    status: SubtaskStatus.optional().describe("New subtask status"),
  }),
  z.object({
    action: z.literal("merge"),
    chain_id: z.string().describe("Execution chain ID"),
    include_failed: z
      .boolean()
      .default(false)
      .describe("Include failed subtask results"),
  }),
  z.object({
    action: z.literal("verify"),
    chain_id: z.string().describe("Execution chain ID"),
    answer: z.string().describe("Answer to verify"),
    verification_queries: z
      .array(z.string())
      .min(1)
      .describe("Queries to verify against"),
  }),
  z.object({
    action: z.literal("status"),
    chain_id: z.string().describe("Execution chain ID"),
    include_subtasks: z
      .boolean()
      .default(true)
      .describe("Include subtask details"),
  }),
]);
export type RLMProcessAction = z.infer<typeof RLMProcessActionSchema>;

/**
 * WorkflowActionSchema — consolidates start_workflow, complete_workflow, pause_workflow,
 * resume_workflow, get_active_workflow, list_workflows, get_workflow_context.
 */
export const WorkflowActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    name: z
      .string()
      .min(1)
      .max(200)
      .describe("Short descriptive name for the workflow thread"),
    description: z
      .string()
      .max(1000)
      .optional()
      .describe("Detailed description of what this workflow will accomplish"),
  }),
  z.object({
    action: z.literal("complete"),
    workflow_id: z
      .string()
      .optional()
      .describe("Workflow ID to complete (defaults to active)"),
  }),
  z.object({
    action: z.literal("pause"),
    workflow_id: z
      .string()
      .optional()
      .describe("Workflow ID to pause (defaults to active)"),
  }),
  z.object({
    action: z.literal("resume"),
    workflow_id: z.string().describe("Workflow ID to resume"),
  }),
  z.object({
    action: z.literal("active"),
    workflow_id: z
      .string()
      .optional()
      .describe("Workflow ID to retrieve (defaults to active)"),
  }),
  z.object({
    action: z.literal("list"),
    status: WorkflowStatus.optional().describe("Filter by workflow status"),
    limit: z
      .number()
      .min(1)
      .max(100)
      .default(20)
      .describe("Maximum workflows to return"),
  }),
  z.object({
    action: z.literal("context"),
    workflow_id: z
      .string()
      .optional()
      .describe("Workflow ID (defaults to active)"),
    max_tokens: z
      .number()
      .min(100)
      .max(2000)
      .default(500)
      .describe("Maximum tokens for context output"),
  }),
]);
export type WorkflowAction = z.infer<typeof WorkflowActionSchema>;

/**
 * MemoryMaintainActionSchema — consolidates auto_consolidate, force_consolidate, consolidation_status,
 * export_memories, import_memories, find_duplicates, consolidate_memories.
 */
export const MemoryMaintainActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("consolidate"),
    memory_count_threshold: z
      .number()
      .min(10)
      .optional()
      .describe("Override default threshold for triggering consolidation"),
    similarity_threshold: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe("Override default similarity threshold"),
    min_cluster_size: z
      .number()
      .min(2)
      .optional()
      .describe("Override minimum cluster size"),
    max_age_days: z
      .number()
      .min(1)
      .optional()
      .describe("Only consolidate memories older than N days"),
    max_memories: z
      .number()
      .min(10)
      .max(10000)
      .optional()
      .describe("Override maximum memories to sample"),
  }),
  z.object({
    action: z.literal("force"),
    similarity_threshold: z.number().min(0).max(1).optional(),
    min_cluster_size: z.number().min(2).optional(),
    max_age_days: z.number().min(1).optional(),
    max_memories: z.number().min(10).max(10000).optional(),
  }),
  z.object({
    action: z.literal("status"),
    memory_count_threshold: z
      .number()
      .min(10)
      .optional()
      .describe("Override default threshold for triggering consolidation"),
  }),
  z.object({
    action: z.literal("export"),
    format: z.enum(["json"]).default("json").describe("Export format"),
    include_embeddings: z
      .boolean()
      .default(false)
      .describe("Include vector embeddings in export"),
    filter_by_type: z
      .array(ContextType)
      .optional()
      .describe("Only export specific types"),
    min_importance: z
      .number()
      .min(1)
      .max(10)
      .optional()
      .describe("Only export above this importance"),
  }),
  z.object({
    action: z.literal("import"),
    data: z.string().describe("JSON string of exported memories"),
    overwrite_existing: z
      .boolean()
      .default(false)
      .describe("Overwrite if memory ID already exists"),
    regenerate_embeddings: z
      .boolean()
      .default(true)
      .describe("Regenerate embeddings on import"),
  }),
  z.object({
    action: z.literal("find_duplicates"),
    similarity_threshold: z
      .number()
      .min(0)
      .max(1)
      .default(0.85)
      .describe("Similarity threshold (0-1)"),
    auto_merge: z
      .boolean()
      .default(false)
      .describe("Automatically merge duplicates"),
    limit: z
      .number()
      .min(1)
      .max(100)
      .default(10)
      .describe("Maximum duplicate pairs to return"),
  }),
  z.object({
    action: z.literal("merge"),
    memory_ids: z
      .array(z.string())
      .min(2)
      .describe("Memory IDs to consolidate"),
    merged_content: z.string().describe("Content for the merged memory"),
    merged_summary: z
      .string()
      .optional()
      .describe("Summary for the merged memory"),
    keep_originals: z
      .boolean()
      .default(false)
      .describe("Keep original memories after merging"),
  }),
]);
export type MemoryMaintainAction = z.infer<typeof MemoryMaintainActionSchema>;
