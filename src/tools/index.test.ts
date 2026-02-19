import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./context-tools.js', () => ({ recall_relevant_context: { description: 'd', inputSchema: {}, handler: vi.fn() }, analyze_and_remember: { description: 'd', inputSchema: {}, handler: vi.fn() }, summarize_session: { description: 'd', inputSchema: {}, handler: vi.fn() }, get_time_window_context: { description: 'd', inputSchema: {}, handler: vi.fn() }, auto_session_start: { description: 'd', inputSchema: {}, handler: vi.fn() }, quick_store_decision: { description: 'd', inputSchema: {}, handler: vi.fn() }, setContextMemoryStore: vi.fn() }));
vi.mock('./export-import-tools.js', () => ({ setExportImportMemoryStore: vi.fn(), exportMemories: vi.fn(), importMemories: vi.fn(), findDuplicates: vi.fn() }));
vi.mock('./relationship-tools.js', () => ({ setRelationshipMemoryStore: vi.fn(), relationshipTools: {} }));
vi.mock('./version-tools.js', () => ({ setVersionMemoryStore: vi.fn(), versionTools: {} }));
vi.mock('./template-tools.js', () => ({ setTemplateMemoryStore: vi.fn(), templateTools: {} }));
vi.mock('./category-tools.js', () => ({ setCategoryMemoryStore: vi.fn(), categoryTools: {} }));
vi.mock('./rlm-tools.js', () => ({ setRLMMemoryStore: vi.fn(), rlmTools: {}, getRLMService: vi.fn(), getRLMStore: vi.fn() }));
vi.mock('./workflow-tools.js', () => ({ setWorkflowMemoryStore: vi.fn(), workflowTools: [], getWorkflowService: vi.fn() }));
vi.mock('./consolidation-tools.js', () => ({ setConsolidationMemoryStore: vi.fn(), consolidationTools: [], getConsolidationService: vi.fn(), getConsolidationStore: vi.fn() }));
vi.mock('./memory-graph-tool.js', () => ({ memory_graph: { description: 'd', inputSchema: {}, handler: vi.fn() }, setMemoryGraphStore: vi.fn() }));
vi.mock('./memory-template-tool.js', () => ({ memory_template: { description: 'd', inputSchema: {}, handler: vi.fn() }, setMemoryTemplateStore: vi.fn() }));
vi.mock('./memory-category-tool.js', () => ({ memory_category: { description: 'd', inputSchema: {}, handler: vi.fn() }, setMemoryCategoryStore: vi.fn() }));
vi.mock('./rlm-process-tool.js', () => ({ rlm_process: { description: 'd', inputSchema: {}, handler: vi.fn() } }));
vi.mock('./workflow-tool.js', () => ({ workflow: { description: 'd', inputSchema: {}, handler: vi.fn() } }));
vi.mock('./memory-maintain-tool.js', () => ({ memory_maintain: { description: 'd', inputSchema: {}, handler: vi.fn() } }));
vi.mock('./aliases.js', () => ({ aliases: { link_memories: { description: 'd', inputSchema: {}, handler: vi.fn() } } }));
vi.mock('../persistence/memory-store.js', () => ({ MemoryStore: { create: vi.fn().mockResolvedValue({ createMemory: vi.fn() }) } }));

describe('getVisibleTools', () => {
  beforeEach(() => {
    delete process.env.RECALL_DISABLE_ADVANCED_TOOLS;
    delete process.env.RECALL_SHOW_DEPRECATED_TOOLS;
  });

  it('should export getVisibleTools function', async () => {
    const { getVisibleTools } = await import('./index.js');
    expect(typeof getVisibleTools).toBe('function');
  });

  it('should include core tools by default', async () => {
    const { getVisibleTools } = await import('./index.js');
    const tools = getVisibleTools();
    expect(tools).toHaveProperty('store_memory');
    expect(tools).toHaveProperty('search_memories');
    expect(tools).toHaveProperty('recall_relevant_context');
    expect(tools).toHaveProperty('delete_memory');
    expect(tools).toHaveProperty('update_memory');
  });

  it('should include advanced tools by default', async () => {
    const { getVisibleTools } = await import('./index.js');
    const tools = getVisibleTools();
    expect(tools).toHaveProperty('memory_graph');
    expect(tools).toHaveProperty('memory_template');
    expect(tools).toHaveProperty('memory_category');
    expect(tools).toHaveProperty('rlm_process');
    expect(tools).toHaveProperty('workflow');
    expect(tools).toHaveProperty('memory_maintain');
  });

  it('should hide advanced tools when RECALL_DISABLE_ADVANCED_TOOLS=true', async () => {
    process.env.RECALL_DISABLE_ADVANCED_TOOLS = 'true';
    const { getVisibleTools } = await import('./index.js');
    const tools = getVisibleTools();
    expect(tools).not.toHaveProperty('memory_graph');
    expect(tools).not.toHaveProperty('rlm_process');
    expect(tools).toHaveProperty('store_memory');
  });

  it('should include aliases when RECALL_SHOW_DEPRECATED_TOOLS=true', async () => {
    process.env.RECALL_SHOW_DEPRECATED_TOOLS = 'true';
    const { getVisibleTools } = await import('./index.js');
    const tools = getVisibleTools();
    expect(tools).toHaveProperty('link_memories');
  });

  it('should not include aliases by default', async () => {
    const { getVisibleTools } = await import('./index.js');
    const tools = getVisibleTools();
    expect(tools).not.toHaveProperty('link_memories');
  });
});
