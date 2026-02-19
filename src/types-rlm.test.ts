import { describe, it, expect } from 'vitest';
import {
  ExecutionStatus,
  DecompositionStrategy,
  SubtaskStatus,
  ExecutionContextSchema,
  SubtaskSchema,
  CreateExecutionContextSchema,
  RLMStorageKeys,
} from './types-rlm.js';

describe('ExecutionStatus', () => {
  it('should accept valid statuses', () => {
    for (const s of ['active','completed','failed','paused']) {
      expect(ExecutionStatus.safeParse(s).success).toBe(true);
    }
  });
});

describe('DecompositionStrategy', () => {
  it('should accept valid strategies', () => {
    for (const s of ['filter','chunk','recursive','aggregate']) {
      expect(DecompositionStrategy.safeParse(s).success).toBe(true);
    }
  });
});

describe('SubtaskStatus', () => {
  it('should accept valid statuses', () => {
    for (const s of ['pending','in_progress','completed','failed','skipped']) {
      expect(SubtaskStatus.safeParse(s).success).toBe(true);
    }
  });
});

describe('ExecutionContextSchema', () => {
  it('should validate minimal context', () => {
    const result = ExecutionContextSchema.safeParse({
      chain_id: '01HXYZ', status: 'active',
      original_task: 'test', context_ref: 'ref',
      created_at: Date.now(), updated_at: Date.now(),
    });
    expect(result.success).toBe(true);
    expect(result.data?.depth).toBe(0);
  });
});

describe('SubtaskSchema', () => {
  it('should require required fields', () => {
    const result = SubtaskSchema.safeParse({
      id: '01HXYZ', chain_id: 'chain-1',
      order: 0, description: 'Process', status: 'pending',
      created_at: Date.now(),
    });
    expect(result.success).toBe(true);
    expect(result.data?.memory_ids).toEqual([]);
  });
});

describe('CreateExecutionContextSchema', () => {
  it('should require task and context', () => {
    expect(CreateExecutionContextSchema.safeParse({}).success).toBe(false);
    expect(CreateExecutionContextSchema.safeParse({ task: 'test', context: 'content' }).success).toBe(true);
  });
});

describe('RLMStorageKeys', () => {
  it('should generate correct keys', () => {
    expect(RLMStorageKeys.execution('ws', 'chain-1')).toBe('ws:ws:execution:chain-1');
    expect(RLMStorageKeys.executions('ws')).toBe('ws:ws:executions:all');
    expect(RLMStorageKeys.globalExecution('chain-1')).toBe('global:execution:chain-1');
  });
});
