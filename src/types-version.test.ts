import { describe, it, expect } from 'vitest';
import {
  MemoryVersionSchema,
  GetMemoryHistorySchema,
  RollbackMemorySchema,
} from './types-version.js';

describe('MemoryVersionSchema', () => {
  it('should validate a complete version', () => {
    const result = MemoryVersionSchema.safeParse({
      version_id: '01HXYZ',
      memory_id: 'mem-1',
      content: 'some content',
      context_type: 'information',
      importance: 5,
      created_at: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it('should apply default created_by', () => {
    const result = MemoryVersionSchema.safeParse({
      version_id: '01HXYZ', memory_id: 'mem-1',
      content: 'x', context_type: 'information',
      importance: 5, created_at: new Date().toISOString(),
    });
    expect(result.data?.created_by).toBe('user');
  });
});

describe('GetMemoryHistorySchema', () => {
  it('should require memory_id', () => {
    expect(GetMemoryHistorySchema.safeParse({}).success).toBe(false);
    expect(GetMemoryHistorySchema.safeParse({ memory_id: 'id1' }).success).toBe(true);
  });
  it('should default limit to 50', () => {
    const result = GetMemoryHistorySchema.safeParse({ memory_id: 'id1' });
    expect(result.data?.limit).toBe(50);
  });
});

describe('RollbackMemorySchema', () => {
  it('should require memory_id and version_id', () => {
    expect(RollbackMemorySchema.safeParse({}).success).toBe(false);
    expect(RollbackMemorySchema.safeParse({ memory_id: 'id1', version_id: 'v1' }).success).toBe(true);
  });
  it('should default preserve_relationships to true', () => {
    const result = RollbackMemorySchema.safeParse({ memory_id: 'id1', version_id: 'v1' });
    expect(result.data?.preserve_relationships).toBe(true);
  });
});
