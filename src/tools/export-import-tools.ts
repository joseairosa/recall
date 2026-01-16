import { z } from 'zod';
import { MemoryStore } from '../persistence/memory-store.js';
import {
  ExportMemoriesSchema,
  ImportMemoriesSchema,
  FindDuplicatesSchema,
  ConsolidateMemoriesSchema,
  type ExportMemories,
  type ImportMemories,
  type FindDuplicates,
  type ConsolidateMemories,
  type MemoryEntry,
  type DuplicateGroup,
  type CreateMemory,
} from '../types.js';
import { cosineSimilarity } from '../embeddings/generator.js';

// Injected memory store for multi-tenant support
let injectedStore: MemoryStore | null = null;

/**
 * Sets the memory store for this module (called from tools/index.ts)
 */
export function setExportImportMemoryStore(store: MemoryStore): void {
  injectedStore = store;
}

async function getStore(workspacePath?: string): Promise<MemoryStore> {
  // If a store was injected (HTTP mode), use it
  if (injectedStore) {
    return injectedStore;
  }
  // Otherwise create one (stdio mode)
  return MemoryStore.create(workspacePath);
}

/**
 * Export memories to JSON format
 */
export async function exportMemories(
  args: ExportMemories,
  workspacePath?: string
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const store = await getStore(workspacePath);

  // Get all memories or filtered subset
  let memories: MemoryEntry[];

  if (args.filter_by_type && args.filter_by_type.length > 0) {
    // Get memories by types
    const memoriesByType: MemoryEntry[] = [];
    for (const type of args.filter_by_type) {
      const typeMemories = await store.getMemoriesByType(type);
      memoriesByType.push(...typeMemories);
    }
    // Deduplicate by ID
    const uniqueMap = new Map<string, MemoryEntry>();
    for (const memory of memoriesByType) {
      uniqueMap.set(memory.id, memory);
    }
    memories = Array.from(uniqueMap.values());
  } else {
    // Get all memories via timeline
    memories = await store.getRecentMemories(10000); // Large limit to get all
  }

  // Filter by importance if specified
  if (args.min_importance !== undefined) {
    memories = memories.filter(m => m.importance >= args.min_importance!);
  }

  // Remove embeddings if not requested
  const exportData = memories.map(memory => {
    if (!args.include_embeddings) {
      const { embedding, ...rest } = memory;
      return rest;
    }
    return memory;
  });

  const exportObject = {
    version: '1.2.0',
    exported_at: Date.now(),
    memory_count: exportData.length,
    memories: exportData,
  };

  const jsonString = JSON.stringify(exportObject, null, 2);

  return {
    content: [
      {
        type: 'text',
        text: `Successfully exported ${exportData.length} memories\n\n${jsonString}`,
      },
    ],
  };
}

/**
 * Import memories from JSON export
 */
export async function importMemories(
  args: ImportMemories,
  workspacePath?: string
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const store = await getStore(workspacePath);

  let importData: any;
  try {
    importData = JSON.parse(args.data);
  } catch (error) {
    throw new Error(`Invalid JSON data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  if (!importData.memories || !Array.isArray(importData.memories)) {
    throw new Error('Invalid import format: missing memories array');
  }

  const results = {
    imported: 0,
    skipped: 0,
    overwritten: 0,
    errors: [] as string[],
  };

  for (const memoryData of importData.memories) {
    try {
      // Check if memory exists
      const existing = await store.getMemory(memoryData.id);

      if (existing && !args.overwrite_existing) {
        results.skipped++;
        continue;
      }

      // Prepare memory for creation
      const createData: CreateMemory = {
        content: memoryData.content,
        context_type: memoryData.context_type,
        tags: memoryData.tags || [],
        importance: memoryData.importance || 5,
        summary: memoryData.summary,
        session_id: memoryData.session_id,
        ttl_seconds: memoryData.ttl_seconds,
        is_global: false,
      };

      // Create or update memory
      if (existing && args.overwrite_existing) {
        await store.updateMemory(memoryData.id, createData);
        results.overwritten++;
      } else {
        // For new imports, we'll create with the original ID by directly manipulating
        // We need to recreate the memory with its original ID
        // This is a special case for imports
        // TODO: importedMemory isn't used - should it be removed?
        const importedMemory: MemoryEntry = {
          id: memoryData.id,
          timestamp: memoryData.timestamp || Date.now(),
          context_type: memoryData.context_type,
          content: memoryData.content,
          summary: memoryData.summary,
          tags: memoryData.tags || [],
          importance: memoryData.importance || 5,
          session_id: memoryData.session_id,
          embedding: args.regenerate_embeddings ? undefined : memoryData.embedding,
          ttl_seconds: memoryData.ttl_seconds,
          expires_at: memoryData.expires_at,
          workspace_id: '',
          is_global: false,
        };

        // If we need to regenerate embeddings, create normally
        if (args.regenerate_embeddings) {
          await store.createMemory(createData);
        } else {
          // Direct import preserving ID and embedding - we'll need a special method
          // For now, create normally (this will generate new ID)
          await store.createMemory(createData);
        }
        results.imported++;
      }
    } catch (error) {
      results.errors.push(`Failed to import memory ${memoryData.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  const summary = [
    `Import completed:`,
    `- Imported: ${results.imported}`,
    `- Overwritten: ${results.overwritten}`,
    `- Skipped: ${results.skipped}`,
    `- Errors: ${results.errors.length}`,
  ];

  if (results.errors.length > 0) {
    summary.push('', 'Errors:', ...results.errors.slice(0, 10));
    if (results.errors.length > 10) {
      summary.push(`... and ${results.errors.length - 10} more errors`);
    }
  }

  return {
    content: [
      {
        type: 'text',
        text: summary.join('\n'),
      },
    ],
  };
}

/**
 * Find duplicate memories based on similarity
 */
export async function findDuplicates(
  args: FindDuplicates,
  workspacePath?: string
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const store = await  MemoryStore.create(workspacePath);

  // Get all memories
  const memories = await store.getRecentMemories(10000);

  // Group duplicates
  const duplicateGroups: DuplicateGroup[] = [];
  const processed = new Set<string>();

  for (let i = 0; i < memories.length; i++) {
    const memory1 = memories[i];

    if (processed.has(memory1.id)) {
      continue;
    }

    const similarMemories: MemoryEntry[] = [memory1];
    let maxSimilarity = 0;

    for (let j = i + 1; j < memories.length; j++) {
      const memory2 = memories[j];

      if (processed.has(memory2.id)) {
        continue;
      }

      // Calculate similarity
      if (memory1.embedding && memory2.embedding) {
        const similarity = cosineSimilarity(memory1.embedding, memory2.embedding);

        if (similarity >= args.similarity_threshold) {
          similarMemories.push(memory2);
          maxSimilarity = Math.max(maxSimilarity, similarity);
          processed.add(memory2.id);
        }
      }
    }

    // If we found duplicates, add to groups
    if (similarMemories.length > 1) {
      duplicateGroups.push({
        memories: similarMemories,
        similarity_score: maxSimilarity,
      });
      processed.add(memory1.id);
    }
  }

  // Auto-merge if requested
  if (args.auto_merge && duplicateGroups.length > 0) {
    let mergedCount = 0;

    for (const group of duplicateGroups) {
      try {
        // Find memory to keep (highest importance)
        const toKeep = args.keep_highest_importance
          ? group.memories.reduce((prev, current) =>
              current.importance > prev.importance ? current : prev
            )
          : group.memories[0];

        // Merge tags from all memories
        const allTags = new Set<string>();
        for (const memory of group.memories) {
          memory.tags.forEach(tag => allTags.add(tag));
        }

        // Update the memory to keep with merged tags
        await store.updateMemory(toKeep.id, {
          tags: Array.from(allTags),
        });

        // Delete the others
        for (const memory of group.memories) {
          if (memory.id !== toKeep.id) {
            await store.deleteMemory(memory.id);
            mergedCount++;
          }
        }
      } catch (error) {
        console.error(`Failed to merge duplicate group: ${error}`);
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: `Found ${duplicateGroups.length} duplicate groups and merged ${mergedCount} duplicate memories.`,
        },
      ],
    };
  }

  // Just report duplicates
  if (duplicateGroups.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: 'No duplicate memories found.',
        },
      ],
    };
  }

  const report = [
    `Found ${duplicateGroups.length} duplicate groups:\n`,
  ];

  for (let i = 0; i < duplicateGroups.length; i++) {
    const group = duplicateGroups[i];
    report.push(`Group ${i + 1} (similarity: ${group.similarity_score.toFixed(3)}):`);

    for (const memory of group.memories) {
      report.push(`  - ID: ${memory.id} | Importance: ${memory.importance} | Summary: ${memory.summary || memory.content.substring(0, 50)}`);
    }
    report.push('');
  }

  return {
    content: [
      {
        type: 'text',
        text: report.join('\n'),
      },
    ],
  };
}

/**
 * Consolidate multiple memories into one
 */
export async function consolidateMemories(
  args: ConsolidateMemories,
  workspacePath?: string
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const store = await getStore(workspacePath);

  const result = await store.mergeMemories(args.memory_ids, args.keep_id);

  if (!result) {
    return {
      content: [
        {
          type: 'text',
          text: 'Failed to consolidate memories. Check that all memory IDs exist.',
        },
      ],
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: `Successfully consolidated ${args.memory_ids.length} memories into ID: ${result.id}\n\nMerged Memory:\n- Content: ${result.summary || result.content.substring(0, 100)}\n- Tags: ${result.tags.join(', ')}\n- Importance: ${result.importance}`,
      },
    ],
  };
}

// Tool definitions for MCP
export const exportImportTools = {
  export_memories: {
    description: 'Export memories to JSON format with optional filtering',
    inputSchema: ExportMemoriesSchema,
    handler: exportMemories,
  },
  import_memories: {
    description: 'Import memories from JSON export data',
    inputSchema: ImportMemoriesSchema,
    handler: importMemories,
  },
  find_duplicates: {
    description: 'Find and optionally merge duplicate memories based on similarity',
    inputSchema: FindDuplicatesSchema,
    handler: findDuplicates,
  },
  consolidate_memories: {
    description: 'Manually consolidate multiple memories into one',
    inputSchema: ConsolidateMemoriesSchema,
    handler: consolidateMemories,
  },
};
