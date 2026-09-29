# Testing Guidelines

## Test Runner

Vitest is the primary test runner. All tests use ESM.

```bash
npm test                    # Run all tests once
npm run test:watch          # Watch mode
npm run test:coverage       # With coverage report
npx vitest run src/path/to/file.test.ts  # Run specific test
```

## Test Organization

### File Placement

Place test files alongside the source file they test:

```
src/
├── tools/
│   ├── index.ts
│   ├── index.test.ts
│   ├── workflow-tool.ts
│   └── workflow-tool.test.ts
├── services/
│   ├── rlm.service.ts
│   └── rlm.service.test.ts
└── http/
    ├── billing.service.ts
    └── billing.service.test.ts
```

### Test Naming Convention

Pattern: `describe what → it should behavior when condition`

```typescript
describe("MemoryStore", () => {
  describe("storeMemory", () => {
    it("should store memory with all required fields", async () => {});
    it("should auto-index memories with importance >= 8", async () => {});
    it("should reject memories with invalid context type", async () => {});
  });

  describe("searchMemories", () => {
    it("should return memories matching semantic query", async () => {});
    it("should respect workspace isolation", async () => {});
    it("should return empty array when no matches found", async () => {});
  });
});
```

## What to Test

- **Business logic**: Memory storage, search ranking, importance indexing, workspace scoping
- **Schema validation**: Zod schema edge cases, invalid inputs, missing fields
- **State transitions**: Session lifecycle, RLM chain states, workflow steps
- **Edge cases**: Empty inputs, boundary values (importance 0, 1, 8, 10), Unicode content
- **Error paths**: Redis connection failures, invalid API keys, exceeded limits
- **Backward compatibility**: Existing Redis data still readable after changes
- **Multi-tenant isolation**: Tenant A cannot access Tenant B's memories

## What NOT to Test

- **Framework behavior**: Trust Express, MCP SDK, ioredis — test your code, not theirs
- **Trivial getters**: If it just returns a field, trust TypeScript
- **Obvious code paths**: Simple passthrough functions don't need tests
- **Duplicative coverage**: One test per behavior; multiple tests for the same path add noise

## Mocking

### Redis Mocking

Mock the storage client interface, not Redis internals:

```typescript
import { describe, it, expect, vi } from "vitest";

const mockStore = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  pipeline: vi.fn(() => ({
    sadd: vi.fn().mockReturnThis(),
    zadd: vi.fn().mockReturnThis(),
    hset: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  })),
};
```

### Embedding Provider Mocking

```typescript
const mockEmbeddingGenerator = {
  generate: vi.fn().mockResolvedValue({
    embedding: new Array(1536).fill(0),
    dimensions: 1536,
  }),
};
```

## Writing Effective Tests

Each test should:

1. **Prevent a specific regression**: Could this break in a future change?
2. **Test one behavior**: A failing test should pinpoint the problem
3. **Use descriptive names**: `should_reject_memory_when_workspace_limit_exceeded`
4. **Be deterministic**: No flaky tests; mock time and external services

```typescript
// Good: Tests specific edge case that could regress
it("should not store memory when tenant exceeds plan limit", async () => {
  mockStore.scard.mockResolvedValue(500); // Free plan limit
  const result = await storeMemory({ content: "test", type: "information" });
  expect(result.error).toContain("limit exceeded");
});

// Bad: Tests obvious behavior
it("should have a storeMemory function", () => {
  expect(typeof storeMemory).toBe("function");
});
```

## Test Purpose

Tests exist to **prevent regressions** as we iterate on the project. Every test should have a clear purpose — do not add tests for the sake of coverage metrics.

Use coverage tools to **find untested paths**, not to chase percentage targets. High coverage with weak assertions is worse than focused coverage with strong assertions.

## Runtime Tests

For tests that require a running Redis instance:

```bash
# Start Redis
redis-server

# Run runtime tests
ANTHROPIC_API_KEY="test-key" node tests/test-runtime.js
```

## Static Checks

For quick validation without dependencies:

```bash
./tests/test-v1.5.0-simple.sh
```

## Test Commands

| Command | Purpose |
|---------|---------|
| `npm test` | Run all vitest tests once |
| `npm run test:watch` | Watch mode |
| `npm run test:coverage` | With coverage report |
| `npx vitest run <file>` | Run specific test file |
| `./tests/test-v1.5.0-simple.sh` | Static checks (no dependencies) |
| `ANTHROPIC_API_KEY="test-key" node tests/test-runtime.js` | Runtime tests (requires Redis) |
