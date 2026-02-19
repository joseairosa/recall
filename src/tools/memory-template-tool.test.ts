import { describe, it, expect } from 'vitest';
import { memory_template } from './memory-template-tool.js';

describe('memory_template tool definition', () => {
  it('should have required tool properties', () => {
    expect(memory_template.description).toBeTruthy();
    expect(memory_template.inputSchema).toBeTruthy();
    expect(typeof memory_template.handler).toBe('function');
  });
});
