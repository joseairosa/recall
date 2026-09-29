# PR Review Workflow

This guide explains how to use the PR review commands for the Recall codebase.

## Quick Start

### Option 1: Slash Command

```bash
# Review current branch changes:
/review-pr

# Review a remote PR:
/review-remote-pr https://github.com/denniswon/recall/pull/123

# Re-review after author addresses feedback:
/re-review-pr https://github.com/denniswon/recall/pull/123
```

### Option 2: Direct Agent Invocation

```bash
Use the pr-reviewer agent to review my changes focusing on Redis key pattern safety
```

## When to Use

**Always review before:**

- Creating a PR from your feature branch
- Requesting review from teammates
- Merging to main

**Especially important for:**

- Storage layer changes (Redis key patterns, MemoryStore methods)
- Multi-tenant isolation (tenant scoping, workspace boundaries)
- Embedding provider changes (new providers, dimension changes)
- MCP tool handler changes (schema validation, error handling)
- HTTP/SaaS infrastructure (auth, billing, session management)

## What Gets Reviewed

The agent checks for issues at three severity levels:

**Blockers** — schema backward compatibility (Redis key patterns, context types), security (API key exposure, tenant isolation breach, missing auth), resource management (unbounded growth, connection leaks), and data integrity (atomic index updates, embedding dimension mismatches).

**Concerns** — error handling (missing MCP error codes, swallowed errors), async patterns (unhandled promise rejections, missing cleanup), performance (N+1 Redis calls, missing pipelines, unnecessary serialization), missing tests for critical paths, and code duplication.

**Minor notes** — naming clarity, TypeScript idiom improvements, and import organization.

## Comment Style Guidelines

### General Principles

- Be **direct and concise** — state the issue immediately without preamble
- No bold category prefixes like "**Critical:**" or "**Warning:**"
- No formal headers like "Suggested fix:" — just provide the fix
- No markdown headings (`##`, `###`) in the review body
- Reference existing patterns in the codebase when applicable
- Use conversational directives: "Let's not do this way" or "something like below can work"
- Use "ditto:" for repeated issues in different files
- Use "nit:" for minor/cosmetic issues
- Bold direct asks to the author: **Document this in the PR description.**
- Escalate clearly when blocking: "A blocker for this PR considering [reason]."

### Voice and Framing

- **Use "we/us" not "you"** — collaborative framing
- **Direct imperatives for clear issues** — "DO NOT", "Shouldn't do this", "Let's do X"
- **Prefix labels for non-blocking items:**
  - `Opinion:` — subjective feedback, architectural preferences
  - `FYI:` — informational, good to know, not actionable now
  - `Suggestion:` — code improvement with example
  - `nit:` — minor/cosmetic
- **No praise sections** — no "What is working well"
- **No severity grouping in review body** — flat numbered list
- **Short punchy comments** — "This hardcodes a Redis key prefix. Shouldn't do this."
- **End with clear merge criteria** — "LGTM once above are addressed."

### Review Body

Keep the overall review body minimal and conversational. No markdown headers.

**No duplication with inline comments.** Every finding that has a specific line goes as an inline comment ONLY — do not repeat it in the review body.

**For first-time reviews:**

```text
made some suggestions inline.
```

**For follow-up reviews (re-reviews):**

Flat numbered list of remaining issues. End with clear merge criteria.

```text
From previous review, these are still unaddressed:
- Redis pipeline not used for batch index updates
- Missing tenant isolation check in workspace handler

New issues:

1. Embedding dimension mismatch between store and search — we should validate dimensions match on retrieval.

LGTM once above are addressed.
```

### Inline Comment Format

Good (direct, references codebase):

```text
The `sessions` Map grows unboundedly as new sessions are created but never cleaned up. Per the 30min timeout pattern in `mcp-handler.ts`, we should evict expired sessions.

1. Add a cleanup interval (already done for memory consolidation in `context-tools.ts`)
2. Set a max session count with LRU eviction
```

```text
Let's not do this way. Use Zod schema validation. We already do this for store_memory in `tools/index.ts`.
```

Avoid (too formal):

```text
**Critical: Unbounded Map growth**

The `sessions` Map grows unboundedly...

**Suggested fix:**
1. Add cleanup interval...
```

### Cross-References

Point to existing patterns using GitHub permalinks:

- "We already do this in https://github.com/denniswon/recall/blob/abc123/src/tools/index.ts#L42-L50"
- "Per the pattern in https://github.com/denniswon/recall/blob/abc123/src/persistence/memory-store.ts#L168"

### Code Suggestions

Only include code examples when the fix is non-obvious. Most comments should be prose-only.

When you do include code, introduce it casually:

```text
something like below can work.
```

```typescript
const cleanup = setInterval(() => {
  for (const [id, session] of sessions) {
    if (Date.now() - session.lastAccess > TIMEOUT_MS) {
      sessions.delete(id);
    }
  }
}, CLEANUP_INTERVAL_MS);
```

### When Reviewing Security

Check all changed files against `.claude/rules/security.md`:

- **API key exposure**: No keys in logs, errors, or client responses
- **Tenant isolation**: All Redis operations scoped to `tenant:{tenantId}:workspace:{workspaceId}:`
- **Input validation**: All MCP tool inputs validated through Zod schemas
- **Embedding provider keys**: Not leaked in error messages or logs
- **Auth middleware**: All HTTP endpoints require authentication
- **Rate limiting**: Workspace limits enforced per plan

Make github PR comments inline to the remote PR using MY github `@denniswon` configured in `~/.gitconfig`. PR comments should be made using "my style of commenting" per the voice and framing rules above.
