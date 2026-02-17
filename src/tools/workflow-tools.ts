/**
 * Workflow MCP Tools
 *
 * Thin MCP tool handlers for cross-session workflow management.
 * Business logic is delegated to WorkflowService.
 *
 * Tools:
 *   start_workflow, complete_workflow, pause_workflow, resume_workflow,
 *   get_active_workflow, list_workflows, get_workflow_context
 */

import { zodToJsonSchema } from 'zod-to-json-schema';
import { MemoryStore } from '../persistence/memory-store.js';
import { WorkflowService } from '../services/workflow.service.js';
import {
  StartWorkflowSchema,
  CompleteWorkflowSchema,
  PauseWorkflowSchema,
  ResumeWorkflowSchema,
  ListWorkflowsSchema,
  GetWorkflowContextSchema,
} from '../types.js';


let _service: WorkflowService | null = null;

export function setWorkflowMemoryStore(store: MemoryStore): void {
  _service = new WorkflowService(store);
}

function getService(): WorkflowService {
  if (!_service) throw new Error('Workflow service not initialized. Call setWorkflowMemoryStore first.');
  return _service;
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

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}


export type WorkflowTool = {
  name: string;
  description: string;
  inputSchema: ReturnType<typeof zodToJsonSchema>;
  handler: (args: Record<string, unknown>) => Promise<ToolResponse>;
};

export const workflowTools: WorkflowTool[] = [
  {
    name: 'start_workflow',
    description:
      'Start a named workflow that spans multiple sessions. ' +
      'Memories stored while this workflow is active are automatically tagged with the workflow ID. ' +
      'Only one workflow can be active at a time — pause or complete the current one first.',
    inputSchema: zodToJsonSchema(StartWorkflowSchema),
    handler: async (args) => {
      try {
        const { name, description } = StartWorkflowSchema.parse(args);
        const workflow = await getService().startWorkflow(name, description);
        return ok({ ...workflow });
      } catch (e) {
        return toolErr(errorMessage(e));
      }
    },
  },

  {
    name: 'complete_workflow',
    description:
      'Complete the active workflow (or a specific workflow by ID). ' +
      'Generates a summary from linked memories and clears the active slot.',
    inputSchema: zodToJsonSchema(CompleteWorkflowSchema),
    handler: async (args) => {
      try {
        const { workflow_id } = CompleteWorkflowSchema.parse(args);
        const workflow = await getService().completeWorkflow(workflow_id);
        return ok({ ...workflow });
      } catch (e) {
        return toolErr(errorMessage(e));
      }
    },
  },

  {
    name: 'pause_workflow',
    description:
      'Pause the active workflow, freeing the active slot so a new workflow can start. ' +
      'A paused workflow can be resumed later with resume_workflow.',
    inputSchema: zodToJsonSchema(PauseWorkflowSchema),
    handler: async (args) => {
      try {
        const { workflow_id } = PauseWorkflowSchema.parse(args);
        const workflow = await getService().pauseWorkflow(workflow_id);
        return ok({ ...workflow });
      } catch (e) {
        return toolErr(errorMessage(e));
      }
    },
  },

  {
    name: 'resume_workflow',
    description:
      'Resume a paused workflow, making it the active workflow. ' +
      'Fails if another workflow is currently active.',
    inputSchema: zodToJsonSchema(ResumeWorkflowSchema),
    handler: async (args) => {
      try {
        const { workflow_id } = ResumeWorkflowSchema.parse(args);
        const workflow = await getService().resumeWorkflow(workflow_id);
        return ok({ ...workflow });
      } catch (e) {
        return toolErr(errorMessage(e));
      }
    },
  },

  {
    name: 'get_active_workflow',
    description:
      'Get the currently active workflow and its memory count. ' +
      'Returns null if no workflow is active.',
    inputSchema: zodToJsonSchema(StartWorkflowSchema.pick({ name: true }).partial()),
    handler: async (_args) => {
      try {
        const workflow = await getService().getActiveWorkflow();
        return ok({ active_workflow: workflow });
      } catch (e) {
        return toolErr(errorMessage(e));
      }
    },
  },

  {
    name: 'list_workflows',
    description:
      'List all workflows in the current workspace, sorted by creation date (newest first). ' +
      'Optionally filter by status: active | paused | completed.',
    inputSchema: zodToJsonSchema(ListWorkflowsSchema),
    handler: async (args) => {
      try {
        const { status } = ListWorkflowsSchema.parse(args);
        const workflows = await getService().listWorkflows(status);
        return ok({ workflows, count: workflows.length });
      } catch (e) {
        return toolErr(errorMessage(e));
      }
    },
  },

  {
    name: 'get_workflow_context',
    description:
      'Get the active workflow context formatted for injection into the conversation. ' +
      'Use this to restore context at the start of a new session on the same workflow.',
    inputSchema: zodToJsonSchema(GetWorkflowContextSchema),
    handler: async (args) => {
      try {
        const { max_tokens } = GetWorkflowContextSchema.parse(args);
        const context = await getService().getActiveWorkflowContext(max_tokens);
        return ok({ context });
      } catch (e) {
        return toolErr(errorMessage(e));
      }
    },
  },
];
