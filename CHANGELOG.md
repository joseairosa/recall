# Changelog

All notable changes to **Recall** (formerly MCP Memory Server) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.6.0] - 2025-10-04

### Added
- **Time Window Context Retrieval** - Get all memories from specific time periods
  - `get_time_window_context` tool for time-based memory retrieval
  - Multiple time specifications: hours, minutes, or explicit timestamp ranges
  - Three output formats: Markdown (default), JSON, and plain text
  - Four grouping options: chronological, by type, by importance, or by tags
  - Filtering by minimum importance and context types
  - Perfect for building context files from work sessions
  - Respects workspace modes (isolated/global/hybrid)

- **Best Practices Documentation** - Context bloat prevention
  - Added guidelines for selective memory storage
  - Clear examples of what to store vs. avoid
  - Added to both README.md and CLAUDE.md
  - Helps users avoid indiscriminate memory storage

### Technical
- New `GetTimeWindowContextSchema` in types.ts
- New `getMemoriesByTimeWindow()` method in MemoryStore
- Helper functions for formatting output (JSON, Markdown, Text)
- Uses Redis `ZRANGEBYSCORE` for efficient time-range queries

### Testing
- New `test-time-window.js` test suite with 8 tests
- All tests passing
- Test coverage for time-based retrieval, filtering, grouping

### Tool Count
- **28 tools** (was 27 in v1.5.0)

---

## [1.5.0] - 2025-10-03

### Added
- **Memory Versioning & History** - Track changes over time
  - Automatic versioning on memory updates (up to 50 versions per memory)
  - Version tracking includes content, context_type, importance, tags, timestamp
  - System-generated and user-generated versions with change reasons
  - `MemoryVersion` schema with created_by field ('user' or 'system')
  - Version history stored in Redis sorted sets by timestamp

- **Version Tools** (2 new tools)
  - `get_memory_history` - Retrieve version history for a memory
  - `rollback_memory` - Rollback memory to a previous version (preserves relationships)

- **Memory Templates** - Reusable memory patterns
  - Template system with variable placeholders ({{variable}} syntax)
  - Built-in and workspace-specific templates
  - Support for default tags, importance, and context_type
  - Template variable validation and replacement

- **Template Tools** (3 new tools)
  - `create_template` - Create new memory template with placeholders
  - `create_from_template` - Instantiate memory from template
  - `list_templates` - List all available templates (workspace + builtin)

- **Advanced Search** - Enhanced search capabilities
  - Fuzzy search with word-matching boost (up to 20% similarity increase)
  - Regex pattern matching for content filtering
  - Category filtering for organized search

- **Memory Categories** - Organize memories by category
  - Category field added to memory schema (optional)
  - Category indexes for fast filtering
  - Automatic category tracking with last-used timestamps

- **Category Tools** (3 new tools)
  - `set_memory_category` - Assign category to a memory
  - `list_categories` - List all categories with memory counts
  - `get_memories_by_category` - Retrieve all memories in a category

### Enhanced
- `search_memories` now supports:
  - `category` parameter for filtering by category
  - `fuzzy` boolean for fuzzy search
  - `regex` parameter for pattern matching
- `createMemory` and `updateMemory` support category field
- All memory operations maintain backward compatibility

### Technical
- Added version keys to Redis: `memory:{id}:versions`, `memory:{id}:version:{versionId}`
- Added template keys: `template:{id}`, `templates:all`, `builtin:templates:all`
- Added category keys: `memory:{id}:category`, `category:{name}`, `categories:all`
- Version limit enforced at 50 per memory (ZREMRANGEBYRANK for cleanup)
- Template variable replacement with {{placeholder}} syntax
- Fuzzy search uses word-level matching with configurable boost
- Category indexes support both workspace and global scopes

### Use Cases
- Track evolution of code patterns and decisions over time
- Rollback incorrect updates while preserving relationships
- Create standardized memory templates for team workflows
- Organize memories by project, feature, or domain with categories
- Use advanced search filters to find specific patterns

**Tools:** 27 total (6 core + 3 smart + 4 advanced + 2 global + 4 relationships + 2 versions + 3 templates + 3 categories)
**Resources:** 17 total (unchanged from v1.4.0)
**Prompts:** 1 (`workspace_context`)

---

## [1.4.0] - 2025-10-03

### Added
- **Memory Relationships** - Link related memories to create knowledge graphs
  - `RelationshipType` enum with 7 relationship types:
    - `relates_to` - Generic connection
    - `parent_of` / `child_of` - Hierarchical relationships
    - `references` - One memory references another
    - `supersedes` - One memory replaces another
    - `implements` - Implementation of a pattern/concept
    - `example_of` - Example demonstrating a pattern
  - Bidirectional relationship tracking (outgoing/incoming/both)
  - Graph traversal with configurable depth (1-5 levels)
  - Circular reference protection
  - Global relationship support (inherits from memory scope)

- **Relationship Tools** (4 new tools)
  - `link_memories` - Create relationships between memories
  - `get_related_memories` - Traverse relationship graph with depth control
  - `unlink_memories` - Remove relationships
  - `get_memory_graph` - Get full graph structure with max nodes limit

- **Relationship Resources** (3 new resources)
  - `memory://relationships?limit=100` - List all relationships
  - `memory://memory/{id}/related?depth=1&direction=both` - Get related memories
  - `memory://graph/{id}?depth=2&max_nodes=50` - Get memory graph structure

### Technical
- Added `MemoryRelationship` interface with metadata support
- Added relationship Redis keys for workspace and global scopes
- Implemented `createRelationship()`, `getRelationship()`, `deleteRelationship()` in MemoryStore
- Implemented `getRelatedMemories()` with graph traversal algorithm
- Implemented `getMemoryGraph()` for full graph construction
- Added `serializeRelationship()` and `deserializeRelationship()` helpers
- Relationship scope determined by memory scope (global + global = global)

### Use Cases
- Link code patterns to their implementations
- Connect decisions to their rationale and consequences
- Build knowledge graphs of related concepts
- Track feature evolution across related memories
- Create hierarchical memory structures

**Tools:** 19 total (6 core + 3 smart + 4 advanced + 2 global + 4 relationships)
**Resources:** 17 total (9 workspace + 5 global + 3 relationships)
**Prompts:** 1 (`workspace_context`)

---

## [1.3.0] - 2025-10-03

### Added
- **Global Memories** - Cross-workspace memory sharing
  - `is_global` field on memories - Mark memories as accessible across all workspaces
  - `workspace_id` field - Track workspace origin for each memory
  - Three workspace modes via `WORKSPACE_MODE` environment variable:
    - `isolated` (default) - Workspace-only, no cross-workspace access
    - `global` - All memories shared globally, no workspace isolation
    - `hybrid` - Both workspace AND global memories with smart weighting
  - Hybrid search weighting: workspace memories 1.0x, global memories 0.9x (prefer local context)
- **Global Memory Tools** (2 new tools)
  - `convert_to_global` - Convert workspace-specific memory to global
  - `convert_to_workspace` - Convert global memory to workspace-specific
- **Global Memory Resources** (5 new resources)
  - `memory://global/recent?limit=50` - Recent global memories
  - `memory://global/by-type/{type}?limit=50` - Global memories by context type
  - `memory://global/by-tag/{tag}?limit=50` - Global memories by tag
  - `memory://global/important?min=8&limit=50` - Important global memories
  - `memory://global/search?q=query&limit=10` - Search global memories
  - All global resources throw helpful errors in `isolated` mode

### Changed
- Enhanced `CreateMemory` schema with optional `is_global` field (defaults to `false`)
- Updated `MemoryEntry` schema with `is_global` and `workspace_id` fields
- Updated `searchMemories()` to support three workspace modes with weighted results
- Enhanced `getMemory()` to check both workspace and global storage
- All retrieval methods respect workspace mode configuration

### Technical
- Added `WorkspaceMode` enum and `getWorkspaceMode()` helper
- Added global Redis key helpers: `globalMemory()`, `globalMemories()`, `globalByType()`, etc.
- Added `ConvertToGlobalSchema` and `ConvertToWorkspaceSchema` validation
- Updated `MemoryStore` with `convertToGlobal()` and `convertToWorkspace()` methods
- All global resources validate workspace mode and provide clear error messages
- Backward compatible: defaults to `isolated` mode, no breaking changes

### Use Cases
- Personal preferences across all projects (coding standards, communication style)
- Team conventions and organizational knowledge
- Cross-project patterns and solutions
- Shared tools and commands

**Tools:** 15 total (6 core + 3 smart context + 4 advanced + 2 global)
**Resources:** 14 total (9 workspace + 5 global)
**Prompts:** 1 (`workspace_context`)

See [WORKSPACE_MODES.md](WORKSPACE_MODES.md) for detailed documentation.

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

### Migrating from v1.2.1 to v1.3.0

**No breaking changes.** All existing functionality works identically.

**Defaults:**
- Workspace mode: `isolated` (same as v1.2.1)
- All memories: `is_global: false` (workspace-only)
- No configuration changes required

**New features available:**
1. **Enable global memories** - Set `WORKSPACE_MODE=hybrid` in config
2. **Convert existing memories** - Use `convert_to_global` tool
3. **Browse global memories** - Use `memory://global/*` resources

**Configuration example:**
```json
{
  "env": {
    "WORKSPACE_MODE": "hybrid",  // Enable both workspace + global
    "REDIS_URL": "redis://localhost:6379",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

**Use cases:**
- Keep mode as `isolated` for project-only memories (default behavior)
- Use `hybrid` for personal preferences + project memories
- Use `global` for team-wide shared knowledge across all projects

See [WORKSPACE_MODES.md](WORKSPACE_MODES.md) for detailed guide.

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
