/**
 * workflow — consolidated tool replacing:
 *   start_workflow, complete_workflow, pause_workflow, resume_workflow,
 *   get_active_workflow, list_workflows, get_workflow_context
 */

import { zodToJsonSchema } from "zod-to-json-schema";
import { getWorkflowService } from "./workflow-tools.js";
import { WorkflowActionSchema } from "../types.js";

function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}
function err(msg: string) {
  return { content: [{ type: "text" as const, text: msg }], isError: true };
}

export const workflow = {
  description:
    "Manage cross-session workflow threads. " +
    "Actions: start (begin a new workflow), complete (finish and summarize), " +
    "pause (suspend without completing), resume (re-activate paused), " +
    "active (get current workflow), list (all workflows), context (get resumable context).",
  inputSchema: zodToJsonSchema(WorkflowActionSchema),
  handler: async (args: unknown) => {
    try {
      const service = getWorkflowService();
      const parsed = WorkflowActionSchema.parse(args);

      switch (parsed.action) {
        case "start": {
          const wf = await service.startWorkflow(
            parsed.name,
            parsed.description,
          );
          return ok({ success: true, ...wf });
        }
        case "complete": {
          const wf = await service.completeWorkflow(parsed.workflow_id);
          return ok({ success: true, ...wf });
        }
        case "pause": {
          const wf = await service.pauseWorkflow(parsed.workflow_id);
          return ok({ success: true, ...wf });
        }
        case "resume": {
          const wf = await service.resumeWorkflow(parsed.workflow_id);
          return ok({ success: true, ...wf });
        }
        case "active": {
          const wf = await service.getActiveWorkflow();
          return ok({ success: true, active_workflow: wf });
        }
        case "list": {
          const workflows = await service.listWorkflows(parsed.status);
          return ok({ success: true, workflows, count: workflows.length });
        }
        case "context": {
          const context = await service.getActiveWorkflowContext(
            parsed.max_tokens,
          );
          return ok({ success: true, context });
        }
      }
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  },
};
