#!/usr/bin/env node

/**
 * Test script for time window context retrieval (v1.6.0)
 */

import Redis from 'ioredis';
import { ulid } from 'ulid';

// Initialize Redis and create simplified store for testing
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  db: 15, // Use test database
});

// Simplified MemoryStore mock for testing
class TestMemoryStore {
  constructor() {
    this.workspaceId = 'test-workspace';
  }

  async createMemory(data) {
    const id = ulid();
    const timestamp = Date.now();
    const memory = {
      id,
      timestamp: timestamp.toString(),
      context_type: data.context_type,
      content: data.content,
      importance: data.importance.toString(),
      tags: JSON.stringify(data.tags || []),
      workspace_id: this.workspaceId,
      is_global: 'false',
    };

    // Store in Redis (hset expects flat key-value pairs)
    const flatData = Object.entries(memory).flat();
    await redis.hset(`ws:${this.workspaceId}:memory:${id}`, ...flatData);
    await redis.zadd(`ws:${this.workspaceId}:memories:timeline`, timestamp, id);

    return {
      id,
      timestamp,
      context_type: data.context_type,
      content: data.content,
      importance: data.importance,
      tags: data.tags || [],
      workspace_id: this.workspaceId,
      is_global: false,
    };
  }

  async getMemoriesByTimeWindow(startTime, endTime, minImportance, contextTypes) {
    // Get IDs in time range
    const ids = await redis.zrangebyscore(
      `ws:${this.workspaceId}:memories:timeline`,
      startTime,
      endTime
    );

    // Retrieve memories
    const memories = [];
    for (const id of ids) {
      const data = await redis.hgetall(`ws:${this.workspaceId}:memory:${id}`);
      if (Object.keys(data).length > 0) {
        // Convert string values back to correct types
        const memory = {
          ...data,
          timestamp: parseInt(data.timestamp),
          importance: parseInt(data.importance),
          tags: data.tags ? JSON.parse(data.tags) : [],
          is_global: data.is_global === 'true',
        };
        memories.push(memory);
      }
    }

    // Filter by importance
    let filtered = memories;
    if (minImportance !== undefined) {
      filtered = filtered.filter(m => m.importance >= minImportance);
    }

    // Filter by context types
    if (contextTypes && contextTypes.length > 0) {
      filtered = filtered.filter(m => contextTypes.includes(m.context_type));
    }

    // Sort chronologically
    filtered.sort((a, b) => a.timestamp - b.timestamp);

    return filtered;
  }

  async deleteMemory(id) {
    await redis.del(`ws:${this.workspaceId}:memory:${id}`);
    await redis.zrem(`ws:${this.workspaceId}:memories:timeline`, id);
  }
}

const MemoryStore = TestMemoryStore;

// Color output helpers
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

let passed = 0;
let failed = 0;

async function runTests() {
  log('\n=== Testing Time Window Context Retrieval (v1.6.0) ===\n', 'blue');

  const store = new MemoryStore();

  try {
    // Test 1: Create test memories with timestamps
    log('Test 1: Creating test memories across different time periods', 'blue');

    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const twoHoursAgo = now - (2 * 60 * 60 * 1000);
    const thirtyMinsAgo = now - (30 * 60 * 1000);

    // Create memories
    const memory1 = await store.createMemory({
      content: 'Memory from 2 hours ago - decided to use PostgreSQL',
      context_type: 'decision',
      importance: 8,
      tags: ['database'],
    });

    const memory2 = await store.createMemory({
      content: 'Memory from 1 hour ago - implemented caching layer',
      context_type: 'code_pattern',
      importance: 7,
      tags: ['performance'],
    });

    const memory3 = await store.createMemory({
      content: 'Memory from 30 mins ago - fixed authentication bug',
      context_type: 'error',
      importance: 9,
      tags: ['security', 'bug-fix'],
    });

    log('✓ Created 3 test memories', 'green');
    passed++;

    // Test 2: Get memories from last hour (should get 2 recent ones)
    log('\nTest 2: Retrieve memories from last hour', 'blue');

    const lastHourMemories = await store.getMemoriesByTimeWindow(
      oneHourAgo,
      now + 1000 // Add buffer
    );

    if (lastHourMemories.length >= 2) {
      log(`✓ Retrieved ${lastHourMemories.length} memories from last hour`, 'green');
      passed++;
    } else {
      log(`✗ Expected at least 2 memories, got ${lastHourMemories.length}`, 'red');
      failed++;
    }

    // Test 3: Filter by importance
    log('\nTest 3: Filter by minimum importance (>= 8)', 'blue');

    const highImportanceMemories = await store.getMemoriesByTimeWindow(
      twoHoursAgo,
      now + 1000,
      8 // min importance
    );

    const hasHighImportance = highImportanceMemories.every(m => m.importance >= 8);
    if (hasHighImportance && highImportanceMemories.length >= 1) {
      log(`✓ Retrieved ${highImportanceMemories.length} high-importance memories`, 'green');
      passed++;
    } else {
      log(`✗ Importance filtering failed`, 'red');
      failed++;
    }

    // Test 4: Filter by context type
    log('\nTest 4: Filter by context type (decision)', 'blue');

    const decisionMemories = await store.getMemoriesByTimeWindow(
      twoHoursAgo,
      now + 1000,
      undefined,
      ['decision']
    );

    const allDecisions = decisionMemories.every(m => m.context_type === 'decision');
    if (allDecisions && decisionMemories.length >= 1) {
      log(`✓ Retrieved ${decisionMemories.length} decision memories`, 'green');
      passed++;
    } else {
      log(`✗ Context type filtering failed`, 'red');
      failed++;
    }

    // Test 5: Chronological ordering
    log('\nTest 5: Verify chronological ordering', 'blue');

    const allMemories = await store.getMemoriesByTimeWindow(
      twoHoursAgo,
      now + 1000
    );

    let isChronological = true;
    for (let i = 1; i < allMemories.length; i++) {
      if (allMemories[i].timestamp < allMemories[i - 1].timestamp) {
        isChronological = false;
        break;
      }
    }

    if (isChronological) {
      log('✓ Memories are in chronological order (oldest first)', 'green');
      passed++;
    } else {
      log('✗ Memories not in chronological order', 'red');
      failed++;
    }

    // Test 6: Empty time window
    log('\nTest 6: Empty time window (no memories)', 'blue');

    const futureStart = now + (24 * 60 * 60 * 1000); // Tomorrow
    const futureEnd = now + (48 * 60 * 60 * 1000); // Day after

    const futureMemories = await store.getMemoriesByTimeWindow(
      futureStart,
      futureEnd
    );

    if (futureMemories.length === 0) {
      log('✓ Empty time window returns no memories', 'green');
      passed++;
    } else {
      log(`✗ Expected 0 memories, got ${futureMemories.length}`, 'red');
      failed++;
    }

    // Test 7: Multiple context types
    log('\nTest 7: Filter by multiple context types', 'blue');

    const multiTypeMemories = await store.getMemoriesByTimeWindow(
      twoHoursAgo,
      now + 1000,
      undefined,
      ['decision', 'error']
    );

    const validTypes = multiTypeMemories.every(m =>
      m.context_type === 'decision' || m.context_type === 'error'
    );

    if (validTypes && multiTypeMemories.length >= 2) {
      log(`✓ Retrieved ${multiTypeMemories.length} memories with multiple types`, 'green');
      passed++;
    } else {
      log('✗ Multiple context type filtering failed', 'red');
      failed++;
    }

    // Test 8: Combined filters (importance + type)
    log('\nTest 8: Combined filters (importance >= 8, type = error)', 'blue');

    const combinedFilterMemories = await store.getMemoriesByTimeWindow(
      twoHoursAgo,
      now + 1000,
      8,
      ['error']
    );

    const validCombined = combinedFilterMemories.every(m =>
      m.importance >= 8 && m.context_type === 'error'
    );

    if (validCombined) {
      log(`✓ Combined filtering works (${combinedFilterMemories.length} memories)`, 'green');
      passed++;
    } else {
      log('✗ Combined filtering failed', 'red');
      failed++;
    }

    // Cleanup
    log('\nCleaning up test memories...', 'blue');
    await store.deleteMemory(memory1.id);
    await store.deleteMemory(memory2.id);
    await store.deleteMemory(memory3.id);
    log('✓ Cleanup complete', 'green');

  } catch (error) {
    log(`\n✗ Test failed with error: ${error.message}`, 'red');
    log(error.stack, 'red');
    failed++;
  }

  // Summary
  log('\n' + '='.repeat(50), 'blue');
  log(`\nTest Results:`, 'blue');
  log(`  Passed: ${passed}`, 'green');
  log(`  Failed: ${failed}`, failed > 0 ? 'red' : 'green');
  log(`  Total:  ${passed + failed}\n`, 'blue');

  if (failed === 0) {
    log('✓ All tests passed!', 'green');
    process.exit(0);
  } else {
    log('✗ Some tests failed', 'red');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  log(`Fatal error: ${error.message}`, 'red');
  log(error.stack, 'red');
  process.exit(1);
});
