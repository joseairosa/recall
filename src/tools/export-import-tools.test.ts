import { describe, it, expect, vi, beforeEach } from 'vitest';
import { importMemories, setExportImportMemoryStore } from './export-import-tools.js';
import type { MemoryStore } from '../persistence/memory-store.js';

/**
 * Regression tests for import fidelity: an exported memory must come back with its own
 * id, timestamp, embedding and category — not a fresh ULID stamped "now".
 */
describe('importMemories', () => {
  const store = {
    getMemory: vi.fn(),
    importMemory: vi.fn(async (m) => m),
    updateMemory: vi.fn(async (_id, updates) => updates),
  };
  const exported = {
    id: '01TESTIMPORTPRESERVE0000001',
    timestamp: 1735689600000,
    context_type: 'information',
    content: 'exported record',
    summary: 'exported',
    tags: ['export'],
    importance: 7,
    embedding: [0.1, 0.2, 0.3],
    category: 'testing',
    workspace_id: 'oldws',
    is_global: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    store.getMemory.mockResolvedValue(null);
    setExportImportMemoryStore(store as unknown as MemoryStore);
  });

  it('keeps id, timestamp, embedding and category from the export', async () => {
    await importMemories({ data: JSON.stringify({ memories: [exported] }), overwrite_existing: false, regenerate_embeddings: false });
    expect(store.importMemory).toHaveBeenCalledTimes(1);
    const written = store.importMemory.mock.calls[0][0];
    expect(written).toMatchObject({
      id: exported.id,
      timestamp: exported.timestamp,
      embedding: exported.embedding,
      category: 'testing',
      tags: ['export'],
      importance: 7,
    });
  });

  it('drops the embedding when regenerate_embeddings is set so the store re-embeds', async () => {
    await importMemories({ data: JSON.stringify({ memories: [exported] }), overwrite_existing: false, regenerate_embeddings: true });
    const written = store.importMemory.mock.calls[0][0];
    expect(written.embedding).toBeUndefined();
    expect(written.id).toBe(exported.id);
    expect(written.timestamp).toBe(exported.timestamp);
  });

  it('skips an existing id unless overwrite_existing is set', async () => {
    store.getMemory.mockResolvedValue(exported);
    const result = await importMemories({ data: JSON.stringify({ memories: [exported] }), overwrite_existing: false, regenerate_embeddings: false });
    expect(store.importMemory).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain('Skipped: 1');
    await importMemories({ data: JSON.stringify({ memories: [exported] }), overwrite_existing: true, regenerate_embeddings: false });
    expect(store.updateMemory).toHaveBeenCalledWith(exported.id, expect.objectContaining({ content: 'exported record' }));
  });
});
