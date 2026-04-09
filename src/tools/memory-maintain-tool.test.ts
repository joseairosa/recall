import { describe, it, expect } from 'vitest';
import { memory_maintain } from './memory-maintain-tool.js';

describe('memory_maintain tool definition', () => {
  it('should have required tool properties', () => {
    expect(memory_maintain.description).toBeTruthy();
    expect(memory_maintain.inputSchema).toBeTruthy();
    expect(typeof memory_maintain.handler).toBe('function');
  });

  it('should have type:object at root with action enum', () => {
    const schema = memory_maintain.inputSchema as Record<string, unknown>;
    expect(schema.type).toBe('object');
    expect(schema.anyOf).toBeUndefined();

    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.action).toBeTruthy();
    expect(props.action.type).toBe('string');
    expect(props.action.enum).toEqual(
      expect.arrayContaining([
        'consolidate', 'force', 'status', 'export', 'import', 'find_duplicates', 'merge',
      ]),
    );

    expect(schema.required).toContain('action');
  });
});
