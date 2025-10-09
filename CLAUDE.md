# CLAUDE.md - MCP Memory Server

Project-specific instructions for Claude when working with this codebase.

---

## Project Context

This is an MCP (Model Context Protocol) server that provides **long-term memory** for Claude conversations. It stores context in Redis with semantic search capabilities to survive context window limitations.

**Key Principle**: This server IS the solution to context loss - treat it with care and always maintain backward compatibility.

---

## Using Recall Efficiently (Context Bloat Prevention)

**IMPORTANT: Be selective with memory storage to avoid context bloat.**

### When to Store Memories

Store **HIGH-SIGNAL** context only:
- ✅ High-level decisions and reasoning ("We chose PostgreSQL over MongoDB because...")
- ✅ Project preferences (coding style, tech stack, architecture patterns)
- ✅ Critical constraints (API limits, business rules, security requirements)
- ✅ Learned patterns from bugs/solutions ("Avoid X because it causes Y")

### When NOT to Store

Don't store **LOW-SIGNAL** content:
- ❌ Code snippets or implementations (put those in files)
- ❌ Obvious facts or general knowledge
- ❌ Temporary context (only needed in current session)
- ❌ Duplicates of what's already in documentation

### Keep Memories Concise

**Examples:**
- ✅ GOOD: "API rate limit is 1000 req/min, prefer caching for frequently accessed data"
- ❌ BAD: "Here's the entire implementation of our caching layer: [50 lines of code]"

- ✅ GOOD: "Team prefers Tailwind CSS over styled-components for consistency"
- ❌ BAD: "Tailwind is a utility-first CSS framework that..."

**Remember:** Recall is for high-level context, not a code repository. Quality over quantity.

---

## Time Window Context Retrieval (v1.6.0+)

### When to Use `get_time_window_context`

Use this tool to retrieve consolidated context from specific time periods:

**Perfect for:**
- 📋 Building context files from work sessions ("Give me everything from the last 2 hours as markdown")
- 🔄 Session handoffs ("Show me what we worked on in the last hour")
- 📊 Progress summaries ("Get all decisions from today")
- 📝 Documentation ("Export the last 4 hours as a context file")

**How to use:**
```
"Give me the context for the last 2 hours"
"Show me all high-importance memories from the last hour, grouped by type"
"Export the last 30 minutes as JSON"
```

### Output Format Options

- **Markdown** (default): Clean formatted context ready to paste
- **JSON**: Structured data for processing
- **Text**: Simple plain text summary

### Grouping Options

- **Chronological**: Time-ordered (default, oldest to newest)
- **By type**: Grouped by context_type (decisions, patterns, etc.)
- **By importance**: High to low priority
- **By tags**: Organized by tag categories

### Best Practices

**DO:**
- ✅ Use for building context files after work sessions
- ✅ Filter by importance (>= 8) for critical context only
- ✅ Group by type when exporting for specific purposes
- ✅ Use markdown format for human-readable output
- ✅ Use JSON format when passing to external tools

**DON'T:**
- ❌ Retrieve huge time windows (>24 hours) without filtering
- ❌ Use when semantic search would be better (use `search_memories` instead)
- ❌ Store the output as another memory (creates redundancy)

---

## Development Guidelines

### Code Style

- **TypeScript**: Strict mode, full type safety
- **ESM Modules**: Use `.js` extensions in imports (even for `.ts` files)
- **Naming**: camelCase for variables/functions, PascalCase for types/classes
- **Files**: kebab-case for filenames (e.g., `memory-store.ts`)

### Architecture Principles

1. **Immutable Memory IDs**: Never change ULID generation - memories must remain accessible
2. **Backward Compatible**: New context types OK, removing types breaks existing memories
3. **Index Integrity**: Always update ALL indexes when modifying/deleting memories
4. **Atomic Operations**: Use Redis pipelines for multi-step updates
5. **Error Handling**: Use MCP error codes (`ErrorCode.InvalidRequest`, `ErrorCode.InternalError`)

### Redis Data Model

**NEVER** change these key patterns without migration:
```
memory:{id}              → Hash
memories:all             → Set
memories:timeline        → Sorted Set (score = timestamp)
memories:type:{type}     → Set
memories:tag:{tag}       → Set
memories:important       → Sorted Set (score = importance)
session:{id}             → Hash
sessions:all             → Set
```

### Context Types (Do Not Remove)

These 10 types are core to the system:
- `directive`, `information`, `heading`, `decision`, `code_pattern`, `requirement`, `error`, `todo`, `insight`, `preference`

**Adding new types**: OK, add to enum in [types.ts](src/types.ts)
**Removing types**: NO - breaks existing memories

### Importance Scale

- **1-3**: Low (transient)
- **4-7**: Medium (general)
- **8-10**: High (critical, auto-indexed)

**Do not change**: The ≥8 threshold for `memories:important` index

---

## Making Changes

### Adding a New Tool

1. Add Zod schema to [types.ts](src/types.ts)
2. Add method to `MemoryStore` class in [memory-store.ts](src/redis/memory-store.ts)
3. Add tool handler to [tools/index.ts](src/tools/index.ts)
4. Update documentation in [README.md](README.md)

### Adding a New Resource

1. Add resource handler to [resources/index.ts](src/resources/index.ts)
2. Add routing in [index.ts](src/index.ts) `ReadResourceRequestSchema` handler
3. Add to resource list in `ListResourcesRequestSchema` handler
4. Update documentation

### Modifying Storage Logic

**CRITICAL**: If changing `MemoryStore` methods:
1. Ensure index updates are atomic (use pipelines)
2. Test with existing Redis data
3. Document migration path if needed
4. Update version in [package.json](package.json)

### Adding Dependencies

- Keep bundle size small (currently 35KB)
- Prefer native Node.js APIs when possible
- Check for ESM compatibility
- Update [package.json](package.json)

---

## Build & Test

### Build
```bash
npm run build      # Production build
npm run dev        # Watch mode
```

### Manual Testing
```bash
# Start Redis
redis-server

# Run server (manual test)
REDIS_URL=redis://localhost:6379 OPENAI_API_KEY=sk-... node dist/index.js

# In another terminal, test Redis
redis-cli
> KEYS *
```

### Verify MCP Config
```bash
# Check Claude Desktop config
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Check logs
tail -f ~/Library/Logs/Claude/mcp*.log
```

---

## Common Tasks

### Update OpenAI Model

Edit [embeddings/generator.ts](src/embeddings/generator.ts):
```typescript
model: 'text-embedding-3-small',  // Current
// Change to: 'text-embedding-3-large' for better quality
```

⚠️ **Warning**: Changing model invalidates existing embeddings! Need migration.

### Add New Context Type

1. Edit [types.ts](src/types.ts):
```typescript
export const ContextType = z.enum([
  // existing...
  'your_new_type',
]);
```

2. Update documentation in [README.md](README.md)

### Increase Embedding Dimensions

If switching to larger embedding model:
1. Update `embedding` field handling in [memory-store.ts](src/redis/memory-store.ts)
2. Existing memories will have wrong dimensions - need migration
3. Consider versioning: `embedding_v1`, `embedding_v2`

---

## Database Migrations

**Current**: No formal migration system

**If Redis Schema Changes**:
1. Create migration script in `scripts/migrate-{version}.ts`
2. Document in `MIGRATIONS.md`
3. Provide rollback instructions
4. Test on copy of production data first

**Never** delete old keys without migration path!

---

## Performance Considerations

### Semantic Search Bottlenecks

**Current**: O(n) cosine similarity in-app
- Fine for <10k memories (~2s)
- Slow for >50k memories

**Future**: Use RediSearch with vector similarity
- O(log n) with HNSW index
- Requires Redis Stack
- Need migration for index creation

### OpenAI API Costs

- `text-embedding-3-small`: ~$0.0001 per 1k tokens
- Average memory: ~100 tokens = $0.00001
- 10k memories: ~$0.10
- Use batch API when storing >5 memories

### Redis Memory Usage

- Per memory: ~2KB (content + embedding + indexes)
- 10k memories: ~20MB
- 100k memories: ~200MB
- Redis can handle this easily in-memory

---

## Security

### Current (Local Use)

- ✅ Runs on localhost
- ✅ No network exposure
- ✅ Uses local Redis

### For Production

Would need:
- [ ] Redis AUTH password
- [ ] TLS for Redis connection
- [ ] Rate limiting on tools
- [ ] User namespacing
- [ ] API key rotation
- [ ] Audit logging

---

## Debugging

### Server Not Starting

```bash
# Check Redis
redis-cli ping

# Check env vars
echo $REDIS_URL
echo $OPENAI_API_KEY

# Check logs
tail -f ~/Library/Logs/Claude/mcp*.log
```

### Memory Not Storing

1. Check OpenAI API key validity
2. Check Redis connection
3. Look for errors in Claude Desktop logs
4. Test Redis directly: `redis-cli KEYS memory:*`

### Search Not Working

1. Verify embeddings are generated (check `embedding` field length)
2. Check OpenAI API quota
3. Verify cosine similarity calculation
4. Test with exact content match first

---

## Documentation Updates

When modifying functionality:

1. Update [README.md](README.md) - User-facing docs
2. Update [QUICKSTART.md](QUICKSTART.md) - If setup changes
3. Update [ai_docs/learnings/README.md](ai_docs/learnings/README.md) - Technical insights
4. Update [ai_docs/plans/README.md](ai_docs/plans/README.md) - Architecture changes
5. Update this file - Development guidelines

---

## Version Management

**Current**: 1.0.0

**Semantic Versioning**:
- **Major (2.0.0)**: Breaking changes (schema changes, removed tools/resources)
- **Minor (1.1.0)**: New features (new tools, resources, context types)
- **Patch (1.0.1)**: Bug fixes, performance improvements

**Before Publishing**:
- Test with real Redis instance
- Verify all tools work
- Check bundle size
- Update CHANGELOG.md

---

## Don't Break

### Critical Files (Change with Extreme Care)

- [types.ts](src/types.ts) - Schema changes break existing data
- [memory-store.ts](src/redis/memory-store.ts) - Storage logic changes need migration
- [package.json](package.json) - Dependency changes affect bundle

### Safe to Modify

- [README.md](README.md) - Documentation only
- [resources/index.ts](src/resources/index.ts) - Adding resources is safe
- [tools/index.ts](src/tools/index.ts) - Adding tools is safe

---

## Testing Checklist

Before committing major changes:

- [ ] TypeScript compiles (`npm run build`)
- [ ] Bundle size reasonable (`ls -lh dist/index.js`)
- [ ] Shebang present (`head -1 dist/index.js`)
- [ ] Can store memory
- [ ] Can retrieve memory
- [ ] Can search memories
- [ ] Sessions work
- [ ] All indexes update correctly
- [ ] Error handling works
- [ ] Documentation updated

---

## Emergency Rollback

If production Redis has issues:

```bash
# Backup Redis
redis-cli SAVE
cp /var/lib/redis/dump.rdb dump.rdb.backup

# Restore from backup
redis-cli SHUTDOWN
cp dump.rdb.backup /var/lib/redis/dump.rdb
redis-server
```

---

## Support

**Maintainer**: José Airosa
**Issues**: File in GitHub (once published)
**Logs**: `~/Library/Logs/Claude/`

---

**Last Updated**: 2025-10-02
**Version**: 1.0.0
