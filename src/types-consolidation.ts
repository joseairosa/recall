import { z } from "zod";

export const ConsolidationConfigSchema = z.object({
  similarity_threshold: z
    .number()
    .min(0)
    .max(1)
    .default(0.75)
    .describe(
      "Minimum cosine similarity to cluster two memories together (0.0-1.0, default 0.75)",
    ),
  min_cluster_size: z
    .number()
    .min(2)
    .max(50)
    .default(2)
    .describe(
      "Minimum number of memories in a cluster to consolidate (default 2)",
    ),
  max_age_days: z
    .number()
    .min(1)
    .optional()
    .describe("Only consider memories older than this many days (optional)"),
  memory_count_threshold: z
    .number()
    .min(10)
    .default(100)
    .describe(
      "Minimum total memory count before auto-consolidation triggers (default 100)",
    ),
  max_memories: z
    .number()
    .min(10)
    .max(10000)
    .default(1000)
    .describe(
      "Maximum memories to load for clustering. Prevents OOM on large stores (default 1000)",
    ),
});
export type ConsolidationConfig = z.infer<typeof ConsolidationConfigSchema>;

export const ConsolidationResultSchema = z.object({
  clusters_found: z.number().describe("Number of clusters identified"),
  memories_consolidated: z
    .number()
    .describe("Total memories merged into consolidated summaries"),
  consolidated_memory_ids: z
    .array(z.string())
    .describe("IDs of newly created consolidated memories"),
  skipped_no_embedding: z
    .number()
    .describe("Memories skipped due to missing embeddings"),
  report: z.string().describe("Human-readable consolidation report"),
});
export type ConsolidationResult = z.infer<typeof ConsolidationResultSchema>;

export const ConsolidationRunSchema = z.object({
  id: z.string().describe("ULID identifier for the consolidation run"),
  timestamp: z.number().describe("Unix timestamp when the run occurred"),
  config: ConsolidationConfigSchema.describe("Configuration used for this run"),
  result: ConsolidationResultSchema.describe(
    "Results of the consolidation run",
  ),
});
export type ConsolidationRun = z.infer<typeof ConsolidationRunSchema>;

export const TriggerConsolidationSchema = z.object({
  similarity_threshold: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Override default similarity threshold (0.0-1.0)"),
  min_cluster_size: z
    .number()
    .min(2)
    .optional()
    .describe("Override minimum cluster size"),
  max_age_days: z
    .number()
    .min(1)
    .optional()
    .describe("Only consolidate memories older than N days"),
  max_memories: z
    .number()
    .min(10)
    .max(10000)
    .optional()
    .describe("Override maximum memories to sample for clustering"),
});
export type TriggerConsolidation = z.infer<typeof TriggerConsolidationSchema>;

export const GetConsolidationStatusSchema = z.object({
  memory_count_threshold: z
    .number()
    .min(10)
    .optional()
    .describe(
      "Override default threshold for triggering consolidation (default 100)",
    ),
});
export type GetConsolidationStatus = z.infer<
  typeof GetConsolidationStatusSchema
>;

export const ConsolidationStorageKeys = {
  consolidation: (workspace: string, id: string) =>
    `ws:${workspace}:consolidation:${id}`,
  consolidations: (workspace: string) => `ws:${workspace}:consolidations:all`,
  lastRun: (workspace: string) => `ws:${workspace}:consolidations:last_run`,
} as const;
