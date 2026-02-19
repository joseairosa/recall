import { describe, it, expect } from 'vitest';
import { workflow } from './workflow-tool.js';

describe('workflow tool definition', () => {
  it('should have required tool properties', () => {
    expect(workflow.description).toBeTruthy();
    expect(workflow.inputSchema).toBeTruthy();
    expect(typeof workflow.handler).toBe('function');
  });

  it('should have action in inputSchema', () => {
    const schema = workflow.inputSchema as Record<string, unknown>;
    const variants = (schema.oneOf ?? schema.anyOf) as Array<Record<string, unknown>>;
    expect(Array.isArray(variants)).toBe(true);
    const first = variants[0] as Record<string, unknown>;
    const props = first.properties as Record<string, unknown>;
    expect(props.action).toBeTruthy();
  });
});
