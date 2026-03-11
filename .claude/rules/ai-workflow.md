# AI Workflow Guidelines

## CLAUDE.md Usage

### Placement

- **Root `CLAUDE.md`**: Upstream project documentation (architecture, schemas, env vars)
- **`.claude/CLAUDE.md`**: Personal overlay (communication style, conventions, workflow rules)
- **`.claude/rules/`**: Modular topic-specific guidelines

### Relationship

Root `CLAUDE.md` is the upstream project's documentation. `.claude/CLAUDE.md` is your personal overlay. Both are loaded — the personal overlay adds conventions on top of the project docs.

## Workflow Patterns

### Explore, Plan, Code, Commit

For complex tasks, follow this sequence:

1. **Explore**: Understand the codebase and requirements
   - "Search for all usages of MemoryStore"
   - "Read the embedding provider factory"

2. **Plan**: Create a clear implementation plan
   - "Create a plan for adding a new embedding provider"
   - Ask Claude to outline steps before coding

3. **Code**: Implement the solution
   - Implement one component at a time
   - Run tests after each significant change

4. **Commit**: Create atomic commits
   - "Create a commit for the new provider implementation"
   - Use conventional commit format

### Test-Driven Development (TDD)

```
1. "Write a failing test for [feature]"
2. Run tests, confirm failure
3. "Now implement the code to make the test pass"
4. Run tests, confirm they pass
5. "Refactor for clarity while keeping tests green"
```

## Extended Thinking

| Keyword | Thinking Level |
|---------|----------------|
| "think" | Low |
| "think hard" | Medium |
| "think harder" | High |
| "ultrathink" | Maximum |

### When to Use

- **"think"**: Simple refactoring, straightforward bugs
- **"think hard"**: Multi-file changes, new tool handlers
- **"think harder"**: Architecture decisions, schema changes
- **"ultrathink"**: Storage layer changes, backward compatibility analysis

## Code Generation Guidelines

### Complete Code

Generate complete, compilable code:

```typescript
// Good: Complete implementation
export async function storeMemory(
  store: MemoryStore,
  input: StoreMemoryInput
): Promise<StoreMemoryResult> {
  const parsed = StoreMemorySchema.safeParse(input);
  if (!parsed.success) {
    throw new McpError(ErrorCode.InvalidRequest, parsed.error.message);
  }
  const memory = await store.create(parsed.data);
  return { id: memory.id, stored: true };
}

// Bad: Placeholders
export async function storeMemory(store: MemoryStore, input: StoreMemoryInput) {
  // TODO: implement
  throw new Error("not implemented");
}
```

### Incremental Changes

Prefer incremental changes over large rewrites:

```
You: Add Zod validation to the search tool
Claude: [modifies only tools/index.ts with minimal changes]

You: Now add the embedding dimension check
Claude: [modifies embeddings/generator.ts and updates tools/index.ts]
```

### Match Existing Style

Before generating code:

1. Read related files
2. Note naming conventions (camelCase, `.js` extensions)
3. Observe patterns (Zod schemas, MCP error codes)
4. Follow established patterns

## Integration with Project Tools

### npm Commands

```
You: Run the tests after your changes
Claude: [runs `npm test`]

You: Check if the build succeeds
Claude: [runs `npm run build`]
```

### Version Management

After version changes:

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Run `npm run build` to verify

## When Uncertain

### Ask Clarifying Questions

```
You: Add a new embedding provider

Claude: Before implementing, a few questions:
        1. Which provider API? (endpoint, auth model)
        2. What embedding dimensions does it produce?
        3. Should it be auto-detected or only used when explicitly configured?
```

### Propose Alternatives

```
You: Optimize memory search

Claude: Two approaches:
        1. Pre-compute embeddings at store time (faster search, more storage)
        2. Cache recent search embeddings (faster repeat queries, bounded memory)

        Trade-offs: [explains]
        Which aligns better with your goals?
```
