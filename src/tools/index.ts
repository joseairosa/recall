import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { MemoryStore } from '../persistence/memory-store.js';
import {
  CreateMemorySchema,
  BatchCreateMemoriesSchema,
  UpdateMemorySchema,
  DeleteMemorySchema,
  SearchMemorySchema,
  OrganizeSessionSchema,
  ConvertToGlobalSchema,
  ConvertToWorkspaceSchema,
} from '../types.js';
import {
  recall_relevant_context,
  analyze_and_remember,
  summarize_session,
  get_time_window_context,
  auto_session_start,
  quick_store_decision,
  should_use_rlm,
  setContextMemoryStore,
} from './context-tools.js';
import {
  exportMemories,
  importMemories,
  findDuplicates,
  consolidateMemories,
  setExportImportMemoryStore,
} from './export-import-tools.js';
import {
  ExportMemoriesSchema,
  ImportMemoriesSchema,
  FindDuplicatesSchema,
  ConsolidateMemoriesSchema,
} from '../types.js';
import { relationshipTools, setRelationshipMemoryStore } from './relationship-tools.js';
import { versionTools, setVersionMemoryStore } from './version-tools.js';
import { templateTools, setTemplateMemoryStore } from './template-tools.js';
import { categoryTools, setCategoryMemoryStore } from './category-tools.js';
import { rlmTools, setRLMMemoryStore } from './rlm-tools.js';

// Default memory store for stdio mode (singleton)
let defaultMemoryStore: MemoryStore | null = null;

// Injected memory store for HTTP multi-tenant mode
let injectedMemoryStore: MemoryStore | null = null;

/**
 * Gets the current memory store (injected or default)
 */
export function getMemoryStore(): MemoryStore {
  if (injectedMemoryStore) {
    return injectedMemoryStore;
  }
  if (!defaultMemoryStore) {
    throw new Error('MemoryStore not initialized. Call initializeDefaultMemoryStore() first.');
  }
  return defaultMemoryStore;
}

/**
 * Sets the memory store for the current request context (HTTP multi-tenant mode)
 */
export function setMemoryStore(store: MemoryStore): void {
  injectedMemoryStore = store;
  // Propagate to sub-modules
  setContextMemoryStore(store);
  setExportImportMemoryStore(store);
  setRelationshipMemoryStore(store);
  setVersionMemoryStore(store);
  setTemplateMemoryStore(store);
  setCategoryMemoryStore(store);
  setRLMMemoryStore(store);
}

/**
 * Clears the injected memory store (call after request completes)
 */
export function clearMemoryStore(): void {
  injectedMemoryStore = null;
}

/**
 * Initializes the default memory store for stdio mode
 */
export async function initializeDefaultMemoryStore(): Promise<void> {
  if (!defaultMemoryStore) {
    defaultMemoryStore = await MemoryStore.create();
    // Set as the active store for sub-modules
    setMemoryStore(defaultMemoryStore);
  }
}

// For backward compatibility with stdio mode, initialize on import
// This is a no-op in HTTP mode where setMemoryStore() is called per-request
initializeDefaultMemoryStore().catch(err => {
  console.error('[Tools] Failed to initialize default memory store:', err);
});

export const tools = {
  // Context management tools
  recall_relevant_context,
  analyze_and_remember,
  summarize_session,
  get_time_window_context,

  // Automatic hooks (v1.8.0) - makes Recall automatic
  auto_session_start,      // Call at start of every session
  quick_store_decision,    // Quickly store decisions after making them
  should_use_rlm,          // Check if content needs RLM processing

  // Export/Import tools
  export_memories: {
    description: 'Export memories to JSON format with optional filtering',
    inputSchema: zodToJsonSchema(ExportMemoriesSchema),
    handler: async (args: z.infer<typeof ExportMemoriesSchema>) => {
      try {
        return await exportMemories(args);
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to export memories: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
  },

  import_memories: {
    description: 'Import memories from JSON export data',
    inputSchema: zodToJsonSchema(ImportMemoriesSchema),
    handler: async (args: z.infer<typeof ImportMemoriesSchema>) => {
      try {
        return await importMemories(args);
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to import memories: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
  },

  find_duplicates: {
    description: 'Find and optionally merge duplicate memories based on similarity',
    inputSchema: zodToJsonSchema(FindDuplicatesSchema),
    handler: async (args: z.infer<typeof FindDuplicatesSchema>) => {
      try {
        return await findDuplicates(args);
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to find duplicates: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
  },

  consolidate_memories: {
    description: 'Manually consolidate multiple memories into one',
    inputSchema: zodToJsonSchema(ConsolidateMemoriesSchema),
    handler: async (args: z.infer<typeof ConsolidateMemoriesSchema>) => {
      try {
        return await consolidateMemories(args);
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to consolidate memories: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
  },

  // Original memory tools
  store_memory: {
    description: 'Store a new memory/context entry for long-term persistence',
    inputSchema: zodToJsonSchema(CreateMemorySchema),
    handler: async (args: z.infer<typeof CreateMemorySchema>) => {
      try {
        const memory = await getMemoryStore().createMemory(args);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                memory_id: memory.id,
                timestamp: memory.timestamp,
                summary: memory.summary,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to store memory: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
  },

  store_batch_memories: {
    description: 'Store multiple memories in a batch operation',
    inputSchema: zodToJsonSchema(BatchCreateMemoriesSchema),
    handler: async (args: z.infer<typeof BatchCreateMemoriesSchema>) => {
      try {
        const memories = await getMemoryStore().createMemories(args.memories);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                count: memories.length,
                memory_ids: memories.map(m => m.id),
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to store memories: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
  },

  update_memory: {
    description: 'Update an existing memory entry',
    inputSchema: zodToJsonSchema(UpdateMemorySchema),
    handler: async (args: z.infer<typeof UpdateMemorySchema>) => {
      try {
        const { memory_id, ...updates } = args;
        const memory = await getMemoryStore().updateMemory(memory_id, updates);

        if (!memory) {
          throw new McpError(ErrorCode.InvalidRequest, `Memory ${memory_id} not found`);
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                memory_id: memory.id,
                updated_at: Date.now(),
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        if (error instanceof McpError) throw error;
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to update memory: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
  },

  delete_memory: {
    description: 'Delete a memory entry',
    inputSchema: zodToJsonSchema(DeleteMemorySchema),
    handler: async (args: z.infer<typeof DeleteMemorySchema>) => {
      try {
        const success = await getMemoryStore().deleteMemory(args.memory_id);

        if (!success) {
          throw new McpError(ErrorCode.InvalidRequest, `Memory ${args.memory_id} not found`);
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                memory_id: args.memory_id,
                deleted_at: Date.now(),
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        if (error instanceof McpError) throw error;
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to delete memory: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
  },

  search_memories: {
    description: 'Search memories using semantic similarity with advanced filters (v1.5.0: category, fuzzy, regex)',
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
          args.regex
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                query: args.query,
                count: results.length,
                filters: {
                  category: args.category,
                  fuzzy: args.fuzzy,
                  regex: args.regex,
                  min_importance: args.min_importance,
                  context_types: args.context_types,
                },
                results: results.map(r => ({
                  memory_id: r.id,
                  content: r.content,
                  summary: r.summary,
                  context_type: r.context_type,
                  importance: r.importance,
                  tags: r.tags,
                  category: r.category,
                  similarity: r.similarity,
                  timestamp: r.timestamp,
                })),
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to search memories: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
  },

  organize_session: {
    description: 'Create a session snapshot grouping related memories',
    inputSchema: zodToJsonSchema(OrganizeSessionSchema),
    handler: async (args: z.infer<typeof OrganizeSessionSchema>) => {
      try {
        const session = await getMemoryStore().createSession(
          args.session_name,
          args.memory_ids,
          args.summary
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                session_id: session.session_id,
                session_name: session.session_name,
                memory_count: session.memory_count,
                created_at: session.created_at,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to organize session: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
  },

  // Global memory conversion tools
  convert_to_global: {
    description: 'Convert a workspace-specific memory to global (accessible across all workspaces)',
    inputSchema: zodToJsonSchema(ConvertToGlobalSchema),
    handler: async (args: z.infer<typeof ConvertToGlobalSchema>) => {
      try {
        const result = await getMemoryStore().convertToGlobal(args.memory_id);

        if (!result) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Memory not found: ${args.memory_id}`
          );
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                memory_id: result.id,
                is_global: result.is_global,
                content: result.content,
                message: 'Memory converted to global successfully',
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        if (error instanceof McpError) throw error;
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to convert memory to global: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
  },

  convert_to_workspace: {
    description: 'Convert a global memory to workspace-specific',
    inputSchema: zodToJsonSchema(ConvertToWorkspaceSchema),
    handler: async (args: z.infer<typeof ConvertToWorkspaceSchema>) => {
      try {
        const result = await getMemoryStore().convertToWorkspace(
          args.memory_id,
          args.workspace_id
        );

        if (!result) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Memory not found: ${args.memory_id}`
          );
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                memory_id: result.id,
                is_global: result.is_global,
                workspace_id: result.workspace_id,
                content: result.content,
                message: 'Memory converted to workspace-specific successfully',
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        if (error instanceof McpError) throw error;
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to convert memory to workspace: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
  },

  // Relationship tools (v1.4.0)
  ...relationshipTools,

  // Version history tools (v1.5.0)
  ...versionTools,

  // Template tools (v1.5.0)
  ...templateTools,

  // Category tools (v1.5.0)
  ...categoryTools,

  // RLM (Recursive Language Model) tools (v1.8.0)
  // For handling large contexts that exceed context window limits
  ...rlmTools,
};

// Helper function to convert Zod schema to JSON Schema
function zodToJsonSchema(schema: z.ZodType): any {
  // Simple conversion - in production you'd use @anatine/zod-to-json-schema
  if (schema instanceof z.ZodObject) {
    const shape = schema._def.shape();
    const properties: any = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchemaInner(value as z.ZodType);
      if (!(value as any).isOptional()) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required,
    };
  }

  return zodToJsonSchemaInner(schema);
}

function zodToJsonSchemaInner(schema: z.ZodType): any {
  if (schema instanceof z.ZodString) {
    const result: any = { type: 'string' };
    if (schema.description) result.description = schema.description;
    return result;
  }

  if (schema instanceof z.ZodNumber) {
    const result: any = { type: 'number' };
    if (schema.description) result.description = schema.description;
    return result;
  }

  if (schema instanceof z.ZodBoolean) {
    const result: any = { type: 'boolean' };
    if (schema.description) result.description = schema.description;
    return result;
  }

  if (schema instanceof z.ZodArray) {
    const result: any = {
      type: 'array',
      items: zodToJsonSchemaInner(schema.element),
    };
    if (schema.description) result.description = schema.description;
    return result;
  }

  if (schema instanceof z.ZodEnum) {
    const result: any = {
      type: 'string',
      enum: schema.options,
    };
    if (schema.description) result.description = schema.description;
    return result;
  }

  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchemaInner(schema.unwrap());
  }

  if (schema instanceof z.ZodDefault) {
    const inner = zodToJsonSchemaInner(schema._def.innerType);
    inner.default = schema._def.defaultValue();
    return inner;
  }

  if (schema instanceof z.ZodObject) {
    return zodToJsonSchema(schema);
  }

  return { type: 'string' };
}
