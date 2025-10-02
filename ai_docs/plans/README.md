# Project Plans - MCP Memory Server

This document contains the approved plan for building the MCP Memory Server, including architecture decisions, implementation steps, and usage guidelines.

---

## Project Goal

Build an MCP server that acts as a persistent "brain" for Claude, solving context window management issues and preventing information loss during context compaction. Uses Redis for fast memory access and stores data from the LLM's point of view with proper context, headings, directives, etc.

---

## Architecture Overview

### Core Components

#### 1. Memory Storage Schema (Redis)

**Context Entries**: Hash structures with ULID keys containing:
- `timestamp`: When stored (Unix timestamp in ms)
- `context_type`: Type of memory ("directive", "information", "heading", "decision", "code_pattern", "requirement", "error", "todo", "insight", "preference")
- `content`: The actual memory content
- `summary`: Short summary for quick scanning (auto-generated if not provided)
- `tags`: Array of tags for categorization
- `importance`: Importance score from 1-10
- `session_id`: Optional session grouping

**Vector Embeddings** (for semantic search):
- Use OpenAI `text-embedding-3-small` model
- Store embeddings alongside content for similarity queries
- Enable semantic search via cosine similarity

**Indexes**:
- **Timeline**: Sorted set ordered by timestamp
- **By Type**: Set per context type
- **By Tag**: Set per tag
- **By Importance**: Sorted set for important memories (score ≥8)

---

#### 2. MCP Server Implementation

##### Tools (Actions with side-effects):

1. **`store_memory`** - Store new context/information
   - Input: content, context_type, tags[], importance, summary
   - Returns: memory_id (ULID)

2. **`store_batch_memories`** - Bulk store multiple memories
   - Input: array of memory objects
   - Returns: array of memory_ids

3. **`update_memory`** - Update existing memory
   - Input: memory_id, updates object
   - Returns: success boolean

4. **`delete_memory`** - Remove a memory
   - Input: memory_id
   - Returns: success boolean

5. **`organize_session`** - Create session snapshot
   - Input: session_name, memory_ids[]
   - Returns: session_id

6. **`search_memories`** - Semantic search
   - Input: query, limit, min_importance, context_types[]
   - Returns: array of results with similarity scores

##### Resources (Read-only data access):

1. **`memory://recent`** - Last N memories (default 50)
   - Query param: `limit`

2. **`memory://by-type/{type}`** - All memories of specific type
   - Path param: type (directive, information, etc.)
   - Query param: `limit`

3. **`memory://by-tag/{tag}`** - All memories with tag
   - Path param: tag
   - Query param: `limit`

4. **`memory://session/{session_id}`** - Session snapshot
   - Path param: session_id

5. **`memory://sessions`** - List all sessions

6. **`memory://search?q={query}`** - Semantic search results
   - Query params: `q` (required), `limit`, `min_importance`

7. **`memory://important`** - High-importance memories (score ≥ 8)
   - Query params: `min`, `limit`

8. **`memory://summary`** - Overall summary of stored knowledge

---

### 3. Key Features

- **Semantic Search**: Vector embeddings for finding relevant memories
- **Importance Scoring**: Prioritize critical information (1-10 scale)
- **Context Types**: Structured categorization (directives, decisions, patterns, etc.)
- **Session Management**: Group related work sessions
- **Auto-summarization**: Generate summaries for quick scanning
- **Fast Retrieval**: Redis in-memory storage for sub-millisecond access
- **Multiple Access Patterns**: Recent, by-type, by-tag, by-importance, semantic search

---

### 4. Tech Stack

- **Language**: TypeScript (ESM modules)
- **MCP SDK**: `@modelcontextprotocol/sdk` v1.0.4+
- **Redis Client**: `ioredis` v5.4.2+
- **Embeddings**: OpenAI API (`text-embedding-3-small`)
- **Validation**: `zod` v3.24+
- **ID Generation**: `ulid` v2.3+
- **Build**: `tsup` for bundling
- **Runtime**: Node.js 18+

---

### 5. File Structure

```
/mem/
├── src/
│   ├── index.ts                    # Server setup & transport
│   ├── types.ts                    # TypeScript types & Zod schemas
│   ├── redis/
│   │   ├── client.ts              # Redis client & connection handling
│   │   └── memory-store.ts        # Memory storage & retrieval logic
│   ├── embeddings/
│   │   └── generator.ts           # OpenAI embedding generation
│   ├── tools/
│   │   └── index.ts               # MCP tool implementations
│   └── resources/
│       └── index.ts               # MCP resource handlers
├── ai_docs/
│   ├── plans/
│   │   └── README.md              # This file
│   └── learnings/
│       └── README.md              # Key learnings and insights
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── README.md                      # User-facing documentation
```

---

## Implementation Plan

### Phase 1: Project Setup ✅
- [x] Initialize TypeScript project with dependencies
- [x] Configure TypeScript with ESM modules
- [x] Set up tsup for bundling
- [x] Create project folder structure

### Phase 2: Core Infrastructure ✅
- [x] Define TypeScript types and Zod schemas
- [x] Set up Redis client with connection handling
- [x] Implement health checks and graceful shutdown
- [x] Create Redis key naming patterns

### Phase 3: Embedding Generation ✅
- [x] Implement OpenAI client initialization
- [x] Create embedding generation functions
- [x] Add cosine similarity calculation
- [x] Support batch embedding generation

### Phase 4: Memory Storage Layer ✅
- [x] Implement MemoryStore class
- [x] Create memory CRUD operations
- [x] Build index management (type, tag, timeline, importance)
- [x] Add semantic search functionality
- [x] Implement session management

### Phase 5: MCP Tools ✅
- [x] Implement `store_memory` tool
- [x] Implement `store_batch_memories` tool
- [x] Implement `update_memory` tool
- [x] Implement `delete_memory` tool
- [x] Implement `search_memories` tool
- [x] Implement `organize_session` tool
- [x] Build Zod to JSON Schema converter

### Phase 6: MCP Resources ✅
- [x] Implement `memory://recent` resource
- [x] Implement `memory://by-type/{type}` resource
- [x] Implement `memory://by-tag/{tag}` resource
- [x] Implement `memory://important` resource
- [x] Implement `memory://session/{session_id}` resource
- [x] Implement `memory://sessions` resource
- [x] Implement `memory://summary` resource
- [x] Implement `memory://search` resource

### Phase 7: Server Entry Point ✅
- [x] Create MCP server instance
- [x] Register tool handlers
- [x] Register resource handlers
- [x] Set up stdio transport
- [x] Add startup checks and error handling

### Phase 8: Documentation 🚧
- [x] Create learnings documentation
- [x] Create plans documentation
- [ ] Write user-facing README
- [ ] Add usage examples
- [ ] Document configuration options

### Phase 9: Testing (Future)
- [ ] Write unit tests for MemoryStore
- [ ] Add integration tests with Redis
- [ ] Test MCP protocol compliance
- [ ] Add CI/CD pipeline

### Phase 10: Publishing (Future)
- [ ] Publish to npm registry
- [ ] Create example configurations
- [ ] Add contribution guidelines

---

## Usage

### Installation

```bash
npm install -g @joseairosa/mcp-memory
```

### Configuration

Add to Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@joseairosa/mcp-memory"],
      "env": {
        "REDIS_URL": "redis://localhost:6379",
        "OPENAI_API_KEY": "sk-..."
      }
    }
  }
}
```

### Redis Setup

```bash
# Install Redis (macOS)
brew install redis

# Start Redis
brew services start redis

# Or run manually
redis-server
```

---

## Usage Examples

### Store Important Directive

```json
{
  "tool": "store_memory",
  "arguments": {
    "content": "Always use ULIDs for database primary keys, never auto-increment integers",
    "context_type": "directive",
    "importance": 10,
    "tags": ["database", "conventions", "ulid"]
  }
}
```

### Store Code Pattern

```json
{
  "tool": "store_memory",
  "arguments": {
    "content": "In this project, use Drizzle ORM with text('id').primaryKey() for ULID IDs",
    "context_type": "code_pattern",
    "importance": 8,
    "tags": ["drizzle", "orm", "database"],
    "summary": "Drizzle ULID pattern"
  }
}
```

### Batch Store Session Context

```json
{
  "tool": "store_batch_memories",
  "arguments": {
    "memories": [
      {
        "content": "Working on MCP memory server implementation",
        "context_type": "heading",
        "importance": 7,
        "tags": ["mcp", "current-work"]
      },
      {
        "content": "User prefers informal, personal tone in communication",
        "context_type": "preference",
        "importance": 6,
        "tags": ["communication", "tone"]
      },
      {
        "content": "Decided to use Redis instead of PostgreSQL for speed",
        "context_type": "decision",
        "importance": 8,
        "tags": ["architecture", "redis"]
      }
    ]
  }
}
```

### Semantic Search

```json
{
  "tool": "search_memories",
  "arguments": {
    "query": "How should I handle database IDs?",
    "limit": 5,
    "min_importance": 7
  }
}
```

### Create Session Snapshot

```json
{
  "tool": "organize_session",
  "arguments": {
    "session_name": "MCP Memory Server - Day 1",
    "memory_ids": ["01J...", "01J...", "01J..."],
    "summary": "Built core infrastructure and storage layer"
  }
}
```

### Get Recent Memories

```
Resource: memory://recent?limit=20
```

### Get Important Directives

```
Resource: memory://by-type/directive
```

### Get All Code Patterns

```
Resource: memory://by-tag/code-pattern
```

---

## Environment Variables

- **`REDIS_URL`** (optional): Redis connection string. Default: `redis://localhost:6379`
- **`OPENAI_API_KEY`** (required): OpenAI API key for embeddings

---

## Performance Expectations

- **Memory Creation**: ~200ms (includes embedding generation)
- **Batch Creation (10 items)**: ~500ms
- **Memory Retrieval by ID**: <1ms
- **Recent Memories (50)**: ~10ms
- **Semantic Search (1k memories)**: ~500ms
- **Semantic Search (10k memories)**: ~2s

---

## Future Enhancements

### Phase 2 Features
1. **LLM-powered Summarization**: Use Claude to generate better summaries
2. **Automatic Tagging**: Auto-extract tags using NLP
3. **Memory Consolidation**: Detect and merge duplicate memories
4. **TTL Support**: Auto-expire temporary context
5. **Export/Import**: Backup and restore functionality

### Phase 3 Features
1. **Vector Database**: Migrate to RediSearch or Pinecone for faster semantic search
2. **Memory Relationships**: Graph structure for linked memories
3. **Multi-user Support**: Namespace memories by user/project
4. **Memory Analytics**: Track access patterns and usefulness
5. **Smart Retrieval**: Auto-suggest relevant memories based on context

---

## Success Criteria

✅ **Core Functionality**:
- Store and retrieve memories with sub-second latency
- Semantic search returns relevant results
- Session management preserves context across conversations
- No data loss during Claude context compaction

✅ **Developer Experience**:
- Easy setup with npm install
- Clear configuration with environment variables
- Well-documented API

✅ **Performance**:
- Handle 10k+ memories without degradation
- Search completes in <3 seconds
- Redis memory usage stays reasonable

---

**Status**: Phase 7 Complete (Server Implementation Done)
**Next**: Documentation and Testing
**Last Updated**: 2025-10-02
