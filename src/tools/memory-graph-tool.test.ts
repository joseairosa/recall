import { describe, it, expect } from 'vitest';
import { memory_graph } from './memory-graph-tool.js';

describe('memory_graph tool definition', () => {
  it('should have required tool properties', () => {
    expect(memory_graph.description).toBeTruthy();
    expect(memory_graph.inputSchema).toBeTruthy();
    expect(typeof memory_graph.handler).toBe('function');
  });

  it('should have action in inputSchema', () => {
    const schema = memory_graph.inputSchema as Record<string, unknown>;
    const variants = (schema.oneOf ?? schema.anyOf) as Array<Record<string, unknown>>;
    expect(Array.isArray(variants)).toBe(true);
    const first = variants[0] as Record<string, unknown>;
    const props = first.properties as Record<string, unknown>;
    expect(props.action).toBeTruthy();
  });
});
