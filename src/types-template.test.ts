import { describe, it, expect } from 'vitest';
import {
  CreateTemplateSchema,
  CreateFromTemplateSchema,
  SetMemoryCategorySchema,
  ListCategoriesSchema,
} from './types-template.js';

describe('CreateTemplateSchema', () => {
  it('should require name and content_template', () => {
    expect(CreateTemplateSchema.safeParse({}).success).toBe(false);
    expect(CreateTemplateSchema.safeParse({ name: 'tmpl', content_template: 'Hello {{name}}' }).success).toBe(true);
  });
  it('should apply defaults', () => {
    const result = CreateTemplateSchema.safeParse({ name: 'tmpl', content_template: 'Hello' });
    expect(result.data?.default_importance).toBe(5);
    expect(result.data?.context_type).toBe('information');
  });
});

describe('CreateFromTemplateSchema', () => {
  it('should require template_id and variables', () => {
    expect(CreateFromTemplateSchema.safeParse({}).success).toBe(false);
    expect(CreateFromTemplateSchema.safeParse({ template_id: 'tmpl-1', variables: { name: 'test' } }).success).toBe(true);
  });
  it('should default is_global to false', () => {
    const result = CreateFromTemplateSchema.safeParse({ template_id: 'tmpl-1', variables: {} });
    expect(result.data?.is_global).toBe(false);
  });
});

describe('SetMemoryCategorySchema', () => {
  it('should require memory_id and category', () => {
    expect(SetMemoryCategorySchema.safeParse({}).success).toBe(false);
    expect(SetMemoryCategorySchema.safeParse({ memory_id: 'id1', category: 'work' }).success).toBe(true);
  });
});

describe('ListCategoriesSchema', () => {
  it('should parse with no required fields', () => {
    expect(ListCategoriesSchema.safeParse({}).success).toBe(true);
  });
  it('should default include_counts to true', () => {
    const result = ListCategoriesSchema.safeParse({});
    expect(result.data?.include_counts).toBe(true);
  });
});
