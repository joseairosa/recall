import { describe, it, expect } from 'vitest';
import { rlm_process } from './rlm-process-tool.js';

describe('rlm_process tool definition', () => {
  it('should have required tool properties', () => {
    expect(rlm_process.description).toBeTruthy();
    expect(rlm_process.inputSchema).toBeTruthy();
    expect(typeof rlm_process.handler).toBe('function');
  });

  it('should have type:object at root with action enum', () => {
    const schema = rlm_process.inputSchema as Record<string, unknown>;
    expect(schema.type).toBe('object');
    expect(schema.anyOf).toBeUndefined();

    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.action).toBeTruthy();
    expect(props.action.type).toBe('string');
    expect(props.action.enum).toEqual(
      expect.arrayContaining([
        'check', 'create', 'decompose', 'inject', 'update', 'merge', 'verify', 'status',
      ]),
    );

    expect(schema.required).toContain('action');
  });
});
