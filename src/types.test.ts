/**
 * RLM Types and Schemas Tests
 *
 * Unit tests for RLM type definitions and Zod schemas.
 *
 * @version 1.8.0
 */

import { describe, it, expect } from 'vitest';
import {
  ExecutionStatus,
  DecompositionStrategy,
  SubtaskStatus,
  ExecutionContextSchema,
  SubtaskSchema,
  CreateExecutionContextSchema,
  DecomposeTaskSchema,
  InjectContextSnippetSchema,
  MergeResultsSchema,
  VerifyAnswerSchema,
  UpdateSubtaskResultSchema,
  GetExecutionStatusSchema,
  RLMStorageKeys,
} from './types.js';

describe('RLM Type Enums', () => {
  describe('ExecutionStatus', () => {
    it('should have all expected values', () => {
      const parsed = ExecutionStatus.safeParse('active');
      expect(parsed.success).toBe(true);
      expect(parsed.data).toBe('active');
    });

    it('should accept all valid statuses', () => {
      const validStatuses = ['active', 'completed', 'failed', 'paused'];
      for (const status of validStatuses) {
        expect(ExecutionStatus.safeParse(status).success).toBe(true);
      }
    });

    it('should reject invalid status', () => {
      const result = ExecutionStatus.safeParse('invalid');
      expect(result.success).toBe(false);
    });
  });

  describe('DecompositionStrategy', () => {
    it('should have all expected values', () => {
      const validStrategies = ['filter', 'chunk', 'recursive', 'aggregate'];
      for (const strategy of validStrategies) {
        expect(DecompositionStrategy.safeParse(strategy).success).toBe(true);
      }
    });

    it('should reject invalid strategy', () => {
      const result = DecompositionStrategy.safeParse('unknown');
      expect(result.success).toBe(false);
    });
  });

  describe('SubtaskStatus', () => {
    it('should have all expected values', () => {
      const validStatuses = ['pending', 'in_progress', 'completed', 'failed', 'skipped'];
      for (const status of validStatuses) {
        expect(SubtaskStatus.safeParse(status).success).toBe(true);
      }
    });

    it('should reject invalid status', () => {
      const result = SubtaskStatus.safeParse('unknown');
      expect(result.success).toBe(false);
    });
  });
});

describe('RLM Schemas', () => {
  describe('ExecutionContextSchema', () => {
    it('should validate a complete execution context', () => {
      const validContext = {
        chain_id: '01HXYZ12345',
        depth: 0,
        status: 'active',
        original_task: 'Analyze this log file',
        context_ref: 'ref-001',
        strategy: 'filter',
        estimated_tokens: 50000,
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      const result = ExecutionContextSchema.safeParse(validContext);
      expect(result.success).toBe(true);
    });

    it('should validate context with optional fields missing', () => {
      const minimalContext = {
        chain_id: '01HXYZ12345',
        status: 'active',
        original_task: 'Analyze this log file',
        context_ref: 'ref-001',
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      const result = ExecutionContextSchema.safeParse(minimalContext);
      expect(result.success).toBe(true);
      expect(result.data?.depth).toBe(0); // Default value
    });

    it('should enforce max depth of 5', () => {
      const contextWithHighDepth = {
        chain_id: '01HXYZ12345',
        depth: 10, // Exceeds max
        status: 'active',
        original_task: 'Test',
        context_ref: 'ref-001',
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      const result = ExecutionContextSchema.safeParse(contextWithHighDepth);
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const incompleteContext = {
        chain_id: '01HXYZ12345',
        // Missing status, original_task, context_ref, timestamps
      };

      const result = ExecutionContextSchema.safeParse(incompleteContext);
      expect(result.success).toBe(false);
    });
  });

  describe('SubtaskSchema', () => {
    it('should validate a complete subtask', () => {
      const validSubtask = {
        id: '01HXYZ12345',
        chain_id: 'chain-001',
        order: 0,
        description: 'Process first chunk',
        status: 'pending',
        query: 'ERROR',
        result: 'Found 5 errors',
        memory_ids: ['mem-001', 'mem-002'],
        tokens_used: 1500,
        created_at: Date.now(),
        completed_at: Date.now(),
      };

      const result = SubtaskSchema.safeParse(validSubtask);
      expect(result.success).toBe(true);
    });

    it('should apply default values', () => {
      const minimalSubtask = {
        id: '01HXYZ12345',
        chain_id: 'chain-001',
        order: 0,
        description: 'Process chunk',
        status: 'pending',
        created_at: Date.now(),
      };

      const result = SubtaskSchema.safeParse(minimalSubtask);
      expect(result.success).toBe(true);
      expect(result.data?.memory_ids).toEqual([]); // Default empty array
    });

    it('should reject negative order', () => {
      const invalidSubtask = {
        id: '01HXYZ12345',
        chain_id: 'chain-001',
        order: -1,
        description: 'Invalid order',
        status: 'pending',
        created_at: Date.now(),
      };

      const result = SubtaskSchema.safeParse(invalidSubtask);
      expect(result.success).toBe(false);
    });
  });

  describe('CreateExecutionContextSchema', () => {
    it('should validate valid input', () => {
      const validInput = {
        task: 'Analyze log files for errors',
        context: 'ERROR: Something went wrong...',
        max_depth: 3,
      };

      const result = CreateExecutionContextSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should apply default max_depth', () => {
      const inputWithoutDepth = {
        task: 'Analyze log files',
        context: 'Log content here...',
      };

      const result = CreateExecutionContextSchema.safeParse(inputWithoutDepth);
      expect(result.success).toBe(true);
      expect(result.data?.max_depth).toBe(3);
    });

    it('should reject empty task', () => {
      const invalidInput = {
        task: '',
        context: 'Some content',
      };

      const result = CreateExecutionContextSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject empty context', () => {
      const invalidInput = {
        task: 'Analyze something',
        context: '',
      };

      const result = CreateExecutionContextSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should enforce max_depth limits', () => {
      const invalidInput = {
        task: 'Test',
        context: 'Content',
        max_depth: 10, // Exceeds max
      };

      const result = CreateExecutionContextSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  describe('DecomposeTaskSchema', () => {
    it('should validate valid input', () => {
      const validInput = {
        chain_id: 'chain-001',
        strategy: 'filter',
        num_chunks: 5,
      };

      const result = DecomposeTaskSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should allow optional fields', () => {
      const minimalInput = {
        chain_id: 'chain-001',
      };

      const result = DecomposeTaskSchema.safeParse(minimalInput);
      expect(result.success).toBe(true);
    });

    it('should enforce num_chunks limits', () => {
      const tooFewChunks = {
        chain_id: 'chain-001',
        num_chunks: 1,
      };

      expect(DecomposeTaskSchema.safeParse(tooFewChunks).success).toBe(false);

      const tooManyChunks = {
        chain_id: 'chain-001',
        num_chunks: 50,
      };

      expect(DecomposeTaskSchema.safeParse(tooManyChunks).success).toBe(false);
    });
  });

  describe('InjectContextSnippetSchema', () => {
    it('should validate valid input', () => {
      const validInput = {
        chain_id: 'chain-001',
        subtask_id: 'subtask-001',
        query: 'ERROR',
        max_tokens: 4000,
      };

      const result = InjectContextSnippetSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should apply default max_tokens', () => {
      const inputWithoutTokens = {
        chain_id: 'chain-001',
        subtask_id: 'subtask-001',
        query: 'ERROR',
      };

      const result = InjectContextSnippetSchema.safeParse(inputWithoutTokens);
      expect(result.success).toBe(true);
      expect(result.data?.max_tokens).toBe(4000);
    });

    it('should enforce max_tokens limits', () => {
      const tooFewTokens = {
        chain_id: 'chain-001',
        subtask_id: 'subtask-001',
        query: 'ERROR',
        max_tokens: 50, // Below minimum
      };

      expect(InjectContextSnippetSchema.safeParse(tooFewTokens).success).toBe(false);

      const tooManyTokens = {
        chain_id: 'chain-001',
        subtask_id: 'subtask-001',
        query: 'ERROR',
        max_tokens: 10000, // Above maximum
      };

      expect(InjectContextSnippetSchema.safeParse(tooManyTokens).success).toBe(false);
    });
  });

  describe('MergeResultsSchema', () => {
    it('should validate valid input', () => {
      const validInput = {
        chain_id: 'chain-001',
        include_failed: true,
      };

      const result = MergeResultsSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should apply default include_failed', () => {
      const inputWithoutFlag = {
        chain_id: 'chain-001',
      };

      const result = MergeResultsSchema.safeParse(inputWithoutFlag);
      expect(result.success).toBe(true);
      expect(result.data?.include_failed).toBe(false);
    });
  });

  describe('VerifyAnswerSchema', () => {
    it('should validate valid input', () => {
      const validInput = {
        chain_id: 'chain-001',
        answer: 'Found 5 errors in the logs',
        verification_queries: ['ERROR', 'count', 'logs'],
      };

      const result = VerifyAnswerSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should require at least one verification query', () => {
      const invalidInput = {
        chain_id: 'chain-001',
        answer: 'Some answer',
        verification_queries: [], // Empty array
      };

      const result = VerifyAnswerSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  describe('UpdateSubtaskResultSchema', () => {
    it('should validate valid input', () => {
      const validInput = {
        chain_id: 'chain-001',
        subtask_id: 'subtask-001',
        result: 'Analysis complete',
        status: 'completed',
      };

      const result = UpdateSubtaskResultSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should allow optional status', () => {
      const inputWithoutStatus = {
        chain_id: 'chain-001',
        subtask_id: 'subtask-001',
        result: 'Analysis complete',
      };

      const result = UpdateSubtaskResultSchema.safeParse(inputWithoutStatus);
      expect(result.success).toBe(true);
    });
  });

  describe('GetExecutionStatusSchema', () => {
    it('should validate valid input', () => {
      const validInput = {
        chain_id: 'chain-001',
        include_subtasks: true,
      };

      const result = GetExecutionStatusSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should apply default include_subtasks', () => {
      const inputWithoutFlag = {
        chain_id: 'chain-001',
      };

      const result = GetExecutionStatusSchema.safeParse(inputWithoutFlag);
      expect(result.success).toBe(true);
      expect(result.data?.include_subtasks).toBe(true);
    });
  });
});

describe('RLMStorageKeys', () => {
  const workspace = 'test-workspace';
  const chainId = 'chain-001';
  const subtaskId = 'subtask-001';

  it('should generate correct execution key', () => {
    const key = RLMStorageKeys.execution(workspace, chainId);
    expect(key).toBe('ws:test-workspace:execution:chain-001');
  });

  it('should generate correct executions key', () => {
    const key = RLMStorageKeys.executions(workspace);
    expect(key).toBe('ws:test-workspace:executions:all');
  });

  it('should generate correct executionSubtasks key', () => {
    const key = RLMStorageKeys.executionSubtasks(workspace, chainId);
    expect(key).toBe('ws:test-workspace:execution:chain-001:subtasks');
  });

  it('should generate correct executionSubtask key', () => {
    const key = RLMStorageKeys.executionSubtask(workspace, chainId, subtaskId);
    expect(key).toBe('ws:test-workspace:execution:chain-001:subtask:subtask-001');
  });

  it('should generate correct executionResults key', () => {
    const key = RLMStorageKeys.executionResults(workspace, chainId);
    expect(key).toBe('ws:test-workspace:execution:chain-001:results');
  });

  it('should generate correct executionContext key', () => {
    const key = RLMStorageKeys.executionContext(workspace, chainId);
    expect(key).toBe('ws:test-workspace:execution:chain-001:context');
  });

  it('should generate correct executionActive key', () => {
    const key = RLMStorageKeys.executionActive(workspace);
    expect(key).toBe('ws:test-workspace:executions:active');
  });

  it('should generate correct globalExecution key', () => {
    const key = RLMStorageKeys.globalExecution(chainId);
    expect(key).toBe('global:execution:chain-001');
  });

  it('should generate correct globalExecutions key', () => {
    const key = RLMStorageKeys.globalExecutions();
    expect(key).toBe('global:executions:all');
  });
});
