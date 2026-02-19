import { z } from "zod";

export const ExecutionStatus = z.enum([
  "active",
  "completed",
  "failed",
  "paused",
]);

export type ExecutionStatus = z.infer<typeof ExecutionStatus>;

export const DecompositionStrategy = z.enum([
  "filter",
  "chunk",
  "recursive",
  "aggregate",
]);

export type DecompositionStrategy = z.infer<typeof DecompositionStrategy>;

export const SubtaskStatus = z.enum([
  "pending",
  "in_progress",
  "completed",
  "failed",
  "skipped",
]);

export type SubtaskStatus = z.infer<typeof SubtaskStatus>;

export const ExecutionContextSchema = z.object({
  chain_id: z.string().describe("ULID identifier for this execution chain"),
  parent_chain_id: z
    .string()
    .optional()
    .describe("Parent chain ID for recursive calls"),
  depth: z
    .number()
    .min(0)
    .max(5)
    .default(0)
    .describe("Current recursion depth (max 5)"),
  status: ExecutionStatus,
  original_task: z.string().describe("The original task description"),
  context_ref: z
    .string()
    .describe("Reference ID to the large context in storage"),
  strategy: DecompositionStrategy.optional().describe(
    "Recommended decomposition strategy",
  ),
  estimated_tokens: z
    .number()
    .optional()
    .describe("Estimated token count of context"),
  created_at: z.number().describe("Unix timestamp in milliseconds"),
  updated_at: z.number().describe("Unix timestamp of last update"),
  completed_at: z.number().optional().describe("Unix timestamp when completed"),
  error_message: z.string().optional().describe("Error message if failed"),
});

export type ExecutionContext = z.infer<typeof ExecutionContextSchema>;

export const SubtaskSchema = z.object({
  id: z.string().describe("ULID identifier for this subtask"),
  chain_id: z.string().describe("Parent execution chain ID"),
  order: z.number().min(0).describe("Order in the execution sequence"),
  description: z.string().describe("What this subtask should accomplish"),
  status: SubtaskStatus,
  query: z.string().optional().describe("Filter/search query for this subtask"),
  result: z.string().optional().describe("Result of this subtask"),
  memory_ids: z.array(z.string()).default([]).describe("Related memory IDs"),
  tokens_used: z.number().optional().describe("Tokens used for this subtask"),
  created_at: z.number().describe("Unix timestamp in milliseconds"),
  completed_at: z.number().optional().describe("Unix timestamp when completed"),
});

export type Subtask = z.infer<typeof SubtaskSchema>;

export interface DecompositionResult {
  strategy: DecompositionStrategy;
  subtasks: Subtask[];
  context_snippets: string[];
  next_action:
    | "execute_subtasks"
    | "decompose_further"
    | "inject_context"
    | "aggregate";
}

export interface ContextSnippet {
  snippet: string;
  relevance_score: number;
  tokens_used: number;
  source_range?: {
    start: number;
    end: number;
  };
}

export interface MergedResults {
  aggregated_result: string;
  confidence: number;
  source_coverage: number;
  subtasks_completed: number;
  subtasks_total: number;
}

export interface VerificationResult {
  verified: boolean;
  confidence: number;
  corrections?: string[];
  discrepancies?: string[];
}

export const CreateExecutionContextSchema = z.object({
  task: z.string().min(1).describe("The task description"),
  context: z
    .string()
    .min(1)
    .describe("The large context to process (will be stored externally)"),
  max_depth: z
    .number()
    .min(1)
    .max(5)
    .default(3)
    .describe("Maximum recursion depth allowed"),
});

export type CreateExecutionContextInput = z.infer<
  typeof CreateExecutionContextSchema
>;

export const DecomposeTaskSchema = z.object({
  chain_id: z.string().describe("Execution chain ID"),
  strategy: DecompositionStrategy.optional().describe(
    "Decomposition strategy (auto-detected if not provided)",
  ),
  num_chunks: z
    .number()
    .min(2)
    .max(20)
    .optional()
    .describe("Number of chunks for chunk strategy"),
});

export type DecomposeTaskInput = z.infer<typeof DecomposeTaskSchema>;

export const InjectContextSnippetSchema = z.object({
  chain_id: z.string().describe("Execution chain ID"),
  subtask_id: z.string().describe("Subtask ID to get context for"),
  query: z.string().describe("Filter/search query to extract relevant context"),
  max_tokens: z
    .number()
    .min(100)
    .max(8000)
    .default(4000)
    .describe("Maximum tokens for the snippet"),
});

export type InjectContextSnippetInput = z.infer<
  typeof InjectContextSnippetSchema
>;

export const MergeResultsSchema = z.object({
  chain_id: z.string().describe("Execution chain ID"),
  include_failed: z
    .boolean()
    .default(false)
    .describe("Include failed subtask results"),
});

export type MergeResultsInput = z.infer<typeof MergeResultsSchema>;

export const VerifyAnswerSchema = z.object({
  chain_id: z.string().describe("Execution chain ID"),
  answer: z.string().describe("The proposed answer to verify"),
  verification_queries: z
    .array(z.string())
    .min(1)
    .describe("Queries to verify the answer against"),
});

export type VerifyAnswerInput = z.infer<typeof VerifyAnswerSchema>;

export const UpdateSubtaskResultSchema = z.object({
  chain_id: z.string().describe("Execution chain ID"),
  subtask_id: z.string().describe("Subtask ID to update"),
  result: z.string().describe("Result of the subtask"),
  status: SubtaskStatus.optional().describe(
    "New status (defaults to completed)",
  ),
});

export type UpdateSubtaskResultInput = z.infer<
  typeof UpdateSubtaskResultSchema
>;

export const GetExecutionStatusSchema = z.object({
  chain_id: z.string().describe("Execution chain ID"),
  include_subtasks: z
    .boolean()
    .default(true)
    .describe("Include subtask details"),
});

export type GetExecutionStatusInput = z.infer<typeof GetExecutionStatusSchema>;

export interface ExecutionChainSummary {
  context: ExecutionContext;
  subtasks: Subtask[];
  progress: {
    total: number;
    completed: number;
    failed: number;
    pending: number;
    in_progress: number;
  };
  estimated_remaining_tokens: number;
}

export const RLMStorageKeys = {
  execution: (workspace: string, chainId: string) =>
    `ws:${workspace}:execution:${chainId}`,
  executions: (workspace: string) => `ws:${workspace}:executions:all`,
  executionSubtasks: (workspace: string, chainId: string) =>
    `ws:${workspace}:execution:${chainId}:subtasks`,
  executionSubtask: (workspace: string, chainId: string, subtaskId: string) =>
    `ws:${workspace}:execution:${chainId}:subtask:${subtaskId}`,
  executionResults: (workspace: string, chainId: string) =>
    `ws:${workspace}:execution:${chainId}:results`,
  executionContext: (workspace: string, chainId: string) =>
    `ws:${workspace}:execution:${chainId}:context`,
  executionActive: (workspace: string) => `ws:${workspace}:executions:active`,

  globalExecution: (chainId: string) => `global:execution:${chainId}`,
  globalExecutions: () => `global:executions:all`,
} as const;
