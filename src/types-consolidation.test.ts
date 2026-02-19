import { describe, it, expect } from 'vitest';
import {
  ConsolidationConfigSchema,
  TriggerConsolidationSchema,
  GetConsolidationStatusSchema,
  ConsolidationStorageKeys,
} from './types-consolidation.js';

describe('ConsolidationConfigSchema', () => {
  it('should parse with defaults', () => {
    const result = ConsolidationConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data?.similarity_threshold).toBe(0.75);
    expect(result.data?.min_cluster_size).toBe(2);
    expect(result.data?.memory_count_threshold).toBe(100);
    expect(result.data?.max_memories).toBe(1000);
  });

  it('should enforce similarity_threshold range', () => {
    expect(ConsolidationConfigSchema.safeParse({ similarity_threshold: -0.1 }).success).toBe(false);
    expect(ConsolidationConfigSchema.safeParse({ similarity_threshold: 1.1 }).success).toBe(false);
  });
});

describe('TriggerConsolidationSchema', () => {
  it('should parse with no required fields', () => {
    expect(TriggerConsolidationSchema.safeParse({}).success).toBe(true);
  });
});

describe('GetConsolidationStatusSchema', () => {
  it('should parse with no required fields', () => {
    expect(GetConsolidationStatusSchema.safeParse({}).success).toBe(true);
  });
});

describe('ConsolidationStorageKeys', () => {
  it('should generate correct keys', () => {
    expect(ConsolidationStorageKeys.consolidation('ws', 'id1')).toBe('ws:ws:consolidation:id1');
    expect(ConsolidationStorageKeys.consolidations('ws')).toBe('ws:ws:consolidations:all');
    expect(ConsolidationStorageKeys.lastRun('ws')).toBe('ws:ws:consolidations:last_run');
  });
});
