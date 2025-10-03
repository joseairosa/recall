import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { MemoryStore } from '../redis/memory-store.js';
import {
  LinkMemoriesSchema,
  GetRelatedMemoriesSchema,
  UnlinkMemoriesSchema,
  GetMemoryGraphSchema,
  type LinkMemories,
  type GetRelatedMemories,
  type UnlinkMemories,
  type GetMemoryGraph,
} from '../types.js';

const memoryStore = new MemoryStore();

export const relationshipTools = {
  link_memories: {
    description: 'Create a relationship between two memories',
    inputSchema: zodToJsonSchema(LinkMemoriesSchema),
    handler: async (args: z.infer<typeof LinkMemoriesSchema>) => {
      try {
        const relationship = await memoryStore.createRelationship(
          args.from_memory_id,
          args.to_memory_id,
          args.relationship_type,
          args.metadata
        );

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              relationship_id: relationship.id,
              from_memory_id: relationship.from_memory_id,
              to_memory_id: relationship.to_memory_id,
              relationship_type: relationship.relationship_type,
              created_at: relationship.created_at,
              message: `Successfully linked memories with ${relationship.relationship_type} relationship`,
            }, null, 2),
          }],
        };
      } catch (error) {
        if (error instanceof McpError) throw error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new McpError(ErrorCode.InternalError, `Failed to link memories: ${errorMessage}`);
      }
    },
  },

  get_related_memories: {
    description: 'Get memories related to a given memory with graph traversal',
    inputSchema: zodToJsonSchema(GetRelatedMemoriesSchema),
    handler: async (args: z.infer<typeof GetRelatedMemoriesSchema>) => {
      try {
        const results = await memoryStore.getRelatedMemories(args.memory_id, {
          relationshipTypes: args.relationship_types,
          depth: args.depth,
          direction: args.direction,
        });

        // Format results for display
        const formatted = results.map(result => ({
          memory_id: result.memory.id,
          content: result.memory.content,
          summary: result.memory.summary,
          context_type: result.memory.context_type,
          importance: result.memory.importance,
          tags: result.memory.tags,
          is_global: result.memory.is_global,
          relationship: {
            id: result.relationship.id,
            type: result.relationship.relationship_type,
            from: result.relationship.from_memory_id,
            to: result.relationship.to_memory_id,
          },
          depth: result.depth,
        }));

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              root_memory_id: args.memory_id,
              total_related: results.length,
              max_depth: args.depth,
              direction: args.direction,
              related_memories: formatted,
            }, null, 2),
          }],
        };
      } catch (error) {
        if (error instanceof McpError) throw error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new McpError(ErrorCode.InternalError, `Failed to get related memories: ${errorMessage}`);
      }
    },
  },

  unlink_memories: {
    description: 'Remove a relationship between memories',
    inputSchema: zodToJsonSchema(UnlinkMemoriesSchema),
    handler: async (args: z.infer<typeof UnlinkMemoriesSchema>) => {
      try {
        const deleted = await memoryStore.deleteRelationship(args.relationship_id);

        if (!deleted) {
          throw new McpError(ErrorCode.InvalidRequest, `Relationship not found: ${args.relationship_id}`);
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              relationship_id: args.relationship_id,
              message: 'Relationship removed successfully',
            }, null, 2),
          }],
        };
      } catch (error) {
        if (error instanceof McpError) throw error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new McpError(ErrorCode.InternalError, `Failed to unlink memories: ${errorMessage}`);
      }
    },
  },

  get_memory_graph: {
    description: 'Get a graph of related memories starting from a root memory',
    inputSchema: zodToJsonSchema(GetMemoryGraphSchema),
    handler: async (args: z.infer<typeof GetMemoryGraphSchema>) => {
      try {
        const graph = await memoryStore.getMemoryGraph(
          args.memory_id,
          args.max_depth,
          args.max_nodes
        );

        // Format graph for display
        const formattedNodes = Object.fromEntries(
          Object.entries(graph.nodes).map(([memoryId, node]) => [
            memoryId,
            {
              memory_id: node.memory.id,
              content: node.memory.content,
              summary: node.memory.summary,
              context_type: node.memory.context_type,
              importance: node.memory.importance,
              tags: node.memory.tags,
              is_global: node.memory.is_global,
              depth: node.depth,
              relationships: node.relationships.map(rel => ({
                id: rel.id,
                type: rel.relationship_type,
                from: rel.from_memory_id,
                to: rel.to_memory_id,
              })),
            },
          ])
        );

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              root_memory_id: graph.root_memory_id,
              total_nodes: graph.total_nodes,
              max_depth_reached: graph.max_depth_reached,
              nodes: formattedNodes,
            }, null, 2),
          }],
        };
      } catch (error) {
        if (error instanceof McpError) throw error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new McpError(ErrorCode.InternalError, `Failed to get memory graph: ${errorMessage}`);
      }
    },
  },
};
