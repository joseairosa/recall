/**
 * memory_graph — consolidated tool replacing:
 *   link_memories, unlink_memories, get_related_memories,
 *   get_memory_graph, get_memory_history, rollback_memory
 */

import { zodToJsonSchema } from "zod-to-json-schema";
import { MemoryStore } from "../persistence/memory-store.js";
import { MemoryGraphActionSchema } from "../types.js";

let _store: MemoryStore | null = null;

export function setMemoryGraphStore(store: MemoryStore): void {
  _store = store;
}

function getStore(): MemoryStore {
  if (!_store) throw new Error("memory_graph store not initialized");
  return _store;
}

function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}
function err(msg: string) {
  return { content: [{ type: "text" as const, text: msg }], isError: true };
}

export const memory_graph = {
  description:
    "Manage memory relationships and version history. " +
    "Actions: link (create relationship), unlink (remove), related (get linked memories), " +
    "graph (visualize network), history (version log), rollback (restore version).",
  inputSchema: zodToJsonSchema(MemoryGraphActionSchema),
  handler: async (args: unknown) => {
    try {
      const store = getStore();
      const parsed = MemoryGraphActionSchema.parse(args);

      switch (parsed.action) {
        case "link": {
          const rel = await store.createRelationship(
            parsed.from_memory_id,
            parsed.to_memory_id,
            parsed.relationship_type,
            parsed.metadata,
          );
          return ok({ success: true, relationship: rel });
        }
        case "unlink": {
          const deleted = await store.deleteRelationship(
            parsed.relationship_id,
          );
          if (!deleted) {
            return err(`Relationship not found: ${parsed.relationship_id}`);
          }
          return ok({ success: true, relationship_id: parsed.relationship_id });
        }
        case "related": {
          const results = await store.getRelatedMemories(parsed.memory_id, {
            relationshipTypes: parsed.relationship_types,
            depth: parsed.depth,
            direction: parsed.direction,
          });
          return ok({
            success: true,
            count: results.length,
            memories: results,
          });
        }
        case "graph": {
          const graph = await store.getMemoryGraph(
            parsed.memory_id,
            parsed.max_depth,
            parsed.max_nodes,
          );
          return ok({ success: true, graph });
        }
        case "history": {
          const versions = await store.getMemoryHistory(
            parsed.memory_id,
            parsed.limit,
          );
          return ok({ success: true, count: versions.length, versions });
        }
        case "rollback": {
          const memory = await store.rollbackMemory(
            parsed.memory_id,
            parsed.version_id,
            parsed.preserve_relationships,
          );
          return ok({ success: true, memory });
        }
      }
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  },
};
