# Changelog

All notable changes to **Recall** (formerly MCP Memory Server) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.2.1] - 2025-10-02

### Added
- **Organizational Shared Memory Documentation** - Comprehensive guide for team collaboration
  - Setup instructions for shared Redis instances
  - Security considerations for organizational deployments
  - Example workflows for cross-team learning
- **Improved Installation Instructions**
  - Added Claude CLI installation method (`npx @modelcontextprotocol/create-server`)
  - Direct `npx` usage examples with no installation required
  - Multiple installation options (CLI, global, from source)

### Changed
- Enhanced README.md with organizational memory use cases
- Updated installation section with recommended approaches
- Clarified team collaboration scenarios

---

## [1.2.0] - 2025-10-02

### Added
- **TTL Support** - Auto-expiring memories with `ttl_seconds` parameter (minimum 60s)
- **Export/Import Tools** - Backup and restore memories
  - `export_memories` - Export to JSON with optional filtering by type/importance
  - `import_memories` - Import from JSON with embedding regeneration option
- **Duplicate Detection** - Find and merge similar memories
  - `find_duplicates` - Detect duplicates with similarity threshold (default 0.85)
  - Auto-merge option with configurable keep strategy
- **Memory Consolidation** - `consolidate_memories` - Manually merge multiple memories
- **Analytics Dashboard** - `memory://analytics` resource
  - Memory trends (24h, 7d, 30d)
  - Top tags and importance distribution
  - Activity breakdown by day and type
- **Cloud Redis Documentation** - Setup guides for Upstash, Redis Cloud, Railway

### Changed
- Resource URI handling - Fixed pathname parsing for `memory://` scheme
- Package renamed from `@joseairosa/mcp-memory` to `@joseairosa/recall`
- Binary command: `mcp-memory` → `recall`

### Technical
- Added `mergeMemories()` method to MemoryStore
- Added `ConsolidateMemoriesSchema`, `ExportMemoriesSchema`, `ImportMemoriesSchema`, `FindDuplicatesSchema`
- Created `src/tools/export-import-tools.ts`
- Created `src/resources/analytics.ts`

**Tools:** 13 total (6 core + 3 smart context + 4 advanced)
**Resources:** 9 total
**Prompts:** 1 (`workspace_context`)

---

## [1.1.0] - 2025-10-02

### Added
- **Smart Context Management**
  - `recall_relevant_context` - Proactive memory retrieval based on current task
  - `analyze_and_remember` - AI-powered conversation analysis and extraction
  - `summarize_session` - Create session snapshots with summaries
- **Auto-Injection Prompt**
  - `workspace_context` - Automatically injects critical directives and decisions at conversation start
- **Workspace Isolation** - Memories automatically segmented by project directory
- **AI Analysis** - Claude Haiku integration for intelligent memory extraction

### Changed (Breaking)
- **API Migration**: OpenAI → Anthropic Claude
  - Environment variable: `OPENAI_API_KEY` → `ANTHROPIC_API_KEY`
  - Embeddings: OpenAI 1536-dim → Hybrid (Claude keywords + trigrams) 128-dim
  - Cost reduction: ~$2/day → ~$0.20/day
- **Redis Key Structure**: Added workspace prefix `ws:{workspace_id}:`
- **Package Dependencies**: `openai` → `@anthropic-ai/sdk`

### Technical
- Added `ConversationAnalyzer` class for AI-powered analysis
- Created `src/analysis/conversation-analyzer.ts`
- Created `src/prompts/` directory (index.ts, formatters.ts)
- Created `src/tools/context-tools.ts`
- Updated `src/embeddings/generator.ts` - Hybrid embedding approach
- Added MCP prompts capability to server

**Tools:** 9 total (6 core + 3 smart context)
**Resources:** 8 total
**Prompts:** 1 (new capability)

---

## [1.0.0] - 2025-10-02

### Added
- **Initial Release** - Persistent memory server for Claude using MCP protocol
- **6 Core Tools**
  - `store_memory` - Store single memory with metadata
  - `store_batch_memories` - Batch store multiple memories
  - `update_memory` - Modify existing memory
  - `delete_memory` - Remove memory by ID
  - `search_memories` - Semantic search using embeddings
  - `organize_session` - Create session snapshots
- **8 Resources** - Read-only memory access
  - `memory://recent` - Recent memories (default 50)
  - `memory://by-type/{type}` - Filter by context type
  - `memory://by-tag/{tag}` - Filter by tag
  - `memory://important` - High importance (≥8)
  - `memory://session/{session_id}` - Session memories
  - `memory://sessions` - All sessions list
  - `memory://search?q=query` - Search interface
  - `memory://summary` - Statistics overview
- **10 Context Types**
  - directive, information, heading, decision, code_pattern
  - requirement, error, todo, insight, preference
- **Features**
  - Redis in-memory storage
  - OpenAI embeddings for semantic search
  - ULID identifiers
  - Importance scoring (1-10)
  - Tag-based organization
  - Session management
  - Zod schema validation

### Technical
- TypeScript with ESM modules
- Redis (ioredis) for storage
- OpenAI text-embedding-3-small (1536-dim)
- MCP SDK v1.0.4
- Multiple access patterns (hashes, sets, sorted sets)

**Tools:** 6
**Resources:** 8
**Prompts:** 0

---

## Migration Guides

### Migrating from v1.1.0 to v1.2.0

**No breaking changes.** All existing functionality works identically.

**New features available immediately:**
- Set `ttl_seconds` when creating memories
- Use `export_memories` and `import_memories` tools
- Access `memory://analytics` resource

**Optional: Upgrade Redis connection**
- Consider cloud Redis for remote access (Upstash, Redis Cloud, Railway)
- See README for setup instructions

### Migrating from v1.0.0 to v1.1.0

**Breaking changes - Action required:**

1. **Update environment variable**
```json
// Before
{
  "env": {
    "OPENAI_API_KEY": "sk-..."
  }
}

// After
{
  "env": {
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

2. **Embeddings migration (optional but recommended)**
```javascript
// Export without embeddings
{tool: "export_memories", args: {include_embeddings: false}}

// Import with regenerated embeddings
{tool: "import_memories", args: {data: "...", regenerate_embeddings: true}}
```

3. **Workspace awareness**
- Memories are now isolated by directory
- Old memories without workspace prefix may need manual migration
- Use Redis CLI to add `ws:{id}:` prefix if needed

**Benefits:**
- 10x cost reduction (~$2/day → ~$0.20/day)
- No OpenAI dependency
- Faster embedding generation
- Better context management with smart tools

### Migrating to v1.0.0

Initial release - no migration needed.

---

## Links

- **GitHub**: https://github.com/joseairosa/recall
- **npm**: https://www.npmjs.com/package/@joseairosa/recall
- **Issues**: https://github.com/joseairosa/recall/issues
