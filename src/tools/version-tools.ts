import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { MemoryStore } from '../redis/memory-store.js';
import {
  GetMemoryHistorySchema,
  RollbackMemorySchema,
} from '../types.js';

const memoryStore = new MemoryStore();

export const versionTools = {
  get_memory_history: {
    description: 'Get the version history of a memory',
    inputSchema: zodToJsonSchema(GetMemoryHistorySchema),
    handler: async (args: z.infer<typeof GetMemoryHistorySchema>) => {
      try {
        const versions = await memoryStore.getMemoryHistory(args.memory_id, args.limit);

        if (versions.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                memory_id: args.memory_id,
                versions: [],
                total_versions: 0,
                message: 'No version history found for this memory',
              }, null, 2),
            }],
          };
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              memory_id: args.memory_id,
              versions,
              total_versions: versions.length,
              oldest_version: versions[versions.length - 1]?.created_at,
              newest_version: versions[0]?.created_at,
            }, null, 2),
          }],
        };
      } catch (error) {
        if (error instanceof McpError) throw error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new McpError(ErrorCode.InternalError, `Failed to get memory history: ${errorMessage}`);
      }
    },
  },

  rollback_memory: {
    description: 'Rollback a memory to a previous version',
    inputSchema: zodToJsonSchema(RollbackMemorySchema),
    handler: async (args: z.infer<typeof RollbackMemorySchema>) => {
      try {
        const rolledBackMemory = await memoryStore.rollbackMemory(
          args.memory_id,
          args.version_id,
          args.preserve_relationships
        );

        if (!rolledBackMemory) {
          throw new McpError(ErrorCode.InternalError, 'Failed to rollback memory');
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              memory: {
                id: rolledBackMemory.id,
                content: rolledBackMemory.content,
                context_type: rolledBackMemory.context_type,
                importance: rolledBackMemory.importance,
                tags: rolledBackMemory.tags,
                summary: rolledBackMemory.summary,
                category: rolledBackMemory.category,
              },
              rolled_back_to: args.version_id,
              preserve_relationships: args.preserve_relationships,
              message: `Successfully rolled back memory to version ${args.version_id}`,
            }, null, 2),
          }],
        };
      } catch (error) {
        if (error instanceof McpError) throw error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new McpError(ErrorCode.InternalError, `Failed to rollback memory: ${errorMessage}`);
      }
    },
  },
};
