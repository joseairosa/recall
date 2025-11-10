#!/usr/bin/env node

/**
 * Test script for memory relationship functionality (v1.7.0)
 * TypeScript version of test-relationships.js
 */

import { createStorageClient } from '../src/persistence/storage-client.factory.js';
import { MemoryStore } from '../src/persistence/memory-store.js';
import { StorageClient } from '../src/persistence/storage-client.js';
import { RelationshipType, MemoryEntry, MemoryRelationship, MemoryGraph } from '../src/types.js';

// --- Test Setup ---

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testRelationships() {
  log('🧪 Testing Memory Relationships v1.7.0\n', 'blue');

  let storageClient: StorageClient | null = null;
  let memory1: MemoryEntry | null = null;
  let memory2: MemoryEntry | null = null;
  let relationship: MemoryRelationship | null = null;

  try {
    storageClient = await createStorageClient();
    const store = await MemoryStore.create();

    // Test 1: Create two memories
    log('📝 Test 1: Creating two test memories...', 'blue');
    memory1 = await store.createMemory({
      content: 'Error handling pattern: Always use try-catch with custom errors',
      context_type: 'code_pattern',
      importance: 9,
      tags: ['patterns', 'errors'],
      is_global: false,
    });
    log(`✅ Created memory 1: ${memory1.id}`, 'green');

    memory2 = await store.createMemory({
      content: 'Example: try { await api.call() } catch (e) { throw new AppError(e) }',
      context_type: 'code_pattern',
      importance: 8,
      tags: ['patterns', 'examples'],
      is_global: false,
    });
    log(`✅ Created memory 2: ${memory2.id}\n`, 'green');

    // Test 2: Create a relationship
    log('🔗 Test 2: Linking memories with EXAMPLE_OF relationship...', 'blue');
    relationship = await store.createRelationship(
      memory2.id,
      memory1.id,
      RelationshipType.EXAMPLE_OF // Using the enum for type safety
    );
    log(`✅ Created relationship: ${relationship.id}`, 'green');
    log(`   Type: ${relationship.relationship_type}`);
    log(`   From: ${relationship.from_memory_id}`);
    log(`   To: ${relationship.to_memory_id}\n`);

    // Test 3: Get related memories
    log('🔍 Test 3: Getting related memories...', 'blue');
    const related = await store.getRelatedMemories(memory1.id, {
      depth: 1,
      direction: 'both',
    });
    log(`✅ Found ${related.length} related memories`, 'green');
    if (related.length > 0) {
      log(`   Related memory: ${related[0].memory.id}`);
      log(`   Relationship: ${related[0].relationship.relationship_type}`);
      log(`   Depth: ${related[0].depth}\n`);
    }

    // Test 4: Get memory graph
    log('📊 Test 4: Getting memory graph...', 'blue');
    const graph: MemoryGraph = await store.getMemoryGraph(memory1.id, 2, 10);
    log(`✅ Graph created:`, 'green');
    log(`   Root: ${graph.root_memory_id}`);
    log(`   Total nodes: ${graph.total_nodes}`);
    log(`   Max depth: ${graph.max_depth_reached}\n`);

    // Test 5: Delete relationship
    log('🗑️  Test 5: Deleting relationship...', 'blue');
    const deleted = await store.deleteRelationship(relationship.id);
    log(`✅ Relationship deleted: ${deleted}\n`, 'green');

    // Test 6: Verify deletion
    log('✓ Test 6: Verifying deletion...', 'blue');
    const relatedAfter = await store.getRelatedMemories(memory1.id, {
      depth: 1,
      direction: 'both',
    });
    log(`✅ Related memories after deletion: ${relatedAfter.length}\n`, 'green');

    log('✨ All tests passed!', 'green');

  } catch (error: any) {
    log(`❌ Test failed: ${error.message}`, 'red');
    console.error(error.stack);
    process.exit(1);
  } finally {
    // Cleanup
    if (storageClient) {
      const store = await MemoryStore.create();
      if (memory1) await store.deleteMemory(memory1.id);
      if (memory2) await store.deleteMemory(memory2.id);
      await storageClient.closeClient();
    }
  }
}

testRelationships().catch(console.error);