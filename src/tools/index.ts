import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { MemoryStore } from "../persistence/memory-store.js";
import {
  CreateMemorySchema,
  BatchCreateMemoriesSchema,
  UpdateMemorySchema,
  DeleteMemorySchema,
  SearchMemorySchema,
  OrganizeSessionSchema,
  ConvertToGlobalSchema,
  ConvertToWorkspaceSchema,
} from "../types.js";
import {
  recall_relevant_context,
  analyze_and_remember,
  summarize_session,
  get_time_window_context,
  auto_session_start,
  quick_store_decision,
  setContextMemoryStore,
} from "./context-tools.js";
import { setExportImportMemoryStore } from "./export-import-tools.js";
import { setRelationshipMemoryStore } from "./relationship-tools.js";
import { setVersionMemoryStore } from "./version-tools.js";
import { setTemplateMemoryStore } from "./template-tools.js";
import { setCategoryMemoryStore } from "./category-tools.js";
import { setRLMMemoryStore } from "./rlm-tools.js";
import { setWorkflowMemoryStore } from "./workflow-tools.js";
import { setConsolidationMemoryStore } from "./consolidation-tools.js";
import { memory_graph, setMemoryGraphStore } from "./memory-graph-tool.js";
import {
  memory_template,
  setMemoryTemplateStore,
} from "./memory-template-tool.js";
import {
  memory_category,
  setMemoryCategoryStore,
} from "./memory-category-tool.js";
import { rlm_process } from "./rlm-process-tool.js";
import { workflow } from "./workflow-tool.js";
import { memory_maintain } from "./memory-maintain-tool.js";
import { aliases } from "./aliases.js";

let defaultMemoryStore: MemoryStore | null = null;
let injectedMemoryStore: MemoryStore | null = null;

export function getMemoryStore(): MemoryStore {
  if (injectedMemoryStore) return injectedMemoryStore;
  if (!defaultMemoryStore) {
    throw new Error(
      "MemoryStore not initialized. Call initializeDefaultMemoryStore() first.",
    );
  }
  return defaultMemoryStore;
}

export function setMemoryStore(store: MemoryStore): void {
  injectedMemoryStore = store;
  setContextMemoryStore(store);
  setExportImportMemoryStore(store);
  setRelationshipMemoryStore(store);
  setVersionMemoryStore(store);
  setTemplateMemoryStore(store);
  setCategoryMemoryStore(store);
  setRLMMemoryStore(store);
  setWorkflowMemoryStore(store);
  setConsolidationMemoryStore(store);
  setMemoryGraphStore(store);
  setMemoryTemplateStore(store);
  setMemoryCategoryStore(store);
}

export function clearMemoryStore(): void {
  injectedMemoryStore = null;
}

export async function initializeDefaultMemoryStore(): Promise<void> {
  if (!defaultMemoryStore) {
    defaultMemoryStore = await MemoryStore.create();
    setMemoryStore(defaultMemoryStore);
  }
}

initializeDefaultMemoryStore().catch((err) => {
  console.error("[Tools] Failed to initialize default memory store:", err);
});

const store_memory = {
  description: "Store a new memory/context entry for long-term persistence",
  inputSchema: zodToJsonSchema(CreateMemorySchema),
  handler: async (args: z.infer<typeof CreateMemorySchema>) => {
    try {
      const memory = await getMemoryStore().createMemory(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                memory_id: memory.id,
                timestamp: memory.timestamp,
                summary: memory.summary,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to store memory: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
};

const store_batch_memories = {
  description: "Store multiple memories in a batch operation",
  inputSchema: zodToJsonSchema(BatchCreateMemoriesSchema),
  handler: async (args: z.infer<typeof BatchCreateMemoriesSchema>) => {
    try {
      const memories = await getMemoryStore().createMemories(args.memories);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                count: memories.length,
                memory_ids: memories.map((m) => m.id),
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to store memories: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
};

const update_memory = {
  description: "Update an existing memory entry",
  inputSchema: zodToJsonSchema(UpdateMemorySchema),
  handler: async (args: z.infer<typeof UpdateMemorySchema>) => {
    try {
      const { memory_id, ...updates } = args;
      const memory = await getMemoryStore().updateMemory(memory_id, updates);
      if (!memory)
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Memory ${memory_id} not found`,
        );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { success: true, memory_id: memory.id, updated_at: Date.now() },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to update memory: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
};

const delete_memory = {
  description: "Delete a memory entry",
  inputSchema: zodToJsonSchema(DeleteMemorySchema),
  handler: async (args: z.infer<typeof DeleteMemorySchema>) => {
    try {
      const success = await getMemoryStore().deleteMemory(args.memory_id);
      if (!success)
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Memory ${args.memory_id} not found`,
        );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                memory_id: args.memory_id,
                deleted_at: Date.now(),
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to delete memory: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
};

const search_memories = {
  description:
    "Search memories using semantic similarity with advanced filters",
  inputSchema: zodToJsonSchema(SearchMemorySchema),
  handler: async (args: z.infer<typeof SearchMemorySchema>) => {
    try {
      const results = await getMemoryStore().searchMemories(
        args.query,
        args.limit,
        args.min_importance,
        args.context_types,
        args.category,
        args.fuzzy,
        args.regex,
      );
      const outputMode = args.output_mode || "summary";
      const formattedResults = results.map((r) => {
        if (outputMode === "compact")
          return {
            memory_id: r.id,
            summary: r.summary || r.content.substring(0, 100) + "...",
            context_type: r.context_type,
            similarity: r.similarity,
          };
        if (outputMode === "full")
          return {
            memory_id: r.id,
            content: r.content,
            summary: r.summary,
            context_type: r.context_type,
            importance: r.importance,
            tags: r.tags,
            category: r.category,
            similarity: r.similarity,
            timestamp: r.timestamp,
          };
        return {
          memory_id: r.id,
          summary: r.summary || r.content.substring(0, 150) + "...",
          context_type: r.context_type,
          importance: r.importance,
          tags: r.tags,
          category: r.category,
          similarity: r.similarity,
          timestamp: r.timestamp,
        };
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                query: args.query,
                count: results.length,
                output_mode: outputMode,
                results: formattedResults,
                ...(outputMode !== "full" &&
                  results.length > 0 && {
                    hint: "Use get_memory with memory_id to retrieve full content",
                  }),
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to search memories: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
};

const organize_session = {
  description: "Create a session snapshot grouping related memories",
  inputSchema: zodToJsonSchema(OrganizeSessionSchema),
  handler: async (args: z.infer<typeof OrganizeSessionSchema>) => {
    try {
      const session = await getMemoryStore().createSession(
        args.session_name,
        args.memory_ids,
        args.summary,
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                session_id: session.session_id,
                session_name: session.session_name,
                memory_count: session.memory_count,
                created_at: session.created_at,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to organize session: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
};

const convert_to_global = {
  description:
    "Convert a workspace-specific memory to global (accessible across all workspaces)",
  inputSchema: zodToJsonSchema(ConvertToGlobalSchema),
  handler: async (args: z.infer<typeof ConvertToGlobalSchema>) => {
    try {
      const result = await getMemoryStore().convertToGlobal(args.memory_id);
      if (!result)
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Memory not found: ${args.memory_id}`,
        );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                memory_id: result.id,
                is_global: result.is_global,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to convert memory to global: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
};

const convert_to_workspace = {
  description: "Convert a global memory to workspace-specific",
  inputSchema: zodToJsonSchema(ConvertToWorkspaceSchema),
  handler: async (args: z.infer<typeof ConvertToWorkspaceSchema>) => {
    try {
      const result = await getMemoryStore().convertToWorkspace(
        args.memory_id,
        args.workspace_id,
      );
      if (!result)
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Memory not found: ${args.memory_id}`,
        );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                memory_id: result.id,
                is_global: result.is_global,
                workspace_id: result.workspace_id,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to convert memory to workspace: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
};

/** Core tools — always visible (10) */
const coreTools = {
  recall_relevant_context,
  analyze_and_remember,
  summarize_session,
  get_time_window_context,
  auto_session_start,
  quick_store_decision,
  store_memory,
  update_memory,
  delete_memory,
  search_memories,
};

/** Advanced tools — hidden when RECALL_DISABLE_ADVANCED_TOOLS=true */
const advancedTools = {
  memory_graph,
  memory_template,
  memory_category,
  rlm_process,
  workflow,
  memory_maintain,
  store_batch_memories,
  organize_session,
  convert_to_global,
  convert_to_workspace,
};

/**
 * Returns the visible tool set based on environment flags:
 *   RECALL_DISABLE_ADVANCED_TOOLS=true  → 10 core tools only
 *   RECALL_SHOW_DEPRECATED_TOOLS=true   → also exposes backwards-compatible aliases
 */
export function getVisibleTools() {
  const disableAdvanced = process.env.RECALL_DISABLE_ADVANCED_TOOLS === "true";
  const showDeprecated = process.env.RECALL_SHOW_DEPRECATED_TOOLS === "true";

  return {
    ...coreTools,
    ...(!disableAdvanced ? advancedTools : {}),
    ...(showDeprecated ? aliases : {}),
  };
}

/** Legacy export — evaluates env vars at startup */
export const tools = getVisibleTools();
