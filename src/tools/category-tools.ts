import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { MemoryStore } from '../persistence/memory-store.js';
import {
  SetMemoryCategorySchema,
  ListCategoriesSchema,
} from '../types.js';

let memoryStore: MemoryStore | null = null;

export function setCategoryMemoryStore(store: MemoryStore): void {
  memoryStore = store;
}

function getStore(): MemoryStore {
  if (!memoryStore) throw new Error('MemoryStore not initialized');
  return memoryStore;
}

export const categoryTools = {
  set_memory_category: {
    description: 'Set or update the category of a memory',
    inputSchema: zodToJsonSchema(SetMemoryCategorySchema),
    handler: async (args: z.infer<typeof SetMemoryCategorySchema>) => {
      try {
        const memory = await getStore().setMemoryCategory(args.memory_id, args.category);

        if (!memory) {
          throw new McpError(ErrorCode.InvalidRequest, 'Memory not found');
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              memory: {
                id: memory.id,
                category: memory.category,
                content: memory.content.substring(0, 100) + '...',
              },
              message: `Successfully set category to "${args.category}"`,
            }, null, 2),
          }],
        };
      } catch (error) {
        if (error instanceof McpError) throw error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new McpError(ErrorCode.InternalError, `Failed to set category: ${errorMessage}`);
      }
    },
  },

  list_categories: {
    description: 'List all categories with memory counts',
    inputSchema: zodToJsonSchema(ListCategoriesSchema),
    handler: async (args: z.infer<typeof ListCategoriesSchema>) => {
      try {
        const categories = await getStore().getAllCategories();

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              categories: categories.map(c => ({
                category: c.category,
                memory_count: args.include_counts ? c.memory_count : undefined,
                last_used: c.last_used,
              })),
              total_categories: categories.length,
              total_memories: categories.reduce((sum, c) => sum + (c.memory_count || 0), 0),
            }, null, 2),
          }],
        };
      } catch (error) {
        if (error instanceof McpError) throw error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new McpError(ErrorCode.InternalError, `Failed to list categories: ${errorMessage}`);
      }
    },
  },

  get_memories_by_category: {
    description: 'Get all memories in a specific category',
    inputSchema: zodToJsonSchema(z.object({
      category: z.string().describe('Category name'),
      limit: z.number().min(1).max(100).default(50).describe('Maximum memories to return'),
    })),
    handler: async (args: { category: string; limit: number }) => {
      try {
        const memories = await getStore().getMemoriesByCategory(args.category);
        const limited = memories.slice(0, args.limit);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              category: args.category,
              memories: limited.map(m => ({
                id: m.id,
                content: m.content.substring(0, 100) + (m.content.length > 100 ? '...' : ''),
                context_type: m.context_type,
                importance: m.importance,
                tags: m.tags,
                summary: m.summary,
                is_global: m.is_global,
              })),
              total_in_category: memories.length,
              returned: limited.length,
            }, null, 2),
          }],
        };
      } catch (error) {
        if (error instanceof McpError) throw error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new McpError(ErrorCode.InternalError, `Failed to get memories by category: ${errorMessage}`);
      }
    },
  },
};
