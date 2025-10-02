# Workspace Modes & Global Memories

## Current Behavior (v1.2.0)

**Workspace Isolation:** All memories are automatically isolated by directory.

```
/Users/you/project-a/  → Workspace A memories (isolated)
/Users/you/project-b/  → Workspace B memories (isolated)
```

This prevents memory pollution between projects.

---

## Future Enhancement: Hybrid Mode (v1.3.0)

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

## Proposed Implementation

### Option 1: Global Flag on Memories

Add `is_global` field to memory schema:

```typescript
{
  content: "I prefer TypeScript strict mode in all projects",
  context_type: "preference",
  importance: 9,
  is_global: true  // ← New field
}
```

**Storage:**
- Global memories: `global:memory:{id}`
- Workspace memories: `ws:{workspace_id}:memory:{id}`

**Search behavior:**
- Always searches workspace + global memories
- Global memories have slightly lower weight (0.9x) to prefer local context

### Option 2: Environment Variable Configuration

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

**Modes:**
- `isolated` (default): Current behavior
- `global`: All memories shared across workspaces
- `hybrid`: Support both global and workspace memories

### Option 3: Separate MCP Instances

Run two instances:

```json
{
  "mcpServers": {
    "recall-workspace": {
      "command": "npx",
      "args": ["-y", "@joseairosa/recall"],
      "env": {
        "WORKSPACE_MODE": "isolated"
      }
    },
    "recall-global": {
      "command": "npx",
      "args": ["-y", "@joseairosa/recall"],
      "env": {
        "WORKSPACE_MODE": "global"
      }
    }
  }
}
```

**Pros:** Simple, explicit control
**Cons:** Two processes, more configuration

---

## Recommended Approach: Hybrid Mode (Option 1 + 2)

### Implementation Plan

1. **Add `is_global` field** to `CreateMemorySchema`
2. **Add `WORKSPACE_MODE` environment variable**
3. **Update search logic** to include global memories
4. **Add tools:**
   - `convert_to_global` - Promote workspace memory to global
   - `convert_to_workspace` - Demote global memory to workspace

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
- All existing memories remain workspace-isolated
- No breaking changes
- `is_global` defaults to `false`
- Users opt-in to global memories

---

## Alternative: Remote Redis with Shared Workspace

Instead of global memories, users can:

1. **Use remote Redis** (Upstash, Redis Cloud)
2. **Share Redis URL** across team
3. **Use same workspace path** for shared memories

```json
{
  "env": {
    "REDIS_URL": "rediss://team-redis.upstash.io:6379",
    "WORKSPACE_PATH": "/team/project-x"  // Override detection
  }
}
```

This enables:
- Team-shared memories for a project
- Consistent memories across machines
- Backup and sync automatically

---

## Summary

**Current (v1.2.0):** ✅ Workspace isolation works perfectly

**Near-term solution:**
- Document cloud Redis options (Upstash, Redis Cloud)
- No local install required
- Remote server fully supported

**Future enhancement (v1.3.0):**
- Add `is_global` flag for hybrid mode
- Implement `WORKSPACE_MODE` environment variable
- Add conversion tools

**Recommendation:** Ship v1.2.0 now with cloud Redis docs, plan v1.3.0 for hybrid mode based on user feedback.
