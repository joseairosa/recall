/**
 * memory_maintain — consolidated tool replacing:
 *   auto_consolidate, force_consolidate, consolidation_status,
 *   export_memories, import_memories, find_duplicates, consolidate_memories
 */

import { zodToJsonSchema } from "zod-to-json-schema";
import {
  getConsolidationService,
  getConsolidationStore,
} from "./consolidation-tools.js";
import {
  exportMemories,
  importMemories,
  findDuplicates,
} from "./export-import-tools.js";
import { getProviderInfo } from "../embeddings/factory.js";
import { MemoryMaintainActionSchema } from "../types.js";

function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}
function err(msg: string) {
  return { content: [{ type: "text" as const, text: msg }], isError: true };
}

export const memory_maintain = {
  description:
    "Maintain memory store health. " +
    "Actions: consolidate (auto-merge similar if needed), force (force consolidation), " +
    "status (check consolidation status), export (backup to JSON), import (restore from JSON), " +
    "find_duplicates (detect and optionally merge duplicates), merge (manually merge memories).",
  inputSchema: zodToJsonSchema(MemoryMaintainActionSchema),
  handler: async (args: unknown) => {
    try {
      const parsed = MemoryMaintainActionSchema.parse(args);

      switch (parsed.action) {
        case "consolidate": {
          const service = getConsolidationService();
          const needed = await service.shouldConsolidate(
            parsed.memory_count_threshold,
          );
          if (!needed) {
            return ok({ needed: false, message: "Consolidation not needed." });
          }
          const result = await service.runConsolidation({
            similarity_threshold: parsed.similarity_threshold,
            min_cluster_size: parsed.min_cluster_size,
            max_age_days: parsed.max_age_days,
            max_memories: parsed.max_memories,
          });
          return ok({ needed: true, result });
        }

        case "force": {
          const service = getConsolidationService();
          const result = await service.runConsolidation({
            similarity_threshold: parsed.similarity_threshold,
            min_cluster_size: parsed.min_cluster_size,
            max_age_days: parsed.max_age_days,
            max_memories: parsed.max_memories,
          });
          return ok({ result });
        }

        case "status": {
          const service = getConsolidationService();
          const store = getConsolidationStore();
          const threshold = parsed.memory_count_threshold ?? 100;
          const stats = await store.getSummaryStats();
          const shouldRun = await service.shouldConsolidate(threshold);
          const history = await service.getConsolidationHistory(1);
          const lastRun = history.length > 0 ? history[0] : null;

          let providerWarning: string | undefined;
          try {
            const info = getProviderInfo();
            if (info.type === "anthropic") {
              providerWarning =
                "Using Anthropic keyword-based embeddings. Consolidation quality may be lower.";
            }
          } catch {}

          return ok({
            total_memories: stats.total_memories,
            threshold,
            should_consolidate: shouldRun,
            last_run: lastRun
              ? {
                  timestamp: lastRun.timestamp,
                  date: new Date(lastRun.timestamp).toISOString(),
                  clusters_found: lastRun.result.clusters_found,
                  memories_consolidated: lastRun.result.memories_consolidated,
                }
              : null,
            ...(providerWarning && { provider_warning: providerWarning }),
          });
        }

        case "export": {
          return await exportMemories({
            format: parsed.format,
            include_embeddings: parsed.include_embeddings,
            filter_by_type: parsed.filter_by_type,
            min_importance: parsed.min_importance,
          });
        }

        case "import": {
          return await importMemories({
            data: parsed.data,
            overwrite_existing: parsed.overwrite_existing,
            regenerate_embeddings: parsed.regenerate_embeddings,
          });
        }

        case "find_duplicates": {
          const result = await findDuplicates({
            similarity_threshold: parsed.similarity_threshold,
            auto_merge: parsed.auto_merge,
            keep_highest_importance: true,
          });
          return result;
        }

        case "merge": {
          const store = getConsolidationStore();
          const merged = await store.mergeMemories(parsed.memory_ids);
          if (!merged) {
            return err(
              "Failed to merge memories. Check that all memory IDs exist.",
            );
          }
          return ok({
            success: true,
            memory_id: merged.id,
            content: merged.summary || merged.content.substring(0, 100),
            tags: merged.tags,
            importance: merged.importance,
          });
        }
      }
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  },
};
