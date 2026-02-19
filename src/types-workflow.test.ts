import { describe, it, expect } from 'vitest';
import {
  WorkflowStatus,
  WorkflowInfoSchema,
  StartWorkflowSchema,
  ListWorkflowsSchema,
  GetWorkflowContextSchema,
  WorkflowStorageKeys,
} from './types-workflow.js';

describe('WorkflowStatus', () => {
  it('should accept valid statuses', () => {
    for (const s of ['active','paused','completed']) {
      expect(WorkflowStatus.safeParse(s).success).toBe(true);
    }
  });
  it('should reject invalid status', () => {
    expect(WorkflowStatus.safeParse('unknown').success).toBe(false);
  });
});

describe('StartWorkflowSchema', () => {
  it('should require name', () => {
    expect(StartWorkflowSchema.safeParse({}).success).toBe(false);
    expect(StartWorkflowSchema.safeParse({ name: 'My feature' }).success).toBe(true);
  });
  it('should enforce name max length', () => {
    expect(StartWorkflowSchema.safeParse({ name: 'x'.repeat(201) }).success).toBe(false);
  });
});

describe('ListWorkflowsSchema', () => {
  it('should parse with no required fields', () => {
    expect(ListWorkflowsSchema.safeParse({}).success).toBe(true);
  });
  it('should default limit to 20', () => {
    const result = ListWorkflowsSchema.safeParse({});
    expect(result.data?.limit).toBe(20);
  });
});

describe('GetWorkflowContextSchema', () => {
  it('should default max_tokens to 500', () => {
    const result = GetWorkflowContextSchema.safeParse({});
    expect(result.data?.max_tokens).toBe(500);
  });
});

describe('WorkflowStorageKeys', () => {
  it('should generate correct keys', () => {
    expect(WorkflowStorageKeys.workflow('ws', 'id1')).toBe('ws:ws:workflow:id1');
    expect(WorkflowStorageKeys.workflows('ws')).toBe('ws:ws:workflows:all');
    expect(WorkflowStorageKeys.workflowActive('ws')).toBe('ws:ws:workflow:active');
    expect(WorkflowStorageKeys.workflowMemories('ws', 'id1')).toBe('ws:ws:workflow:id1:memories');
  });
});
