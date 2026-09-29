import { describe, it, expect } from 'vitest';
import { workflow } from './workflow-tool.js';

describe('workflow tool definition', () => {
  it('should have required tool properties', () => {
    expect(workflow.description).toBeTruthy();
    expect(workflow.inputSchema).toBeTruthy();
    expect(typeof workflow.handler).toBe('function');
  });

  it('should have type:object at root with action enum', () => {
    const schema = workflow.inputSchema as Record<string, unknown>;
    expect(schema.type).toBe('object');
    expect(schema.anyOf).toBeUndefined();

    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.action).toBeTruthy();
    expect(props.action.type).toBe('string');
    expect(props.action.enum).toEqual(
      expect.arrayContaining([
        'start', 'complete', 'pause', 'resume', 'active', 'list', 'context',
      ]),
    );

    expect(schema.required).toContain('action');
  });
});
