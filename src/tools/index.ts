import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { MemoryStore } from '../redis/memory-store.js';
import {
  CreateMemorySchema,
  BatchCreateMemoriesSchema,
  UpdateMemorySchema,
  DeleteMemorySchema,
  SearchMemorySchema,
  OrganizeSessionSchema,
} from '../types.js';
import {
  recall_relevant_context,
  analyze_and_remember,
  summarize_session,
} from './context-tools.js';
import {
  exportMemories,
  importMemories,
  findDuplicates,
  consolidateMemories,
} from './export-import-tools.js';
import {
  ExportMemoriesSchema,
  ImportMemoriesSchema,
  FindDuplicatesSchema,
  ConsolidateMemoriesSchema,
} from '../types.js';

const memoryStore = new MemoryStore();

export const tools = {
  // Context management tools
  recall_relevant_context,
  analyze_and_remember,
  summarize_session,

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
        const memory = await memoryStore.createMemory(args);
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
        const memories = await memoryStore.createMemories(args.memories);
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
        const memory = await memoryStore.updateMemory(memory_id, updates);

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
        const success = await memoryStore.deleteMemory(args.memory_id);

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
    description: 'Search memories using semantic similarity',
    inputSchema: zodToJsonSchema(SearchMemorySchema),
    handler: async (args: z.infer<typeof SearchMemorySchema>) => {
      try {
        const results = await memoryStore.searchMemories(
          args.query,
          args.limit,
          args.min_importance,
          args.context_types
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                query: args.query,
                count: results.length,
                results: results.map(r => ({
                  memory_id: r.id,
                  content: r.content,
                  summary: r.summary,
                  context_type: r.context_type,
                  importance: r.importance,
                  tags: r.tags,
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
        const session = await memoryStore.createSession(
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
