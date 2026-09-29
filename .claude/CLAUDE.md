# Recall — Agent Guidelines (Personal Overlay)

This file supplements the root `CLAUDE.md` (upstream project docs) with personal conventions, communication style, and workflow rules for @denniswon.

---

## Project Context

Recall is an MCP server providing **persistent cross-session memory** for Claude and AI agents. It stores context in Redis or Valkey with semantic search, surviving context limits and session restarts.

- **Repository**: https://github.com/denniswon/recall (fork of https://github.com/joseairosa/recall)
- **SaaS**: https://recallmcp.com
- **Tech Stack**: TypeScript, Node.js, Redis/Valkey, Express, Zod, MCP SDK, Stripe, Firebase
- **Build**: tsup (ESM), vitest for testing
- **Transports**: stdio (Claude Desktop/Code) and HTTP (SaaS multi-tenant)

## Key Value Propositions

- Persistent memory that survives context window limits and session restarts
- Semantic search across stored memories (7 embedding providers)
- Multi-tenant SaaS with workspace isolation and team sharing
- Open source + managed cloud (recallmcp.com)
- MCP-native — first-class integration with Claude ecosystem
- RLM system for processing content larger than context windows

## Target Audience

- AI developers using Claude Code and Claude Desktop
- MCP ecosystem builders
- Enterprise AI teams needing persistent context
- Developers building AI agents that need long-term memory

---

## Communication & Writing Style

See `.claude/rules/communication-style.md` for full details.

**Summary:**

- Be direct and concise. No filler, no flattery.
- Use "we/us/let's" in PR reviews — collaborative framing.
- No emoji in comments, docs, or commit messages.
- No AI attribution anywhere (commits, PRs, code comments).
- Reference specific file:line locations as GitHub permalinks.
- Short, punchy comments. No bold-label patterns like "**Problem:**".

---

## Modular Rules

Detailed guidelines are in `.claude/rules/`:

| File                    | Contents                                          |
|-------------------------|---------------------------------------------------|
| `communication-style.md`| Writing style, PR review voice, Notion comments   |
| `code-style.md`         | TypeScript conventions, naming, imports, comments  |
| `testing.md`            | Vitest patterns, test organization, what to test   |
| `security.md`           | Redis security, API keys, tenant isolation         |
| `architecture.md`       | Recall architecture quick reference                |
| `ai-workflow.md`        | AI-assisted development patterns                   |
| `docs-sync.md`          | Documentation sync and deduplication rules         |

---

## Essential Commands

| Command              | Purpose                                    |
|----------------------|--------------------------------------------|
| `npm run build`      | Production build (tsup)                    |
| `npm run dev`        | Watch mode for development                 |
| `npm run start`      | Run MCP server (stdio transport)           |
| `npm run start:http` | Run HTTP server (SaaS deployment)          |
| `npm test`           | Run all tests (vitest)                     |
| `npm run test:watch` | Watch mode tests                           |
| `npm run test:coverage` | Tests with coverage report              |

### Before Committing

```bash
npm run build         # Verify build succeeds
npm test              # Run tests
```

---

## Key Principles

1. **Never break backward compatibility** — existing Redis key patterns and context types are immutable without migration
2. **Never remove core context types** — the 10 core types (`directive`, `information`, `heading`, `decision`, `code_pattern`, `requirement`, `error`, `todo`, `insight`, `preference`) must persist
3. **Never log sensitive data** — no API keys, embedding provider keys, or user content in logs
4. **Always validate external input** — MCP tool arguments, HTTP requests, Redis data
5. **Always use `.js` extensions in imports** — ESM module convention (even for `.ts` files)
6. **Use Zod schemas for validation** — all tool inputs validated through Zod
7. **Use MCP error codes** — `ErrorCode.InvalidRequest`, `ErrorCode.InternalError`
8. **Atomic Redis operations** — use pipelines for index updates in MemoryStore

---

## Git & PR Conventions

- Use conventional commit format: `type: subject` (feat, fix, refactor, docs, test, chore, perf, ci, build)
- **Never** include AI attribution in commits, PR titles, or PR descriptions
- PR descriptions: plain prose, short paragraphs, like a Slack message. No markdown headings, no bold-label patterns.
- Use the git user already configured in the local repository (`@denniswon`). Do not modify git config.

---

## Common Pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| Import errors with `.ts` extension | ESM requires `.js` extensions | Change `.ts` to `.js` in import paths |
| Redis connection fails | Redis not running or wrong URL | `redis-cli ping`, check `REDIS_URL` |
| Embedding generation fails | Missing API key for provider | Check `EMBEDDING_PROVIDER` and corresponding key |
| HTTP server auth fails | Invalid or missing API key | Check `Authorization: Bearer sk-recall-xxx` header |
| Memory not found after store | Wrong workspace scope | Check `WORKSPACE_MODE` (isolated/global/hybrid) |

---

## Related Documentation

- Root [`CLAUDE.md`](../CLAUDE.md) — Upstream project documentation (architecture, schemas, environment variables)
- [`CHANGELOG.md`](../CHANGELOG.md) — Release history
- [`README.md`](../README.md) — User-facing documentation
- [`QUICKSTART.md`](../QUICKSTART.md) — Quick start guide
