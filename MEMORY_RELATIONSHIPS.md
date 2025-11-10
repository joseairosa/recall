# Memory Relationships Guide (v1.4.0)

## Overview

Memory Relationships enable you to **link related memories together**, creating a knowledge graph that helps Claude understand connections between concepts, patterns, implementations, and decisions.

### Why Use Relationships?

- **Connect patterns to implementations** - Link abstract patterns to concrete examples
- **Build decision trees** - Connect decisions to their rationale and consequences
- **Track feature evolution** - Link related memories across time
- **Create hierarchical structures** - Organize memories with parent-child relationships
- **Enable graph traversal** - Discover related context automatically

---

## Relationship Types

Recall supports **7 relationship types** for different connection patterns:

| Type | Description | Example |
|------|-------------|---------|
| **`relates_to`** | Generic connection | "Authentication" relates to "Security" |
| **`parent_of`** | Hierarchical (from is parent) | "API Design" parent of "REST Endpoints" |
| **`child_of`** | Hierarchical (from is child) | "Login endpoint" child of "Authentication" |
| **`references`** | From references to | "Implementation" references "RFC 7519" |
| **`supersedes`** | From replaces to | "New pattern" supersedes "Old pattern" |
| **`implements`** | From implements to | "Example code" implements "Error pattern" |
| **`example_of`** | From is example of to | "try-catch code" example of "Error handling" |

---

## Creating Relationships

### Natural Language

Claude can create relationships from natural language:

```
"Link these two memories: implementation mem_abc123 is an example of pattern mem_xyz789"
```

Claude uses `link_memories` with type `example_of`.

### Direct Tool Call

```json
{
  "tool": "link_memories",
  "arguments": {
    "from_memory_id": "mem_abc123",
    "to_memory_id": "mem_xyz789",
    "relationship_type": "example_of",
    "metadata": {
      "note": "Shows async/await pattern"
    }
  }
}
```

### Features

- **Idempotent** - Creating the same relationship twice returns the existing one
- **Validation** - Both memories must exist before linking
- **Self-reference prevention** - Cannot link a memory to itself
- **Metadata support** - Optional metadata for additional context

---

## Traversing Relationships

### Get Related Memories

Find all memories connected to a root memory:

```
"Show me all memories related to mem_abc123"
```

Claude uses `get_related_memories` with default depth=1.

**With depth:**
```
"Show me memories related to mem_abc123, going 3 levels deep"
```

**With direction:**
```
"Show me memories that reference mem_abc123" (incoming)
"Show me memories that mem_abc123 references" (outgoing)
"Show me all connected memories" (both - default)
```

**With relationship type filter:**
```
"Show me all examples of pattern mem_abc123"
```

Claude filters by `relationship_type: ["example_of"]`.

### Graph Parameters

- **`depth`** - How many levels to traverse (1-5, default: 1)
- **`direction`** - Which way to traverse:
  - `outgoing` - Follow relationships from this memory
  - `incoming` - Follow relationships to this memory
  - `both` - Follow all relationships (default)
- **`relationship_types`** - Filter by specific types (optional)

---

## Memory Graphs

Get a complete graph structure for visualization:

```
"Get the memory graph for mem_abc123"
```

Claude uses `get_memory_graph` with default depth=2, max_nodes=50.

**Graph Structure:**

```json
{
  "root_memory_id": "mem_abc123",
  "total_nodes": 12,
  "max_depth_reached": 2,
  "nodes": {
    "mem_abc123": {
      "memory_id": "mem_abc123",
      "content": "Error handling pattern...",
      "context_type": "code_pattern",
      "importance": 9,
      "depth": 0,
      "relationships": [
        {
          "id": "rel_xyz",
          "type": "example_of",
          "from": "mem_def456",
          "to": "mem_abc123"
        }
      ]
    },
    "mem_def456": {
      "memory_id": "mem_def456",
      "content": "try { ... } catch { ... }",
      "context_type": "code_pattern",
      "importance": 8,
      "depth": 1,
      "relationships": [...]
    }
  }
}
```

### Graph Limits

- **`max_depth`** - Maximum depth to traverse (1-3, default: 2)
- **`max_nodes`** - Maximum nodes to return (1-100, default: 50)

These limits prevent performance issues with large graphs.

---

## Removing Relationships

Remove a relationship while keeping both memories:

```
"Unlink relationship rel_abc123"
```

Claude uses `unlink_memories`.

**What happens:**
- ✅ Relationship is deleted
- ✅ Both memories remain intact
- ✅ Other relationships to these memories are preserved

---

## Browsing Relationships

### Resources

Use MCP resources to browse relationships:

**List all relationships:**
```
memory://relationships?limit=100
```

**Get related memories:**
```
memory://memory/{id}/related?depth=2&direction=both
```

**Get memory graph:**
```
memory://graph/{id}?depth=2&max_nodes=50
```

---

## Global Relationships

Relationships **inherit scope from memories**:

| From Memory | To Memory | Relationship Scope |
|-------------|-----------|-------------------|
| Workspace | Workspace | Workspace |
| Global | Global | **Global** |
| Workspace | Global | **Error** ❌ |
| Global | Workspace | **Error** ❌ |

**Why this design?**
- Global memories should only link to other global memories
- Workspace memories can link to other workspace memories
- This prevents scope leakage and maintains isolation

---

## Examples

### Example 1: Link Pattern to Implementation

```
You: "Remember this error pattern: Always use try-catch with custom errors"
Claude: ✓ Stored: mem_pattern_123

You: "Remember this example: try { await api() } catch (e) { throw new AppError(e) }"
Claude: ✓ Stored: mem_example_456

You: "Link these: the example implements the pattern"
Claude: [Creates relationship with type 'implements']
        ✓ Linked: mem_example_456 → mem_pattern_123 (implements)

You (later): "Show me examples of the error pattern"
Claude: [Uses get_related_memories with filter]
        "I found 1 implementation:
         - mem_example_456: try { await api() } catch { throw new AppError(e) }"
```

### Example 2: Build Decision Tree

```
You: "Remember: Chose PostgreSQL over MongoDB for ACID guarantees"
Claude: ✓ Stored: mem_decision_789

You: "Remember: PostgreSQL choice enables strong consistency"
Claude: ✓ Stored: mem_consequence_111

You: "Link these: the consequence is a child of the decision"
Claude: [Creates relationship with type 'child_of']
        ✓ Linked: mem_consequence_111 → mem_decision_789 (child_of)

You (later): "What were the consequences of choosing PostgreSQL?"
Claude: [Uses get_related_memories with direction='outgoing', types=['child_of']]
        "The PostgreSQL decision had these consequences:
         - Strong consistency enabled
         - [other related memories]"
```

### Example 3: Track Feature Evolution

```
You: "Old auth pattern used sessions (deprecated)"
Claude: ✓ Stored: mem_old_pattern_222

You: "New auth pattern uses JWT with refresh tokens"
Claude: ✓ Stored: mem_new_pattern_333

You: "Link these: new pattern supersedes old pattern"
Claude: [Creates relationship with type 'supersedes']
        ✓ Linked: mem_new_pattern_333 → mem_old_pattern_222 (supersedes)

You (later): "What replaced the session-based auth?"
Claude: [Uses get_related_memories with filter 'supersedes']
        "JWT with refresh tokens superseded the old session pattern"
```

---

## Best Practices

### 1. **Use Descriptive Relationship Types**
- `implements` - For concrete implementations of abstract patterns
- `example_of` - For examples demonstrating concepts
- `parent_of` / `child_of` - For hierarchical organization
- `references` - For citations and dependencies
- `supersedes` - For deprecation and replacement tracking

### 2. **Keep Depth Reasonable**
- Depth 1-2: Fast, good for immediate relationships
- Depth 3-5: Slower, use sparingly for deep exploration
- Use `max_nodes` to prevent overwhelming results

### 3. **Combine with Search**
- First search for relevant memories
- Then explore their relationships
- This gives both breadth (search) and depth (relationships)

### 4. **Use Metadata**
- Add notes explaining why memories are linked
- Store dates for time-based relationships
- Add confidence scores if applicable

### 5. **Clean Up Old Relationships**
- Remove relationships when memories are deprecated
- Use `unlink_memories` to maintain graph health

---

## Technical Details

### Storage

**Redis/Valkey Keys:**
```
# Workspace relationships
ws:{workspace_id}:relationship:{id}
ws:{workspace_id}:relationships:all
ws:{workspace_id}:memory:{id}:relationships:out
ws:{workspace_id}:memory:{id}:relationships:in

# Global relationships
global:relationship:{id}
global:relationships:all
global:memory:{id}:relationships:out
global:memory:{id}:relationships:in
```

### Graph Traversal Algorithm

```typescript
function traverseGraph(memoryId, depth, visited, results) {
  if (depth === 0 || visited.has(memoryId)) return;

  visited.add(memoryId);

  relationships = getRelationships(memoryId);

  for (rel of relationships) {
    relatedId = getOtherMemoryId(rel, memoryId);

    if (!visited.has(relatedId)) {
      results.push({ memory, relationship, depth });

      if (depth > 1) {
        traverseGraph(relatedId, depth - 1, visited, results);
      }
    }
  }
}
```

**Features:**
- Circular reference protection via `visited` set
- Depth-first traversal
- Bidirectional support (outgoing/incoming/both)
- Type filtering at each level

---

## Future Enhancements

Planned for future versions:

- **Relationship weights** - Indicate strength of connection
- **Relationship metadata search** - Query by metadata fields
- **Automatic relationship suggestions** - AI-powered relationship detection
- **Relationship analytics** - Most connected memories, orphaned memories
- **Visual graph export** - Generate DOT/GraphViz output

---

## Troubleshooting

### "Memory not found" error

**Cause:** One or both memories don't exist.

**Solution:** Verify memory IDs exist before linking:
```
"Does memory mem_abc123 exist?"
```

### "Cannot create relationship to self"

**Cause:** Trying to link a memory to itself.

**Solution:** Ensure from_memory_id ≠ to_memory_id.

### "Cannot link global to workspace memory"

**Cause:** Trying to link memories with different scopes.

**Solution:** Convert workspace memory to global first:
```
"Convert mem_xyz to global, then link it to mem_abc"
```

### Empty results from get_related_memories

**Possible causes:**
- Memory has no relationships
- Wrong direction specified
- Relationship type filter too restrictive
- Depth too shallow

**Solution:** Try `direction='both'` and increase depth.

---

## See Also

- [README.md](README.md) - Main documentation
- [WORKSPACE_MODES.md](WORKSPACE_MODES.md) - Global memory guide
- [CHANGELOG.md](CHANGELOG.md) - Version history
