# Workspace Modes & Global Memories

## Current Behavior (v1.3.0)

**Workspace Isolation (default):** All memories are automatically isolated by directory.

```
/Users/you/project-a/  → Workspace A memories (isolated)
/Users/you/project-b/  → Workspace B memories (isolated)
```

This prevents memory pollution between projects.

**Global Memories (v1.3.0):** Cross-workspace memory sharing with three modes:
- **`isolated`** (default) - Workspace-only, no cross-workspace access
- **`global`** - All memories shared globally, no workspace isolation
- **`hybrid`** - Both workspace AND global memories

---

## Global Memories (v1.3.0)

### Use Cases for Global Memories

**Global memories** would be useful for:
- Personal preferences (communication style, coding conventions)
- General knowledge (team practices, company policies)
- Cross-project patterns (error handling, testing approaches)
- Tools and commands you always use

**Workspace memories** for:
- Project-specific architecture decisions
- Local database schemas
- Feature requirements
- Bug fixes and issues

---

## Implementation (v1.3.0)

### Schema Changes

Added `is_global` field to memory schema:

```typescript
// New field in MemoryEntry
is_global: boolean  // If true, memory is accessible across all workspaces
workspace_id: string  // Workspace identifier (empty for global memories)

// New field in CreateMemory
is_global?: boolean  // Optional, defaults to false
```

### Storage Architecture

**Redis/Valkey Key Structure:**
- Global memories: `global:memory:{id}`
- Workspace memories: `ws:{workspace_id}:memory:{id}`

**Indexes:**
- Global timeline: `global:memories:timeline`
- Global by type: `global:memories:type:{type}`
- Global by tag: `global:memories:tag:{tag}`
- Global important: `global:memories:important`

### Workspace Modes

Configure via `WORKSPACE_MODE` environment variable:

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

**Mode Behaviors:**

| Mode | Workspace Memories | Global Memories | Search Behavior |
|------|-------------------|-----------------|-----------------|
| **`isolated`** (default) | ✅ Stored & retrieved | ❌ Not accessible | Workspace only |
| **`global`** | ❌ All stored as global | ✅ All memories global | Global only |
| **`hybrid`** | ✅ Stored & retrieved | ✅ Stored & retrieved | Both, weighted |

**Hybrid Mode Search Weighting:**
- Workspace memories: 1.0x similarity score (preferred)
- Global memories: 0.9x similarity score (slightly lower priority)
- This ensures local context is preferred over global knowledge

### New Tools (v1.3.0)

**`convert_to_global`** - Convert workspace memory to global:
```typescript
{
  tool: "convert_to_global",
  arguments: {
    memory_id: "mem_abc123"
  }
}
```

**`convert_to_workspace`** - Convert global memory to workspace:
```typescript
{
  tool: "convert_to_workspace",
  arguments: {
    memory_id: "mem_abc123",
    workspace_id: "/Users/you/project-a"  // Optional, defaults to current
  }
}
```

### New Resources (v1.3.0)

Global memory resources (only work in `global` or `hybrid` modes):
- `memory://global/recent?limit=50` - Recent global memories
- `memory://global/by-type/{type}?limit=50` - Global memories by context type
- `memory://global/by-tag/{tag}?limit=50` - Global memories by tag
- `memory://global/important?min=8&limit=50` - Important global memories
- `memory://global/search?q=query&limit=10` - Search global memories

**Error in isolated mode:**
```
McpError: Global memories are not available in isolated mode.
Set WORKSPACE_MODE=hybrid or global to access global memories.
```

### User Experience

```javascript
// Store a global preference
{
  tool: "store_memory",
  arguments: {
    content: "Always use ULIDs for database IDs",
    context_type: "directive",
    importance: 10,
    is_global: true  // Available in all workspaces
  }
}

// Store workspace-specific
{
  tool: "store_memory",
  arguments: {
    content: "This project uses MySQL with Drizzle ORM",
    context_type: "information",
    importance: 8,
    is_global: false  // Only this workspace
  }
}

// Search automatically includes both
{
  tool: "search_memories",
  arguments: {
    query: "database setup",
    // Returns: Global directive + workspace MySQL info
  }
}
```

### Migration Path

For existing users (v1.2.0 → v1.3.0):
- ✅ **No breaking changes** - defaults to `isolated` mode
- ✅ All existing memories remain workspace-isolated
- ✅ `is_global` defaults to `false` for all new memories
- ✅ Users opt-in to global memories by setting `WORKSPACE_MODE`

**Backward compatibility:**
```typescript
// v1.2.0 memories (no is_global field)
{
  id: "mem_123",
  content: "...",
  // is_global: undefined → treated as false
}

// v1.3.0+ automatically adds fields
{
  id: "mem_123",
  content: "...",
  is_global: false,  // Added with default value
  workspace_id: "/Users/you/project-a"
}
```

### Implementation Details

**CreateMemory behavior by mode:**

| Mode | `is_global` param | Storage Location | Indexes |
|------|------------------|------------------|---------|
| `isolated` | Ignored | Workspace | Workspace only |
| `global` | Forced to `true` | Global | Global only |
| `hybrid` | Respected | Based on flag | Both as appropriate |

**Search behavior:**

```typescript
// Isolated mode
searchMemories("query", 10)
// → Searches: workspace memories only

// Global mode
searchMemories("query", 10)
// → Searches: global memories only

// Hybrid mode
searchMemories("query", 10)
// → Searches: workspace (1.0x) + global (0.9x)
// → Merges results, sorts by weighted similarity
```

**Conversion logic:**

```typescript
// Convert to global
// 1. Fetch memory from workspace
// 2. Delete from workspace indexes (memory, timeline, by-type, by-tag, important)
// 3. Store in global indexes with is_global=true
// 4. Update workspace_id to empty string

// Convert to workspace
// 1. Fetch memory from global
// 2. Delete from global indexes
// 3. Store in workspace indexes with is_global=false
// 4. Update workspace_id to target workspace
```

---

## Alternative: Remote Redis with Shared Workspace

Instead of using global memories feature, users can share memories by:

1. **Use remote Redis** (Upstash, Redis Cloud)
2. **Share Redis URL** across team
3. **Use same workspace path** for project memories

```json
{
  "env": {
    "REDIS_URL": "rediss://team-redis.upstash.io:6379",
    "WORKSPACE_MODE": "isolated"  // Traditional workspace isolation
  }
}
```

This enables:
- Team-shared memories for specific projects
- Consistent memories across machines
- Automatic backup and sync
- Simpler than global memories for single-project teams

---

## Summary

**v1.3.0 Implementation:** ✅ Complete

**Features shipped:**
- ✅ Global memories with `is_global` flag
- ✅ Three workspace modes: `isolated`, `global`, `hybrid`
- ✅ Hybrid search with 0.9x global weighting
- ✅ Conversion tools (`convert_to_global`, `convert_to_workspace`)
- ✅ Global resources (`memory://global/*`)
- ✅ No breaking changes, fully backward compatible

**Use Cases:**
- Personal preferences across all projects → Global memories
- Team conventions and patterns → Global memories
- Project-specific architecture → Workspace memories
- Local debugging notes → Workspace memories

**Next Steps (Future Versions):**
- v1.4.0: Memory relationships (links between memories)
- v1.5.0: Memory versioning (track changes over time)
- v1.6.0: Smart suggestions (AI-powered memory recommendations)
