# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Context

**Recall** is an MCP (Model Context Protocol) server providing persistent memory for Claude conversations. Stores context in Redis or Valkey with semantic search to survive context window limitations.

**Version**: 1.7.0 | **Author**: José Airosa | **License**: MIT

**Key Principle**: This server IS the solution to context loss - maintain backward compatibility at all costs.

---

## Build & Test Commands

```bash
npm run build          # Production build (tsup)
npm run dev            # Watch mode

# Static checks (no Redis required)
./tests/test-v1.5.0-simple.sh

# Runtime tests (requires Redis + API key)
ANTHROPIC_API_KEY="your-key" node tests/test-runtime.js

# Manual verification
redis-cli ping                    # Check Redis
node dist/index.js                # Run server manually
```

---

## Architecture Overview

### Storage Abstraction Layer (v1.7.0)

```
src/persistence/
├── storage-client.interface.ts   # StorageClient interface
├── storage-client.factory.ts     # Factory for Redis/Valkey selection
├── redis-adapter.ts              # Redis implementation
├── redis-client.ts               # Redis connection
├── valkey-adapter.ts             # Valkey implementation
├── valkey-client.ts              # Valkey connection
└── memory-store.ts               # Core storage logic (uses StorageClient)
```

**Backend Selection**: Set `BACKEND_TYPE=valkey` for Valkey, defaults to Redis.

### Tool Modules

| Module                          | Purpose                                   |
| ------------------------------- | ----------------------------------------- |
| `tools/index.ts`                | Core memory CRUD                          |
| `tools/context-tools.ts`        | Smart context (recall, analyze, summarize)|
| `tools/relationship-tools.ts`   | Knowledge graphs                          |
| `tools/version-tools.ts`        | Version history & rollback                |
| `tools/template-tools.ts`       | Memory templates                          |
| `tools/category-tools.ts`       | Categories                                |
| `tools/export-import-tools.ts`  | Backup/restore                            |

### Request Flow

```
Claude → MCP SDK → src/index.ts → tools/*.ts → memory-store.ts → StorageClient → Redis/Valkey
```

---

## Critical Constraints

### NEVER Change Without Migration

**Redis Key Patterns:**
```
memory:{id}              → Hash
memories:all             → Set
memories:timeline        → Sorted Set (score = timestamp)
memories:type:{type}     → Set
memories:tag:{tag}       → Set
memories:important       → Sorted Set (score = importance)
```

**10 Core Context Types** (never remove):
`directive`, `information`, `heading`, `decision`, `code_pattern`, `requirement`, `error`, `todo`, `insight`, `preference`

**Importance Threshold**: ≥8 for `memories:important` index

**Memory IDs**: ULID-based, must remain stable forever

---

## Code Style

- **ESM Modules**: Use `.js` extensions in imports (even for `.ts` files)
- **Files**: kebab-case (`memory-store.ts`)
- **Variables/Functions**: camelCase
- **Types/Classes**: PascalCase
- **Error Handling**: Use MCP `ErrorCode.InvalidRequest`, `ErrorCode.InternalError`

---

## Making Changes

### Adding a New Tool

1. Add Zod schema to [types.ts](src/types.ts)
2. Add method to `MemoryStore` in [memory-store.ts](src/persistence/memory-store.ts)
3. Add handler in [tools/index.ts](src/tools/index.ts)
4. Update [README.md](README.md)

### Modifying Storage Logic

1. Ensure index updates are atomic (use pipelines)
2. Test with existing data
3. Document migration path
4. Update version in package.json

---

## Environment Variables

| Variable            | Default                  | Purpose                      |
| ------------------- | ------------------------ | ---------------------------- |
| `REDIS_URL`         | `redis://localhost:6379` | Redis connection             |
| `BACKEND_TYPE`      | `redis`                  | Backend: `redis` or `valkey` |
| `VALKEY_HOST`       | `localhost`              | Valkey host                  |
| `VALKEY_PORT`       | `6379`                   | Valkey port                  |
| `ANTHROPIC_API_KEY` | -                        | Claude API for embeddings    |
| `WORKSPACE_MODE`    | `isolated`               | Memory isolation mode        |

---

## Slash Commands

Located in `.claude/commands/`:

| Command             | Purpose                            |
| ------------------- | ---------------------------------- |
| `/init`             | Initialize session with context    |
| `/commit-push-pr`   | Commit, push, and create PR        |
| `/verify-app`       | Build and test verification        |
| `/code-simplifier`  | Clean up code after implementation |
| `/review-pr`        | Thorough PR code review            |

---

## Debugging

```bash
redis-cli ping                              # Check Redis
redis-cli KEYS memory:*                     # List memories
tail -f ~/Library/Logs/Claude/mcp*.log      # MCP logs
```

---

## Using Recall Efficiently

**Store HIGH-SIGNAL context only:**

- ✅ Decisions and reasoning ("Chose X because...")
- ✅ Project preferences, constraints
- ✅ Learned patterns from bugs

**Don't store:**

- ❌ Code snippets (put in files)
- ❌ Obvious facts
- ❌ Temporary session context

---

## Testing Checklist

Before committing:

- [ ] `npm run build` passes
- [ ] `head -1 dist/index.js` shows shebang
- [ ] Store/retrieve/search memories work
- [ ] All indexes update correctly
- [ ] Documentation updated

---

**Last Updated**: 2026-01-16
