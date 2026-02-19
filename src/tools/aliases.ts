/**
 * aliases — backwards-compatible tool aliases for all deprecated tool names.
 * Exposed when RECALL_SHOW_DEPRECATED_TOOLS=true.
 *
 * Each alias delegates to the appropriate consolidated tool with the action pre-filled.
 */

import { zodToJsonSchema } from "zod-to-json-schema";
import { memory_graph } from "./memory-graph-tool.js";
import { memory_template } from "./memory-template-tool.js";
import { memory_category } from "./memory-category-tool.js";
import { rlm_process } from "./rlm-process-tool.js";
import { workflow } from "./workflow-tool.js";
import { memory_maintain } from "./memory-maintain-tool.js";
import {
  LinkMemoriesSchema,
  UnlinkMemoriesSchema,
  GetRelatedMemoriesSchema,
  GetMemoryGraphSchema,
  GetMemoryHistorySchema,
  RollbackMemorySchema,
  CreateTemplateSchema,
  CreateFromTemplateSchema,
  SetMemoryCategorySchema,
  ListCategoriesSchema,
  CreateExecutionContextSchema,
  DecomposeTaskSchema,
  InjectContextSnippetSchema,
  UpdateSubtaskResultSchema,
  MergeResultsSchema,
  VerifyAnswerSchema,
  GetExecutionStatusSchema,
  StartWorkflowSchema,
  CompleteWorkflowSchema,
  PauseWorkflowSchema,
  ResumeWorkflowSchema,
  ListWorkflowsSchema,
  GetWorkflowContextSchema,
  TriggerConsolidationSchema,
  GetConsolidationStatusSchema,
  ExportMemoriesSchema,
  ImportMemoriesSchema,
  FindDuplicatesSchema,
  ConsolidateMemoriesSchema,
} from "../types.js";
import { z } from "zod";

const ShouldUseRLMSchema = z.object({
  content: z.string().describe("Content to analyze"),
  task: z.string().describe("What you want to do with this content"),
});

const dep = (name: string) => `[Deprecated — use ${name}] `;

export const aliases = {
  link_memories: {
    description:
      dep("memory_graph") + "Create a relationship between two memories",
    inputSchema: zodToJsonSchema(LinkMemoriesSchema),
    handler: (args: unknown) =>
      memory_graph.handler({ action: "link", ...(args as object) }),
  },
  unlink_memories: {
    description: dep("memory_graph") + "Remove a relationship between memories",
    inputSchema: zodToJsonSchema(UnlinkMemoriesSchema),
    handler: (args: unknown) =>
      memory_graph.handler({ action: "unlink", ...(args as object) }),
  },
  get_related_memories: {
    description: dep("memory_graph") + "Get memories related to a given memory",
    inputSchema: zodToJsonSchema(GetRelatedMemoriesSchema),
    handler: (args: unknown) =>
      memory_graph.handler({ action: "related", ...(args as object) }),
  },
  get_memory_graph: {
    description: dep("memory_graph") + "Get a graph of related memories",
    inputSchema: zodToJsonSchema(GetMemoryGraphSchema),
    handler: (args: unknown) =>
      memory_graph.handler({ action: "graph", ...(args as object) }),
  },
  get_memory_history: {
    description: dep("memory_graph") + "Get the version history of a memory",
    inputSchema: zodToJsonSchema(GetMemoryHistorySchema),
    handler: (args: unknown) =>
      memory_graph.handler({ action: "history", ...(args as object) }),
  },
  rollback_memory: {
    description:
      dep("memory_graph") + "Rollback a memory to a previous version",
    inputSchema: zodToJsonSchema(RollbackMemorySchema),
    handler: (args: unknown) =>
      memory_graph.handler({ action: "rollback", ...(args as object) }),
  },

  create_template: {
    description: dep("memory_template") + "Create a new memory template",
    inputSchema: zodToJsonSchema(CreateTemplateSchema),
    handler: (args: unknown) =>
      memory_template.handler({ action: "create", ...(args as object) }),
  },
  create_from_template: {
    description: dep("memory_template") + "Create a memory from a template",
    inputSchema: zodToJsonSchema(CreateFromTemplateSchema),
    handler: (args: unknown) =>
      memory_template.handler({ action: "use", ...(args as object) }),
  },
  list_templates: {
    description: dep("memory_template") + "List all available templates",
    inputSchema: zodToJsonSchema(z.object({})),
    handler: (_args: unknown) => memory_template.handler({ action: "list" }),
  },

  set_memory_category: {
    description: dep("memory_category") + "Set category of a memory",
    inputSchema: zodToJsonSchema(SetMemoryCategorySchema),
    handler: (args: unknown) =>
      memory_category.handler({ action: "set", ...(args as object) }),
  },
  list_categories: {
    description:
      dep("memory_category") + "List all categories with memory counts",
    inputSchema: zodToJsonSchema(ListCategoriesSchema),
    handler: (args: unknown) =>
      memory_category.handler({
        action: "list",
        include_counts:
          (args as { include_counts?: boolean }).include_counts ?? true,
      }),
  },
  get_memories_by_category: {
    description:
      dep("memory_category") + "Get all memories in a specific category",
    inputSchema: zodToJsonSchema(
      z.object({
        category: z.string(),
        limit: z.number().default(50),
      }),
    ),
    handler: (args: unknown) =>
      memory_category.handler({ action: "get", ...(args as object) }),
  },

  should_use_rlm: {
    description: dep("rlm_process") + "Check if content needs RLM processing",
    inputSchema: zodToJsonSchema(ShouldUseRLMSchema),
    handler: (args: unknown) =>
      rlm_process.handler({ action: "check", ...(args as object) }),
  },
  create_execution_context: {
    description: dep("rlm_process") + "Create an RLM execution context",
    inputSchema: zodToJsonSchema(CreateExecutionContextSchema),
    handler: (args: unknown) =>
      rlm_process.handler({ action: "create", ...(args as object) }),
  },
  decompose_task: {
    description: dep("rlm_process") + "Decompose a task into subtasks",
    inputSchema: zodToJsonSchema(DecomposeTaskSchema),
    handler: (args: unknown) =>
      rlm_process.handler({ action: "decompose", ...(args as object) }),
  },
  inject_context_snippet: {
    description: dep("rlm_process") + "Extract a context snippet for a subtask",
    inputSchema: zodToJsonSchema(InjectContextSnippetSchema),
    handler: (args: unknown) =>
      rlm_process.handler({ action: "inject", ...(args as object) }),
  },
  update_subtask_result: {
    description: dep("rlm_process") + "Record the result of a subtask",
    inputSchema: zodToJsonSchema(UpdateSubtaskResultSchema),
    handler: (args: unknown) =>
      rlm_process.handler({ action: "update", ...(args as object) }),
  },
  merge_results: {
    description: dep("rlm_process") + "Aggregate subtask results",
    inputSchema: zodToJsonSchema(MergeResultsSchema),
    handler: (args: unknown) =>
      rlm_process.handler({ action: "merge", ...(args as object) }),
  },
  verify_answer: {
    description:
      dep("rlm_process") + "Cross-check an answer against source context",
    inputSchema: zodToJsonSchema(VerifyAnswerSchema),
    handler: (args: unknown) =>
      rlm_process.handler({ action: "verify", ...(args as object) }),
  },
  get_execution_status: {
    description: dep("rlm_process") + "Get RLM execution chain status",
    inputSchema: zodToJsonSchema(GetExecutionStatusSchema),
    handler: (args: unknown) =>
      rlm_process.handler({ action: "status", ...(args as object) }),
  },

  start_workflow: {
    description: dep("workflow") + "Start a named cross-session workflow",
    inputSchema: zodToJsonSchema(StartWorkflowSchema),
    handler: (args: unknown) =>
      workflow.handler({ action: "start", ...(args as object) }),
  },
  complete_workflow: {
    description: dep("workflow") + "Complete the active workflow",
    inputSchema: zodToJsonSchema(CompleteWorkflowSchema),
    handler: (args: unknown) =>
      workflow.handler({ action: "complete", ...(args as object) }),
  },
  pause_workflow: {
    description: dep("workflow") + "Pause the active workflow",
    inputSchema: zodToJsonSchema(PauseWorkflowSchema),
    handler: (args: unknown) =>
      workflow.handler({ action: "pause", ...(args as object) }),
  },
  resume_workflow: {
    description: dep("workflow") + "Resume a paused workflow",
    inputSchema: zodToJsonSchema(ResumeWorkflowSchema),
    handler: (args: unknown) =>
      workflow.handler({ action: "resume", ...(args as object) }),
  },
  get_active_workflow: {
    description: dep("workflow") + "Get the currently active workflow",
    inputSchema: zodToJsonSchema(z.object({})),
    handler: (_args: unknown) => workflow.handler({ action: "active" }),
  },
  list_workflows: {
    description: dep("workflow") + "List all workflows",
    inputSchema: zodToJsonSchema(ListWorkflowsSchema),
    handler: (args: unknown) =>
      workflow.handler({ action: "list", ...(args as object) }),
  },
  get_workflow_context: {
    description: dep("workflow") + "Get active workflow context for injection",
    inputSchema: zodToJsonSchema(GetWorkflowContextSchema),
    handler: (args: unknown) =>
      workflow.handler({ action: "context", ...(args as object) }),
  },

  auto_consolidate: {
    description:
      dep("memory_maintain") + "Auto-consolidate similar memories if needed",
    inputSchema: zodToJsonSchema(
      TriggerConsolidationSchema.extend({
        memory_count_threshold:
          GetConsolidationStatusSchema.shape.memory_count_threshold,
      }),
    ),
    handler: (args: unknown) =>
      memory_maintain.handler({ action: "consolidate", ...(args as object) }),
  },
  force_consolidate: {
    description:
      dep("memory_maintain") + "Force consolidation regardless of thresholds",
    inputSchema: zodToJsonSchema(TriggerConsolidationSchema),
    handler: (args: unknown) =>
      memory_maintain.handler({ action: "force", ...(args as object) }),
  },
  consolidation_status: {
    description: dep("memory_maintain") + "Check consolidation status",
    inputSchema: zodToJsonSchema(GetConsolidationStatusSchema),
    handler: (args: unknown) =>
      memory_maintain.handler({ action: "status", ...(args as object) }),
  },
  export_memories: {
    description: dep("memory_maintain") + "Export memories to JSON format",
    inputSchema: zodToJsonSchema(ExportMemoriesSchema),
    handler: (args: unknown) =>
      memory_maintain.handler({ action: "export", ...(args as object) }),
  },
  import_memories: {
    description:
      dep("memory_maintain") + "Import memories from JSON export data",
    inputSchema: zodToJsonSchema(ImportMemoriesSchema),
    handler: (args: unknown) =>
      memory_maintain.handler({ action: "import", ...(args as object) }),
  },
  find_duplicates: {
    description:
      dep("memory_maintain") + "Find and optionally merge duplicate memories",
    inputSchema: zodToJsonSchema(FindDuplicatesSchema),
    handler: (args: unknown) =>
      memory_maintain.handler({
        action: "find_duplicates",
        ...(args as object),
      }),
  },
  consolidate_memories: {
    description:
      dep("memory_maintain") + "Manually merge multiple memories into one",
    inputSchema: zodToJsonSchema(ConsolidateMemoriesSchema),
    handler: (args: unknown) => {
      const a = args as { memory_ids: string[] };
      return memory_maintain.handler({
        action: "merge",
        memory_ids: a.memory_ids,
        merged_content: "",
        keep_originals: false,
      });
    },
  },
};
