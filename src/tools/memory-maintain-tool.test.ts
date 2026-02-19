import { describe, it, expect } from 'vitest';
import { memory_maintain } from './memory-maintain-tool.js';

describe('memory_maintain tool definition', () => {
  it('should have required tool properties', () => {
    expect(memory_maintain.description).toBeTruthy();
    expect(memory_maintain.inputSchema).toBeTruthy();
    expect(typeof memory_maintain.handler).toBe('function');
  });

  it('should have action in inputSchema', () => {
    const schema = memory_maintain.inputSchema as Record<string, unknown>;
    const variants = (schema.oneOf ?? schema.anyOf) as Array<Record<string, unknown>>;
    expect(Array.isArray(variants)).toBe(true);
    const first = variants[0] as Record<string, unknown>;
    const props = first.properties as Record<string, unknown>;
    expect(props.action).toBeTruthy();
  });
});
