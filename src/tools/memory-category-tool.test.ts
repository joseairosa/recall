import { describe, it, expect } from 'vitest';
import { memory_category } from './memory-category-tool.js';

describe('memory_category tool definition', () => {
  it('should have required tool properties', () => {
    expect(memory_category.description).toBeTruthy();
    expect(memory_category.inputSchema).toBeTruthy();
    expect(typeof memory_category.handler).toBe('function');
  });

  it('should have type:object at root with action enum', () => {
    const schema = memory_category.inputSchema as Record<string, unknown>;
    expect(schema.type).toBe('object');
    expect(schema.anyOf).toBeUndefined();

    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.action).toBeTruthy();
    expect(props.action.type).toBe('string');
    expect(props.action.enum).toEqual(
      expect.arrayContaining(['set', 'list', 'get']),
    );

    expect(schema.required).toContain('action');
  });
});
