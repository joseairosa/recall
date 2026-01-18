/**
 * RLM (Recursive Language Model) Tools
 *
 * MCP tool handlers for RLM execution chains.
 * Based on MIT CSAIL paper: arxiv:2512.24601
 *
 * Architecture:
 * - Tool handlers are thin - they transform input/output for MCP protocol
 * - Business logic is delegated to RLMService (SRP)
 * - MemoryStore is injected for multi-tenant support
 *
 * @version 1.8.0
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { MemoryStore } from '../persistence/memory-store.js';
import { RLMService } from '../services/rlm.service.js';
import {
  CreateExecutionContextSchema,
  DecomposeTaskSchema,
  InjectContextSnippetSchema,
  MergeResultsSchema,
  VerifyAnswerSchema,
  UpdateSubtaskResultSchema,
  GetExecutionStatusSchema,
} from '../types.js';

// ==========================================================================
// Module State & Dependency Injection
// ==========================================================================

let memoryStore: MemoryStore | null = null;
let rlmService: RLMService | null = null;

/**
 * Sets the memory store for this module (dependency injection)
 * Creates a new RLMService instance with the provided store
 */
export function setRLMMemoryStore(store: MemoryStore): void {
  memoryStore = store;
  rlmService = new RLMService(store);
}

/**
 * Gets the current memory store (throws if not initialized)
 */
function getStore(): MemoryStore {
  if (!memoryStore) {
    throw new Error('RLM memory store not initialized. Call setRLMMemoryStore first.');
  }
  return memoryStore;
}

/**
 * Gets the RLM service (throws if not initialized)
 */
function getService(): RLMService {
  if (!rlmService) {
    throw new Error('RLM service not initialized. Call setRLMMemoryStore first.');
  }
  return rlmService;
}

// ==========================================================================
// Response Helpers
// ==========================================================================

/**
 * Creates a successful MCP response
 */
function successResponse(data: Record<string, unknown>) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

/**
 * Creates an error MCP response
 */
function errorResponse(message: string) {
  return {
    content: [
      {
        type: 'text' as const,
        text: message,
      },
    ],
    isError: true,
  };
}

/**
 * Extracts error message from unknown error
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ==========================================================================
// Tool Handlers
// ==========================================================================

/**
 * create_execution_context
 *
 * Initialize an RLM execution chain for processing large contexts.
 * Stores the context externally and returns a chain ID for subsequent operations.
 */
export const create_execution_context = {
  description:
    'Create an execution context for processing large content that exceeds context window limits. ' +
    'Stores the content externally and returns a chain ID with recommended processing strategy. ' +
    'Use this when you need to analyze documents, logs, or codebases larger than ~100KB.',
  inputSchema: zodToJsonSchema(CreateExecutionContextSchema),
  handler: async (args: z.infer<typeof CreateExecutionContextSchema>) => {
    try {
      const service = getService();
      const result = await service.createExecutionContext(
        args.task,
        args.context,
        args.max_depth
      );

      return successResponse({
        success: true,
        chain_id: result.chain_id,
        estimated_tokens: result.estimated_tokens,
        recommended_strategy: result.strategy,
        status: result.status,
        message:
          `Execution context created. Estimated ${result.estimated_tokens} tokens. ` +
          `Recommended strategy: ${result.strategy}. ` +
          `Next step: Call decompose_task with chain_id="${result.chain_id}"`,
      });
    } catch (error) {
      return errorResponse(`Error creating execution context: ${getErrorMessage(error)}`);
    }
  },
};

/**
 * decompose_task
 *
 * Break down a task into subtasks based on the decomposition strategy.
 * Creates subtasks that can be processed independently.
 */
export const decompose_task = {
  description:
    'Decompose a large task into smaller subtasks based on the recommended strategy. ' +
    'Creates subtasks with queries for extracting relevant context snippets. ' +
    'Strategies: filter (regex/pattern), chunk (sequential), recursive (nested), aggregate (combine).',
  inputSchema: zodToJsonSchema(DecomposeTaskSchema),
  handler: async (args: z.infer<typeof DecomposeTaskSchema>) => {
    try {
      const service = getService();
      const result = await service.decomposeTask(
        args.chain_id,
        args.strategy,
        args.num_chunks
      );

      return successResponse({
        success: true,
        chain_id: result.chain_id,
        strategy: result.strategy,
        subtasks_created: result.subtasks.length,
        subtasks: result.subtasks,
        next_action: result.next_action,
        message:
          `Created ${result.subtasks.length} subtasks using "${result.strategy}" strategy. ` +
          `Next: For each subtask, call inject_context_snippet to get relevant content, ` +
          `then call update_subtask_result with your analysis.`,
      });
    } catch (error) {
      return errorResponse(`Error decomposing task: ${getErrorMessage(error)}`);
    }
  },
};

/**
 * inject_context_snippet
 *
 * Extract a relevant snippet from the stored context based on a query.
 * Returns filtered content that fits within token limits.
 */
export const inject_context_snippet = {
  description:
    'Extract a relevant snippet from the stored context for a specific subtask. ' +
    'Uses the query to filter content (supports regex patterns like ERROR|WARN). ' +
    'Returns content within token limits for processing.',
  inputSchema: zodToJsonSchema(InjectContextSnippetSchema),
  handler: async (args: z.infer<typeof InjectContextSnippetSchema>) => {
    try {
      const service = getService();
      const result = await service.injectContextSnippet(
        args.chain_id,
        args.subtask_id,
        args.query,
        args.max_tokens
      );

      return successResponse({
        success: true,
        chain_id: result.chain_id,
        subtask_id: result.subtask_id,
        tokens_used: result.tokens_used,
        relevance_score: result.relevance_score.toFixed(3),
        snippet: result.snippet,
        message:
          `Extracted ${result.tokens_used} tokens with ${(result.relevance_score * 100).toFixed(1)}% relevance. ` +
          `Process this snippet and call update_subtask_result with your analysis.`,
      });
    } catch (error) {
      return errorResponse(`Error injecting context: ${getErrorMessage(error)}`);
    }
  },
};

/**
 * update_subtask_result
 *
 * Record the result of processing a subtask.
 */
export const update_subtask_result = {
  description:
    'Update a subtask with the result of your analysis. ' +
    'Call this after processing each context snippet.',
  inputSchema: zodToJsonSchema(UpdateSubtaskResultSchema),
  handler: async (args: z.infer<typeof UpdateSubtaskResultSchema>) => {
    try {
      const service = getService();
      const result = await service.updateSubtaskResult(
        args.chain_id,
        args.subtask_id,
        args.result,
        args.status
      );

      return successResponse({
        success: true,
        subtask_id: result.subtask_id,
        status: result.status,
        progress: result.progress,
        message: result.all_complete
          ? 'All subtasks complete! Call merge_results to aggregate.'
          : `${result.progress.completed}/${result.progress.total} subtasks complete.`,
      });
    } catch (error) {
      return errorResponse(`Error updating subtask: ${getErrorMessage(error)}`);
    }
  },
};

/**
 * merge_results
 *
 * Aggregate results from all completed subtasks.
 */
export const merge_results = {
  description:
    'Aggregate results from all completed subtasks into a final answer. ' +
    'Call this after all subtasks are complete.',
  inputSchema: zodToJsonSchema(MergeResultsSchema),
  handler: async (args: z.infer<typeof MergeResultsSchema>) => {
    try {
      const service = getService();
      const result = await service.mergeResults(args.chain_id, args.include_failed);

      return successResponse({
        success: true,
        chain_id: result.chain_id,
        subtasks_merged: result.subtasks_merged,
        confidence: result.confidence,
        source_coverage: `${(result.source_coverage * 100).toFixed(1)}%`,
        aggregated_result: result.aggregated_result,
        message:
          `Merged ${result.subtasks_merged} subtask results. ` +
          `Coverage: ${(result.source_coverage * 100).toFixed(1)}% of context examined. ` +
          `Optionally call verify_answer to cross-check the result.`,
      });
    } catch (error) {
      return errorResponse(`Error merging results: ${getErrorMessage(error)}`);
    }
  },
};

/**
 * verify_answer
 *
 * Cross-check an answer against the source context.
 */
export const verify_answer = {
  description:
    'Verify a proposed answer by cross-checking against the source context. ' +
    'Use verification queries to spot-check specific claims.',
  inputSchema: zodToJsonSchema(VerifyAnswerSchema),
  handler: async (args: z.infer<typeof VerifyAnswerSchema>) => {
    try {
      const service = getService();
      const result = await service.verifyAnswer(
        args.chain_id,
        args.answer,
        args.verification_queries
      );

      // Get detailed verification for response
      const store = getStore();
      const verificationDetails: Array<{
        query: string;
        found: boolean;
        snippet?: string;
        relevance: number;
      }> = [];

      for (const query of args.verification_queries) {
        const snippet = await store.getContextSnippet(args.chain_id, query, 1000);
        if (snippet) {
          const found = snippet.relevance_score > 0.01;
          verificationDetails.push({
            query,
            found,
            snippet: found ? snippet.snippet.substring(0, 200) + '...' : undefined,
            relevance: snippet.relevance_score,
          });
        }
      }

      return successResponse({
        success: true,
        chain_id: args.chain_id,
        verified: result.verified,
        confidence: result.confidence.toFixed(2),
        queries_verified: `${verificationDetails.filter(v => v.found).length}/${args.verification_queries.length}`,
        discrepancies: result.discrepancies,
        verification_details: verificationDetails,
        message: result.verified
          ? `Answer verified with ${(result.confidence * 100).toFixed(0)}% confidence.`
          : `Verification failed. ${result.discrepancies?.length ?? 0} queries not found in context.`,
      });
    } catch (error) {
      return errorResponse(`Error verifying answer: ${getErrorMessage(error)}`);
    }
  },
};

/**
 * get_execution_status
 *
 * Get the current status and progress of an execution chain.
 */
export const get_execution_status = {
  description:
    'Get the current status and progress of an RLM execution chain. ' +
    'Shows subtask progress, estimated remaining tokens, and current status.',
  inputSchema: zodToJsonSchema(GetExecutionStatusSchema),
  handler: async (args: z.infer<typeof GetExecutionStatusSchema>) => {
    try {
      const service = getService();
      const summary = await service.getExecutionStatus(args.chain_id);

      const response: Record<string, unknown> = {
        success: true,
        chain_id: args.chain_id,
        status: summary.context.status,
        task: summary.context.original_task,
        strategy: summary.context.strategy,
        progress: summary.progress,
        estimated_remaining_tokens: summary.estimated_remaining_tokens,
      };

      if (args.include_subtasks) {
        response.subtasks = summary.subtasks.map(s => ({
          id: s.id,
          order: s.order,
          description: s.description,
          status: s.status,
          tokens_used: s.tokens_used,
          has_result: !!s.result,
        }));
      }

      // Get merged results if completed
      if (summary.context.status === 'completed') {
        const results = await service.getMergedResults(args.chain_id);
        if (results) {
          response.merged_results = {
            confidence: results.confidence,
            source_coverage: `${(results.source_coverage * 100).toFixed(1)}%`,
            subtasks_completed: results.subtasks_completed,
          };
        }
      }

      return successResponse(response);
    } catch (error) {
      return errorResponse(`Error getting status: ${getErrorMessage(error)}`);
    }
  },
};

// ==========================================================================
// Exports
// ==========================================================================

/**
 * Export all RLM tools as a collection
 */
export const rlmTools = {
  create_execution_context,
  decompose_task,
  inject_context_snippet,
  update_subtask_result,
  merge_results,
  verify_answer,
  get_execution_status,
};
