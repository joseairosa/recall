import { describe, it, expect } from 'vitest';
import {
  ContextType,
  MemoryEntrySchema,
  CreateMemorySchema,
  BatchCreateMemoriesSchema,
  UpdateMemorySchema,
  DeleteMemorySchema,
  SearchOutputMode,
  SearchMemorySchema,
  WorkspaceMode,
  createWorkspaceId,
  getWorkspaceMode,
} from './types-core.js';

describe('ContextType', () => {
  it('should accept all valid context types', () => {
    const valid = ['directive','information','heading','decision','code_pattern','requirement','error','todo','insight','preference'];
    for (const t of valid) {
      expect(ContextType.safeParse(t).success).toBe(true);
    }
  });

  it('should reject invalid context type', () => {
    expect(ContextType.safeParse('unknown').success).toBe(false);
  });
});

describe('MemoryEntrySchema', () => {
  it('should validate a complete memory entry', () => {
    const result = MemoryEntrySchema.safeParse({
      id: '01HXYZ12345',
      timestamp: Date.now(),
      context_type: 'information',
      content: 'Test memory',
      tags: [],
      importance: 5,
      is_global: false,
      workspace_id: 'ws-test',
    });
    expect(result.success).toBe(true);
  });

  it('should enforce importance range 1-10', () => {
    const base = { id: '01HXYZ', timestamp: Date.now(), context_type: 'information', content: 'x', is_global: false, workspace_id: 'ws' };
    expect(MemoryEntrySchema.safeParse({ ...base, importance: 0 }).success).toBe(false);
    expect(MemoryEntrySchema.safeParse({ ...base, importance: 11 }).success).toBe(false);
    expect(MemoryEntrySchema.safeParse({ ...base, importance: 5 }).success).toBe(true);
  });
});

describe('CreateMemorySchema', () => {
  it('should require non-empty content', () => {
    expect(CreateMemorySchema.safeParse({ content: '' }).success).toBe(false);
    expect(CreateMemorySchema.safeParse({ content: 'valid' }).success).toBe(true);
  });

  it('should apply defaults', () => {
    const result = CreateMemorySchema.safeParse({ content: 'test' });
    expect(result.success).toBe(true);
    expect(result.data?.context_type).toBe('information');
    expect(result.data?.importance).toBe(5);
    expect(result.data?.is_global).toBe(false);
  });
});

describe('BatchCreateMemoriesSchema', () => {
  it('should require at least one memory', () => {
    expect(BatchCreateMemoriesSchema.safeParse({ memories: [] }).success).toBe(false);
    expect(BatchCreateMemoriesSchema.safeParse({ memories: [{ content: 'x' }] }).success).toBe(true);
  });
});

describe('UpdateMemorySchema', () => {
  it('should require memory_id', () => {
    expect(UpdateMemorySchema.safeParse({}).success).toBe(false);
    expect(UpdateMemorySchema.safeParse({ memory_id: 'id-1' }).success).toBe(true);
  });
});

describe('DeleteMemorySchema', () => {
  it('should require memory_id', () => {
    expect(DeleteMemorySchema.safeParse({}).success).toBe(false);
    expect(DeleteMemorySchema.safeParse({ memory_id: 'id-1' }).success).toBe(true);
  });
});

describe('SearchOutputMode', () => {
  it('should accept valid modes', () => {
    for (const mode of ['full', 'summary', 'compact']) {
      expect(SearchOutputMode.safeParse(mode).success).toBe(true);
    }
  });
});

describe('SearchMemorySchema', () => {
  it('should require query', () => {
    expect(SearchMemorySchema.safeParse({}).success).toBe(false);
    expect(SearchMemorySchema.safeParse({ query: 'test' }).success).toBe(true);
  });

  it('should apply default output_mode', () => {
    const result = SearchMemorySchema.safeParse({ query: 'test' });
    expect(result.data?.output_mode).toBe('summary');
  });
});

describe('WorkspaceMode', () => {
  it('should have all three modes', () => {
    expect(WorkspaceMode.ISOLATED).toBe('isolated');
    expect(WorkspaceMode.GLOBAL).toBe('global');
    expect(WorkspaceMode.HYBRID).toBe('hybrid');
  });
});

describe('createWorkspaceId', () => {
  it('should return a consistent hash for the same path', () => {
    const id1 = createWorkspaceId('/some/path');
    const id2 = createWorkspaceId('/some/path');
    expect(id1).toBe(id2);
  });

  it('should return different hashes for different paths', () => {
    const id1 = createWorkspaceId('/path/a');
    const id2 = createWorkspaceId('/path/b');
    expect(id1).not.toBe(id2);
  });
});

describe('getWorkspaceMode', () => {
  it('should return ISOLATED by default', () => {
    delete process.env.WORKSPACE_MODE;
    expect(getWorkspaceMode()).toBe(WorkspaceMode.ISOLATED);
  });

  it('should return GLOBAL when env is set', () => {
    process.env.WORKSPACE_MODE = 'global';
    expect(getWorkspaceMode()).toBe(WorkspaceMode.GLOBAL);
    delete process.env.WORKSPACE_MODE;
  });
});
