/**
 * RLMService Unit Tests
 *
 * Comprehensive tests for the RLM service layer.
 *
 * @version 1.8.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RLMService, DEFAULT_RLM_CONFIG } from './rlm.service.js';
import {
  MockMemoryStore,
  createMockExecutionContext,
  createMockSubtask,
  createMockContextSnippet,
  createMockExecutionChainSummary,
  createMockMergedResults,
} from '../__mocks__/memory-store.mock.js';
import type { MemoryStore } from '../persistence/memory-store.js';

describe('RLMService', () => {
  let mockStore: MockMemoryStore;
  let service: RLMService;

  beforeEach(() => {
    mockStore = new MockMemoryStore();
    service = new RLMService(mockStore as unknown as MemoryStore);
  });

  // ==========================================================================
  // Constructor & Configuration
  // ==========================================================================

  describe('constructor', () => {
    it('should create instance with default config', () => {
      const svc = new RLMService(mockStore as unknown as MemoryStore);
      expect(svc).toBeDefined();
    });

    it('should merge custom config with defaults', () => {
      const customConfig = { maxRecursionDepth: 3, defaultChunkCount: 10 };
      const svc = new RLMService(mockStore as unknown as MemoryStore, customConfig);
      expect(svc).toBeDefined();
    });
  });

  // ==========================================================================
  // Execution Context Management
  // ==========================================================================

  describe('createExecutionContext', () => {
    it('should create execution context successfully', async () => {
      const result = await service.createExecutionContext(
        'Analyze log files',
        'ERROR: Test error\nWARN: Test warning',
        3
      );

      expect(result.chain_id).toBeDefined();
      expect(result.strategy).toBeDefined();
      expect(result.estimated_tokens).toBeGreaterThanOrEqual(0);
      expect(result.status).toBe('active');
    });

    it('should call store.createExecutionContext with correct parameters', async () => {
      const task = 'Find all errors';
      const context = 'Log content here';
      const maxDepth = 4;

      await service.createExecutionContext(task, context, maxDepth);

      expect(mockStore.createExecutionContext).toHaveBeenCalledWith(
        task,
        context,
        maxDepth
      );
    });

    it('should use default max depth when not provided', async () => {
      await service.createExecutionContext('Task', 'Context');

      expect(mockStore.createExecutionContext).toHaveBeenCalledWith(
        'Task',
        'Context',
        DEFAULT_RLM_CONFIG.maxRecursionDepth
      );
    });

    it('should propagate errors from store', async () => {
      mockStore.createExecutionContext.mockRejectedValueOnce(new Error('Store error'));

      await expect(
        service.createExecutionContext('Task', 'Context')
      ).rejects.toThrow('Store error');
    });
  });

  describe('getExecutionContext', () => {
    it('should return context when found', async () => {
      const expectedContext = createMockExecutionContext();
      mockStore.getExecutionContext.mockResolvedValueOnce(expectedContext);

      const result = await service.getExecutionContext('chain-001');

      expect(result).toEqual(expectedContext);
      expect(mockStore.getExecutionContext).toHaveBeenCalledWith('chain-001');
    });

    it('should return null when not found', async () => {
      mockStore.getExecutionContext.mockResolvedValueOnce(null);

      const result = await service.getExecutionContext('nonexistent');

      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // Task Decomposition
  // ==========================================================================

  describe('decomposeTask', () => {
    it('should decompose task with provided strategy', async () => {
      mockStore.getExecutionContext.mockResolvedValueOnce(
        createMockExecutionContext({ original_task: 'Find errors' })
      );

      const result = await service.decomposeTask('chain-001', 'filter', 5);

      expect(result.chain_id).toBe('chain-001');
      expect(result.strategy).toBe('filter');
      expect(result.subtasks.length).toBeGreaterThan(0);
    });

    it('should use context strategy when not provided', async () => {
      mockStore.getExecutionContext.mockResolvedValueOnce(
        createMockExecutionContext({ strategy: 'aggregate' })
      );

      const result = await service.decomposeTask('chain-001');

      expect(result.strategy).toBe('aggregate');
    });

    it('should default to chunk strategy when neither provided', async () => {
      mockStore.getExecutionContext.mockResolvedValueOnce(
        createMockExecutionContext({ strategy: undefined })
      );

      const result = await service.decomposeTask('chain-001');

      expect(result.strategy).toBe('chunk');
    });

    it('should throw error when chain not found', async () => {
      mockStore.getExecutionContext.mockResolvedValueOnce(null);

      await expect(service.decomposeTask('nonexistent')).rejects.toThrow(
        'Execution chain nonexistent not found'
      );
    });

    it('should create subtasks in store', async () => {
      mockStore.getExecutionContext.mockResolvedValueOnce(
        createMockExecutionContext()
      );

      await service.decomposeTask('chain-001', 'chunk', 3);

      expect(mockStore.createSubtasks).toHaveBeenCalled();
      const [chainId, definitions] = mockStore.createSubtasks.mock.calls[0];
      expect(chainId).toBe('chain-001');
      expect(definitions.length).toBe(3);
    });

    it('should return decompose_further for recursive strategy with large context', async () => {
      mockStore.getExecutionContext.mockResolvedValueOnce(
        createMockExecutionContext({ strategy: 'recursive', estimated_tokens: 200000 })
      );

      const result = await service.decomposeTask('chain-001', 'recursive');

      expect(result.next_action).toBe('decompose_further');
    });

    it('should return inject_context for filter strategy', async () => {
      mockStore.getExecutionContext.mockResolvedValueOnce(
        createMockExecutionContext()
      );

      const result = await service.decomposeTask('chain-001', 'filter');

      expect(result.next_action).toBe('inject_context');
    });

    it('should return execute_subtasks for other strategies', async () => {
      mockStore.getExecutionContext.mockResolvedValueOnce(
        createMockExecutionContext()
      );

      const result = await service.decomposeTask('chain-001', 'chunk');

      expect(result.next_action).toBe('execute_subtasks');
    });
  });

  describe('generateSubtaskDefinitions', () => {
    it('should generate error-specific filter subtasks for error task', () => {
      const definitions = service.generateSubtaskDefinitions(
        'Find all errors in the logs',
        'filter',
        5
      );

      expect(definitions.length).toBe(5);
      expect(definitions[0].query).toContain('ERROR');
      expect(definitions[1].query).toContain('WARN');
    });

    it('should generate generic filter subtasks for non-error task', () => {
      const definitions = service.generateSubtaskDefinitions(
        'Analyze the document',
        'filter',
        5
      );

      expect(definitions.length).toBe(5);
      expect(definitions[0].query).toContain('important');
    });

    it('should generate aggregate subtasks', () => {
      const definitions = service.generateSubtaskDefinitions(
        'Summarize findings',
        'aggregate',
        5
      );

      expect(definitions.length).toBe(5);
      expect(definitions[0].description).toContain('themes');
    });

    it('should generate recursive subtasks', () => {
      const definitions = service.generateSubtaskDefinitions(
        'Deep analysis',
        'recursive',
        5
      );

      expect(definitions.length).toBe(5);
      expect(definitions[0].description).toContain('first section');
    });

    it('should generate correct number of chunk subtasks', () => {
      const definitions = service.generateSubtaskDefinitions(
        'Process document',
        'chunk',
        7
      );

      expect(definitions.length).toBe(7);
      expect(definitions[0].description).toContain('chunk 1 of 7');
      expect(definitions[6].description).toContain('chunk 7 of 7');
    });
  });

  // ==========================================================================
  // Context Injection
  // ==========================================================================

  describe('injectContextSnippet', () => {
    it('should inject context snippet successfully', async () => {
      mockStore.getExecutionContext.mockResolvedValueOnce(
        createMockExecutionContext()
      );
      mockStore.getSubtask.mockResolvedValueOnce(createMockSubtask());
      mockStore.getContextSnippet.mockResolvedValueOnce(createMockContextSnippet());

      const result = await service.injectContextSnippet(
        'chain-001',
        'subtask-001',
        'ERROR'
      );

      expect(result.chain_id).toBe('chain-001');
      expect(result.subtask_id).toBe('subtask-001');
      expect(result.snippet).toBeDefined();
      expect(result.tokens_used).toBeGreaterThan(0);
    });

    it('should throw error when chain not found', async () => {
      mockStore.getExecutionContext.mockResolvedValueOnce(null);

      await expect(
        service.injectContextSnippet('nonexistent', 'subtask-001', 'ERROR')
      ).rejects.toThrow('Execution chain nonexistent not found');
    });

    it('should throw error when subtask not found', async () => {
      mockStore.getExecutionContext.mockResolvedValueOnce(
        createMockExecutionContext()
      );
      mockStore.getSubtask.mockResolvedValueOnce(null);

      await expect(
        service.injectContextSnippet('chain-001', 'nonexistent', 'ERROR')
      ).rejects.toThrow('Subtask nonexistent not found in chain chain-001');
    });

    it('should throw error when snippet extraction fails', async () => {
      mockStore.getExecutionContext.mockResolvedValueOnce(
        createMockExecutionContext()
      );
      mockStore.getSubtask.mockResolvedValueOnce(createMockSubtask());
      mockStore.getContextSnippet.mockResolvedValueOnce(null);

      await expect(
        service.injectContextSnippet('chain-001', 'subtask-001', 'ERROR')
      ).rejects.toThrow('Could not extract snippet');
    });

    it('should mark subtask as in_progress', async () => {
      mockStore.getExecutionContext.mockResolvedValueOnce(
        createMockExecutionContext()
      );
      mockStore.getSubtask.mockResolvedValueOnce(createMockSubtask());
      mockStore.getContextSnippet.mockResolvedValueOnce(
        createMockContextSnippet({ tokens_used: 1000 })
      );

      await service.injectContextSnippet('chain-001', 'subtask-001', 'ERROR');

      expect(mockStore.updateSubtaskResult).toHaveBeenCalledWith(
        'chain-001',
        'subtask-001',
        '',
        'in_progress',
        1000
      );
    });

    it('should use custom max tokens when provided', async () => {
      mockStore.getExecutionContext.mockResolvedValueOnce(
        createMockExecutionContext()
      );
      mockStore.getSubtask.mockResolvedValueOnce(createMockSubtask());
      mockStore.getContextSnippet.mockResolvedValueOnce(createMockContextSnippet());

      await service.injectContextSnippet('chain-001', 'subtask-001', 'ERROR', 2000);

      expect(mockStore.getContextSnippet).toHaveBeenCalledWith('chain-001', 'ERROR', 2000);
    });
  });

  // ==========================================================================
  // Subtask Management
  // ==========================================================================

  describe('updateSubtaskResult', () => {
    it('should update subtask result successfully', async () => {
      mockStore.updateSubtaskResult.mockResolvedValueOnce(
        createMockSubtask({ status: 'completed', result: 'Analysis complete' })
      );
      mockStore.getExecutionChainSummary.mockResolvedValueOnce(
        createMockExecutionChainSummary({
          progress: { total: 3, completed: 3, failed: 0, pending: 0, in_progress: 0 },
        })
      );

      const result = await service.updateSubtaskResult(
        'chain-001',
        'subtask-001',
        'Analysis complete'
      );

      expect(result.subtask_id).toBe('subtask-001');
      expect(result.status).toBe('completed');
      expect(result.all_complete).toBe(true);
    });

    it('should throw error when subtask not found', async () => {
      mockStore.updateSubtaskResult.mockResolvedValueOnce(null);

      await expect(
        service.updateSubtaskResult('chain-001', 'nonexistent', 'Result')
      ).rejects.toThrow('Subtask nonexistent not found');
    });

    it('should default to completed status', async () => {
      mockStore.updateSubtaskResult.mockResolvedValueOnce(
        createMockSubtask({ status: 'completed' })
      );
      mockStore.getExecutionChainSummary.mockResolvedValueOnce(
        createMockExecutionChainSummary()
      );

      await service.updateSubtaskResult('chain-001', 'subtask-001', 'Result');

      expect(mockStore.updateSubtaskResult).toHaveBeenCalledWith(
        'chain-001',
        'subtask-001',
        'Result',
        'completed'
      );
    });

    it('should report all_complete as false when tasks pending', async () => {
      mockStore.updateSubtaskResult.mockResolvedValueOnce(
        createMockSubtask({ status: 'completed' })
      );
      mockStore.getExecutionChainSummary.mockResolvedValueOnce(
        createMockExecutionChainSummary({
          progress: { total: 3, completed: 2, failed: 0, pending: 1, in_progress: 0 },
        })
      );

      const result = await service.updateSubtaskResult(
        'chain-001',
        'subtask-001',
        'Result'
      );

      expect(result.all_complete).toBe(false);
    });
  });

  // ==========================================================================
  // Results Management
  // ==========================================================================

  describe('mergeResults', () => {
    it('should merge results successfully', async () => {
      const summary = createMockExecutionChainSummary({
        subtasks: [
          createMockSubtask({ order: 0, status: 'completed', result: 'Result 1', description: 'Task 1' }),
          createMockSubtask({ order: 1, status: 'completed', result: 'Result 2', description: 'Task 2' }),
        ],
        progress: { total: 2, completed: 2, failed: 0, pending: 0, in_progress: 0 },
      });
      mockStore.getExecutionChainSummary.mockResolvedValueOnce(summary);

      const result = await service.mergeResults('chain-001');

      expect(result.chain_id).toBe('chain-001');
      expect(result.subtasks_merged).toBe(2);
      expect(result.confidence).toBe(0.9);
      expect(result.aggregated_result).toContain('Result 1');
      expect(result.aggregated_result).toContain('Result 2');
    });

    it('should throw error when chain not found', async () => {
      mockStore.getExecutionChainSummary.mockResolvedValueOnce(null);

      await expect(service.mergeResults('nonexistent')).rejects.toThrow(
        'Execution chain nonexistent not found'
      );
    });

    it('should throw error when no completed subtasks', async () => {
      mockStore.getExecutionChainSummary.mockResolvedValueOnce(
        createMockExecutionChainSummary({
          subtasks: [createMockSubtask({ status: 'pending' })],
          progress: { total: 1, completed: 0, failed: 0, pending: 1, in_progress: 0 },
        })
      );

      await expect(service.mergeResults('chain-001')).rejects.toThrow(
        'No completed subtasks to merge'
      );
    });

    it('should include failed subtasks when includeFailed is true', async () => {
      const summary = createMockExecutionChainSummary({
        subtasks: [
          createMockSubtask({ order: 0, status: 'completed', result: 'Result 1', description: 'Task 1' }),
          createMockSubtask({ order: 1, status: 'failed', result: 'Failed result', description: 'Task 2' }),
        ],
        progress: { total: 2, completed: 1, failed: 1, pending: 0, in_progress: 0 },
      });
      mockStore.getExecutionChainSummary.mockResolvedValueOnce(summary);

      const result = await service.mergeResults('chain-001', true);

      expect(result.subtasks_merged).toBe(2);
      expect(result.aggregated_result).toContain('Failed result');
    });

    it('should exclude failed subtasks by default', async () => {
      const summary = createMockExecutionChainSummary({
        subtasks: [
          createMockSubtask({ order: 0, status: 'completed', result: 'Result 1', description: 'Task 1' }),
          createMockSubtask({ order: 1, status: 'failed', result: 'Failed result', description: 'Task 2' }),
        ],
        progress: { total: 2, completed: 1, failed: 1, pending: 0, in_progress: 0 },
      });
      mockStore.getExecutionChainSummary.mockResolvedValueOnce(summary);

      const result = await service.mergeResults('chain-001', false);

      expect(result.subtasks_merged).toBe(1);
      expect(result.aggregated_result).not.toContain('Failed result');
    });

    it('should reduce confidence when failures exist', async () => {
      const summary = createMockExecutionChainSummary({
        subtasks: [
          createMockSubtask({ order: 0, status: 'completed', result: 'Result 1', description: 'Task 1' }),
          createMockSubtask({ order: 1, status: 'failed', result: 'Failed', description: 'Task 2' }),
        ],
        progress: { total: 2, completed: 1, failed: 1, pending: 0, in_progress: 0 },
      });
      mockStore.getExecutionChainSummary.mockResolvedValueOnce(summary);

      const result = await service.mergeResults('chain-001', true);

      expect(result.confidence).toBe(0.7);
    });

    it('should store merged results', async () => {
      mockStore.getExecutionChainSummary.mockResolvedValueOnce(
        createMockExecutionChainSummary()
      );

      await service.mergeResults('chain-001');

      expect(mockStore.storeMergedResults).toHaveBeenCalled();
    });

    it('should mark chain as completed', async () => {
      mockStore.getExecutionChainSummary.mockResolvedValueOnce(
        createMockExecutionChainSummary()
      );

      await service.mergeResults('chain-001');

      expect(mockStore.updateExecutionContext).toHaveBeenCalledWith('chain-001', {
        status: 'completed',
      });
    });
  });

  // ==========================================================================
  // Verification
  // ==========================================================================

  describe('verifyAnswer', () => {
    it('should verify answer successfully', async () => {
      mockStore.getExecutionContext.mockResolvedValueOnce(
        createMockExecutionContext()
      );
      mockStore.getContextSnippet
        .mockResolvedValueOnce(createMockContextSnippet({ relevance_score: 0.8 }))
        .mockResolvedValueOnce(createMockContextSnippet({ relevance_score: 0.9 }));

      const result = await service.verifyAnswer(
        'chain-001',
        'Found 5 errors',
        ['errors', 'count']
      );

      expect(result.verified).toBe(true);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should throw error when chain not found', async () => {
      mockStore.getExecutionContext.mockResolvedValueOnce(null);

      await expect(
        service.verifyAnswer('nonexistent', 'answer', ['query'])
      ).rejects.toThrow('Execution chain nonexistent not found');
    });

    it('should report not verified when queries not found', async () => {
      mockStore.getExecutionContext.mockResolvedValueOnce(
        createMockExecutionContext()
      );
      mockStore.getContextSnippet
        .mockResolvedValueOnce(createMockContextSnippet({ relevance_score: 0.001 }))
        .mockResolvedValueOnce(createMockContextSnippet({ relevance_score: 0.005 }));

      const result = await service.verifyAnswer(
        'chain-001',
        'Invalid answer',
        ['nonexistent', 'missing']
      );

      expect(result.verified).toBe(false);
      expect(result.discrepancies).toBeDefined();
      expect(result.discrepancies?.length).toBe(2);
    });

    it('should use configurable verification threshold', async () => {
      const customService = new RLMService(
        mockStore as unknown as MemoryStore,
        { verificationThreshold: 0.5 }
      );

      mockStore.getExecutionContext.mockResolvedValueOnce(
        createMockExecutionContext()
      );
      mockStore.getContextSnippet
        .mockResolvedValueOnce(createMockContextSnippet({ relevance_score: 0.8 }))
        .mockResolvedValueOnce(createMockContextSnippet({ relevance_score: 0.001 }));

      const result = await customService.verifyAnswer(
        'chain-001',
        'Answer',
        ['query1', 'query2']
      );

      expect(result.verified).toBe(true); // 50% >= 50% threshold
    });
  });

  // ==========================================================================
  // Status & Monitoring
  // ==========================================================================

  describe('getExecutionStatus', () => {
    it('should return execution status', async () => {
      const expectedSummary = createMockExecutionChainSummary();
      mockStore.getExecutionChainSummary.mockResolvedValueOnce(expectedSummary);

      const result = await service.getExecutionStatus('chain-001');

      expect(result).toEqual(expectedSummary);
      expect(mockStore.getExecutionChainSummary).toHaveBeenCalledWith('chain-001');
    });

    it('should throw error when chain not found', async () => {
      mockStore.getExecutionChainSummary.mockResolvedValueOnce(null);

      await expect(service.getExecutionStatus('nonexistent')).rejects.toThrow(
        'Execution chain nonexistent not found'
      );
    });
  });

  describe('getMergedResults', () => {
    it('should return merged results', async () => {
      const expectedResults = createMockMergedResults();
      mockStore.getMergedResults.mockResolvedValueOnce(expectedResults);

      const result = await service.getMergedResults('chain-001');

      expect(result).toEqual(expectedResults);
      expect(mockStore.getMergedResults).toHaveBeenCalledWith('chain-001');
    });

    it('should return null when not found', async () => {
      mockStore.getMergedResults.mockResolvedValueOnce(null);

      const result = await service.getMergedResults('chain-001');

      expect(result).toBeNull();
    });
  });
});
