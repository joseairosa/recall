/**
 * MemoryStore Mock
 *
 * Mock implementation of MemoryStore for unit testing.
 * Provides controlled responses and spy functionality.
 *
 * @version 1.8.0
 */

import { vi } from 'vitest';
import {
  type ExecutionContext,
  type Subtask,
  type SubtaskStatus,
  type ExecutionChainSummary,
  type ContextSnippet,
  type MergedResults,
} from '../types.js';

/**
 * Creates a mock ExecutionContext with default values
 */
export function createMockExecutionContext(
  overrides: Partial<ExecutionContext> = {}
): ExecutionContext {
  return {
    chain_id: 'test-chain-001',
    depth: 0,
    status: 'active',
    original_task: 'Test task',
    context_ref: 'ref-001',
    strategy: 'chunk',
    estimated_tokens: 10000,
    created_at: Date.now(),
    updated_at: Date.now(),
    ...overrides,
  };
}

/**
 * Creates a mock Subtask with default values
 */
export function createMockSubtask(overrides: Partial<Subtask> = {}): Subtask {
  return {
    id: 'subtask-001',
    chain_id: 'test-chain-001',
    order: 0,
    description: 'Process chunk 1 of 5',
    status: 'pending',
    memory_ids: [],
    created_at: Date.now(),
    ...overrides,
  };
}

/**
 * Creates a mock ContextSnippet with default values
 */
export function createMockContextSnippet(
  overrides: Partial<ContextSnippet> = {}
): ContextSnippet {
  return {
    snippet: 'This is a test snippet from the context.',
    relevance_score: 0.85,
    tokens_used: 500,
    ...overrides,
  };
}

/**
 * Creates a mock ExecutionChainSummary with default values
 */
export function createMockExecutionChainSummary(
  overrides: Partial<ExecutionChainSummary> = {}
): ExecutionChainSummary {
  const defaultContext = createMockExecutionContext();
  const defaultSubtasks = [
    createMockSubtask({ id: 'subtask-001', order: 0, status: 'completed', result: 'Result 1' }),
    createMockSubtask({ id: 'subtask-002', order: 1, status: 'completed', result: 'Result 2' }),
    createMockSubtask({ id: 'subtask-003', order: 2, status: 'pending' }),
  ];

  return {
    context: defaultContext,
    subtasks: defaultSubtasks,
    progress: {
      total: 3,
      completed: 2,
      failed: 0,
      pending: 1,
      in_progress: 0,
    },
    estimated_remaining_tokens: 2000,
    ...overrides,
  };
}

/**
 * Creates a mock MergedResults with default values
 */
export function createMockMergedResults(
  overrides: Partial<MergedResults> = {}
): MergedResults {
  return {
    aggregated_result: '[Subtask 1]\nResult 1\n\n---\n\n[Subtask 2]\nResult 2',
    confidence: 0.9,
    source_coverage: 0.75,
    subtasks_completed: 3,
    subtasks_total: 3,
    ...overrides,
  };
}

/**
 * MockMemoryStore class
 *
 * Provides a fully mockable MemoryStore for testing RLMService
 */
export class MockMemoryStore {
  // Execution context methods
  createExecutionContext = vi.fn().mockImplementation(
    async (
      task: string,
      _context: string,
      _maxDepth: number,
      parentChainId?: string
    ): Promise<ExecutionContext> => {
      return createMockExecutionContext({
        original_task: task,
        depth: 0,
        parent_chain_id: parentChainId,
      });
    }
  );

  getExecutionContext = vi.fn().mockImplementation(
    async (_chainId: string): Promise<ExecutionContext | null> => createMockExecutionContext()
  );

  updateExecutionContext = vi.fn().mockImplementation(
    async (
      _chainId: string,
      updates: Partial<{ status: string; error_message: string }>
    ): Promise<ExecutionContext | null> => {
      return createMockExecutionContext({ ...updates } as Partial<ExecutionContext>);
    }
  );

  // Subtask methods
  createSubtasks = vi.fn().mockImplementation(
    async (
      chainId: string,
      definitions: Array<{ description: string; query?: string }>
    ): Promise<Subtask[]> => {
      return definitions.map((def, index) =>
        createMockSubtask({
          id: `subtask-${String(index + 1).padStart(3, '0')}`,
          chain_id: chainId,
          order: index,
          description: def.description,
          query: def.query,
        })
      );
    }
  );

  getSubtask = vi.fn().mockImplementation(
    async (_chainId: string, _subtaskId: string): Promise<Subtask | null> => createMockSubtask()
  );

  getSubtasks = vi.fn().mockImplementation(
    async (_chainId: string): Promise<Subtask[]> => [
      createMockSubtask({ id: 'subtask-001', order: 0 }),
      createMockSubtask({ id: 'subtask-002', order: 1 }),
    ]
  );

  updateSubtaskResult = vi.fn().mockImplementation(
    async (
      chainId: string,
      subtaskId: string,
      result: string,
      status: SubtaskStatus,
      tokensUsed?: number,
      _memoryIds?: string[]
    ): Promise<Subtask | null> => {
      return createMockSubtask({
        id: subtaskId,
        chain_id: chainId,
        status,
        result,
        tokens_used: tokensUsed,
      });
    }
  );

  // Context snippet methods
  getContextSnippet = vi.fn().mockImplementation(
    async (
      _chainId: string,
      _query: string,
      _maxTokens: number
    ): Promise<ContextSnippet | null> => createMockContextSnippet()
  );

  getExecutionContextData = vi.fn().mockImplementation(
    async (_chainId: string): Promise<string | null> =>
      'This is the raw context data for testing purposes.'
  );

  // Results methods
  getExecutionChainSummary = vi.fn().mockImplementation(
    async (_chainId: string): Promise<ExecutionChainSummary | null> =>
      createMockExecutionChainSummary()
  );

  storeMergedResults = vi.fn().mockImplementation(
    async (_chainId: string, _results: MergedResults): Promise<void> => {}
  );

  getMergedResults = vi.fn().mockImplementation(
    async (_chainId: string): Promise<MergedResults | null> => createMockMergedResults()
  );

  // Chain management
  listExecutionChains = vi.fn().mockImplementation(
    async (_status?: string, _limit?: number): Promise<ExecutionContext[]> => [
      createMockExecutionContext(),
    ]
  );

  deleteExecutionChain = vi.fn().mockImplementation(
    async (_chainId: string): Promise<boolean> => true
  );

  /**
   * Resets all mocks to their initial state
   */
  reset(): void {
    this.createExecutionContext.mockClear();
    this.getExecutionContext.mockClear();
    this.updateExecutionContext.mockClear();
    this.createSubtasks.mockClear();
    this.getSubtask.mockClear();
    this.getSubtasks.mockClear();
    this.updateSubtaskResult.mockClear();
    this.getContextSnippet.mockClear();
    this.getExecutionContextData.mockClear();
    this.getExecutionChainSummary.mockClear();
    this.storeMergedResults.mockClear();
    this.getMergedResults.mockClear();
    this.listExecutionChains.mockClear();
    this.deleteExecutionChain.mockClear();
  }
}

/**
 * Creates a fresh MockMemoryStore instance
 */
export function createMockMemoryStore(): MockMemoryStore {
  return new MockMemoryStore();
}
