import { describe, it, expect } from 'vitest';
import {
  RelationshipType,
  MemoryRelationshipSchema,
  LinkMemoriesSchema,
  GetRelatedMemoriesSchema,
  UnlinkMemoriesSchema,
  GetMemoryGraphSchema,
} from './types-relationship.js';

describe('RelationshipType', () => {
  it('should have all expected values', () => {
    const values = ['relates_to','parent_of','child_of','references','supersedes','implements','example_of'];
    for (const v of values) {
      expect(Object.values(RelationshipType)).toContain(v);
    }
  });
});

describe('LinkMemoriesSchema', () => {
  it('should require from_memory_id, to_memory_id, relationship_type', () => {
    expect(LinkMemoriesSchema.safeParse({}).success).toBe(false);
    expect(LinkMemoriesSchema.safeParse({
      from_memory_id: 'a', to_memory_id: 'b', relationship_type: RelationshipType.RELATES_TO
    }).success).toBe(true);
  });
});

describe('GetRelatedMemoriesSchema', () => {
  it('should require memory_id', () => {
    expect(GetRelatedMemoriesSchema.safeParse({}).success).toBe(false);
  });
  it('should apply defaults', () => {
    const result = GetRelatedMemoriesSchema.safeParse({ memory_id: 'id1' });
    expect(result.data?.depth).toBe(1);
    expect(result.data?.direction).toBe('both');
  });
});

describe('UnlinkMemoriesSchema', () => {
  it('should require relationship_id', () => {
    expect(UnlinkMemoriesSchema.safeParse({}).success).toBe(false);
    expect(UnlinkMemoriesSchema.safeParse({ relationship_id: 'rel-1' }).success).toBe(true);
  });
});

describe('GetMemoryGraphSchema', () => {
  it('should require memory_id', () => {
    expect(GetMemoryGraphSchema.safeParse({}).success).toBe(false);
  });
  it('should apply defaults', () => {
    const result = GetMemoryGraphSchema.safeParse({ memory_id: 'id1' });
    expect(result.data?.max_depth).toBe(2);
    expect(result.data?.max_nodes).toBe(50);
  });

  it('should enforce max_depth range', () => {
    expect(GetMemoryGraphSchema.safeParse({ memory_id: 'id1', max_depth: 5 }).success).toBe(false);
    expect(GetMemoryGraphSchema.safeParse({ memory_id: 'id1', max_depth: 3 }).success).toBe(true);
  });
});
