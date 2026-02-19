import { z } from "zod";
import { ContextType, MemoryEntry } from "./types-core.js";

export const ExportMemoriesSchema = z.object({
  format: z.enum(["json"]).default("json").describe("Export format"),
  include_embeddings: z
    .boolean()
    .default(false)
    .describe("Include vector embeddings in export"),
  filter_by_type: z
    .array(ContextType)
    .optional()
    .describe("Only export specific types"),
  min_importance: z
    .number()
    .min(1)
    .max(10)
    .optional()
    .describe("Only export above this importance"),
});

export type ExportMemories = z.infer<typeof ExportMemoriesSchema>;

export const ImportMemoriesSchema = z.object({
  data: z.string().describe("JSON string of exported memories"),
  overwrite_existing: z
    .boolean()
    .default(false)
    .describe("Overwrite if memory ID already exists"),
  regenerate_embeddings: z
    .boolean()
    .default(true)
    .describe("Regenerate embeddings on import"),
});

export type ImportMemories = z.infer<typeof ImportMemoriesSchema>;

export const FindDuplicatesSchema = z.object({
  similarity_threshold: z
    .number()
    .min(0)
    .max(1)
    .default(0.85)
    .describe("Similarity threshold (0-1)"),
  auto_merge: z
    .boolean()
    .default(false)
    .describe("Automatically merge duplicates"),
  keep_highest_importance: z
    .boolean()
    .default(true)
    .describe("When merging, keep highest importance"),
});

export type FindDuplicates = z.infer<typeof FindDuplicatesSchema>;

export const ConsolidateMemoriesSchema = z.object({
  memory_ids: z
    .array(z.string())
    .min(2)
    .describe("Array of memory IDs to consolidate"),
  keep_id: z
    .string()
    .optional()
    .describe("Optional ID of memory to keep (default: highest importance)"),
});

export type ConsolidateMemories = z.infer<typeof ConsolidateMemoriesSchema>;

export interface DuplicateGroup {
  memories: MemoryEntry[];
  similarity_score: number;
}

export const StorageKeys = {
  memory: (workspace: string, id: string) => `ws:${workspace}:memory:${id}`,
  memories: (workspace: string) => `ws:${workspace}:memories:all`,
  byType: (workspace: string, type: ContextType) =>
    `ws:${workspace}:memories:type:${type}`,
  byTag: (workspace: string, tag: string) =>
    `ws:${workspace}:memories:tag:${tag}`,
  timeline: (workspace: string) => `ws:${workspace}:memories:timeline`,
  session: (workspace: string, id: string) => `ws:${workspace}:session:${id}`,
  sessions: (workspace: string) => `ws:${workspace}:sessions:all`,
  important: (workspace: string) => `ws:${workspace}:memories:important`,

  globalMemory: (id: string) => `global:memory:${id}`,
  globalMemories: () => `global:memories:all`,
  globalByType: (type: ContextType) => `global:memories:type:${type}`,
  globalByTag: (tag: string) => `global:memories:tag:${tag}`,
  globalTimeline: () => `global:memories:timeline`,
  globalImportant: () => `global:memories:important`,

  relationship: (workspace: string, id: string) =>
    `ws:${workspace}:relationship:${id}`,
  relationships: (workspace: string) => `ws:${workspace}:relationships:all`,
  memoryRelationships: (workspace: string, memoryId: string) =>
    `ws:${workspace}:memory:${memoryId}:relationships`,
  memoryRelationshipsOut: (workspace: string, memoryId: string) =>
    `ws:${workspace}:memory:${memoryId}:relationships:out`,
  memoryRelationshipsIn: (workspace: string, memoryId: string) =>
    `ws:${workspace}:memory:${memoryId}:relationships:in`,

  globalRelationship: (id: string) => `global:relationship:${id}`,
  globalRelationships: () => `global:relationships:all`,
  globalMemoryRelationships: (memoryId: string) =>
    `global:memory:${memoryId}:relationships`,
  globalMemoryRelationshipsOut: (memoryId: string) =>
    `global:memory:${memoryId}:relationships:out`,
  globalMemoryRelationshipsIn: (memoryId: string) =>
    `global:memory:${memoryId}:relationships:in`,

  memoryVersions: (workspace: string, memoryId: string) =>
    `ws:${workspace}:memory:${memoryId}:versions`,
  memoryVersion: (workspace: string, memoryId: string, versionId: string) =>
    `ws:${workspace}:memory:${memoryId}:version:${versionId}`,
  globalMemoryVersions: (memoryId: string) =>
    `global:memory:${memoryId}:versions`,
  globalMemoryVersion: (memoryId: string, versionId: string) =>
    `global:memory:${memoryId}:version:${versionId}`,

  template: (workspace: string, id: string) => `ws:${workspace}:template:${id}`,
  templates: (workspace: string) => `ws:${workspace}:templates:all`,
  builtinTemplates: () => `builtin:templates:all`,
  builtinTemplate: (id: string) => `builtin:template:${id}`,

  memoryCategory: (workspace: string, memoryId: string) =>
    `ws:${workspace}:memory:${memoryId}:category`,
  category: (workspace: string, category: string) =>
    `ws:${workspace}:category:${category}`,
  categories: (workspace: string) => `ws:${workspace}:categories:all`,
  globalMemoryCategory: (memoryId: string) =>
    `global:memory:${memoryId}:category`,
  globalCategory: (category: string) => `global:category:${category}`,
  globalCategories: () => `global:categories:all`,
} as const;

export function getMemoryKey(
  workspace: string,
  id: string,
  isGlobal: boolean,
): string {
  return isGlobal
    ? StorageKeys.globalMemory(id)
    : StorageKeys.memory(workspace, id);
}

export const ConvertToGlobalSchema = z.object({
  memory_id: z.string().describe("ID of the memory to convert to global"),
});

export type ConvertToGlobal = z.infer<typeof ConvertToGlobalSchema>;

export const ConvertToWorkspaceSchema = z.object({
  memory_id: z
    .string()
    .describe("ID of the global memory to convert to workspace-specific"),
  workspace_id: z
    .string()
    .optional()
    .describe("Target workspace (default: current workspace)"),
});

export type ConvertToWorkspace = z.infer<typeof ConvertToWorkspaceSchema>;
