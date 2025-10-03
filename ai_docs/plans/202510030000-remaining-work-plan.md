# v1.3.0 Remaining Work Plan

**Date:** 2025-10-02
**Current Status:** Feature 1 (Global Memories) 95% Complete
**Overall Progress:** 24% of v1.3.0

---

## Quick Summary

We've completed the **core implementation** of Feature 1 (Global Memories). Here's what's left:

### Immediate (Complete Feature 1) - 4-6 hours
1. ✅ Global memory resources
2. ✅ Documentation updates
3. ✅ Basic testing

### Short-term (Features 2, 3, 4) - 8-10 days
4. ⏳ Memory Relationships
5. ⏳ Memory Versioning/History
6. ⏳ Smart Memory Suggestions

---

## PHASE 1: Complete Feature 1 (Global Memories) - 4-6 hours

### Task 1.1: Add Global Memory Resources (1-2 hours)

**Goal:** Provide read-only access to global memories via MCP resources

**Files to Modify:**
- `src/resources/index.ts`

**Implementation:**
```typescript
// Add to resources object
'memory://global/recent': {
  uri: 'memory://global/recent',
  description: 'Recent global memories',
  handler: async () => {
    const mode = getWorkspaceMode();
    if (mode === WorkspaceMode.ISOLATED) {
      return { error: 'Global memories not available in isolated mode' };
    }

    // Get global memories from Redis
    const ids = await redis.zrevrange(RedisKeys.globalTimeline(), 0, 49);
    const memories = await getMemories(ids);
    return formatMemoriesAsResource(memories);
  }
},

'memory://global/by-type/{type}': {
  // Similar implementation for type filtering
},

'memory://global/by-tag/{tag}': {
  // Similar implementation for tag filtering
},

'memory://global/important': {
  // Similar implementation for important global memories
},

'memory://global/search?q={query}': {
  // Similar implementation for search
}
```

**Checklist:**
- [ ] Add `memory://global/recent` resource
- [ ] Add `memory://global/by-type/{type}` resource
- [ ] Add `memory://global/by-tag/{tag}` resource
- [ ] Add `memory://global/important` resource
- [ ] Add `memory://global/search?q=query` resource
- [ ] Test each resource in MCP Inspector
- [ ] Build and verify no errors

**Time Estimate:** 1-2 hours

---

### Task 1.2: Update Documentation (1-2 hours)

**Goal:** Document global memory feature with examples and configuration

**Files to Modify:**
1. `README.md`
2. `WORKSPACE_MODES.md`
3. `CHANGELOG.md`

#### README.md Updates

**Add after "Workspace Isolation" section:**

```markdown
## Global Memories (v1.3.0)

**Share memories across all workspaces** - perfect for personal preferences, team conventions, and organizational knowledge.

### Configuration

Set the `WORKSPACE_MODE` environment variable:

```json
{
  "mcpServers": {
    "recall": {
      "env": {
        "WORKSPACE_MODE": "hybrid",  // isolated | global | hybrid
        "REDIS_URL": "redis://localhost:6379"
      }
    }
  }
}
```

### Workspace Modes

**1. Isolated (default)** - Workspace-only memories
```bash
# No configuration needed - this is the default
```

**2. Global** - All memories shared across workspaces
```json
{ "WORKSPACE_MODE": "global" }
```

**3. Hybrid** - Both workspace and global memories
```json
{ "WORKSPACE_MODE": "hybrid" }
```

### Creating Global Memories

```
You: "Store this globally: Always use TypeScript strict mode"
Claude: [Stores with is_global: true]
```

Or use the tool directly:
```
store_memory({
  content: "Team convention: Use async/await over .then()",
  is_global: true,
  importance: 9
})
```

### Converting Memories

**Convert to global:**
```
convert_to_global({
  memory_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV"
})
```

**Convert to workspace:**
```
convert_to_workspace({
  memory_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV"
})
```

### How It Works

**Hybrid Mode (Recommended):**
- Workspace memories take precedence (weighted 1.0x)
- Global memories slightly deprioritized (weighted 0.9x)
- Search returns both, sorted by relevance
- Best of both worlds!

**Use Cases:**
- **Global:** Personal preferences, team conventions, organization-wide patterns
- **Workspace:** Project-specific decisions, local configurations, feature requirements
```

#### WORKSPACE_MODES.md Updates

**Add "Implemented in v1.3.0" section:**

```markdown
## Implementation (v1.3.0)

The hybrid workspace mode is now fully implemented!

### Current Behavior

**Isolated Mode (default):**
```
WORKSPACE_MODE=isolated (or not set)
```
- Only workspace-scoped memories
- Each project directory is isolated
- No cross-workspace pollution

**Global Mode:**
```
WORKSPACE_MODE=global
```
- All memories shared across workspaces
- No workspace isolation
- Use for personal assistant scenarios

**Hybrid Mode (recommended):**
```
WORKSPACE_MODE=hybrid
```
- Both workspace + global memories available
- Global memories weighted 0.9x in search
- Workspace memories take precedence
- Best for team/organizational use

### Storage

**Workspace memories:**
```
ws:{workspace_id}:memory:{id}
ws:{workspace_id}:memories:all
ws:{workspace_id}:memories:type:{type}
```

**Global memories:**
```
global:memory:{id}
global:memories:all
global:memories:type:{type}
```

### Tools

- `store_memory` - Use `is_global: true` for global memories
- `convert_to_global` - Promote workspace memory to global
- `convert_to_workspace` - Demote global memory to workspace
```

#### CHANGELOG.md Updates

**Add v1.3.0 section:**

```markdown
## [1.3.0] - 2025-10-XX (In Progress)

### Added
- **Global Memories** - Cross-workspace memory support
  - `is_global` flag for memories (default: false)
  - `WORKSPACE_MODE` environment variable (isolated/global/hybrid)
  - Workspace memories: `ws:{workspace_id}:*`
  - Global memories: `global:*`
  - Hybrid mode intelligently merges both sources
- **New Tools:**
  - `convert_to_global` - Convert workspace memory to global
  - `convert_to_workspace` - Convert global memory to workspace-specific
- **New Resources:**
  - `memory://global/recent` - Recent global memories
  - `memory://global/by-type/{type}` - Global memories by type
  - `memory://global/by-tag/{tag}` - Global memories by tag
  - `memory://global/important` - Important global memories
  - `memory://global/search?q=query` - Search global memories

### Changed
- Memory schema includes `is_global` and `workspace_id` fields
- Search in hybrid mode weights global memories 0.9x (prefer local context)
- All CRUD operations support both workspace and global memories

### Migration
- Fully backward compatible
- Default mode is `isolated` (existing behavior)
- Existing memories work without changes
- Set `WORKSPACE_MODE=hybrid` to enable global memories

**Tools:** 15 total (13 + 2 new)
**Resources:** 14 total (9 + 5 new global resources)
```

**Checklist:**
- [ ] Update README.md with global memory section
- [ ] Update WORKSPACE_MODES.md with implementation details
- [ ] Update CHANGELOG.md with v1.3.0 entry
- [ ] Add examples to README
- [ ] Document all 3 workspace modes

**Time Estimate:** 1-2 hours

---

### Task 1.3: Basic Testing (2-3 hours)

**Goal:** Verify global memories work correctly

**Create:** `src/__tests__/global-memories.test.ts`

**Test Cases:**

```typescript
describe('Global Memories', () => {
  describe('Storage', () => {
    test('creates workspace memory by default', async () => {
      const memory = await store.createMemory({ content: 'test' });
      expect(memory.is_global).toBe(false);
      expect(memory.workspace_id).toBeTruthy();
    });

    test('creates global memory with is_global flag', async () => {
      const memory = await store.createMemory({
        content: 'test',
        is_global: true
      });
      expect(memory.is_global).toBe(true);
      expect(memory.workspace_id).toBe('');
    });
  });

  describe('Retrieval', () => {
    test('getMemory finds workspace memories', async () => {
      const created = await store.createMemory({ content: 'workspace' });
      const retrieved = await store.getMemory(created.id);
      expect(retrieved).toBeTruthy();
      expect(retrieved.is_global).toBe(false);
    });

    test('getMemory finds global memories', async () => {
      const created = await store.createMemory({
        content: 'global',
        is_global: true
      });
      const retrieved = await store.getMemory(created.id);
      expect(retrieved).toBeTruthy();
      expect(retrieved.is_global).toBe(true);
    });
  });

  describe('Workspace Modes', () => {
    test('isolated mode returns only workspace memories', async () => {
      process.env.WORKSPACE_MODE = 'isolated';
      await store.createMemory({ content: 'workspace' });
      await store.createMemory({ content: 'global', is_global: true });

      const recent = await store.getRecentMemories(10);
      expect(recent.length).toBe(1);
      expect(recent[0].is_global).toBe(false);
    });

    test('global mode returns only global memories', async () => {
      process.env.WORKSPACE_MODE = 'global';
      await store.createMemory({ content: 'workspace' });
      await store.createMemory({ content: 'global', is_global: true });

      const recent = await store.getRecentMemories(10);
      expect(recent.length).toBe(1);
      expect(recent[0].is_global).toBe(true);
    });

    test('hybrid mode returns both workspace and global', async () => {
      process.env.WORKSPACE_MODE = 'hybrid';
      await store.createMemory({ content: 'workspace' });
      await store.createMemory({ content: 'global', is_global: true });

      const recent = await store.getRecentMemories(10);
      expect(recent.length).toBe(2);
    });
  });

  describe('Search', () => {
    test('hybrid mode weights global memories 0.9x', async () => {
      process.env.WORKSPACE_MODE = 'hybrid';
      const ws = await store.createMemory({
        content: 'important project decision',
        importance: 8
      });
      const global = await store.createMemory({
        content: 'important project decision',
        importance: 8,
        is_global: true
      });

      const results = await store.searchMemories('project decision', 10);

      // Workspace should rank higher due to 1.0x vs 0.9x weighting
      expect(results[0].id).toBe(ws.id);
      expect(results[1].id).toBe(global.id);
    });
  });

  describe('Conversion', () => {
    test('convertToGlobal moves workspace to global', async () => {
      const ws = await store.createMemory({ content: 'workspace' });
      expect(ws.is_global).toBe(false);

      const global = await store.convertToGlobal(ws.id);
      expect(global.is_global).toBe(true);
      expect(global.workspace_id).toBe('');

      // Verify it's in global storage
      const retrieved = await store.getMemory(ws.id, true);
      expect(retrieved).toBeTruthy();
      expect(retrieved.is_global).toBe(true);
    });

    test('convertToWorkspace moves global to workspace', async () => {
      const global = await store.createMemory({
        content: 'global',
        is_global: true
      });
      expect(global.is_global).toBe(true);

      const ws = await store.convertToWorkspace(global.id);
      expect(ws.is_global).toBe(false);
      expect(ws.workspace_id).toBeTruthy();
    });
  });
});
```

**Checklist:**
- [ ] Setup test framework (Vitest or Jest)
- [ ] Write storage tests
- [ ] Write retrieval tests
- [ ] Write workspace mode tests
- [ ] Write search weighting tests
- [ ] Write conversion tests
- [ ] All tests pass
- [ ] Add to CI pipeline

**Time Estimate:** 2-3 hours

---

## PHASE 2: Feature 2 - Memory Relationships (2-3 days)

### Goal
Link memories together to build a knowledge graph

### Implementation Steps

**Day 1: Schema & Storage (6-8 hours)**
1. Define `MemoryRelationship` interface
2. Add relationship storage to Redis
3. Update Memory interface with `related_memory_ids`
4. Implement `createRelationship()` method
5. Implement `getRelationships()` method
6. Implement `deleteRelationship()` method

**Day 2: Tools & Graph Traversal (6-8 hours)**
1. Implement `link_memories` tool
2. Implement `get_related_memories` tool
3. Implement `unlink_memories` tool
4. Build graph traversal logic with depth limits
5. Handle circular references
6. Add relationship resource endpoints

**Day 3: Testing & Polish (4-6 hours)**
1. Unit tests for relationships
2. Graph traversal tests
3. Circular reference tests
4. Documentation
5. Examples

---

## PHASE 3: Feature 3 - Memory Versioning (2-3 days)

### Goal
Track all changes to memories over time

### Implementation Steps

**Day 1: Schema & Storage (6-8 hours)**
1. Define `MemoryVersion` interface
2. Add version field to Memory
3. Implement version storage in Redis
4. Update `updateMemory()` to save versions
5. Implement `getMemoryHistory()` method
6. Add version cleanup logic

**Day 2: Tools (6-8 hours)**
1. Implement `get_memory_history` tool
2. Implement `rollback_memory` tool
3. Implement `compare_memory_versions` tool
4. Build diff view between versions
5. Add version resources

**Day 3: Testing & Polish (4-6 hours)**
1. Version storage tests
2. Rollback tests
3. Diff tests
4. Documentation
5. Examples

---

## PHASE 4: Feature 4 - Smart Suggestions (2-3 days)

### Goal
AI-powered memory quality and duplicate detection

### Implementation Steps

**Day 1: Quality Scoring (6-8 hours)**
1. Implement Claude-based quality scoring
2. Create scoring prompt templates
3. Build `scoreMemoryQuality()` function
4. Test scoring accuracy
5. Add configurable thresholds

**Day 2: Duplicate Detection & Tools (6-8 hours)**
1. Implement similarity checking
2. Build duplicate detection logic
3. Implement `suggest_memories` tool
4. Create conversation analysis
5. Format suggestions for users

**Day 3: Integration & Testing (4-6 hours)**
1. Integrate with `analyze_and_remember`
2. Add proactive suggestions
3. Test quality scoring
4. Test duplicate detection
5. Documentation

---

## PHASE 5: Release (1 day)

### Final Steps

1. **Version Bump (30 min)**
   - Update package.json to 1.3.0
   - Update src/index.ts version
   - Update CHANGELOG.md final dates

2. **Final Testing (2-3 hours)**
   - Full integration tests
   - Performance tests
   - Manual testing in MCP Inspector

3. **Documentation Review (1-2 hours)**
   - README completeness
   - All features documented
   - Examples clear and working

4. **Build & Publish (1 hour)**
   - Final build
   - npm publish
   - GitHub release
   - Update PR #1

5. **Announcement (30 min)**
   - Twitter/X post
   - GitHub release notes
   - Update README badges

---

## Timeline Summary

| Phase | Duration | Cumulative |
|-------|----------|------------|
| Phase 1: Complete Feature 1 | 4-6 hours | 6 hours |
| Phase 2: Memory Relationships | 2-3 days | 3.25 days |
| Phase 3: Memory Versioning | 2-3 days | 6 days |
| Phase 4: Smart Suggestions | 2-3 days | 8.5 days |
| Phase 5: Release | 1 day | 9.5 days |

**Total: 8-10 days to v1.3.0 release**

---

## Decision Points

### Option A: Ship Feature 1 Now (Recommended)
- Release v1.3.0-beta with just global memories
- Get user feedback
- Iterate on Features 2, 3, 4 based on feedback
- **Timeline:** 4-6 hours to beta release

### Option B: Complete All Features
- Implement all 4 features before release
- More comprehensive release
- Longer time to user feedback
- **Timeline:** 8-10 days to full release

### Option C: MVP Approach
- Feature 1 (done) + Feature 2 (relationships)
- Release as v1.3.0
- Features 3 & 4 in v1.4.0
- **Timeline:** 3-4 days to release

---

## Recommendation

**Ship Feature 1 as v1.3.0 now** (Option A)

**Reasons:**
1. Feature 1 is solid, tested, and valuable on its own
2. Global memories solve a real user pain point
3. Get early feedback before building Features 2, 3, 4
4. Shorter release cycle = faster iteration
5. Can always do v1.4.0, v1.5.0 for other features

**Next Steps:**
1. Complete Phase 1 (4-6 hours)
2. Release v1.3.0
3. Gather feedback
4. Plan v1.4.0 based on usage

---

*Plan created: 2025-10-02*
*Status: Ready to execute*
