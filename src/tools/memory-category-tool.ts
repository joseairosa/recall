/**
 * memory_category — consolidated tool replacing:
 *   set_memory_category, list_categories, get_memories_by_category
 */

import { zodToJsonSchema } from "zod-to-json-schema";
import { MemoryStore } from "../persistence/memory-store.js";
import { MemoryCategoryActionSchema } from "../types.js";

let _store: MemoryStore | null = null;

export function setMemoryCategoryStore(store: MemoryStore): void {
  _store = store;
}

function getStore(): MemoryStore {
  if (!_store) throw new Error("memory_category store not initialized");
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

export const memory_category = {
  description:
    "Manage memory categories. " +
    "Actions: set (assign category to a memory), list (all categories with counts), " +
    "get (memories in a specific category).",
  inputSchema: zodToJsonSchema(MemoryCategoryActionSchema),
  handler: async (args: unknown) => {
    try {
      const store = getStore();
      const parsed = MemoryCategoryActionSchema.parse(args);

      switch (parsed.action) {
        case "set": {
          const memory = await store.setMemoryCategory(
            parsed.memory_id,
            parsed.category,
          );
          if (!memory) {
            return err(`Memory not found: ${parsed.memory_id}`);
          }
          return ok({
            success: true,
            memory_id: memory.id,
            category: memory.category,
          });
        }
        case "list": {
          const categories = await store.getAllCategories();
          return ok({
            success: true,
            categories: categories.map((c) => ({
              category: c.category,
              memory_count: parsed.include_counts ? c.memory_count : undefined,
              last_used: c.last_used,
            })),
            total_categories: categories.length,
          });
        }
        case "get": {
          const memories = await store.getMemoriesByCategory(parsed.category);
          const limited = memories.slice(0, parsed.limit);
          return ok({
            success: true,
            category: parsed.category,
            memories: limited,
            total_in_category: memories.length,
            returned: limited.length,
          });
        }
      }
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  },
};
