import { describe, it, expect } from 'vitest';
import { aliases } from './aliases.js';

describe('aliases', () => {
  it('should export an aliases object', () => {
    expect(aliases).toBeTruthy();
    expect(typeof aliases).toBe('object');
  });

  it('should have all deprecated tool names mapped', () => {
    const expectedAliases = [
      'link_memories',
      'unlink_memories',
      'get_related_memories',
      'get_memory_graph',
      'get_memory_history',
      'rollback_memory',
      'create_template',
      'create_from_template',
      'list_templates',
      'set_memory_category',
      'list_categories',
      'get_memories_by_category',
      'should_use_rlm',
      'create_execution_context',
      'decompose_task',
      'inject_context_snippet',
      'update_subtask_result',
      'merge_results',
      'verify_answer',
      'get_execution_status',
      'start_workflow',
      'complete_workflow',
      'pause_workflow',
      'resume_workflow',
      'get_active_workflow',
      'list_workflows',
      'get_workflow_context',
      'auto_consolidate',
      'force_consolidate',
      'consolidation_status',
      'export_memories',
      'import_memories',
      'find_duplicates',
      'consolidate_memories',
    ];
    for (const name of expectedAliases) {
      expect(aliases, `missing alias: ${name}`).toHaveProperty(name);
      const alias = aliases[name as keyof typeof aliases];
      expect(typeof alias.description).toBe('string');
      expect(alias.inputSchema).toBeTruthy();
      expect(typeof alias.handler).toBe('function');
    }
  });
});
