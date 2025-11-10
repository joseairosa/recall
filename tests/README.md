# Test Suite

Comprehensive testing infrastructure for the MCP Memory Server.

---

## Overview

This test suite ensures the MCP Memory Server works correctly across all features and versions. Tests are organized into three categories:

1. **Static Tests** - File existence, type definitions, method signatures
2. **Runtime Tests** - Server startup, tool availability, JSON-RPC protocol
3. **Manual Tests** - Interactive feature testing with Claude Desktop

---

## Quick Start

### Run All Automated Tests

```bash
# 1. Static checks (fast, no dependencies)
./tests/test-v1.5.0-simple.sh

# 2. Runtime checks (requires Redis + API keys)
ANTHROPIC_API_KEY="test-key" OPENAI_API_KEY="test-key" node tests/test-runtime.js
```

### Prerequisites

- **Redis**: Running on `localhost:6379`
- **Node.js**: v18 or higher
- **API Keys**: Set as environment variables (can use dummy keys for basic tests)
- **Built Package**: Run `npm run build` first

---

## Test Files

### Automated Tests

#### `test-v1.5.0-simple.sh`
**Purpose**: Quick static validation checks

**What it tests**:
- File existence (tool files, types, memory-store)
- Method signatures in MemoryStore
- Type definitions and schemas
- Redis key patterns
- Build artifacts and version numbers
- TypeScript compilation

**Run**:
```bash
chmod +x tests/test-v1.5.0-simple.sh
./tests/test-v1.5.0-simple.sh
```

**Duration**: ~5 seconds

**Requirements**: None (just source files)

---

#### `test-runtime.js`
**Purpose**: Runtime server and protocol tests

**What it tests**:
- Server startup without crashes
- Redis connection
- MemoryStore initialization
- JSON-RPC protocol (initialize, tools/list)
- Tool availability (all 27 tools)
- v1.5.0 specific tools present

**Run**:
```bash
# With dummy API keys (recommended)
ANTHROPIC_API_KEY="test-key" OPENAI_API_KEY="test-key" node tests/test-runtime.js

# Or with real keys
node tests/test-runtime.js
```

**Duration**: ~15 seconds

**Requirements**: Redis running

---

#### `test-vr-v1.7.0.js`
**Purpose**: Full integration tests with real Redis operations



**What it tests**:
- Memory CRUD operations
- Version history creation and rollback
- Template creation and instantiation
- Category assignment and queries
- Advanced search (fuzzy, regex, category filtering)
- Global vs workspace scopes
- Relationship preservation

**Run**:
This needs to be compiled first - install tsc then in tests run
```bash
tsc
```
This will compile the test code into tests/test_dist

Then to run the test for Redis:

**Requirements**: Redis running

```bash
ANTHROPIC_API_KEY="test-key" node test_dist/tests/test-vr-V1.7.0.js
```

To run this test on Valkey:

**Requirements**: Valkey running

```bash
ANTHROPIC_API_KEY="test-key" BACKEND_TYPE="valkey" VALKEY_HOST="localhost" VALKEY_PORT="6379" node test_dist/tests/test-vr-V1.7.0.js
```


**Duration**: ~30 seconds


**⚠️ Warning**: Creates real data. Use test instance or flush after.

---

#### `test-time-window-vr.ts`
**Purpose**: Tests v1.7.0 time window context retrieval

**What it tests**:
- Time-based memory retrieval (last N hours/minutes)
- Importance filtering (minimum threshold)
- Context type filtering (single and multiple types)
- Combined filters (importance + type)
- Chronological ordering verification
- Empty time windows (no results)



**Run**:
This needs to be compiled first - install tsc then in tests run - unless already done in test-vr-v1.7.0.js test above.
```bash
tsc
```
This will compile the test code into tests/test_dist

Then to run the test for Redis:

**Requirements**: Redis running

```bash
REDIS_URL="redis://localhost:6379/15" node test_dist/tests/test-time-window-vr.js
```
the 15 after the port number in the url is the db number.

To run this test on Valkey:

**Requirements**: Valkey running
```bash
BACKEND_TYPE="valkey" VALKEY_HOST="localhost" VALKEY_PORT="6379" VALKEY_DB=15 node test_dist/tests/test-time-window-vr.js
```


**Duration**: ~5 seconds



**Test Coverage**: 8 tests covering all time window retrieval features

---

### Manual Tests

#### `test-v1.5.0-manual.md`
**Purpose**: Interactive testing checklist for Claude Desktop integration

**What it tests**:
- End-to-end feature workflows
- UI/UX with Claude Desktop
- Edge cases and error handling
- Real-world usage patterns

**How to use**:
1. Configure Claude Desktop with MCP server
2. Open checklist in `test-v1.5.0-manual.md`
3. Follow step-by-step instructions
4. Verify expected outputs
5. Mark items as complete

**Duration**: 30-60 minutes

**Requirements**:
- Claude Desktop configured
- MCP server running
- Redis running
- Real API keys

---

### Utility Scripts

#### `test-relationships-vr.js`
**Purpose**: Tests v1.7.0 relationship features (graph traversal, linking)
**Run**:
This needs to be compiled first - install tsc then in tests run - unless already done in test-vr-v1.7.0.js test above.
```bash
tsc
```
This will compile the test code into tests/test_dist

Then to run the test for Redis:

**Requirements**: Redis running

```bash
ANTHROPIC_API_KEY="test-key" REDIS_URL="redis://localhost:6379/15" node test_dist/tests/test-relationships-vr.js
```
the 15 after the port number in the url is the db number.

To run this test on Valkey:

**Requirements**: Valkey running
```bash
ANTHROPIC_API_KEY="test-key" BACKEND_TYPE="valkey" VALKEY_HOST="localhost" VALKEY_PORT="6379" VALKEY_DB=15 node test_dist/tests/test-relationships-vr.js
```

## Testing Workflow for New Releases

**CRITICAL**: Follow this workflow before publishing to npm

### 1. Pre-Development
- [ ] Create feature branch: `feature/{TIMESTAMP}-{DESCRIPTION}`
- [ ] Store implementation plan in recall-dev MCP

### 2. Development
- [ ] Implement features
- [ ] Update types and schemas
- [ ] Add new tools/resources
- [ ] Update CHANGELOG.md
- [ ] Update README.md

### 3. Static Testing
```bash
# Run static checks
./tests/test-v1.5.0-simple.sh
```
- [ ] All file existence checks pass
- [ ] All method signatures present
- [ ] TypeScript compiles without errors
- [ ] Bundle size reasonable (<200KB)

### 4. Build Verification
```bash
# Clean build
rm -rf dist/
npm run build

# Verify output
ls -lh dist/index.js
head -1 dist/index.js  # Check shebang
```
- [ ] Build succeeds
- [ ] dist/index.js exists
- [ ] Shebang present (#!/usr/bin/env node)

### 5. Runtime Testing
```bash
# Start Redis if not running
redis-server

# Run runtime tests
ANTHROPIC_API_KEY="test-key" OPENAI_API_KEY="test-key" node tests/test-runtime.js
```
- [ ] Server starts without crashes
- [ ] All tools available
- [ ] JSON-RPC protocol works

### 6. Integration Testing
```bash
# Run full integration tests
ANTHROPIC_API_KEY="test-key" OPENAI_API_KEY="test-key" node tests/test-v1.5.0.js
```
- [ ] All CRUD operations work
- [ ] New features work correctly
- [ ] Backward compatibility maintained
- [ ] Indexes update correctly

### 7. Manual Testing
- [ ] Follow `test-v1.5.0-manual.md` checklist
- [ ] Test with Claude Desktop
- [ ] Verify all edge cases
- [ ] Document any issues found

### 8. Pre-Release
- [ ] All tests passing
- [ ] Version bumped in package.json
- [ ] Version bumped in src/index.ts
- [ ] CHANGELOG.md updated
- [ ] README.md updated
- [ ] Commit message descriptive

### 9. Publish
```bash
# Only after ALL tests pass
git push origin feature-branch
# Create and merge PR
git checkout main
git pull
npm publish
```

### 10. Post-Release
- [ ] Create GitHub release with tag
- [ ] Update recall-dev with learnings
- [ ] Test npm install works: `npx -y @joseairosa/recall`

---

## Test Results

### v1.5.0 Test Results

See [TEST-RESULTS-v1.5.0.md](TEST-RESULTS-v1.5.0.md) for complete results.

**Summary**:
- ✅ 16 static checks passed
- ✅ 19 runtime checks passed
- ✅ All 8 new tools present
- ⚠️ 1 known issue (ANTHROPIC_API_KEY requirement - pre-existing)

---

## Known Issues

### ANTHROPIC_API_KEY Required at Startup
**Severity**: Medium

**Impact**: Server cannot start without ANTHROPIC_API_KEY environment variable

**Root Cause**: ConversationAnalyzer instantiated at module load time in context-tools.ts

**Workaround**:
```bash
export ANTHROPIC_API_KEY="test-key"
# or
ANTHROPIC_API_KEY="test-key" node dist/index.js
```

**Status**: Pre-existing bug (not caused by v1.5.0), can be fixed in future version

**Proposed Fix**: Lazy-load ConversationAnalyzer only when analyze_and_remember is called

---

## Debugging Tests

### Test Fails: "Redis connection failed"
```bash
# Check if Redis is running
redis-cli ping
# Should return: PONG

# If not running, start Redis
redis-server
```

### Test Fails: "ANTHROPIC_API_KEY required"
```bash
# Use dummy key for basic tests
export ANTHROPIC_API_KEY="test-key"
export OPENAI_API_KEY="test-key"

# Or use real keys for full testing
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."
```

### Test Fails: "Cannot find module"
```bash
# Rebuild the project
npm run build

# Check dist/index.js exists
ls -lh dist/index.js
```

### Server Won't Start in Tests
```bash
# Check Node version (requires v18+)
node --version

# Check for Redis conflicts
lsof -i :6379

# Check logs in test output
# Look for stack traces in stderr
```

### View Test Data in Redis
```bash
# Connect to Redis
redis-cli

# List all keys
KEYS *

# View a memory
HGETALL ws:default:memory:{id}

# View version history
ZRANGE ws:default:memory:{id}:versions 0 -1

# View categories
SMEMBERS ws:default:categories:all

# View templates
SMEMBERS ws:default:templates:all
```

---

## Adding New Tests

### For New Features

1. **Add to test-v1.5.0.js** (or create test-v1.x.x.js for new version):
```javascript
// Example: Testing new feature
async function testNewFeature() {
  log('\n=== Testing New Feature ===', 'blue');

  try {
    // Your test code here
    passed++;
    log('✓ New feature works', 'green');
  } catch (error) {
    failed++;
    log(`✗ New feature failed: ${error.message}`, 'red');
  }
}
```

2. **Add to manual checklist** in test-v1.5.0-manual.md:
```markdown
### New Feature
- [ ] Test basic usage
- [ ] Test edge cases
- [ ] Test error handling
- [ ] Verify Redis data
```

3. **Add to static checks** in test-v1.5.0-simple.sh:
```bash
test_command "New method exists" \
    "grep -q 'async newMethod' src/redis/memory-store.ts && echo 'found'" \
    "found"
```

### For Regression Tests

Add to existing test files to ensure old features still work with new changes.

---

## CI/CD Integration (Future)

**Planned for v1.6.0+**:

```yaml
# .github/workflows/test.yml
name: Test Suite
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      redis:
        image: redis:7
        ports:
          - 6379:6379
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run build
      - run: ./tests/test-v1.5.0-simple.sh
      - run: ANTHROPIC_API_KEY="test" node tests/test-runtime.js
```

---

## Support

**Maintainer**: José Airosa

**Issues**: File in GitHub at [https://github.com/joseairosa/recall/issues](https://github.com/joseairosa/recall/issues)

**Test Failures**: Include:
1. Test file name
2. Error message
3. Full output
4. Environment (OS, Node version, Redis version)

---

**Last Updated**: 2025-10-03
**Version**: 1.5.0
