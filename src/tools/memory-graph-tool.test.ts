import { describe, it, expect } from 'vitest';
import { memory_graph } from './memory-graph-tool.js';

describe('memory_graph tool definition', () => {
  it('should have required tool properties', () => {
    expect(memory_graph.description).toBeTruthy();
    expect(memory_graph.inputSchema).toBeTruthy();
    expect(typeof memory_graph.handler).toBe('function');
  });

  it('should have type:object at root with action enum', () => {
    const schema = memory_graph.inputSchema as Record<string, unknown>;
    expect(schema.type).toBe('object');
    expect(schema.anyOf).toBeUndefined();
    expect(schema.oneOf).toBeUndefined();

    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.action).toBeTruthy();
    expect(props.action.type).toBe('string');
    expect(props.action.enum).toEqual(
      expect.arrayContaining(['link', 'unlink', 'related', 'graph', 'history', 'rollback']),
    );

    expect(schema.required).toContain('action');
  });
});
