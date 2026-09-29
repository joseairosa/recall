import { describe, it, expect } from 'vitest';
import { memory_template } from './memory-template-tool.js';

describe('memory_template tool definition', () => {
  it('should have required tool properties', () => {
    expect(memory_template.description).toBeTruthy();
    expect(memory_template.inputSchema).toBeTruthy();
    expect(typeof memory_template.handler).toBe('function');
  });

  it('should have type:object at root with action enum', () => {
    const schema = memory_template.inputSchema as Record<string, unknown>;
    expect(schema.type).toBe('object');
    expect(schema.anyOf).toBeUndefined();

    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.action).toBeTruthy();
    expect(props.action.type).toBe('string');
    expect(props.action.enum).toEqual(
      expect.arrayContaining(['create', 'use', 'list']),
    );

    expect(schema.required).toContain('action');
  });
});
