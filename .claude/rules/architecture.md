# Architecture Quick Reference

## Entry Points

| Entry | File | Transport | Use Case |
|-------|------|-----------|----------|
| MCP Server | `src/index.ts` | stdio | Claude Desktop, Claude Code |
| HTTP Server | `src/server-http.ts` | HTTP | SaaS (recallmcp.com) |

## Core Components

```
src/
├── index.ts                    # MCP server entry (stdio)
├── server-http.ts              # HTTP server entry (SaaS)
├── types*.ts                   # Zod schemas, TypeScript types (10+ files)
├── persistence/                # Storage layer (abstracted)
│   ├── storage-client.interface.ts  # Interface for storage adapters
│   ├── storage-client.factory.ts    # Creates Redis or Valkey adapter
│   ├── memory-store.ts              # Core memory CRUD + index management
│   ├── redis-client.ts / redis-adapter.ts
│   └── valkey-client.ts / valkey-adapter.ts
├── embeddings/                 # Multi-provider embedding system
│   ├── factory.ts              # Auto-detects provider from API keys
│   ├── generator.ts            # Embedding generation orchestration
│   └── providers/              # 7 provider implementations
├── services/
│   └── rlm.service.ts          # RLM for large context processing
├── tools/                      # MCP tool handlers (16+ tools)
│   ├── index.ts                # Core tools (store, search, delete)
│   ├── context-tools.ts        # Smart context (recall, analyze, summarize)
│   ├── rlm-tools.ts            # RLM tools
│   ├── workflow-tool.ts        # Cross-session workflows
│   └── ...                     # Relationship, version, template, category tools
├── resources/                  # MCP resource handlers
├── prompts/                    # MCP prompt handlers
├── analysis/                   # Claude-powered conversation analysis
└── http/                       # HTTP/SaaS infrastructure
    ├── server.ts               # Express server setup
    ├── mcp-handler.ts          # MCP-over-HTTP with session management
    ├── auth.middleware.ts       # API key auth + tenant isolation
    ├── billing.service.ts      # Stripe subscription management
    ├── workspace.service.ts    # Workspace limit enforcement
    ├── team.service.ts         # Team/organization management
    └── oauth.service.ts        # OAuth flow for Claude Desktop
```

## Data Flow

### stdio Transport (Self-Hosted)

```
Claude Desktop/Code → stdio → MCP Server → Redis/Valkey
                                    ↓
                              Embedding Provider (optional)
```

### HTTP Transport (SaaS)

```
Client → HTTP → Auth Middleware → MCP Handler → Session → MCP Server → Redis
                     ↓                                         ↓
               Tenant Context                          Embedding Provider
               Plan Limits
               Billing Check
```

## Storage Layer

The storage client is abstracted behind `StorageClientInterface`:

- **Redis adapter** (`ioredis`) — default, most common
- **Valkey adapter** (`@valkey/valkey-glide`) — AWS-friendly alternative

Both implement the same interface. Factory selects based on `BACKEND_TYPE` env var.

## Embedding Provider Priority

Auto-detected from available API keys (highest quality first):

1. Voyage AI (`VOYAGE_API_KEY`)
2. Cohere (`COHERE_API_KEY`)
3. OpenAI (`OPENAI_API_KEY`)
4. Deepseek (`DEEPSEEK_API_KEY`)
5. Grok (`GROK_API_KEY`)
6. Anthropic (`ANTHROPIC_API_KEY`) — keyword fallback, no vectors
7. Ollama (`OLLAMA_BASE_URL`) — local inference

Force with `EMBEDDING_PROVIDER=voyage|cohere|openai|etc`.

## RLM System

For processing content larger than context windows (~100KB+):

1. `create_execution_context` — store large content, get strategy
2. `decompose_task` — break into subtasks
3. `inject_context_snippet` — extract relevant portions
4. `update_subtask_result` — store intermediate results
5. `merge_results` — combine all subtask results
6. `verify_answer` — cross-check against source

## Multi-Tenant Architecture

Each API key creates an isolated tenant:

- Scoped Redis prefix: `tenant:{tenantId}:workspace:{workspaceId}:memory:*`
- Session-based MCP instances (30min timeout)
- Plan-based limits (free: 500, pro: 5000, team: 25000)
- Workspace isolation per project directory

## Immutable Schema Patterns

These Redis key patterns MUST NOT change without migration:

```
# Self-hosted
memory:{id}              → Hash
memories:all             → Set
memories:timeline        → Sorted Set (score = timestamp)
memories:type:{type}     → Set
memories:tag:{tag}       → Set
memories:important       → Sorted Set (score = importance >= 8)
session:{id}             → Hash
sessions:all             → Set

# SaaS
tenant:{tenantId}:workspace:{workspaceId}:memory:{id}
tenant:{tenantId}:apikeys
tenant:{tenantId}:customer
rlm:chain:{chainId}
```

## Core Context Types (Never Remove)

These 10 types are immutable — removing breaks existing memories:

`directive`, `information`, `heading`, `decision`, `code_pattern`, `requirement`, `error`, `todo`, `insight`, `preference`

Adding new types is safe — edit `src/types-core.ts`.
