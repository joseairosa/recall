import { z } from "zod";

export const WorkflowStatus = z
  .enum(["active", "paused", "completed"])
  .describe("Workflow lifecycle state");
export type WorkflowStatus = z.infer<typeof WorkflowStatus>;

export const WorkflowInfoSchema = z.object({
  id: z.string().describe("ULID identifier for the workflow"),
  name: z
    .string()
    .describe('Short name for the workflow (e.g., "Implementing auth system")'),
  description: z
    .string()
    .optional()
    .describe("Detailed description of the workflow goal"),
  status: WorkflowStatus.describe("Current workflow state"),
  created_at: z.number().describe("Unix timestamp when workflow was created"),
  updated_at: z
    .number()
    .describe("Unix timestamp when workflow was last updated"),
  completed_at: z
    .number()
    .optional()
    .describe("Unix timestamp when workflow was completed"),
  memory_count: z
    .number()
    .default(0)
    .describe("Number of memories linked to this workflow"),
  summary: z
    .string()
    .optional()
    .describe("Auto-generated summary created on completion"),
  workspace_id: z.string().describe("Workspace this workflow belongs to"),
});
export type WorkflowInfo = z.infer<typeof WorkflowInfoSchema>;

export const StartWorkflowSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(200)
    .describe("Short descriptive name for the workflow thread"),
  description: z
    .string()
    .max(1000)
    .optional()
    .describe("Detailed description of what this workflow will accomplish"),
});
export type StartWorkflow = z.infer<typeof StartWorkflowSchema>;

export const CompleteWorkflowSchema = z.object({
  workflow_id: z
    .string()
    .optional()
    .describe("Workflow ID to complete (defaults to active workflow)"),
});
export type CompleteWorkflow = z.infer<typeof CompleteWorkflowSchema>;

export const PauseWorkflowSchema = z.object({
  workflow_id: z
    .string()
    .optional()
    .describe("Workflow ID to pause (defaults to active workflow)"),
});
export type PauseWorkflow = z.infer<typeof PauseWorkflowSchema>;

export const ResumeWorkflowSchema = z.object({
  workflow_id: z.string().describe("Workflow ID to resume"),
});
export type ResumeWorkflow = z.infer<typeof ResumeWorkflowSchema>;

export const GetWorkflowSchema = z.object({
  workflow_id: z
    .string()
    .optional()
    .describe("Workflow ID to retrieve (defaults to active workflow)"),
});
export type GetWorkflow = z.infer<typeof GetWorkflowSchema>;

export const ListWorkflowsSchema = z.object({
  status: WorkflowStatus.optional().describe("Filter by workflow status"),
  limit: z
    .number()
    .min(1)
    .max(100)
    .default(20)
    .describe("Maximum number of workflows to return"),
});
export type ListWorkflows = z.infer<typeof ListWorkflowsSchema>;

export const GetWorkflowContextSchema = z.object({
  workflow_id: z
    .string()
    .optional()
    .describe("Workflow ID (defaults to active workflow)"),
  max_tokens: z
    .number()
    .min(100)
    .max(2000)
    .default(500)
    .describe("Maximum tokens for context output"),
});
export type GetWorkflowContext = z.infer<typeof GetWorkflowContextSchema>;

export const WorkflowStorageKeys = {
  workflow: (workspace: string, id: string) => `ws:${workspace}:workflow:${id}`,
  workflows: (workspace: string) => `ws:${workspace}:workflows:all`,
  workflowActive: (workspace: string) => `ws:${workspace}:workflow:active`,
  workflowMemories: (workspace: string, id: string) =>
    `ws:${workspace}:workflow:${id}:memories`,
} as const;
