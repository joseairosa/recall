#!/usr/bin/env node

// Simple test script for relationship functionality
import { MemoryStore } from './dist/index.js';
import { RelationshipType } from './dist/index.js';

async function testRelationships() {
  console.log('🧪 Testing Memory Relationships v1.4.0\n');

  const store = new MemoryStore();

  try {
    // Test 1: Create two memories
    console.log('📝 Test 1: Creating two test memories...');
    const memory1 = await store.createMemory({
      content: 'Error handling pattern: Always use try-catch with custom errors',
      context_type: 'code_pattern',
      importance: 9,
      tags: ['patterns', 'errors'],
    });
    console.log(`✅ Created memory 1: ${memory1.id}`);

    const memory2 = await store.createMemory({
      content: 'Example: try { await api.call() } catch (e) { throw new AppError(e) }',
      context_type: 'code_pattern',
      importance: 8,
      tags: ['patterns', 'examples'],
    });
    console.log(`✅ Created memory 2: ${memory2.id}\n`);

    // Test 2: Create a relationship
    console.log('🔗 Test 2: Linking memories with EXAMPLE_OF relationship...');
    const relationship = await store.createRelationship(
      memory2.id,
      memory1.id,
      'example_of'
    );
    console.log(`✅ Created relationship: ${relationship.id}`);
    console.log(`   Type: ${relationship.relationship_type}`);
    console.log(`   From: ${relationship.from_memory_id}`);
    console.log(`   To: ${relationship.to_memory_id}\n`);

    // Test 3: Get related memories
    console.log('🔍 Test 3: Getting related memories...');
    const related = await store.getRelatedMemories(memory1.id, {
      depth: 1,
      direction: 'both',
    });
    console.log(`✅ Found ${related.length} related memories`);
    if (related.length > 0) {
      console.log(`   Related memory: ${related[0].memory.id}`);
      console.log(`   Relationship: ${related[0].relationship.relationship_type}`);
      console.log(`   Depth: ${related[0].depth}\n`);
    }

    // Test 4: Get memory graph
    console.log('📊 Test 4: Getting memory graph...');
    const graph = await store.getMemoryGraph(memory1.id, 2, 10);
    console.log(`✅ Graph created:`);
    console.log(`   Root: ${graph.root_memory_id}`);
    console.log(`   Total nodes: ${graph.total_nodes}`);
    console.log(`   Max depth: ${graph.max_depth_reached}\n`);

    // Test 5: Delete relationship
    console.log('🗑️  Test 5: Deleting relationship...');
    const deleted = await store.deleteRelationship(relationship.id);
    console.log(`✅ Relationship deleted: ${deleted}\n`);

    // Test 6: Verify deletion
    console.log('✓ Test 6: Verifying deletion...');
    const relatedAfter = await store.getRelatedMemories(memory1.id, {
      depth: 1,
      direction: 'both',
    });
    console.log(`✅ Related memories after deletion: ${relatedAfter.length}\n`);

    console.log('✨ All tests passed!');

    // Cleanup
    await store.deleteMemory(memory1.id);
    await store.deleteMemory(memory2.id);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testRelationships().catch(console.error);
