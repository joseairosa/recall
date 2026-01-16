# Verify App

This command runs comprehensive verification of the Recall MCP server.

## Pre-computed Context

```bash
# Check if Redis is running
redis-cli ping 2>/dev/null || echo "Redis not running"

# Check Node version
node --version

# Check if built
ls -la dist/index.js 2>/dev/null || echo "Not built"
```

## Verification Steps

### 1. Build Verification

```bash
npm run build
```

- Verify TypeScript compiles without errors
- Check bundle size is reasonable (should be ~35KB)
- Verify shebang is present: `head -1 dist/index.js`

### 2. Static Analysis

```bash
# Type checking
npx tsc --noEmit

# Check for common issues
npm run lint 2>/dev/null || echo "No lint script"
```

### 3. Runtime Tests

Only run if Redis is available:

```bash
# Run test suite
./tests/test-v1.5.0-simple.sh
```

### 4. Manual Smoke Test

If full verification needed:

1. Start the MCP server:
   ```bash
   REDIS_URL=redis://localhost:6379 ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY node dist/index.js
   ```

2. Test core operations:
   - Store a memory
   - Retrieve the memory
   - Search memories
   - Delete the memory

### 5. Package Verification

```bash
# Check package.json is valid
node -e "require('./package.json')"

# Check exports
node -e "console.log(Object.keys(require('./dist/index.js')))"
```

## Success Criteria

- [ ] Build completes without errors
- [ ] Bundle size < 50KB
- [ ] Shebang present in output
- [ ] Type checking passes
- [ ] Tests pass (if Redis available)
- [ ] No security warnings

## Failure Handling

If any step fails:
1. Report the specific failure
2. Suggest fixes based on error messages
3. Do NOT proceed to commit/push until verified
