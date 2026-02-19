import { describe, it, expect } from 'vitest';
import { rlm_process } from './rlm-process-tool.js';

describe('rlm_process tool definition', () => {
  it('should have required tool properties', () => {
    expect(rlm_process.description).toBeTruthy();
    expect(rlm_process.inputSchema).toBeTruthy();
    expect(typeof rlm_process.handler).toBe('function');
  });

  it('should have action in inputSchema', () => {
    const schema = rlm_process.inputSchema as Record<string, unknown>;
    const variants = (schema.oneOf ?? schema.anyOf) as Array<Record<string, unknown>>;
    expect(Array.isArray(variants)).toBe(true);
    const first = variants[0] as Record<string, unknown>;
    const props = first.properties as Record<string, unknown>;
    expect(props.action).toBeTruthy();
  });
});
