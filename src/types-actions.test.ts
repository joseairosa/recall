import { describe, it, expect } from 'vitest';
import {
  MemoryGraphActionSchema,
  MemoryTemplateActionSchema,
  MemoryCategoryActionSchema,
  RLMProcessActionSchema,
  WorkflowActionSchema,
  MemoryMaintainActionSchema,
} from './types-actions.js';
import { RelationshipType } from './types-relationship.js';

describe('MemoryGraphActionSchema', () => {
  it('should validate link action', () => {
    const result = MemoryGraphActionSchema.safeParse({
      action: 'link', from_memory_id: 'a', to_memory_id: 'b',
      relationship_type: RelationshipType.RELATES_TO,
    });
    expect(result.success).toBe(true);
  });
  it('should validate unlink action', () => {
    expect(MemoryGraphActionSchema.safeParse({ action: 'unlink', relationship_id: 'rel-1' }).success).toBe(true);
  });
  it('should validate graph action', () => {
    expect(MemoryGraphActionSchema.safeParse({ action: 'graph', memory_id: 'id1' }).success).toBe(true);
  });
  it('should reject unknown action', () => {
    expect(MemoryGraphActionSchema.safeParse({ action: 'unknown' }).success).toBe(false);
  });
});

describe('MemoryTemplateActionSchema', () => {
  it('should validate create action', () => {
    expect(MemoryTemplateActionSchema.safeParse({
      action: 'create', name: 'tmpl', content_template: 'Hello {{name}}'
    }).success).toBe(true);
  });
  it('should validate list action', () => {
    expect(MemoryTemplateActionSchema.safeParse({ action: 'list' }).success).toBe(true);
  });
  it('should validate use action', () => {
    expect(MemoryTemplateActionSchema.safeParse({
      action: 'use', template_id: 'tmpl-1', variables: { name: 'test' }
    }).success).toBe(true);
  });
});

describe('MemoryCategoryActionSchema', () => {
  it('should validate set action', () => {
    expect(MemoryCategoryActionSchema.safeParse({ action: 'set', memory_id: 'id1', category: 'work' }).success).toBe(true);
  });
  it('should validate list action', () => {
    expect(MemoryCategoryActionSchema.safeParse({ action: 'list' }).success).toBe(true);
  });
  it('should validate get action', () => {
    expect(MemoryCategoryActionSchema.safeParse({ action: 'get', category: 'work' }).success).toBe(true);
  });
});

describe('RLMProcessActionSchema', () => {
  it('should validate check action', () => {
    expect(RLMProcessActionSchema.safeParse({ action: 'check', content: 'some content', task: 'analyze' }).success).toBe(true);
  });
  it('should validate create action', () => {
    expect(RLMProcessActionSchema.safeParse({ action: 'create', task: 'analyze', context: 'content' }).success).toBe(true);
  });
  it('should validate status action', () => {
    expect(RLMProcessActionSchema.safeParse({ action: 'status', chain_id: 'chain-1' }).success).toBe(true);
  });
});

describe('WorkflowActionSchema', () => {
  it('should validate start action', () => {
    expect(WorkflowActionSchema.safeParse({ action: 'start', name: 'My feature' }).success).toBe(true);
  });
  it('should validate list action', () => {
    expect(WorkflowActionSchema.safeParse({ action: 'list' }).success).toBe(true);
  });
  it('should validate complete action', () => {
    expect(WorkflowActionSchema.safeParse({ action: 'complete' }).success).toBe(true);
  });
});

describe('MemoryMaintainActionSchema', () => {
  it('should validate consolidate action', () => {
    expect(MemoryMaintainActionSchema.safeParse({ action: 'consolidate' }).success).toBe(true);
  });
  it('should validate export action', () => {
    expect(MemoryMaintainActionSchema.safeParse({ action: 'export' }).success).toBe(true);
  });
  it('should validate find_duplicates action', () => {
    expect(MemoryMaintainActionSchema.safeParse({ action: 'find_duplicates' }).success).toBe(true);
  });
  it('should validate merge action', () => {
    expect(MemoryMaintainActionSchema.safeParse({
      action: 'merge', memory_ids: ['a', 'b'], merged_content: 'combined'
    }).success).toBe(true);
  });
  it('should reject unknown action', () => {
    expect(MemoryMaintainActionSchema.safeParse({ action: 'unknown' }).success).toBe(false);
  });
});
