/**
 * Tool Registration tests
 *
 * Verifies that workflow and consolidation tools are wired
 * into the main tools export and accessible by name.
 */
import { describe, it, expect } from 'vitest';
import { getVisibleTools } from './index.js';

describe('Tool Registration', () => {
  describe('consolidated workflow tool', () => {
    it('should export workflow consolidated tool', () => {
      const tools = getVisibleTools();
      const tool = (tools as Record<string, any>)['workflow'];
      expect(tool).toBeDefined();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(typeof tool.handler).toBe('function');
    });
  });

  describe('consolidated maintenance tool', () => {
    it('should export memory_maintain consolidated tool', () => {
      const tools = getVisibleTools();
      const tool = (tools as Record<string, any>)['memory_maintain'];
      expect(tool).toBeDefined();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(typeof tool.handler).toBe('function');
    });
  });

  describe('deprecated aliases (RECALL_SHOW_DEPRECATED_TOOLS=true)', () => {
    const workflowAliasNames = [
      'start_workflow', 'complete_workflow', 'pause_workflow',
      'resume_workflow', 'get_active_workflow', 'list_workflows', 'get_workflow_context',
    ];
    const consolidationAliasNames = [
      'auto_consolidate', 'force_consolidate', 'consolidation_status',
    ];

    it.each([...workflowAliasNames, ...consolidationAliasNames])(
      'should expose %s alias when deprecated tools enabled',
      (name) => {
        process.env.RECALL_SHOW_DEPRECATED_TOOLS = 'true';
        const tools = getVisibleTools();
        const tool = (tools as Record<string, any>)[name];
        expect(tool).toBeDefined();
        expect(tool.description).toBeTruthy();
        expect(tool.inputSchema).toBeDefined();
        expect(typeof tool.handler).toBe('function');
        delete process.env.RECALL_SHOW_DEPRECATED_TOOLS;
      }
    );
  });
});
