import { describe, it, expect } from 'vitest';
import { memory_category } from './memory-category-tool.js';

describe('memory_category tool definition', () => {
  it('should have required tool properties', () => {
    expect(memory_category.description).toBeTruthy();
    expect(memory_category.inputSchema).toBeTruthy();
    expect(typeof memory_category.handler).toBe('function');
  });

  it('should have action in inputSchema', () => {
    const schema = memory_category.inputSchema as Record<string, unknown>;
    const variants = (schema.oneOf ?? schema.anyOf) as Array<Record<string, unknown>>;
    expect(Array.isArray(variants)).toBe(true);
    const first = variants[0] as Record<string, unknown>;
    const props = first.properties as Record<string, unknown>;
    expect(props.action).toBeTruthy();
  });
});
