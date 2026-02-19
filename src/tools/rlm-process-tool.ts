/**
 * rlm_process — consolidated tool replacing:
 *   should_use_rlm, create_execution_context, decompose_task,
 *   inject_context_snippet, update_subtask_result, merge_results,
 *   verify_answer, get_execution_status
 */

import { zodToJsonSchema } from "zod-to-json-schema";
import { getRLMService, getRLMStore } from "./rlm-tools.js";
import { detectSuggestedStrategy } from "./rlm-utils.js";
import { RLMProcessActionSchema } from "../types.js";

function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}
function err(msg: string) {
  return { content: [{ type: "text" as const, text: msg }], isError: true };
}

export const rlm_process = {
  description:
    "Process large content using Recursive Language Model (RLM) decomposition. " +
    "Actions: check (should you use RLM?), create (execution context), decompose (split into subtasks), " +
    "inject (get context snippet), update (save subtask result), merge (combine results), " +
    "verify (cross-check answer), status (check progress).",
  inputSchema: zodToJsonSchema(RLMProcessActionSchema),
  handler: async (args: unknown) => {
    try {
      const parsed = RLMProcessActionSchema.parse(args);

      switch (parsed.action) {
        case "check": {
          const estimatedTokens = Math.ceil(parsed.content.length / 4);
          const SAFE = 4000;
          const WARNING = 8000;
          const REQUIRED = 15000;

          let recommendation: "direct" | "consider_rlm" | "use_rlm";
          let reason: string;
          let suggestedStrategy: string | null = null;

          if (estimatedTokens <= SAFE) {
            recommendation = "direct";
            reason = `Content is ~${estimatedTokens} tokens. Safe to process directly.`;
          } else if (estimatedTokens <= WARNING) {
            recommendation = "consider_rlm";
            reason = `Content is ~${estimatedTokens} tokens. Consider using RLM for better accuracy.`;
            suggestedStrategy = detectSuggestedStrategy(
              parsed.content,
              parsed.task,
            );
          } else {
            recommendation = "use_rlm";
            reason = `Content is ~${estimatedTokens} tokens. RLM strongly recommended to avoid context overflow.`;
            suggestedStrategy = detectSuggestedStrategy(
              parsed.content,
              parsed.task,
            );
          }

          const guidance =
            recommendation === "direct"
              ? "Process the content directly in your analysis."
              : `To use RLM:\n1. Call rlm_process(action="create", task="...", context=<content>)\n2. Call rlm_process(action="decompose", chain_id=..., strategy="${suggestedStrategy || "chunk"}")\n3. Process each subtask with rlm_process(action="inject", ...)\n4. Call rlm_process(action="merge", ...) when done`;

          return ok({
            estimated_tokens: estimatedTokens,
            content_length_chars: parsed.content.length,
            recommendation,
            reason,
            suggested_strategy: suggestedStrategy,
            guidance,
            thresholds: {
              safe: `<${SAFE} tokens`,
              consider_rlm: `${SAFE}-${WARNING} tokens`,
              use_rlm: `>${REQUIRED} tokens`,
            },
          });
        }

        case "create": {
          const service = getRLMService();
          const result = await service.createExecutionContext(
            parsed.task,
            parsed.context,
            parsed.max_depth,
          );
          return ok({
            success: true,
            chain_id: result.chain_id,
            estimated_tokens: result.estimated_tokens,
            recommended_strategy: result.strategy,
            status: result.status,
            message:
              `Execution context created. Estimated ${result.estimated_tokens} tokens. ` +
              `Recommended strategy: ${result.strategy}. ` +
              `Next step: Call rlm_process(action="decompose", chain_id="${result.chain_id}")`,
          });
        }

        case "decompose": {
          const service = getRLMService();
          const result = await service.decomposeTask(
            parsed.chain_id,
            parsed.strategy,
            parsed.num_chunks,
          );
          return ok({
            success: true,
            chain_id: result.chain_id,
            strategy: result.strategy,
            subtasks_created: result.subtasks.length,
            subtasks: result.subtasks,
            next_action: result.next_action,
          });
        }

        case "inject": {
          const service = getRLMService();
          const result = await service.injectContextSnippet(
            parsed.chain_id,
            parsed.subtask_id,
            parsed.query,
            parsed.max_tokens,
          );
          return ok({
            success: true,
            chain_id: result.chain_id,
            subtask_id: result.subtask_id,
            tokens_used: result.tokens_used,
            relevance_score: result.relevance_score.toFixed(3),
            snippet: result.snippet,
          });
        }

        case "update": {
          const service = getRLMService();
          const result = await service.updateSubtaskResult(
            parsed.chain_id,
            parsed.subtask_id,
            parsed.result,
            parsed.status,
          );
          return ok({
            success: true,
            subtask_id: result.subtask_id,
            status: result.status,
            progress: result.progress,
            message: result.all_complete
              ? 'All subtasks complete! Call rlm_process(action="merge", ...) to aggregate.'
              : `${result.progress.completed}/${result.progress.total} subtasks complete.`,
          });
        }

        case "merge": {
          const service = getRLMService();
          const result = await service.mergeResults(
            parsed.chain_id,
            parsed.include_failed,
          );
          return ok({
            success: true,
            chain_id: result.chain_id,
            subtasks_merged: result.subtasks_merged,
            confidence: result.confidence,
            source_coverage: `${(result.source_coverage * 100).toFixed(1)}%`,
            aggregated_result: result.aggregated_result,
          });
        }

        case "verify": {
          const service = getRLMService();
          const store = getRLMStore();
          const result = await service.verifyAnswer(
            parsed.chain_id,
            parsed.answer,
            parsed.verification_queries,
          );

          const verificationDetails: Array<{
            query: string;
            found: boolean;
            snippet?: string;
            relevance: number;
          }> = [];
          for (const query of parsed.verification_queries) {
            const snippet = await store.getContextSnippet(
              parsed.chain_id,
              query,
              1000,
            );
            if (snippet) {
              const found = snippet.relevance_score > 0.01;
              verificationDetails.push({
                query,
                found,
                snippet: found
                  ? snippet.snippet.substring(0, 200) + "..."
                  : undefined,
                relevance: snippet.relevance_score,
              });
            }
          }

          return ok({
            success: true,
            chain_id: parsed.chain_id,
            verified: result.verified,
            confidence: result.confidence.toFixed(2),
            queries_verified: `${verificationDetails.filter((v) => v.found).length}/${parsed.verification_queries.length}`,
            discrepancies: result.discrepancies,
            verification_details: verificationDetails,
          });
        }

        case "status": {
          const service = getRLMService();
          const summary = await service.getExecutionStatus(parsed.chain_id);

          const response: Record<string, unknown> = {
            success: true,
            chain_id: parsed.chain_id,
            status: summary.context.status,
            task: summary.context.original_task,
            strategy: summary.context.strategy,
            progress: summary.progress,
            estimated_remaining_tokens: summary.estimated_remaining_tokens,
          };

          if (parsed.include_subtasks) {
            response.subtasks = summary.subtasks.map((s) => ({
              id: s.id,
              order: s.order,
              description: s.description,
              status: s.status,
              tokens_used: s.tokens_used,
              has_result: !!s.result,
            }));
          }

          if (summary.context.status === "completed") {
            const results = await service.getMergedResults(parsed.chain_id);
            if (results) {
              response.merged_results = {
                confidence: results.confidence,
                source_coverage: `${(results.source_coverage * 100).toFixed(1)}%`,
                subtasks_completed: results.subtasks_completed,
              };
            }
          }

          return ok(response);
        }
      }
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  },
};
