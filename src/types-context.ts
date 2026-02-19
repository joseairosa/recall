import { z } from "zod";
import { ContextType } from "./types-core.js";

export const RecallContextSchema = z.object({
  current_task: z
    .string()
    .describe("Description of what I'm currently working on"),
  query: z.string().optional().describe("Optional specific search query"),
  limit: z
    .number()
    .min(1)
    .max(20)
    .default(5)
    .describe("Number of results to return"),
  min_importance: z
    .number()
    .min(1)
    .max(10)
    .default(6)
    .describe("Minimum importance threshold"),
});

export type RecallContext = z.infer<typeof RecallContextSchema>;

export const AnalyzeConversationSchema = z.object({
  conversation_text: z
    .string()
    .min(1)
    .describe("Conversation text to analyze and extract memories from"),
  auto_categorize: z
    .boolean()
    .default(true)
    .describe("Automatically categorize extracted memories"),
  auto_store: z
    .boolean()
    .default(true)
    .describe("Automatically store extracted memories"),
});

export type AnalyzeConversation = z.infer<typeof AnalyzeConversationSchema>;

export const SummarizeSessionSchema = z.object({
  session_name: z.string().optional().describe("Optional name for the session"),
  auto_create_snapshot: z
    .boolean()
    .default(true)
    .describe("Automatically create session snapshot"),
  lookback_minutes: z
    .number()
    .default(60)
    .describe("How many minutes back to look for memories"),
});

export type SummarizeSession = z.infer<typeof SummarizeSessionSchema>;

export const GetTimeWindowContextSchema = z.object({
  hours: z
    .number()
    .min(0.1)
    .max(72)
    .optional()
    .describe(
      "Number of hours to look back (mutually exclusive with minutes/timestamps)",
    ),
  minutes: z
    .number()
    .min(1)
    .max(4320)
    .optional()
    .describe(
      "Number of minutes to look back (mutually exclusive with hours/timestamps)",
    ),
  start_timestamp: z
    .number()
    .optional()
    .describe(
      "Unix timestamp in ms for start of window (requires end_timestamp)",
    ),
  end_timestamp: z
    .number()
    .optional()
    .describe(
      "Unix timestamp in ms for end of window (requires start_timestamp)",
    ),
  format: z
    .enum(["json", "markdown", "text"])
    .default("markdown")
    .describe("Output format"),
  include_metadata: z
    .boolean()
    .default(true)
    .describe("Include metadata (tags, importance, type)"),
  group_by: z
    .enum(["type", "importance", "chronological", "tags"])
    .default("chronological")
    .describe("How to group the output"),
  min_importance: z
    .number()
    .min(1)
    .max(10)
    .optional()
    .describe("Filter by minimum importance"),
  context_types: z
    .array(ContextType)
    .optional()
    .describe("Filter by specific context types"),
});

export type GetTimeWindowContext = z.infer<typeof GetTimeWindowContextSchema>;

export interface ExtractedMemory {
  content: string;
  context_type: ContextType;
  importance: number;
  tags: string[];
  summary?: string;
}

export interface AnalysisResult {
  extracted_memories: ExtractedMemory[];
  total_count: number;
  stored_ids?: string[];
}
