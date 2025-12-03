#!/bin/bash

# Simple test script for v1.5.0 features
# Tests by checking if tools are available and Backend keys are created correctly

# set -e

echo "======================================================================"
echo "  v1.5.0 Simple Test Suite"
echo "======================================================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0

# Test function
test_command() {
    local name="$1"
    local command="$2"
    local expected="$3"

    echo -e "${BLUE}Testing: $name${NC}"
    if eval "$command" | grep -q "$expected"; then
        echo -e "${GREEN}  ✓ PASSED${NC}"
        ((PASSED++))
    else
        echo -e "${RED}  ✗ FAILED${NC}"
        ((FAILED++))
    fi
}

# Test 1: Check if new tools exist in build
echo ""
echo "==================================="
echo "Phase 1: Tool Availability"
echo "==================================="

test_command "version-tools.ts exists" \
    "test -f src/tools/version-tools.ts && echo 'exists'" \
    "exists"

test_command "template-tools.ts exists" \
    "test -f src/tools/template-tools.ts && echo 'exists'" \
    "exists"

test_command "category-tools.ts exists" \
    "test -f src/tools/category-tools.ts && echo 'exists'" \
    "exists"

test_command "get_memory_history in version-tools" \
    "grep -q 'get_memory_history' src/tools/version-tools.ts && echo 'found'" \
    "found"

test_command "rollback_memory in version-tools" \
    "grep -q 'rollback_memory' src/tools/version-tools.ts && echo 'found'" \
    "found"

test_command "create_template in template-tools" \
    "grep -q 'create_template' src/tools/template-tools.ts && echo 'found'" \
    "found"

test_command "set_memory_category in category-tools" \
    "grep -q 'set_memory_category' src/tools/category-tools.ts && echo 'found'" \
    "found"

# Test 2: Check type definitions
echo ""
echo "==================================="
echo "Phase 2: Type Definitions"
echo "==================================="

test_command "MemoryVersion schema exists" \
    "grep -q 'MemoryVersionSchema' src/types.ts && echo 'found'" \
    "found"

test_command "MemoryTemplate schema exists" \
    "grep -q 'MemoryTemplateSchema' src/types.ts && echo 'found'" \
    "found"

test_command "Category field in MemoryEntry" \
    "grep -q 'category.*optional.*describe.*Category for organization' src/types.ts && echo 'found'" \
    "found"

test_command "Redis version keys defined" \
    "grep -q 'memoryVersions:' src/types.ts && echo 'found'" \
    "found"

test_command "Redis template keys defined" \
    "grep -q 'template:' src/types.ts && echo 'found'" \
    "found"

test_command "Redis category keys defined" \
    "grep -q 'memoryCategory:' src/types.ts && echo 'found'" \
    "found"

# Test 3: Check MemoryStore implementation
echo ""
echo "==================================="
echo "Phase 3: MemoryStore Methods"
echo "==================================="

test_command "createVersion method exists" \
    "grep -q 'async createVersion' src/persistence/memory-store.ts && echo 'found'" \
    "found"

test_command "getMemoryHistory method exists" \
    "grep -q 'async getMemoryHistory' src/persistence/memory-store.ts && echo 'found'" \
    "found"

test_command "rollbackMemory method exists" \
    "grep -q 'async rollbackMemory' src/persistence/memory-store.ts && echo 'found'" \
    "found"

test_command "createTemplate method exists" \
    "grep -q 'async createTemplate' src/persistence/memory-store.ts && echo 'found'" \
    "found"

test_command "setMemoryCategory method exists" \
    "grep -q 'async setMemoryCategory' src/persistence/memory-store.ts && echo 'found'" \
    "found"

test_command "searchMemories has new parameters" \
    "grep -q 'category.*string' src/persistence/memory-store.ts && grep -q 'fuzzy.*boolean' src/persistence/memory-store.ts && grep -q 'regex.*string' src/persistence/memory-store.ts && echo 'found'" \
    "found"

# Test 4: Check build artifacts
echo ""
echo "==================================="
echo "Phase 4: Build Artifacts"
echo "==================================="

test_command "dist/index.js exists" \
    "test -f dist/index.js && echo 'exists'" \
    "exists"

test_command "Version 1.7.0 in package.json" \
    "grep -q '\"version\": \"1.7.0\"' package.json && echo 'found'" \
    "found"

test_command "Version 1.7.0 in src/index.ts" \
    "grep -q \"version: '1.7.0'\" src/index.ts && echo 'found'" \
    "found"

test_command "CHANGELOG has v1.7.0 entry" \
    "grep -q '\[1.7.0\]' CHANGELOG.md && echo 'found'" \
    "found"

test_command "README mentions 27 tools" \
    "grep -q '27' README.md && echo 'found'" \
    "found"

# Test 5: TypeScript Compilation
echo ""
echo "==================================="
echo "Phase 6: Build Verification"
echo "==================================="

test_command "TypeScript builds without errors" \
    "npm run build 2>&1 | grep -q 'Build success' && echo 'success'" \
    "success"

test_command "Bundle size is reasonable (<220KB)" \
    "test $(wc -c < dist/index.js) -lt 220000 && echo 'ok'" \
    "ok"

# Summary
echo ""
echo "======================================================================"
echo "  Test Summary"
echo "======================================================================"
echo -e "Total: $((PASSED + FAILED))"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All static tests passed!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Start MCP server: npx -y @joseairosa/recall"
    echo "2. Follow manual test checklist: test-v1.5.0-manual.md"
    echo "3. Test with Claude Desktop to verify runtime behavior"
    exit 0
else
    echo -e "${RED}✗ Some tests failed. Review errors above.${NC}"
    exit 1
fi
