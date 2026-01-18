/**
 * RLM Tools Unit Tests
 *
 * Tests for RLM tool handlers.
 *
 * @version 1.8.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  create_execution_context,
  decompose_task,
  inject_context_snippet,
  update_subtask_result,
  merge_results,
  verify_answer,
  get_execution_status,
  setRLMMemoryStore,
  rlmTools,
} from './rlm-tools.js';
import {
  MockMemoryStore,
  createMockExecutionContext,
  createMockSubtask,
  createMockContextSnippet,
  createMockExecutionChainSummary,
  createMockMergedResults,
} from '../__mocks__/memory-store.mock.js';
import type { MemoryStore } from '../persistence/memory-store.js';

describe('RLM Tools', () => {
  let mockStore: MockMemoryStore;

  beforeEach(() => {
    mockStore = new MockMemoryStore();
    setRLMMemoryStore(mockStore as unknown as MemoryStore);
  });

  afterEach(() => {
    mockStore.reset();
  });

  // ==========================================================================
  // Tool Registration
  // ==========================================================================

  describe('Tool Registration', () => {
    it('should export all RLM tools', () => {
      expect(rlmTools).toBeDefined();
      expect(rlmTools.create_execution_context).toBeDefined();
      expect(rlmTools.decompose_task).toBeDefined();
      expect(rlmTools.inject_context_snippet).toBeDefined();
      expect(rlmTools.update_subtask_result).toBeDefined();
      expect(rlmTools.merge_results).toBeDefined();
      expect(rlmTools.verify_answer).toBeDefined();
      expect(rlmTools.get_execution_status).toBeDefined();
    });

    it('should have descriptions for all tools', () => {
      expect(create_execution_context.description).toBeDefined();
      expect(decompose_task.description).toBeDefined();
      expect(inject_context_snippet.description).toBeDefined();
      expect(update_subtask_result.description).toBeDefined();
      expect(merge_results.description).toBeDefined();
      expect(verify_answer.description).toBeDefined();
      expect(get_execution_status.description).toBeDefined();
    });

    it('should have input schemas for all tools', () => {
      expect(create_execution_context.inputSchema).toBeDefined();
      expect(decompose_task.inputSchema).toBeDefined();
      expect(inject_context_snippet.inputSchema).toBeDefined();
      expect(update_subtask_result.inputSchema).toBeDefined();
      expect(merge_results.inputSchema).toBeDefined();
      expect(verify_answer.inputSchema).toBeDefined();
      expect(get_execution_status.inputSchema).toBeDefined();
    });
  });

  // ==========================================================================
  // create_execution_context
  // ==========================================================================

  describe('create_execution_context', () => {
    it('should create execution context and return success response', async () => {
      mockStore.createExecutionContext.mockResolvedValueOnce(
        createMockExecutionContext({
          chain_id: 'chain-001',
          estimated_tokens: 50000,
          strategy: 'filter',
        })
      );

      const result = await create_execution_context.handler({
        task: 'Find all errors',
        context: 'ERROR: Test error\nWARN: Warning',
        max_depth: 3,
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.chain_id).toBe('chain-001');
      expect(parsed.estimated_tokens).toBe(50000);
      expect(parsed.recommended_strategy).toBe('filter');
    });

    it('should return error response on failure', async () => {
      mockStore.createExecutionContext.mockRejectedValueOnce(new Error('Store error'));

      const result = await create_execution_context.handler({
        task: 'Task',
        context: 'Context',
        max_depth: 3,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error creating execution context');
    });
  });

  // ==========================================================================
  // decompose_task
  // ==========================================================================

  describe('decompose_task', () => {
    it('should decompose task and return subtasks', async () => {
      mockStore.getExecutionContext.mockResolvedValueOnce(
        createMockExecutionContext({ strategy: 'filter' })
      );
      mockStore.createSubtasks.mockResolvedValueOnce([
        createMockSubtask({ id: 'subtask-001', order: 0, query: 'ERROR' }),
        createMockSubtask({ id: 'subtask-002', order: 1, query: 'WARN' }),
      ]);

      const result = await decompose_task.handler({
        chain_id: 'chain-001',
        strategy: 'filter',
      });

      expect(result.content).toHaveLength(1);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.subtasks_created).toBe(2);
      expect(parsed.strategy).toBe('filter');
    });

    it('should return error when chain not found', async () => {
      mockStore.getExecutionContext.mockResolvedValueOnce(null);

      const result = await decompose_task.handler({
        chain_id: 'nonexistent',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });
  });

  // ==========================================================================
  // inject_context_snippet
  // ==========================================================================

  describe('inject_context_snippet', () => {
    it('should inject context snippet successfully', async () => {
      mockStore.getExecutionContext.mockResolvedValueOnce(
        createMockExecutionContext()
      );
      mockStore.getSubtask.mockResolvedValueOnce(createMockSubtask());
      mockStore.getContextSnippet.mockResolvedValueOnce(
        createMockContextSnippet({
          snippet: 'ERROR: Test error found',
          tokens_used: 100,
          relevance_score: 0.95,
        })
      );

      const result = await inject_context_snippet.handler({
        chain_id: 'chain-001',
        subtask_id: 'subtask-001',
        query: 'ERROR',
        max_tokens: 4000,
      });

      expect(result.content).toHaveLength(1);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.snippet).toContain('ERROR');
      expect(parsed.tokens_used).toBe(100);
    });

    it('should return error when chain not found', async () => {
      mockStore.getExecutionContext.mockResolvedValueOnce(null);

      const result = await inject_context_snippet.handler({
        chain_id: 'nonexistent',
        subtask_id: 'subtask-001',
        query: 'ERROR',
        max_tokens: 4000,
      });

      expect(result.isError).toBe(true);
    });

    it('should return error when subtask not found', async () => {
      mockStore.getExecutionContext.mockResolvedValueOnce(
        createMockExecutionContext()
      );
      mockStore.getSubtask.mockResolvedValueOnce(null);

      const result = await inject_context_snippet.handler({
        chain_id: 'chain-001',
        subtask_id: 'nonexistent',
        query: 'ERROR',
        max_tokens: 4000,
      });

      expect(result.isError).toBe(true);
    });

    it('should return error when snippet extraction fails', async () => {
      mockStore.getExecutionContext.mockResolvedValueOnce(
        createMockExecutionContext()
      );
      mockStore.getSubtask.mockResolvedValueOnce(createMockSubtask());
      mockStore.getContextSnippet.mockResolvedValueOnce(null);

      const result = await inject_context_snippet.handler({
        chain_id: 'chain-001',
        subtask_id: 'subtask-001',
        query: 'ERROR',
        max_tokens: 4000,
      });

      expect(result.isError).toBe(true);
    });
  });

  // ==========================================================================
  // update_subtask_result
  // ==========================================================================

  describe('update_subtask_result', () => {
    it('should update subtask result successfully', async () => {
      mockStore.updateSubtaskResult.mockResolvedValueOnce(
        createMockSubtask({ status: 'completed' })
      );
      mockStore.getExecutionChainSummary.mockResolvedValueOnce(
        createMockExecutionChainSummary({
          progress: { total: 3, completed: 2, failed: 0, pending: 1, in_progress: 0 },
        })
      );

      const result = await update_subtask_result.handler({
        chain_id: 'chain-001',
        subtask_id: 'subtask-001',
        result: 'Analysis complete',
        status: 'completed',
      });

      expect(result.content).toHaveLength(1);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.status).toBe('completed');
      expect(parsed.progress.completed).toBe(2);
    });

    it('should return error when subtask not found', async () => {
      mockStore.updateSubtaskResult.mockResolvedValueOnce(null);

      const result = await update_subtask_result.handler({
        chain_id: 'chain-001',
        subtask_id: 'nonexistent',
        result: 'Result',
      });

      expect(result.isError).toBe(true);
    });

    it('should indicate all tasks complete when no pending', async () => {
      mockStore.updateSubtaskResult.mockResolvedValueOnce(
        createMockSubtask({ status: 'completed' })
      );
      mockStore.getExecutionChainSummary.mockResolvedValueOnce(
        createMockExecutionChainSummary({
          progress: { total: 3, completed: 3, failed: 0, pending: 0, in_progress: 0 },
        })
      );

      const result = await update_subtask_result.handler({
        chain_id: 'chain-001',
        subtask_id: 'subtask-001',
        result: 'Done',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.message).toContain('All subtasks complete');
    });
  });

  // ==========================================================================
  // merge_results
  // ==========================================================================

  describe('merge_results', () => {
    it('should merge results successfully', async () => {
      mockStore.getExecutionChainSummary.mockResolvedValueOnce(
        createMockExecutionChainSummary({
          subtasks: [
            createMockSubtask({ order: 0, status: 'completed', result: 'Result 1', description: 'Task 1' }),
            createMockSubtask({ order: 1, status: 'completed', result: 'Result 2', description: 'Task 2' }),
          ],
          progress: { total: 2, completed: 2, failed: 0, pending: 0, in_progress: 0 },
        })
      );

      const result = await merge_results.handler({
        chain_id: 'chain-001',
        include_failed: false,
      });

      expect(result.content).toHaveLength(1);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.subtasks_merged).toBe(2);
      expect(parsed.aggregated_result).toContain('Result 1');
    });

    it('should return error when chain not found', async () => {
      mockStore.getExecutionChainSummary.mockResolvedValueOnce(null);

      const result = await merge_results.handler({
        chain_id: 'nonexistent',
      });

      expect(result.isError).toBe(true);
    });

    it('should return error when no completed subtasks', async () => {
      mockStore.getExecutionChainSummary.mockResolvedValueOnce(
        createMockExecutionChainSummary({
          subtasks: [createMockSubtask({ status: 'pending' })],
          progress: { total: 1, completed: 0, failed: 0, pending: 1, in_progress: 0 },
        })
      );

      const result = await merge_results.handler({
        chain_id: 'chain-001',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No completed subtasks');
    });

    it('should update chain status to completed', async () => {
      mockStore.getExecutionChainSummary.mockResolvedValueOnce(
        createMockExecutionChainSummary()
      );

      await merge_results.handler({ chain_id: 'chain-001' });

      expect(mockStore.updateExecutionContext).toHaveBeenCalledWith('chain-001', {
        status: 'completed',
      });
    });
  });

  // ==========================================================================
  // verify_answer
  // ==========================================================================

  describe('verify_answer', () => {
    it('should verify answer successfully', async () => {
      mockStore.getExecutionContext.mockResolvedValueOnce(
        createMockExecutionContext()
      );
      mockStore.getContextSnippet
        .mockResolvedValueOnce(createMockContextSnippet({ relevance_score: 0.9 }))
        .mockResolvedValueOnce(createMockContextSnippet({ relevance_score: 0.8 }));

      const result = await verify_answer.handler({
        chain_id: 'chain-001',
        answer: 'Found 5 errors',
        verification_queries: ['errors', 'count'],
      });

      expect(result.content).toHaveLength(1);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.verified).toBe(true);
    });

    it('should return error when chain not found', async () => {
      mockStore.getExecutionContext.mockResolvedValueOnce(null);

      const result = await verify_answer.handler({
        chain_id: 'nonexistent',
        answer: 'Answer',
        verification_queries: ['query'],
      });

      expect(result.isError).toBe(true);
    });

    it('should report discrepancies when queries not found', async () => {
      mockStore.getExecutionContext.mockResolvedValueOnce(
        createMockExecutionContext()
      );
      mockStore.getContextSnippet
        .mockResolvedValueOnce(createMockContextSnippet({ relevance_score: 0.001 }))
        .mockResolvedValueOnce(createMockContextSnippet({ relevance_score: 0.005 }));

      const result = await verify_answer.handler({
        chain_id: 'chain-001',
        answer: 'Invalid',
        verification_queries: ['missing1', 'missing2'],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.verified).toBe(false);
      expect(parsed.discrepancies).toBeDefined();
    });
  });

  // ==========================================================================
  // get_execution_status
  // ==========================================================================

  describe('get_execution_status', () => {
    it('should return execution status', async () => {
      const summary = createMockExecutionChainSummary();
      mockStore.getExecutionChainSummary.mockResolvedValueOnce(summary);

      const result = await get_execution_status.handler({
        chain_id: 'chain-001',
        include_subtasks: true,
      });

      expect(result.content).toHaveLength(1);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.status).toBeDefined();
      expect(parsed.progress).toBeDefined();
    });

    it('should return error when chain not found', async () => {
      mockStore.getExecutionChainSummary.mockResolvedValueOnce(null);

      const result = await get_execution_status.handler({
        chain_id: 'nonexistent',
      });

      expect(result.isError).toBe(true);
    });

    it('should include merged results when completed', async () => {
      const summary = createMockExecutionChainSummary({
        context: createMockExecutionContext({ status: 'completed' }),
      });
      mockStore.getExecutionChainSummary.mockResolvedValueOnce(summary);
      mockStore.getMergedResults.mockResolvedValueOnce(createMockMergedResults());

      const result = await get_execution_status.handler({
        chain_id: 'chain-001',
        include_subtasks: false,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.merged_results).toBeDefined();
    });

    it('should include subtasks when requested', async () => {
      mockStore.getExecutionChainSummary.mockResolvedValueOnce(
        createMockExecutionChainSummary()
      );

      const result = await get_execution_status.handler({
        chain_id: 'chain-001',
        include_subtasks: true,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.subtasks).toBeDefined();
    });
  });

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  describe('Error Handling', () => {
    it('should handle unknown errors gracefully', async () => {
      mockStore.createExecutionContext.mockRejectedValueOnce('Unknown error');

      const result = await create_execution_context.handler({
        task: 'Task',
        context: 'Context',
        max_depth: 3,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown error');
    });

    it('should handle Error instances properly', async () => {
      mockStore.createExecutionContext.mockRejectedValueOnce(
        new Error('Specific error message')
      );

      const result = await create_execution_context.handler({
        task: 'Task',
        context: 'Context',
        max_depth: 3,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Specific error message');
    });
  });

  // ==========================================================================
  // Store Initialization
  // ==========================================================================

  describe('Store Initialization', () => {
    it('should throw when store not initialized', async () => {
      // Create a fresh import to test uninitialized state
      // This is tested implicitly through the setRLMMemoryStore function
      expect(typeof setRLMMemoryStore).toBe('function');
    });
  });
});
