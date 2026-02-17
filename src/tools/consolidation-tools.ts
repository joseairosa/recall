/**
 * Consolidation MCP Tools
 *
 * Thin MCP tool handlers for auto-consolidation pipeline.
 * Business logic delegated to ConsolidationService.
 *
 * Tools:
 *   auto_consolidate, force_consolidate, consolidation_status
 */

import { zodToJsonSchema } from 'zod-to-json-schema';
import { MemoryStore } from '../persistence/memory-store.js';
import { ConsolidationService } from '../services/consolidation.service.js';
import {
  TriggerConsolidationSchema,
  GetConsolidationStatusSchema,
} from '../types.js';
import { getProviderInfo } from '../embeddings/factory.js';

let _service: ConsolidationService | null = null;

export function setConsolidationMemoryStore(store: MemoryStore): void {
  _service = new ConsolidationService(store);
}

function getService(): ConsolidationService {
  if (!_service) throw new Error('Consolidation service not initialized. Call setConsolidationMemoryStore first.');
  return _service;
}

function getStore(): MemoryStore {
  if (!_service) throw new Error('Consolidation service not initialized.');
  return (_service as any).store as MemoryStore;
}

type ToolResponse = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

function ok(data: Record<string, unknown>): ToolResponse {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function toolErr(message: string): ToolResponse {
  return { content: [{ type: 'text', text: message }], isError: true };
}

export type ConsolidationTool = {
  name: string;
  description: string;
  inputSchema: ReturnType<typeof zodToJsonSchema>;
  handler: (args: Record<string, unknown>) => Promise<ToolResponse>;
};

export const consolidationTools: ConsolidationTool[] = [
  {
    name: 'auto_consolidate',
    description:
      'Automatically consolidate similar memories if needed. ' +
      'Checks if memory count exceeds threshold and no recent consolidation. ' +
      'Returns early if not needed — safe to call proactively.',
    inputSchema: zodToJsonSchema(TriggerConsolidationSchema.extend({
      memory_count_threshold: GetConsolidationStatusSchema.shape.memory_count_threshold,
    })),
    handler: async (args) => {
      try {
        const service = getService();
        const threshold = (args.memory_count_threshold as number) ?? undefined;
        const needed = await service.shouldConsolidate(threshold);

        if (!needed) {
          return ok({ needed: false, message: 'Consolidation not needed at this time.' });
        }

        const result = await service.runConsolidation({
          similarity_threshold: (args.similarity_threshold as number) ?? undefined,
          min_cluster_size: (args.min_cluster_size as number) ?? undefined,
          max_age_days: (args.max_age_days as number) ?? undefined,
          max_memories: (args.max_memories as number) ?? undefined,
        });

        return ok({ needed: true, result });
      } catch (e) {
        return toolErr(e instanceof Error ? e.message : String(e));
      }
    },
  },

  {
    name: 'force_consolidate',
    description:
      'Force consolidation regardless of thresholds. ' +
      'Use for manual trigger or after large batch imports.',
    inputSchema: zodToJsonSchema(TriggerConsolidationSchema),
    handler: async (args) => {
      try {
        const result = await getService().runConsolidation({
          similarity_threshold: (args.similarity_threshold as number) ?? undefined,
          min_cluster_size: (args.min_cluster_size as number) ?? undefined,
          max_age_days: (args.max_age_days as number) ?? undefined,
          max_memories: (args.max_memories as number) ?? undefined,
        });

        return ok({ result });
      } catch (e) {
        return toolErr(e instanceof Error ? e.message : String(e));
      }
    },
  },

  {
    name: 'consolidation_status',
    description:
      'Check if consolidation is needed and get last run info. ' +
      'Returns memory count, threshold, last run, and recommendation.',
    inputSchema: zodToJsonSchema(GetConsolidationStatusSchema),
    handler: async (args) => {
      try {
        const service = getService();
        const store = getStore();
        const threshold = (args.memory_count_threshold as number) ?? 100;
        const stats = await store.getSummaryStats();
        const shouldRun = await service.shouldConsolidate(threshold);
        const history = await service.getConsolidationHistory(1);
        const lastRun = history.length > 0 ? history[0] : null;

        let providerWarning: string | undefined;
        try {
          const info = getProviderInfo();
          if (info.type === 'anthropic') {
            providerWarning = 'Using Anthropic keyword-based embeddings. Consolidation quality may be lower. Consider using OpenAI, Voyage, or Cohere for better results.';
          }
        } catch {
        }

        return ok({
          total_memories: stats.total_memories,
          threshold,
          should_consolidate: shouldRun,
          last_run: lastRun ? {
            timestamp: lastRun.timestamp,
            date: new Date(lastRun.timestamp).toISOString(),
            clusters_found: lastRun.result.clusters_found,
            memories_consolidated: lastRun.result.memories_consolidated,
          } : null,
          ...(providerWarning && { provider_warning: providerWarning }),
        });
      } catch (e) {
        return toolErr(e instanceof Error ? e.message : String(e));
      }
    },
  },
];
