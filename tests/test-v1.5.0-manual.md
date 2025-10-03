# v1.5.0 Manual Testing Checklist

Follow these steps to thoroughly test all v1.5.0 features with the running MCP server.

## Prerequisites

1. Redis running: `redis-server`
2. Set environment variables:
   ```bash
   export REDIS_URL="redis://localhost:6379"
   export OPENAI_API_KEY="your-key-here"
   export ANTHROPIC_API_KEY="your-key-here"
   ```
3. Start MCP server: `npx -y @joseairosa/recall`

## Test 1: Memory Versioning

### 1.1 Create a memory
Via Claude:
```
"Store a memory: Testing versioning feature with initial content"
```

Expected: Memory created with ID (e.g., `mem_01ABC...`)

### 1.2 Update the memory
```
"Update memory [ID from above] to say: Updated content for version test"
```

Expected: Memory updated, version auto-created

### 1.3 Check version history
```
"Show me the version history for memory [ID]"
```

Expected:
- At least 1 version shown
- First version has original content
- Includes timestamps and change reasons

### 1.4 Update again
```
"Update memory [ID] to say: Third version of content"
```

Expected: Another version created

### 1.5 Rollback
```
"Rollback memory [ID] to the first version"
```

Expected:
- Memory content restored to original
- Relationships preserved
- System versions created for rollback

### 1.6 Verify Redis keys
```bash
redis-cli
> KEYS *:memory:[ID]:versions
> ZRANGE [key from above] 0 -1
> KEYS *:memory:[ID]:version:*
```

Expected: Version sorted set and version hashes exist

---

## Test 2: Memory Templates

### 2.1 Create template
Via Claude:
```
"Create a template named 'Bug Report' with fields: {{title}}, {{severity}}, {{description}}"
```

Expected: Template created with ID

### 2.2 List templates
```
"List all available templates"
```

Expected: Shows newly created template

### 2.3 Create from template
```
"Create a memory from the Bug Report template: title='Login broken', severity='high', description='Users cannot log in'"
```

Expected:
- Memory created with filled-in content
- No {{placeholders}} remaining
- Default tags/importance applied

### 2.4 Test missing variables
```
"Create a memory from Bug Report template with only title='Test'"
```

Expected: Error about missing variables (severity, description)

### 2.5 Verify Redis keys
```bash
redis-cli
> KEYS *:template:*
> KEYS *:templates:all
```

Expected: Template hashes and index set exist

---

## Test 3: Memory Categories

### 3.1 Create with category
Via Claude:
```
"Store a memory in category 'authentication': OAuth implementation using JWT tokens"
```

Expected: Memory created with category field set

### 3.2 Assign category to existing
```
"Categorize memory [ID] as 'database'"
```

Expected: Category assigned successfully

### 3.3 Create multiple in same category
```
"Store in authentication category: Two-factor authentication setup"
"Store in authentication category: Password reset flow"
```

Expected: Multiple memories in same category

### 3.4 List categories
```
"Show me all categories with memory counts"
```

Expected: Shows categories with counts (authentication should have 2+)

### 3.5 Get by category
```
"Show me all memories in the authentication category"
```

Expected: Returns all authentication memories

### 3.6 Update category
```
"Change the category of memory [ID] to 'security'"
```

Expected: Category updated, removed from old, added to new

### 3.7 Verify Redis keys
```bash
redis-cli
> KEYS *:category:*
> KEYS *:categories:all
> SMEMBERS [category key]
```

Expected: Category sets and index exist

---

## Test 4: Advanced Search - Fuzzy

### 4.1 Create test memory
```
"Store: Authentication system configuration"
```

### 4.2 Search with typo (no fuzzy)
```
"Search for 'authentification'"
```

Expected: May or may not find it (depends on semantic similarity)

### 4.3 Search with typo (fuzzy enabled)
```
"Search for 'authentification' with fuzzy matching enabled"
```

Expected: Should find "Authentication" despite typo (20% boost)

---

## Test 5: Advanced Search - Regex

### 5.1 Create test memories
```
"Store: API v1 endpoint documentation"
"Store: API v2 new features"
"Store: API v3 breaking changes"
"Store: Database configuration"
```

### 5.2 Regex search
```
"Search for memories matching pattern 'API.*v[0-9]+'"
```

Expected: Returns only API v1, v2, v3 (not database)

---

## Test 6: Advanced Search - Category Filter

### 6.1 Category search
```
"Search for 'configuration' only in the 'authentication' category"
```

Expected: Only returns authentication memories with "configuration"

### 6.2 Combined filters
```
"Search for 'system' in authentication category with fuzzy matching"
```

Expected: Combines category filter + fuzzy search

---

## Test 7: Backward Compatibility

### 7.1 Create old-style memory
```
"Store without category: Old style memory for compatibility test"
```

Expected: Works without category (optional field)

### 7.2 Old-style search
```
"Search for 'compatibility'"
```

Expected: Standard search works without new parameters

### 7.3 Old-style update
```
"Update memory [ID] content to: Updated via old API"
```

Expected: Update works, version created automatically

### 7.4 v1.4.0 relationships still work
```
"Link memory [ID1] relates_to memory [ID2]"
"Show related memories for [ID1]"
```

Expected: Relationships work as before

---

## Test 8: Edge Cases

### 8.1 Version limit (50 max)
Update same memory 51+ times and check that only last 50 versions kept

### 8.2 Empty template variables
Try to create template with no placeholders

### 8.3 Invalid regex
Search with invalid regex pattern (should skip regex filter)

### 8.4 Special characters in category
Try category names with spaces, symbols

---

## Success Criteria

✅ All version operations work (create, view, rollback)
✅ Templates can be created and instantiated
✅ Categories can be assigned and filtered
✅ Fuzzy search improves typo tolerance
✅ Regex search filters correctly
✅ Category filtering works in search
✅ Backward compatibility maintained
✅ Redis keys created correctly
✅ No runtime errors or crashes
✅ Memory operations remain fast

---

## Cleanup

After testing:
```bash
redis-cli
> KEYS *test*
> DEL [keys to remove]
```

Or flush test database if using separate DB:
```bash
redis-cli -n 1 FLUSHDB
```
