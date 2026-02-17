/**
 * Tool Registration tests
 *
 * Verifies that workflow and consolidation tools are wired
 * into the main tools export and accessible by name.
 */
import { describe, it, expect } from 'vitest';
import { tools } from './index.js';

describe('Tool Registration', () => {
  describe('workflow tools', () => {
    const workflowToolNames = [
      'start_workflow',
      'complete_workflow',
      'pause_workflow',
      'resume_workflow',
      'get_active_workflow',
      'list_workflows',
      'get_workflow_context',
    ];

    it.each(workflowToolNames)('should export %s tool', (name) => {
      const tool = (tools as Record<string, any>)[name];
      expect(tool).toBeDefined();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(typeof tool.handler).toBe('function');
    });
  });

  describe('consolidation tools', () => {
    const consolidationToolNames = [
      'auto_consolidate',
      'force_consolidate',
      'consolidation_status',
    ];

    it.each(consolidationToolNames)('should export %s tool', (name) => {
      const tool = (tools as Record<string, any>)[name];
      expect(tool).toBeDefined();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(typeof tool.handler).toBe('function');
    });
  });
});
