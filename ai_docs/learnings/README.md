# AI Learnings - MCP Memory Server

This document captures key learnings, insights, and patterns discovered during the development of the MCP Memory Server.

## Project Overview

**Goal**: Build an MCP (Model Context Protocol) server that acts as a persistent "brain" for Claude, solving context window limitations and preventing information loss during context compaction.

**Tech Stack**:
- TypeScript with ESM modules
- Redis for fast memory storage and retrieval
- OpenAI embeddings for semantic search
- MCP SDK for protocol implementation

---

## Key Learnings

### 1. MCP Architecture Fundamentals

**What is MCP?**
- Protocol for connecting AI assistants to external data sources and tools
- Two main components: **Resources** (read-only, like GET) and **Tools** (actions with side-effects, like POST)
- Uses stdio transport for local communication with AI clients

**Resources vs Tools**:
- **Resources**: Data retrieval without side effects (e.g., `memory://recent`, `memory://search`)
- **Tools**: Actions that modify state (e.g., `store_memory`, `delete_memory`)
- Resources use URI patterns, Tools use named functions with schemas

### 2. Memory Storage Design Pattern

**Three-tier Memory Structure**:
1. **Entities**: Core memory entries with ULID IDs
2. **Indexes**: Multiple Redis data structures for fast lookup
   - Timeline (sorted set by timestamp)
   - By type (sets per context type)
   - By tag (sets per tag)
   - Important memories (sorted set by importance score)
3. **Vector Embeddings**: Semantic search capability

**Why This Works**:
- Fast retrieval using Redis in-memory storage
- Multiple access patterns (recent, by-type, by-tag, by-importance, semantic)
- Scalable to millions of memories with sub-millisecond latency

### 3. Context Types for LLM Memory

**10 Context Types** identified for organizing LLM memory:
- `directive` - Instructions or commands to follow
- `information` - General facts or knowledge
- `heading` - Section headers or organizational markers
- `decision` - Decisions made during work sessions
- `code_pattern` - Code patterns or conventions to remember
- `requirement` - Project requirements or specifications
- `error` - Errors encountered and their solutions
- `todo` - Tasks or todo items
- `insight` - Key insights or realizations
- `preference` - User preferences

**Why These?** They map to how an LLM needs to recall context:
- What to do (directives, requirements, todos)
- What was decided (decisions, insights)
- What to reference (information, code_patterns, errors)
- How to organize (headings, preferences)

### 4. Importance Scoring Strategy

**1-10 Scale**:
- **1-3**: Low importance, transient context
- **4-7**: Medium importance, general information
- **8-10**: High importance, critical directives or decisions

**Auto-indexing**: Memories with importance ≥8 automatically added to special `memories:important` index for quick access to critical information.

### 5. Semantic Search Implementation

**Vector Similarity Approach**:
- Generate OpenAI embeddings for all memory content
- Store embeddings alongside memory data
- Search by computing cosine similarity between query and all memories
- Sort by similarity score

**Trade-offs**:
- **Pros**: Excellent for finding conceptually similar memories, works across paraphrasing
- **Cons**: Slower than indexed lookups, requires OpenAI API calls
- **When to use**: Complex queries, conceptual searches, "find similar" use cases

### 6. Session Management Pattern

**Sessions as Memory Snapshots**:
- Group related memories from a work session
- Each session has ULID, name, summary, and array of memory IDs
- Enables "restore context from session X" capability

**Use Case**:
- End of work session → create session snapshot
- Next session → load session memories to restore full context
- Prevents context loss across days/weeks of work

### 7. Redis Data Modeling Best Practices

**Key Patterns Used**:
```
memory:{id}           → Hash (main memory data)
memories:all          → Set (all memory IDs)
memories:timeline     → Sorted Set (ordered by timestamp)
memories:type:{type}  → Set (filtered by type)
memories:tag:{tag}    → Set (filtered by tag)
memories:important    → Sorted Set (ordered by importance)
session:{id}          → Hash (session data)
sessions:all          → Set (all session IDs)
```

**Why This Works**:
- Each access pattern has optimized data structure
- Pipeline operations for atomic multi-step updates
- Easy to add new indexes without changing core data

### 8. TypeScript + MCP SDK Patterns

**Zod for Schema Validation**:
- Define schemas once, use for runtime validation and JSON Schema generation
- Type safety from TypeScript + runtime safety from Zod

**JSON Schema Conversion**:
- MCP requires JSON Schema for tool inputs
- Built lightweight Zod → JSON Schema converter
- Production apps should use `@anatine/zod-to-json-schema`

**ESM Modules**:
- Use `.js` extensions in imports even though writing `.ts`
- Configure `tsconfig.json` with `moduleResolution: "bundler"`
- Use `tsup` for bundling with shebang for CLI

### 9. Error Handling Strategy

**MCP Error Codes**:
- `ErrorCode.InvalidRequest` - Bad input (e.g., memory not found)
- `ErrorCode.InternalError` - Server errors (Redis failures, etc.)

**Graceful Degradation**:
- Connection retries for Redis
- Health checks before server start
- Graceful shutdown handlers (SIGINT, SIGTERM)

### 10. Auto-summarization

**Simple but Effective**:
- If no summary provided, take first 100 chars + "..."
- Helps with quick scanning of memories
- Future: Could use LLM for smarter summarization

---

## Architecture Decisions

### Why Redis?
- **Speed**: In-memory, sub-millisecond access
- **Flexibility**: Multiple data structures (sets, sorted sets, hashes)
- **Scalability**: Handles millions of keys easily
- **Vector Search**: Redis Stack supports vector similarity (not used yet, using cosine similarity in-app)

### Why OpenAI Embeddings?
- **Quality**: Best-in-class semantic understanding
- **Size**: `text-embedding-3-small` is cheap and fast (1536 dims)
- **Consistency**: Deterministic embeddings for same input

### Why ULID over UUID?
- **Sortable**: Lexicographically sortable by timestamp
- **Compact**: Same length as UUID but more information-dense
- **Readable**: No special characters, URL-safe

---

## Performance Characteristics

**Estimated Performance** (single Redis instance):
- Memory creation: ~200ms (includes OpenAI embedding call)
- Batch creation (10 items): ~500ms (parallel embedding generation)
- Memory retrieval by ID: <1ms
- Recent memories (50): ~10ms
- Semantic search (across 10k memories): ~2s (depends on embeddings)

**Scaling Considerations**:
- For >100k memories, consider Redis Cluster
- For semantic search at scale, use vector database (Pinecone, Weaviate, or RediSearch)
- Batch embedding generation for better throughput

---

## Future Enhancements

1. **LLM-powered Summarization**: Use Claude to generate better summaries
2. **Automatic Tagging**: Auto-extract tags from content using NLP
3. **Memory Consolidation**: Merge duplicate/similar memories
4. **TTL Support**: Auto-expire temporary context
5. **Memory Relationships**: Link related memories (graph structure)
6. **Export/Import**: Backup and restore memory state
7. **Vector Database Integration**: Use RediSearch or dedicated vector DB for faster semantic search
8. **Multi-user Support**: Namespace memories by user/project
9. **Memory Analytics**: Track which memories are most accessed/useful
10. **Smart Retrieval**: Automatically suggest relevant memories based on current context

---

## Common Pitfalls Avoided

1. **Don't store embeddings as JSON strings in Redis** - Store as JSON array, parse on read (or use binary format for production)
2. **Don't forget to update all indexes** - Use Redis pipelines for atomic multi-index updates
3. **Don't block on OpenAI API** - Use batching for multiple memories
4. **Don't forget cleanup** - Remove from all indexes when deleting a memory
5. **Don't trust user input** - Validate with Zod schemas before processing

---

## Testing Strategy

**Manual Testing Checklist**:
- [ ] Create memory with all fields
- [ ] Create batch memories
- [ ] Retrieve recent memories
- [ ] Search by type, tag, importance
- [ ] Semantic search with various queries
- [ ] Update memory (content, tags, importance)
- [ ] Delete memory and verify index cleanup
- [ ] Create and retrieve sessions
- [ ] Test with Redis connection failure
- [ ] Test with missing OpenAI API key

**Future: Automated Tests**:
- Unit tests for MemoryStore methods
- Integration tests with Redis test instance
- MCP protocol compliance tests

---

## Useful Resources

- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Redis Commands](https://redis.io/commands)
- [OpenAI Embeddings API](https://platform.openai.com/docs/guides/embeddings)
- [Zod Documentation](https://zod.dev)
- [ULID Specification](https://github.com/ulid/spec)

---

**Last Updated**: 2025-10-02
