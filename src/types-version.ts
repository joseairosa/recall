import { z } from "zod";
import { ContextType } from "./types-core.js";

export const MemoryVersionSchema = z.object({
  version_id: z.string().describe("Version identifier (ULID)"),
  memory_id: z.string().describe("Memory this version belongs to"),
  content: z.string().describe("Content at this version"),
  context_type: ContextType,
  importance: z.number().min(1).max(10),
  tags: z.array(z.string()).default([]),
  summary: z.string().optional(),
  created_at: z.string().describe("ISO 8601 timestamp"),
  created_by: z
    .enum(["user", "system"])
    .default("user")
    .describe("Who created this version"),
  change_reason: z.string().optional().describe("Reason for the change"),
});

export type MemoryVersion = z.infer<typeof MemoryVersionSchema>;

export const GetMemoryHistorySchema = z.object({
  memory_id: z.string().describe("Memory ID to get history for"),
  limit: z
    .number()
    .min(1)
    .max(100)
    .default(50)
    .describe("Maximum versions to return"),
});

export type GetMemoryHistory = z.infer<typeof GetMemoryHistorySchema>;

export const RollbackMemorySchema = z.object({
  memory_id: z.string().describe("Memory ID to rollback"),
  version_id: z.string().describe("Version ID to rollback to"),
  preserve_relationships: z
    .boolean()
    .default(true)
    .describe("Preserve current relationships after rollback"),
});

export type RollbackMemory = z.infer<typeof RollbackMemorySchema>;

export interface MemoryDiff {
  version_from: MemoryVersion;
  version_to: MemoryVersion;
  content_diff: {
    added: string[];
    removed: string[];
    unchanged: string[];
  };
  importance_change: number;
  tags_added: string[];
  tags_removed: string[];
  context_type_changed: boolean;
}
