# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Context

Recall is an MCP (Model Context Protocol) server providing **long-term memory** for Claude conversations. It stores context in Redis or Valkey with semantic search capabilities to survive context window limitations.

**Key Principle**: This server IS the solution to context loss - treat it with care and always maintain backward compatibility.

---

## Build & Run Commands

```bash
npm run build      # Production build (tsup)
npm run dev        # Watch mode for development
npm run start      # Run MCP server (stdio transport)
npm run start:http # Run HTTP server (for SaaS deployment)
```

### Testing

```bash
# Static checks (fast, no dependencies)
./tests/test-v1.5.0-simple.sh

# Runtime tests (requires Redis)
ANTHROPIC_API_KEY="test-key" node tests/test-runtime.js

# Integration tests
node tests/test-v1.5.0.js
```

### Manual Testing

```bash
# Start Redis
redis-server

# Run MCP server manually
REDIS_URL=redis://localhost:6379 ANTHROPIC_API_KEY=sk-... node dist/index.js

# Test Redis connection
redis-cli ping  # Should return PONG
redis-cli KEYS memory:*
```

---

## Architecture Overview

### Entry Points

- **[index.ts](src/index.ts)** - MCP server (stdio transport) - use for Claude Desktop/Claude Code
- **[server-http.ts](src/server-http.ts)** - HTTP server for SaaS deployment (Railway, Render, etc.)

### Core Components

```text
src/
├── index.ts                    # MCP server entry (stdio)
├── server-http.ts              # HTTP server entry (SaaS)
├── types.ts                    # Zod schemas, TypeScript types
├── persistence/                # Storage layer (abstracted)
│   ├── storage-client.interface.ts  # Interface for storage adapters
│   ├── storage-client.factory.ts    # Creates Redis or Valkey adapter
│   ├── memory-store.ts              # Core memory CRUD operations
│   ├── redis-client.ts / redis-adapter.ts
│   └── valkey-client.ts / valkey-adapter.ts
├── embeddings/                 # Multi-provider embedding system
│   ├── factory.ts              # Auto-detects provider from API keys
│   ├── generator.ts            # Embedding generation orchestration
│   ├── types.ts                # Provider interface
│   └── providers/              # Provider implementations
│       ├── voyage-provider.ts      # Voyage AI (best quality)
│       ├── cohere-provider.ts      # Cohere (multilingual)
│       ├── openai-compatible-provider.ts  # OpenAI/Deepseek/Grok
│       ├── anthropic-provider.ts   # Anthropic (keyword fallback)
│       └── ollama-provider.ts      # Local Ollama
├── tools/                      # MCP tool handlers
│   ├── index.ts                # Core tools (store, search, delete)
│   ├── context-tools.ts        # Smart context (recall, analyze, summarize)
│   ├── relationship-tools.ts   # Memory linking/graphs
│   ├── version-tools.ts        # Version history/rollback
│   ├── template-tools.ts       # Memory templates
│   ├── category-tools.ts       # Category management
│   └── export-import-tools.ts  # Backup/restore
├── resources/                  # MCP resource handlers
├── prompts/                    # MCP prompt handlers
├── analysis/                   # Claude-powered conversation analysis
└── http/                       # HTTP/SaaS infrastructure
    ├── server.ts               # Express server setup
    ├── mcp-handler.ts          # MCP-over-HTTP handler
    ├── auth.middleware.ts      # API key authentication
    └── billing.service.ts      # Stripe integration
```

### Embedding Provider System

The embedding factory auto-detects providers based on available API keys:

**Priority order (best quality first)**:

1. Voyage AI (`VOYAGE_API_KEY`) - Premium retrieval quality
2. Cohere (`COHERE_API_KEY`) - Multilingual, high MTEB
3. OpenAI (`OPENAI_API_KEY`) - Standard, widely adopted
4. Deepseek (`DEEPSEEK_API_KEY`) - Standard
5. Grok (`GROK_API_KEY`) - Standard
6. Anthropic (`ANTHROPIC_API_KEY`) - Fallback (keyword-based)
7. Ollama (`OLLAMA_BASE_URL`) - Local inference

Force a specific provider with `EMBEDDING_PROVIDER=voyage|cohere|openai|anthropic|etc`

---

## Key Environment Variables

| Variable | Purpose | Default |
| -------- | ------- | ------- |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `BACKEND_TYPE` | `redis` or `valkey` | `redis` |
| `VALKEY_HOST` / `VALKEY_PORT` | Valkey connection | `localhost:6379` |
| `EMBEDDING_PROVIDER` | Force specific embedding provider | auto-detect |
| `WORKSPACE_MODE` | `isolated`, `global`, or `hybrid` | `isolated` |
| `PORT` | HTTP server port (for SaaS) | `8080` |

---

## Critical Constraints (Do Not Break)

### Immutable Schema Patterns

**Redis key patterns** - changing these requires migration:

```text
memory:{id}              → Hash
memories:all             → Set
memories:timeline        → Sorted Set (score = timestamp)
memories:type:{type}     → Set
memories:tag:{tag}       → Set
memories:important       → Sorted Set (score = importance ≥8)
session:{id}             → Hash
sessions:all             → Set
```

### Context Types (Never Remove)

These 10 types are core - removing breaks existing memories:
`directive`, `information`, `heading`, `decision`, `code_pattern`, `requirement`, `error`, `todo`, `insight`, `preference`

Adding new types is safe - edit [types.ts](src/types.ts).

### Importance Scale

- **1-3**: Low (transient)
- **4-7**: Medium (general)
- **8-10**: High (critical, auto-indexed in `memories:important`)

---

## Making Changes

### Adding a New Tool

1. Add Zod schema to [types.ts](src/types.ts)
2. Add method to `MemoryStore` in [persistence/memory-store.ts](src/persistence/memory-store.ts)
3. Add tool handler to [tools/index.ts](src/tools/index.ts)
4. Update README.md

### Adding a New Embedding Provider

1. Create provider in [embeddings/providers/](src/embeddings/providers/)
2. Implement `EmbeddingProvider` interface from [embeddings/types.ts](src/embeddings/types.ts)
3. Register in [embeddings/factory.ts](src/embeddings/factory.ts)
4. Add env var documentation

### Modifying Storage Logic

**CRITICAL**: If changing `MemoryStore` methods:

1. Ensure index updates are atomic (use pipelines)
2. Test with existing Redis data
3. Document migration path
4. Bump version in package.json

---

## Code Style

- **TypeScript**: Strict mode, full type safety
- **ESM Modules**: Use `.js` extensions in imports (even for `.ts` files)
- **Naming**: camelCase for variables/functions, PascalCase for types/classes
- **Files**: kebab-case for filenames (e.g., `memory-store.ts`)
- **Error Handling**: Use MCP error codes (`ErrorCode.InvalidRequest`, `ErrorCode.InternalError`)

---

## Memory Storage Best Practices

**Store HIGH-SIGNAL context only**:

- ✅ Decisions and reasoning ("Chose PostgreSQL because...")
- ✅ Preferences (coding style, architecture patterns)
- ✅ Constraints (API limits, security requirements)
- ✅ Learned patterns from bugs/solutions

**Don't store LOW-SIGNAL content**:

- ❌ Code implementations (put in files)
- ❌ General knowledge
- ❌ Temporary session context
- ❌ Duplicates of documentation

---

## Debugging

### Server Not Starting

```bash
redis-cli ping                    # Check Redis
echo $REDIS_URL                   # Check env vars
tail -f ~/Library/Logs/Claude/mcp*.log  # Check MCP logs
```

### Memory Not Storing

1. Check embedding provider API key validity
2. Check Redis connection: `redis-cli KEYS memory:*`
3. Check Claude Desktop logs for errors

---

## Version History

Current: **1.7.0**

See [CHANGELOG.md](CHANGELOG.md) for detailed changes.

**Semantic Versioning**:

- Major: Breaking changes (schema, removed tools)
- Minor: New features (tools, providers, context types)
- Patch: Bug fixes, performance

---

**Maintainer**: José Airosa
**Repository**: <https://github.com/joseairosa/recall>
