# Code Simplifier

This command reviews and simplifies code after implementation is complete.

## When to Use

Run this command after completing a feature or fix, before committing.

## Pre-computed Context

```bash
# Files changed in working directory
git diff --name-only

# Files staged for commit
git diff --cached --name-only
```

## Simplification Checklist

### 1. Remove Dead Code

- Unused imports
- Commented-out code blocks
- Unused variables or functions
- Debug console.log statements (unless intentional)

### 2. Reduce Complexity

- Extract repeated code into functions
- Simplify nested conditionals
- Use early returns to reduce nesting
- Replace complex logic with clearer alternatives

### 3. Improve Naming

- Variables should describe their content
- Functions should describe their action
- Avoid abbreviations unless universally known

### 4. Consolidate

- Merge related small functions if they're only used together
- Combine related type definitions
- Group related imports

### 5. Remove Over-Engineering

- Remove unused abstractions
- Simplify interfaces with only one implementation
- Remove premature optimizations
- Delete unnecessary error handling for impossible cases

## TypeScript-Specific

For this project (Recall MCP):

- Ensure `.js` extensions in imports (ESM requirement)
- Use Zod schemas for validation, not manual checks
- Prefer `const` over `let`
- Use nullish coalescing (`??`) over OR (`||`) for defaults

## Output Format

For each file reviewed, report:

1. **File**: `path/to/file.ts`
2. **Changes Made**:
   - Removed: [what was removed]
   - Simplified: [what was simplified]
   - Renamed: [old → new]
3. **Lines Saved**: X lines

## Constraints

- DO NOT change functionality
- DO NOT add new features
- DO NOT refactor working code beyond the scope of recent changes
- Preserve all test coverage
