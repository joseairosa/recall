# Changelog

## [1.1.0] - 2025-10-02

### 🎉 Major Features: Smart Context Management

#### New Tools
- **`recall_relevant_context`** - Proactive context retrieval tool that Claude can call automatically when it needs to recall relevant memories
- **`analyze_and_remember`** - Intelligent conversation analysis that extracts and stores structured memories automatically
- **`summarize_session`** - Session summarization tool that creates snapshots of work sessions

#### New Prompts
- **`workspace_context`** - Auto-injected prompt that displays critical directives, decisions, and patterns at conversation start

#### Enhanced Features
- Workspace isolation: Memories now segmented by project directory
- Claude API integration for intelligent analysis
- Semantic keyword extraction using Claude Haiku
- Auto-categorization of extracted memories
- Importance auto-scoring
- Session summaries with Claude-generated descriptions

#### Breaking Changes
- Switched from OpenAI to Anthropic API
  - `OPENAI_API_KEY` → `ANTHROPIC_API_KEY`
  - Embeddings now use hybrid approach (Claude keywords + trigrams)
- Redis keys now include workspace prefix: `ws:{workspace_id}:memory:{id}`
  - Existing memories will need migration if upgrading

#### New Files
- `src/analysis/conversation-analyzer.ts` - Claude API conversation analysis
- `src/prompts/index.ts` - MCP prompts handlers
- `src/prompts/formatters.ts` - Context formatting utilities
- `src/tools/context-tools.ts` - Smart context management tools
- `CONTEXT_MANAGEMENT.md` - Comprehensive guide for new features

#### Updated Files
- `src/types.ts` - Added new schemas and workspace context types
- `src/redis/memory-store.ts` - Added workspace isolation to all operations
- `src/embeddings/generator.ts` - Replaced OpenAI with Claude + hybrid approach
- `src/tools/index.ts` - Integrated new context tools
- `src/index.ts` - Added prompts capability
- `README.md` - Updated with v1.1.0 features
- `package.json` - Version bump, replaced openai with @anthropic-ai/sdk

---

## [1.0.0] - 2025-10-02

### Initial Release

#### Core Features
- Persistent memory storage in Redis
- Semantic search using OpenAI embeddings
- 10 context types (directive, information, heading, decision, code_pattern, requirement, error, todo, insight, preference)
- Importance scoring (1-10)
- Tag-based organization
- Session management
- Multiple access patterns (recent, by-type, by-tag, important)

#### Tools (6)
- `store_memory` - Store single memory
- `store_batch_memories` - Batch store memories
- `update_memory` - Update existing memory
- `delete_memory` - Delete memory
- `search_memories` - Semantic search
- `organize_session` - Create session snapshot

#### Resources (8)
- `memory://recent` - Recent memories
- `memory://by-type/{type}` - Filter by type
- `memory://by-tag/{tag}` - Filter by tag
- `memory://important` - High-importance memories
- `memory://session/{id}` - Session memories
- `memory://sessions` - All sessions
- `memory://search` - Search interface
- `memory://summary` - Statistics

#### Tech Stack
- TypeScript + ESM modules
- Redis (ioredis)
- OpenAI embeddings
- MCP SDK
- Zod validation
- ULID identifiers

---

## Migration Guide: 1.0.0 → 1.1.0

### Environment Variables
Update your `.mcp.json` or config:

**Before:**
```json
{
  "env": {
    "REDIS_URL": "redis://localhost:6379",
    "OPENAI_API_KEY": "sk-..."
  }
}
```

**After:**
```json
{
  "env": {
    "REDIS_URL": "redis://localhost:6379",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

### Data Migration

⚠️ **Important**: Redis key structure has changed!

**Before:** `memory:{id}`
**After:** `ws:{workspace_id}:memory:{id}`

If upgrading with existing data, you have two options:

#### Option 1: Start Fresh (Recommended)
```bash
# Clear Redis
redis-cli FLUSHDB

# Or selectively delete old keys
redis-cli KEYS "memory:*" | xargs redis-cli DEL
redis-cli KEYS "memories:*" | xargs redis-cli DEL
redis-cli KEYS "session:*" | xargs redis-cli DEL
```

#### Option 2: Migrate Data
```bash
# Create migration script (coming soon)
# Will copy old keys to new workspace-prefixed format
```

### Setup Command

**New command:**
```bash
claude mcp add-json --scope=user memory '{"command":"node","args":["/Users/joseairosa/Development/mcp/mem/dist/index.js"],"env":{"REDIS_URL":"redis://localhost:6379","ANTHROPIC_API_KEY":"YOUR_KEY"}}'
```

### Testing After Upgrade

```bash
# 1. Check server starts
npm run build
node dist/index.js
# Should see: "MCP Memory Server started successfully"

# 2. Test with Claude Code
# Store a test memory
claude> "Store a test memory with importance 8"

# 3. Test new features
claude> "Recall relevant context for testing"
claude> "Summarize our session"

# 4. Check workspace isolation
# Verify workspace path in logs
# Should see: "[MemoryStore] Workspace: /your/path"
```

---

## Roadmap

### v1.2.0 (Planned)
- Hook integration for auto-analysis before compaction
- Memory consolidation (dedupe similar memories)
- TTL support for temporary context
- Memory relationships (graph structure)

### v1.3.0 (Planned)
- Web UI for memory management
- Export/import functionality
- Memory analytics dashboard
- Cross-workspace pattern learning

### v2.0.0 (Planned)
- Alternative vector databases (Pinecone, Weaviate)
- Redis Cluster support
- Multi-user namespacing
- Advanced context freshness tracking
