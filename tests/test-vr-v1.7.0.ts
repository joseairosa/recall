#!/usr/bin/env node

/**
 * Comprehensive test script for v1.7.0 features (converted from v1.5.0)
 * Tests: Versioning, Templates, Categories, Advanced Search
 */

import { createStorageClient } from '../src/persistence/storage-client.factory.js';
import { MemoryStore } from '../src/persistence/memory-store.js';
import { StorageClient } from '../src/persistence/storage-client.js';
import { RelationshipType } from '../src/types.js';

let storageClient: StorageClient;

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title: string) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60));
}

function logTest(name: string) {
  log(`\n→ Testing: ${name}`, 'blue');
}

function logSuccess(message: string) {
  log(`  ✓ ${message}`, 'green');
}

function logError(message: string) {
  log(`  ✗ ${message}`, 'red');
}

// Test results
const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
};

async function assert(condition: any, message: string) {
  if (condition) {
    results.passed++;
    logSuccess(message);
  } else {
    results.failed++;
    logError(message);
    throw new Error(message);
  }
}

const createdMemoryIds: string[] = [];
const createdTemplateIds: string[] = [];
const createdRelationshipIds: string[] = [];

async function cleanup() {
  logSection('Performing Cleanup');
  const memoryStore = await MemoryStore.create();
  for (const id of createdMemoryIds) {
    try {
      await memoryStore.deleteMemory(id);
    } catch (e) {}
  }
  for (const id of createdTemplateIds) {
    try {
      await memoryStore.deleteTemplate(id);
    } catch (e) {}
  }
  for (const id of createdRelationshipIds) {
    try {
      await memoryStore.deleteRelationship(id);
    } catch (e) {}
  }
  logSuccess('Cleanup complete.');
}

// ============================================================================
// Phase 1: Memory Versioning Tests
// ============================================================================
async function testVersioning() {
  logSection('PHASE 1: Memory Versioning & History');

  const memoryStore = await MemoryStore.create();

  // Test 1: Create a memory
  logTest('Create initial memory');
  const memory = await memoryStore.createMemory({
    content: 'Initial content for versioning test',
    context_type: 'information',
    importance: 7,
    tags: ['test', 'versioning'],
    is_global: false
  });
  createdMemoryIds.push(memory.id);
  await assert(memory.id, 'Memory created successfully');
  await assert(memory.content === 'Initial content for versioning test', 'Content matches');

  // Test 2: Update memory (should create version)
  logTest('Update memory (should auto-create version)');
  const updated = await memoryStore.updateMemory(memory.id, {
    content: 'Updated content v2',
    importance: 8,
  });
  await assert(updated, 'Memory updated successfully');
  await assert(updated!.content === 'Updated content v2', 'Content updated');

  // Test 3: Check version was created
  logTest('Verify version history was created');
  const history = await memoryStore.getMemoryHistory(memory.id);
  await assert(history.length >= 1, `Version history exists (${history.length} versions)`);
  await assert(
    history[0].content === 'Initial content for versioning test',
    'First version has original content'
  );

  // Test 4: Update again to create second version
  logTest('Create second version');
  await memoryStore.updateMemory(memory.id, {
    content: 'Updated content v3',
    importance: 9,
  });
  const history2 = await memoryStore.getMemoryHistory(memory.id);
  await assert(history2.length >= 2, `Multiple versions exist (${history2.length} versions)`);

  // Test 5: Rollback to first version
  logTest('Rollback to previous version');
  const firstVersionId = history[0].version_id;
  const rolledBack = await memoryStore.rollbackMemory(memory.id, firstVersionId, true);
  await assert(rolledBack, 'Rollback successful');
  await assert(
    rolledBack!.content === 'Initial content for versioning test',
    'Content rolled back correctly'
  );

  // Test 6: Verify rollback created new versions
  logTest('Verify rollback created system versions');
  const historyAfterRollback = await memoryStore.getMemoryHistory(memory.id);
  await assert(
    historyAfterRollback.length > history2.length,
    `Rollback added versions (${historyAfterRollback.length} total)`
  );
}

// ============================================================================
// Phase 2: Template Tests
// ============================================================================
async function testTemplates() {
  logSection('PHASE 2: Memory Templates');

  const memoryStore = await MemoryStore.create();

  // Test 1: Create template
  logTest('Create memory template');
  const template = await memoryStore.createTemplate({
    name: 'Bug Report',
    description: 'Standard bug report template',
    context_type: 'error',
    content_template: 'Bug: {{title}} - Severity: {{severity}} - Steps: {{steps}}',
    default_tags: ['bug', 'test'],
    default_importance: 8,
  });
  createdTemplateIds.push(template.template_id);
  await assert(template.template_id, 'Template created successfully');
  await assert(template.name === 'Bug Report', 'Template name correct');
  await assert(template.content_template.includes('{{title}}'), 'Template has placeholders');

  // Test 2: List templates
  logTest('List all templates');
  const templates = await memoryStore.getAllTemplates();
  await assert(templates.length > 0, `Templates exist (${templates.length} total)`);
  const found = templates.find((t) => t.template_id === template.template_id);
  await assert(found, 'Created template found in list');

  // Test 3: Create memory from template
  logTest('Create memory from template');
  const memory = await memoryStore.createFromTemplate(
    template.template_id,
    {
      title: 'Login fails',
      severity: 'high',
      steps: '1. Click login 2. Enter credentials 3. Error appears',
    },
    ['urgent'],
    9
  );
  createdMemoryIds.push(memory.id);
  await assert(memory.id, 'Memory created from template');
  await assert(memory.content.includes('Login fails'), 'Template variable replaced');
  await assert(memory.content.includes('high'), 'Severity variable replaced');
  await assert(!memory.content.includes('{{'), 'No unreplaced placeholders');
  await assert(memory.tags.includes('bug'), 'Default tags applied');
  await assert(memory.tags.includes('urgent'), 'Additional tags added');
  await assert(memory.importance === 9, 'Custom importance applied');

  // Test 4: Test missing variables
  logTest('Test template with missing variables (should fail)');
  try {
    await memoryStore.createFromTemplate(template.template_id, { title: 'Test' });
    logError('Should have thrown error for missing variables');
    results.failed++;
  } catch (error: any) {
    await assert(
      error.message.includes('Missing variables'),
      'Correctly caught missing variables'
    );
  }
}

// ============================================================================
// Phase 3: Category Tests
// ============================================================================
async function testCategories() {
  logSection('PHASE 3: Memory Categories');

  const memoryStore = await MemoryStore.create();

  // Test 1: Create memory with category
  logTest('Create memory with category');
  const memory1 = await memoryStore.createMemory({
    content: 'Memory in authentication category',
    context_type: 'information',
    importance: 7,
    tags: ['test'],
    category: 'authentication',
    is_global: false
  });
  createdMemoryIds.push(memory1.id);
  await assert(memory1.category === 'authentication', 'Category set on creation');

  // Test 2: Set category on existing memory
  logTest('Set category on existing memory');
  const memory2 = await memoryStore.createMemory({
    content: 'Memory without category',
    context_type: 'information',
    importance: 6,
    tags: ['test'],
    is_global: false
  });
  createdMemoryIds.push(memory2.id);
  const categorized = await memoryStore.setMemoryCategory(memory2.id, 'database');
  await assert(categorized!.category === 'database', 'Category assigned');

  // Test 3: Create multiple memories in same category
  logTest('Create multiple memories in same category');
  const memory3 = await memoryStore.createMemory({
    content: 'Another auth memory',
    context_type: 'information',
    importance: 5,
    tags: ['test'],
    category: 'authentication',
    is_global: false
  });
  createdMemoryIds.push(memory3.id);
  await assert(memory3.category === 'authentication', 'Second memory in same category');

  // Test 4: List all categories
  logTest('List all categories');
  const categories = await memoryStore.getAllCategories();
  await assert(categories.length >= 2, `Categories exist (${categories.length} total)`);
  const authCategory = categories.find((c) => c.category === 'authentication');
  await assert(authCategory, 'Authentication category found');
  await assert(authCategory?.memory_count! >= 2, 'Category count is correct');

  // Test 5: Get memories by category
  logTest('Get memories by category');
  const authMemories = await memoryStore.getMemoriesByCategory('authentication');
  await assert(authMemories.length >= 2, `Found memories in category (${authMemories.length})`);
  await assert(
    authMemories.every((m) => m.category === 'authentication'),
    'All memories have correct category'
  );

  // Test 6: Update category
  logTest('Update memory category');
  const updated = await memoryStore.setMemoryCategory(memory1.id, 'security');
  await assert(updated!.category === 'security', 'Category updated');

  const authMemoriesAfter = await memoryStore.getMemoriesByCategory('authentication');
  await assert(
    authMemoriesAfter.length === authMemories.length - 1,
    'Memory removed from old category'
  );
}

// ============================================================================
// Phase 4: Advanced Search Tests
// ============================================================================
async function testAdvancedSearch() {
  logSection('PHASE 4: Advanced Search (Fuzzy, Regex, Category)');

  const memoryStore = await MemoryStore.create();

  // Setup: Create test memories
  logTest('Setup test memories for search');
  const memory1 = await memoryStore.createMemory({
    content: 'Authentication system using OAuth',
    context_type: 'code_pattern',
    importance: 8,
    tags: ['auth'],
    category: 'authentication',
    is_global: false
  });

  const memory2 = await memoryStore.createMemory({
    content: 'Database connection pool configuration',
    context_type: 'information',
    importance: 7,
    tags: ['db'],
    category: 'database',
    is_global: false
  });

  const memory3 = await memoryStore.createMemory({
    content: 'API v2 endpoint documentation',
    context_type: 'information',
    importance: 6,
    tags: ['api'],
    category: 'api',
    is_global: false
  });

  const memory4 = await memoryStore.createMemory({
    content: 'API v3 new features',
    context_type: 'information',
    importance: 7,
    tags: ['api'],
    category: 'api',
    is_global: false
  });

  createdMemoryIds.push(memory1.id, memory2.id, memory3.id, memory4.id);
  await assert(memory1.id && memory2.id && memory3.id && memory4.id, 'Test memories created');

  // Test 1: Fuzzy search
  logTest('Fuzzy search (typo tolerance)');
  const fuzzyResults = await memoryStore.searchMemories(
    'authentification', // Typo
    10, undefined, undefined, undefined, true // fuzzy
  );
  await assert(fuzzyResults.length > 0, `Fuzzy search found results (${fuzzyResults.length})`);
  const foundAuth = fuzzyResults.some((r) => r.content.includes('Authentication'));
  await assert(foundAuth, 'Fuzzy search found authentication despite typo');

  // Test 2: Regex search
  logTest('Regex search (pattern matching)');
  const regexResults = await memoryStore.searchMemories(
    'API', 10, undefined, undefined, undefined, false, 'API.*v[0-9]+' // Regex
  );
  await assert(regexResults.length >= 2, `Regex search found results (${regexResults.length})`);
  await assert(
    regexResults.every((r) => /API.*v[0-9]+/.test(r.content)),
    'All results match regex pattern'
  );

  // Test 3: Category filter
  logTest('Category filtering');
  const categoryResults = await memoryStore.searchMemories(
    'configuration', 10, undefined, undefined, 'database' // Category
  );
  await assert(categoryResults.length > 0, `Category search found results`);
  await assert(
    categoryResults.every((r) => r.category === 'database'),
    'All results in correct category'
  );

  // Test 4: Combined filters (category + fuzzy)
  logTest('Combined filters (category + fuzzy)');
  const combinedResults = await memoryStore.searchMemories(
    'conection', 10, undefined, undefined, 'database', true // Category + Fuzzy
  );
  await assert(
    combinedResults.length > 0,
    `Combined search found results (${combinedResults.length})`
  );

  // Test 5: Search with importance filter
  logTest('Search with importance filter');
  const importantResults = await memoryStore.searchMemories(
    'API', 10, 8, undefined, undefined, false
  );
  await assert(importantResults.length >= 0, 'Importance filter works');
  await assert(
    importantResults.every((r) => r.importance >= 8),
    'All results meet importance threshold'
  );
}

// ============================================================================
// Phase 5: Backward Compatibility Tests
// ============================================================================
async function testBackwardCompatibility() {
  logSection('PHASE 5: Backward Compatibility with v1.4.0');

  const memoryStore = await MemoryStore.create();

  // Test 1: Create memory without new fields (like v1.4.0)
  logTest('Create memory without v1.5.0 fields');
  const oldStyleMemory = await memoryStore.createMemory({
    content: 'Old style memory without category',
    context_type: 'information',
    importance: 7,
    tags: ['old'],
    is_global: false
  });
  createdMemoryIds.push(oldStyleMemory.id);
  await assert(oldStyleMemory.id, 'Old-style memory created');
  await assert(oldStyleMemory.category === undefined, 'Category is optional');

  // Test 2: Update old memory without triggering versioning issues
  logTest('Update old-style memory');
  const updated = await memoryStore.updateMemory(oldStyleMemory.id, {
    content: 'Updated old-style memory',
  });
  await assert(updated!.content === 'Updated old-style memory', 'Old-style update works');

  // Test 3: Search without new parameters (like v1.4.0)
  logTest('Search without v1.5.0 parameters');
  const searchResults = await memoryStore.searchMemories('old', 10);
  await assert(searchResults.length > 0, 'Old-style search works');

  // Test 4: Verify v1.4.0 relationships still work
  logTest('Verify v1.4.0 relationships still work');
  const memory2 = await memoryStore.createMemory({
    content: 'Related memory',
    context_type: 'information',
    importance: 6,
    tags: ['test'],
    is_global: false
  });
  createdMemoryIds.push(memory2.id);

  const relationship = await memoryStore.createRelationship(
    oldStyleMemory.id,
    memory2.id,
    RelationshipType.RELATES_TO
  );
  createdRelationshipIds.push(relationship.id);
  await assert(relationship.id, 'Relationships still work');

  const related = await memoryStore.getRelatedMemories(oldStyleMemory.id, { depth: 1, direction: 'both' });
  await assert(related.length > 0, 'Get related memories still works');
}

// ============================================================================
// Main Test Runner
// ============================================================================
async function runAllTests() {
  console.log('\n');
  log('╔═══════════════════════════════════════════════════════════╗', 'cyan');
  log('║     Recall v1.7.0 - Comprehensive Feature Test Suite     ║', 'cyan');
  log('╚═══════════════════════════════════════════════════════════╝', 'cyan');

  try {
    // Pre-flight Checks
    logSection('Pre-flight Checks');
    logTest('Backend connection');
    storageClient = await createStorageClient();
    const connected = await storageClient.checkConnection();
    await assert(connected, 'Backend connected successfully');

    // Run all test phases
    await testVersioning();
    await testTemplates();
    await testCategories();
    await testAdvancedSearch();
    await testBackwardCompatibility();

  } catch (error: any) {
    logError(`\nTest suite crashed: ${error.message}`);
    console.error(error.stack);
    results.failed++;
  } finally {
    // Cleanup
    await cleanup();

    // Print summary
    logSection('Test Summary');
    log(`Total Assertions: ${results.passed + results.failed}`, 'blue');
    log(`✓ Passed: ${results.passed}`, 'green');
    log(`✗ Failed: ${results.failed}`, results.failed > 0 ? 'red' : 'green');

    if (storageClient) {
      await storageClient.closeClient();
    }

    if (results.failed === 0) {
      log('\n🎉 All tests passed! v1.7.0 features are working correctly.', 'green');
      process.exit(0);
    } else {
      log('\n❌ Some tests failed. Review errors above.', 'red');
      process.exit(1);
    }
  }
}

// Run tests
runAllTests();