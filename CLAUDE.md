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
# Unit tests with vitest (primary test runner)
npm test                    # Run all tests once
npm run test:watch          # Watch mode
npm run test:coverage       # With coverage report

# Run specific test file
npx vitest run src/services/rlm.service.test.ts

# Static checks (fast, no dependencies)
./tests/test-v1.5.0-simple.sh

# Runtime tests (requires Redis)
ANTHROPIC_API_KEY="test-key" node tests/test-runtime.js
```

### Manual Testing

```bash
# Start Redis
redis-server

# Run MCP server manually
REDIS_URL=redis://localhost:6379 ANTHROPIC_API_KEY=sk-... node dist/index.js

# Run HTTP server for SaaS testing
REDIS_URL=redis://localhost:6379 STRIPE_SECRET_KEY=sk_test_... node dist/server-http.js

# Test Redis connection
redis-cli ping  # Should return PONG
redis-cli KEYS memory:*
```

---

## Architecture Overview

### Entry Points

- **[index.ts](src/index.ts)** - MCP server (stdio transport) - use for Claude Desktop/Claude Code
- **[server-http.ts](src/server-http.ts)** - HTTP server for SaaS deployment (recallmcp.com)

### Core Components

```text
src/
├── index.ts                    # MCP server entry (stdio)
├── server-http.ts              # HTTP server entry (SaaS)
├── types.ts                    # Zod schemas, TypeScript types
├── persistence/                # Storage layer (abstracted)
│   ├── storage-client.interface.ts  # Interface for storage adapters
│   ├── storage-client.factory.ts    # Creates Redis or Valkey adapter
│   ├── storage-client.ts            # Storage client singleton
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
├── services/                   # Business logic services
│   └── rlm.service.ts          # RLM (Recursive Language Model) for large context
├── tools/                      # MCP tool handlers
│   ├── index.ts                # Core tools (store, search, delete)
│   ├── context-tools.ts        # Smart context (recall, analyze, summarize)
│   ├── rlm-tools.ts            # RLM tools (create_execution_context, decompose, etc.)
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
    ├── mcp-handler.ts          # MCP-over-HTTP with session management
    ├── auth.middleware.ts      # API key authentication + tenant isolation
    ├── billing.service.ts      # Stripe subscription management
    ├── workspace.service.ts    # Workspace limit enforcement
    ├── team.service.ts         # Team/organization management
    ├── oauth.service.ts        # OAuth flow for Claude Desktop
    ├── audit.service.ts        # API usage auditing
    ├── firebase-admin.ts       # Firebase auth integration
    └── types.ts                # HTTP-specific types (TenantContext, etc.)
```

### RLM (Recursive Language Model) System

For processing content larger than context windows (~100KB+):

1. **create_execution_context** - Store large content, get processing strategy
2. **decompose_task** - Break into subtasks (filter/chunk/recursive/aggregate)
3. **inject_context_snippet** - Extract relevant portions for each subtask
4. **update_subtask_result** - Store results as you process
5. **merge_results** - Combine all subtask results
6. **verify_answer** - Cross-check against source context

### HTTP/SaaS Multi-Tenant Architecture

Each API key creates an isolated tenant with:

- Scoped Redis key prefix: `tenant:{tenantId}:workspace:{workspaceId}:memory:*`
- Session-based MCP server instances (30min timeout)
- Plan-based limits (free: 500 memories, pro: 5000, team: 25000)
- Workspace isolation per project directory

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

### Core

| Variable | Purpose | Default |
| -------- | ------- | ------- |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `BACKEND_TYPE` | `redis` or `valkey` | `redis` |
| `VALKEY_HOST` / `VALKEY_PORT` | Valkey connection | `localhost:6379` |
| `EMBEDDING_PROVIDER` | Force specific embedding provider | auto-detect |
| `WORKSPACE_MODE` | `isolated`, `global`, or `hybrid` | `isolated` |
| `PORT` | HTTP server port (for SaaS) | `8080` |

### SaaS/HTTP Server

| Variable | Purpose |
| -------- | ------- |
| `STRIPE_SECRET_KEY` | Stripe API key for billing |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature verification |
| `STRIPE_PRICE_PRO` / `STRIPE_PRICE_TEAM` | Stripe price IDs |
| `GOOGLE_APPLICATION_CREDENTIALS` | Firebase service account JSON path |
| `FIREBASE_PROJECT_ID` | Firebase project for OAuth |

---

## Critical Constraints (Do Not Break)

### Immutable Schema Patterns

**Redis key patterns** - changing these requires migration:

```text
# Self-hosted (stdio transport)
memory:{id}              → Hash
memories:all             → Set
memories:timeline        → Sorted Set (score = timestamp)
memories:type:{type}     → Set
memories:tag:{tag}       → Set
memories:important       → Sorted Set (score = importance ≥8)
session:{id}             → Hash
sessions:all             → Set

# SaaS (HTTP transport) - tenant-scoped
tenant:{tenantId}:workspace:{workspaceId}:memory:{id}
tenant:{tenantId}:apikeys → Set of API key records
tenant:{tenantId}:customer → Stripe customer record
rlm:chain:{chainId}      → RLM execution chain state
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

### Adding a New MCP Tool

1. Add Zod schema to [types.ts](src/types.ts)
2. Add method to `MemoryStore` in [persistence/memory-store.ts](src/persistence/memory-store.ts)
3. Add tool handler to [tools/index.ts](src/tools/index.ts) or create new tool file
4. Register in [http/mcp-handler.ts](src/http/mcp-handler.ts) if using HTTP transport
5. Update README.md

### Adding RLM Tools (Complex Logic)

For tools requiring significant business logic, use the service pattern:

1. Add types to [types.ts](src/types.ts)
2. Create/update service in [services/](src/services/) (e.g., `rlm.service.ts`)
3. Write tests: `*.test.ts` alongside the service
4. Create thin tool handlers in [tools/rlm-tools.ts](src/tools/rlm-tools.ts)

### Adding HTTP Endpoints

1. Add route in [http/server.ts](src/http/server.ts)
2. Add types to [http/types.ts](src/http/types.ts)
3. Create service file if complex (e.g., `billing.service.ts`, `team.service.ts`)
4. Use `AuthenticatedRequest` for tenant-scoped endpoints

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

### MCP Server (stdio) Not Starting

```bash
redis-cli ping                    # Check Redis
echo $REDIS_URL                   # Check env vars
tail -f ~/Library/Logs/Claude/mcp*.log  # Check MCP logs
```

### HTTP Server Issues

```bash
# Check if server is running
curl http://localhost:8080/health

# Test authentication
curl -H "Authorization: Bearer sk-recall-xxx" http://localhost:8080/api/stats

# Check MCP session
curl -X POST http://localhost:8080/mcp \
  -H "Authorization: Bearer sk-recall-xxx" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

### Memory Not Storing

1. Check embedding provider API key validity
2. Check Redis connection: `redis-cli KEYS memory:*`
3. For SaaS: Check tenant key prefix `redis-cli KEYS tenant:*`
4. Check Claude Desktop logs for errors

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
