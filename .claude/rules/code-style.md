# Code Style Guidelines

## Language & Module System

- **TypeScript**: Strict mode, full type safety
- **ESM Modules**: Use `.js` extensions in imports (even for `.ts` files)
- **Build**: tsup for production builds
- **Runtime**: Node.js >= 18

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Functions | camelCase | `storeMemory` |
| Variables | camelCase | `memoryId` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_MEMORIES` |
| Types/Interfaces | PascalCase | `MemoryStore` |
| Enums | PascalCase | `ContextType` |
| Files | kebab-case | `memory-store.ts` |
| Zod Schemas | PascalCase + Schema suffix | `StoreMemorySchema` |

### Descriptive Names

Use descriptive names that convey intent:

```typescript
// Good: Clear and descriptive
const embeddingProvider = factory.createProvider(config);
const isMemoryImportant = memory.importance >= 8;
const tenantKeyPrefix = `tenant:${tenantId}:workspace:${workspaceId}`;

// Bad: Abbreviated or unclear
const ep = factory.createProvider(config);
const imp = memory.importance >= 8;
const prefix = `tenant:${tid}:workspace:${wid}`;
```

## Imports

### Organization

Group imports in order:

1. Node.js built-ins
2. External packages
3. Internal modules (relative paths)

```typescript
import { createHash } from "crypto";

import { z } from "zod";
import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";

import { MemoryStore } from "../persistence/memory-store.js";
import { generateEmbedding } from "../embeddings/generator.js";
```

### ESM Import Rules

Always use `.js` extensions, even when the source file is `.ts`:

```typescript
// Good
import { MemoryStore } from "./persistence/memory-store.js";

// Bad
import { MemoryStore } from "./persistence/memory-store";
import { MemoryStore } from "./persistence/memory-store.ts";
```

### Avoid Glob Imports

```typescript
// Good: Explicit imports
import { StoreMemorySchema, SearchMemoriesSchema } from "./types.js";

// Avoid: Glob imports
import * as types from "./types.js";
```

## Zod Schemas

Use Zod for all input validation:

```typescript
// Define schema with descriptions for MCP tool inputs
const StoreMemorySchema = z.object({
  content: z.string().describe("The memory content to store"),
  type: z.enum([
    "directive", "information", "heading", "decision",
    "code_pattern", "requirement", "error", "todo",
    "insight", "preference"
  ]).describe("Context type"),
  importance: z.number().min(1).max(10).default(5)
    .describe("Importance level (1-10, 8+ auto-indexed)"),
  tags: z.array(z.string()).optional()
    .describe("Tags for categorization"),
});

// Infer types from schemas
type StoreMemoryInput = z.infer<typeof StoreMemorySchema>;
```

## Error Handling

### MCP Error Codes

Use standard MCP error codes:

```typescript
// Good: Specific MCP error codes
throw new McpError(
  ErrorCode.InvalidRequest,
  `Memory ${memoryId} not found`
);

throw new McpError(
  ErrorCode.InternalError,
  "Failed to connect to Redis"
);

// Bad: Generic errors
throw new Error("not found");
throw new Error("something went wrong");
```

### Error Messages

- State what failed
- Include relevant identifiers
- Be specific
- Do not include sensitive data (API keys, tokens)

```typescript
// Good
`Embedding generation failed for provider ${providerName}: ${error.message}`
`Tenant ${tenantId} exceeded memory limit (${count}/${limit})`

// Bad
`API call failed with key sk-xxx...` // Leaks API key
`Error occurred` // Too vague
```

## Comments

### General Rules

- No emojis anywhere in comments
- No exclamation marks unless semantically necessary
- Write in neutral, professional tone
- Be concise; avoid filler words

### What to Comment

- **Why** something is done, not **what** is being done
- Non-obvious business logic and domain rules
- Edge cases and handling rationale
- Redis key pattern decisions
- Backward compatibility notes

### What NOT to Comment

- Obvious code behavior
- Prompt-specific context or AI generation notes
- Changelog-style entries
- Commented-out code (delete it)
- Restating the function signature

```typescript
// Good: explains why
// Skip memories with importance < 8 to keep the important index bounded
if (memory.importance < 8) continue;

// Bad: restates the obvious
// Check if importance is less than 8
if (memory.importance < 8) continue;
```

## File Organization

```typescript
// Order within a file:
// 1. Imports
// 2. Constants
// 3. Type definitions (interfaces, types, Zod schemas)
// 4. Helper functions (private/unexported)
// 5. Main exports (classes, public functions)
// 6. Default export (if any)
```

## Technical Documentation Files

When writing technical documentation:

**Current State Assumption**
- Documentation describes the current implementation by default
- Do not mark features as "Implemented" or "Done" — this is implied
- Avoid phrases like "fully implemented", "properly integrated"

**Diagrams**
- Do NOT use ASCII art diagrams
- Use Mermaid for flow diagrams (flowcharts, sequence diagrams, state diagrams)
- Use tables for component breakdowns
- Use indented code blocks for directory structure

**Tables**
- Remove columns that contain redundant information
- Keep tables focused on distinguishing information

## Redis Key Patterns

When working with Redis keys, always follow the established patterns:

```typescript
// Self-hosted (stdio transport)
`memory:${id}`              // Hash
`memories:all`              // Set
`memories:timeline`         // Sorted Set (score = timestamp)
`memories:type:${type}`     // Set
`memories:tag:${tag}`       // Set
`memories:important`        // Sorted Set (score = importance >= 8)

// SaaS (HTTP transport) - tenant-scoped
`tenant:${tenantId}:workspace:${workspaceId}:memory:${id}`
```

Never change these patterns without a migration path.
