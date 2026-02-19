import { z } from "zod";

export const ContextType = z.enum([
  "directive",
  "information",
  "heading",
  "decision",
  "code_pattern",
  "requirement",
  "error",
  "todo",
  "insight",
  "preference",
]);

export type ContextType = z.infer<typeof ContextType>;

export const MemoryEntrySchema = z.object({
  id: z.string().describe("ULID identifier"),
  timestamp: z.number().describe("Unix timestamp in milliseconds"),
  context_type: ContextType,
  content: z.string().describe("The actual memory content"),
  summary: z.string().optional().describe("Short summary for quick scanning"),
  tags: z.array(z.string()).default([]).describe("Tags for categorization"),
  importance: z
    .number()
    .min(1)
    .max(10)
    .default(5)
    .describe("Importance score 1-10"),
  session_id: z.string().optional().describe("Optional session grouping"),
  embedding: z.array(z.number()).optional().describe("Vector embedding"),
  ttl_seconds: z
    .number()
    .optional()
    .describe("Time-to-live in seconds (auto-expires)"),
  expires_at: z
    .number()
    .optional()
    .describe("Unix timestamp when memory expires"),
  is_global: z
    .boolean()
    .default(false)
    .describe("If true, memory is accessible across all workspaces"),
  workspace_id: z
    .string()
    .describe("Workspace identifier (empty for global memories)"),
  category: z
    .string()
    .optional()
    .describe("Category for organization (v1.5.0)"),
});

export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;

export const CreateMemorySchema = z.object({
  content: z.string().min(1).describe("The memory content to store"),
  context_type: ContextType.default("information"),
  tags: z.array(z.string()).default([]).describe("Tags for categorization"),
  importance: z
    .number()
    .min(1)
    .max(10)
    .default(5)
    .describe("Importance score 1-10"),
  summary: z.string().optional().describe("Optional summary"),
  session_id: z.string().optional().describe("Optional session ID"),
  ttl_seconds: z
    .number()
    .min(60)
    .optional()
    .describe("Time-to-live in seconds (minimum 60s)"),
  is_global: z
    .boolean()
    .default(false)
    .describe("If true, memory is accessible across all workspaces"),
  category: z
    .string()
    .optional()
    .describe("Category for organization (v1.5.0)"),
});

export type CreateMemory = z.infer<typeof CreateMemorySchema>;

export const BatchCreateMemoriesSchema = z.object({
  memories: z
    .array(CreateMemorySchema)
    .min(1)
    .describe("Array of memories to store"),
});

export const UpdateMemorySchema = z.object({
  memory_id: z.string().describe("ULID of memory to update"),
  content: z.string().optional(),
  context_type: ContextType.optional(),
  tags: z.array(z.string()).optional(),
  importance: z.number().min(1).max(10).optional(),
  summary: z.string().optional(),
  session_id: z.string().optional(),
  is_global: z.boolean().optional(),
  category: z
    .string()
    .optional()
    .describe("Category for organization (v1.5.0)"),
});

export const DeleteMemorySchema = z.object({
  memory_id: z.string().describe("ULID of memory to delete"),
});

export const SearchOutputMode = z.enum(["full", "summary", "compact"]);
export type SearchOutputMode = z.infer<typeof SearchOutputMode>;

export const SearchMemorySchema = z.object({
  query: z.string().describe("Search query"),
  limit: z.number().min(1).max(100).default(10).describe("Number of results"),
  min_importance: z
    .number()
    .min(1)
    .max(10)
    .optional()
    .describe("Filter by minimum importance"),
  context_types: z
    .array(ContextType)
    .optional()
    .describe("Filter by context types"),
  category: z.string().optional().describe("Filter by category (v1.5.0)"),
  fuzzy: z.boolean().default(false).describe("Enable fuzzy search (v1.5.0)"),
  regex: z
    .string()
    .optional()
    .describe("Regex pattern for advanced search (v1.5.0)"),
  output_mode: SearchOutputMode.default("summary").describe(
    "Output mode for context efficiency (v1.8.1): " +
      "full=all fields including content, " +
      "summary=no content field (default, recommended), " +
      "compact=minimal fields (id, summary, type, similarity only)",
  ),
});

export const OrganizeSessionSchema = z.object({
  session_name: z.string().describe("Name for the session"),
  memory_ids: z
    .array(z.string())
    .min(1)
    .describe("Array of memory IDs to include"),
  summary: z.string().optional().describe("Optional session summary"),
});

export interface SessionInfo {
  session_id: string;
  session_name: string;
  created_at: number;
  memory_count: number;
  summary?: string;
  memory_ids: string[];
}

export enum WorkspaceMode {
  ISOLATED = "isolated",
  GLOBAL = "global",
  HYBRID = "hybrid",
}

export interface WorkspaceContext {
  workspace_path: string;
  workspace_id: string;
  mode: WorkspaceMode;
}

export function createWorkspaceId(path: string): string {
  let hash = 0;
  for (let i = 0; i < path.length; i++) {
    const char = path.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export function getWorkspaceMode(): WorkspaceMode {
  const mode = process.env.WORKSPACE_MODE?.toLowerCase();

  switch (mode) {
    case "global":
      return WorkspaceMode.GLOBAL;
    case "hybrid":
      return WorkspaceMode.HYBRID;
    case "isolated":
    default:
      return WorkspaceMode.ISOLATED;
  }
}
