# Global Configuration - Recall MCP Server

## Project Overview

**Recall** is an MCP (Model Context Protocol) server providing persistent memory for Claude conversations. It stores context in Redis with semantic search capabilities, solving context window limitations.

**Version**: 1.6.0
**Author**: José Airosa
**License**: MIT

---

## Tech Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript (strict mode)
- **Build**: tsup
- **Database**: Redis (ioredis)
- **AI**: Anthropic Claude API (for embeddings/analysis)
- **Protocol**: Model Context Protocol (MCP)
- **IDs**: ULID (not auto-increment)

---

## Key Architecture

### Core Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Entry Point | `src/index.ts` | MCP server setup, request routing |
| Types | `src/types.ts` | Zod schemas, TypeScript types |
| Memory Store | `src/redis/memory-store.ts` | Redis storage logic |
| Redis Client | `src/redis/client.ts` | Connection management |
| Embeddings | `src/embeddings/generator.ts` | Claude-based embeddings |
| Analyzer | `src/analysis/conversation-analyzer.ts` | AI conversation analysis |

### Tool Modules

| Module | Purpose |
|--------|---------|
| `tools/index.ts` | Core memory operations |
| `tools/context-tools.ts` | Smart context (recall, analyze, summarize) |
| `tools/export-import-tools.ts` | Backup/restore, duplicates |
| `tools/relationship-tools.ts` | Knowledge graphs (v1.4) |
| `tools/version-tools.ts` | Version history (v1.5) |
| `tools/template-tools.ts` | Memory templates (v1.5) |
| `tools/category-tools.ts` | Categories (v1.5) |

### Resources

| Module | Purpose |
|--------|---------|
| `resources/index.ts` | MCP resource handlers |
| `resources/analytics.ts` | Usage analytics |

---

## Critical Constraints

### NEVER Change Without Migration

1. **Redis Key Patterns**:
   - `memory:{id}` → Hash
   - `memories:all` → Set
   - `memories:timeline` → Sorted Set
   - `memories:type:{type}` → Set
   - `memories:tag:{tag}` → Set
   - `memories:important` → Sorted Set

2. **Context Types** (10 core types):
   - `directive`, `information`, `heading`, `decision`, `code_pattern`
   - `requirement`, `error`, `todo`, `insight`, `preference`

3. **Importance Threshold**: >= 8 for `memories:important` index

4. **ULID Generation**: Memory IDs must remain accessible forever

---

## Code Conventions

### Naming
- **Files**: kebab-case (`memory-store.ts`)
- **Variables/Functions**: camelCase
- **Types/Classes**: PascalCase
- **Constants**: SCREAMING_SNAKE_CASE

### Imports
- Use `.js` extensions (ESM requirement)
- Group: stdlib → vendor → local

### Error Handling
- Use MCP error codes: `ErrorCode.InvalidRequest`, `ErrorCode.InternalError`
- Always include descriptive messages

---

## Testing

### Quick Commands
```bash
# Build
npm run build

# Static checks
./tests/test-v1.5.0-simple.sh

# Runtime tests (requires Redis)
ANTHROPIC_API_KEY="test-key" node tests/test-runtime.js
```

### Before Committing
- [ ] TypeScript compiles
- [ ] Bundle size reasonable
- [ ] All tools work
- [ ] Indexes update correctly
- [ ] Documentation updated

---

## Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `REDIS_URL` | No | `redis://localhost:6379` | Redis connection |
| `ANTHROPIC_API_KEY` | Yes | - | Claude API for embeddings |
| `WORKSPACE_MODE` | No | `isolated` | Memory isolation mode |

---

## Workspace Modes

- **isolated** (default): Workspace-only memories
- **global**: All memories shared globally
- **hybrid**: Both workspace-specific AND global memories

---

## Performance Targets

- Store Memory: ~200ms
- Batch Store (10): ~500ms
- Get by ID: <1ms
- Recent (50): ~10ms
- Semantic Search (1k): ~500ms
- Semantic Search (10k): ~2s

---

## Security Reminders

- Redis should be secured (AUTH, TLS)
- Never store secrets in memories
- Audit stored data regularly
- Use `rediss://` for remote connections

---

## Coordinator Role

When working as the Coordinator on this project:

1. **Route to Specialists**: Use agents in `.claude/agents/` for specialized tasks
2. **Track Progress**: Keep `.claude/todo.json` updated
3. **Maintain Quality**: Ensure tests pass before commits
4. **Preserve Compatibility**: Never break existing memories
5. **Document Changes**: Update CHANGELOG.md and README.md
