import { describe, it, expect } from 'vitest';
import {
  ExportMemoriesSchema,
  ImportMemoriesSchema,
  FindDuplicatesSchema,
  ConsolidateMemoriesSchema,
  StorageKeys,
  getMemoryKey,
  ConvertToGlobalSchema,
  ConvertToWorkspaceSchema,
} from './types-maintenance.js';

describe('ExportMemoriesSchema', () => {
  it('should parse with no required fields', () => {
    expect(ExportMemoriesSchema.safeParse({}).success).toBe(true);
  });
  it('should default format to json', () => {
    const result = ExportMemoriesSchema.safeParse({});
    expect(result.data?.format).toBe('json');
  });
});

describe('ImportMemoriesSchema', () => {
  it('should require data', () => {
    expect(ImportMemoriesSchema.safeParse({}).success).toBe(false);
    expect(ImportMemoriesSchema.safeParse({ data: '{}' }).success).toBe(true);
  });
});

describe('FindDuplicatesSchema', () => {
  it('should parse with defaults', () => {
    const result = FindDuplicatesSchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data?.similarity_threshold).toBe(0.85);
    expect(result.data?.auto_merge).toBe(false);
  });
});

describe('ConsolidateMemoriesSchema', () => {
  it('should require at least 2 memory_ids', () => {
    expect(ConsolidateMemoriesSchema.safeParse({ memory_ids: ['a'] }).success).toBe(false);
    expect(ConsolidateMemoriesSchema.safeParse({ memory_ids: ['a', 'b'] }).success).toBe(true);
  });
});

describe('StorageKeys', () => {
  const ws = 'test-ws';
  it('should generate workspace-scoped memory key', () => {
    expect(StorageKeys.memory(ws, 'id1')).toBe('ws:test-ws:memory:id1');
  });
  it('should generate global memory key', () => {
    expect(StorageKeys.globalMemory('id1')).toBe('global:memory:id1');
  });
  it('should generate timeline key', () => {
    expect(StorageKeys.timeline(ws)).toBe('ws:test-ws:memories:timeline');
  });
});

describe('getMemoryKey', () => {
  it('should return global key when is_global is true', () => {
    expect(getMemoryKey('ws', 'id1', true)).toBe('global:memory:id1');
  });
  it('should return workspace key when is_global is false', () => {
    expect(getMemoryKey('ws', 'id1', false)).toBe('ws:ws:memory:id1');
  });
});

describe('ConvertToGlobalSchema', () => {
  it('should require memory_id', () => {
    expect(ConvertToGlobalSchema.safeParse({}).success).toBe(false);
    expect(ConvertToGlobalSchema.safeParse({ memory_id: 'id1' }).success).toBe(true);
  });
});

describe('ConvertToWorkspaceSchema', () => {
  it('should require memory_id', () => {
    expect(ConvertToWorkspaceSchema.safeParse({}).success).toBe(false);
    expect(ConvertToWorkspaceSchema.safeParse({ memory_id: 'id1' }).success).toBe(true);
  });
});
