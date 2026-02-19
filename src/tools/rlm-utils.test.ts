import { describe, it, expect } from 'vitest';
import { detectSuggestedStrategy } from './rlm-utils.js';

describe('detectSuggestedStrategy', () => {
  it('should return aggregate for summary tasks', () => {
    expect(detectSuggestedStrategy('some long content', 'summarize this document')).toBe('aggregate');
    expect(detectSuggestedStrategy('content', 'give me an overview')).toBe('aggregate');
  });

  it('should return filter for search/find tasks', () => {
    expect(detectSuggestedStrategy('log content', 'find all error messages')).toBe('filter');
    expect(detectSuggestedStrategy('content', 'extract all URLs')).toBe('filter');
  });

  it('should return recursive for very large content', () => {
    const largeContent = 'x'.repeat(60000);
    expect(detectSuggestedStrategy(largeContent, 'process this')).toBe('recursive');
  });

  it('should return chunk as default', () => {
    expect(detectSuggestedStrategy('medium content', 'analyze this')).toBe('chunk');
  });
});
