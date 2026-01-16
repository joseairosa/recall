# Agent Registry - Recall MCP Server

This registry defines specialized agents for the Recall project. The Coordinator should route tasks to appropriate agents based on their specialization.

---

## Available Agents

### 1. Code Agent (`code`)

**Specialization**: TypeScript implementation, MCP tools, Redis operations

**Use When**:
- Implementing new tools or resources
- Modifying memory-store.ts logic
- Adding new context types or schemas
- Fixing bugs in core functionality

**Key Files**:
- `src/types.ts` - Schemas
- `src/redis/memory-store.ts` - Storage
- `src/tools/*.ts` - Tool implementations
- `src/index.ts` - Request routing

**Guidelines**:
- Always use Zod schemas for validation
- Use Redis pipelines for atomic operations
- Maintain backward compatibility
- Add comprehensive error handling

---

### 2. Test Agent (`test`)

**Specialization**: Testing, quality assurance, validation

**Use When**:
- Writing new tests
- Validating feature implementations
- Running test suites
- Debugging test failures

**Key Files**:
- `tests/test-runtime.js` - Runtime tests
- `tests/test-v1.5.0.js` - Integration tests
- `tests/test-v1.5.0-simple.sh` - Static checks
- `tests/README.md` - Test documentation

**Guidelines**:
- Test both success and failure paths
- Include edge cases
- Document test requirements
- Keep tests independent

---

### 3. Docs Agent (`docs`)

**Specialization**: Documentation, README updates, changelog

**Use When**:
- Updating README.md
- Writing feature documentation
- Updating CHANGELOG.md
- Creating usage examples

**Key Files**:
- `README.md` - Main documentation
- `CHANGELOG.md` - Version history
- `CLAUDE.md` - Development guidelines
- `ai_docs/` - AI-specific docs

**Guidelines**:
- Keep examples practical
- Update all relevant docs together
- Maintain consistent formatting
- Include version numbers

---

### 4. Review Agent (`review`)

**Specialization**: Code review, architecture validation, quality checks

**Use When**:
- Reviewing PRs
- Validating architectural decisions
- Checking for breaking changes
- Security audits

**Guidelines**:
- Check for backward compatibility
- Validate error handling
- Review test coverage
- Check documentation updates

---

### 5. Release Agent (`release`)

**Specialization**: Version management, npm publishing, releases

**Use When**:
- Preparing a new release
- Updating version numbers
- Creating GitHub releases
- Publishing to npm

**Key Files**:
- `package.json` - Version, metadata
- `CHANGELOG.md` - Release notes
- `dist/` - Built output

**Guidelines**:
- Follow semantic versioning
- Update CHANGELOG.md
- Test build before release
- Verify npm package contents

---

## Routing Guidelines

### Simple Tasks (No Agent Needed)
- Quick fixes with clear solutions
- Single-file changes
- Documentation typos
- Minor refactoring

### Code Agent Tasks
- "Add a new tool for X"
- "Fix bug in memory storage"
- "Implement feature Y"
- "Optimize Redis queries"

### Test Agent Tasks
- "Write tests for X feature"
- "Why is test Y failing?"
- "Validate feature implementation"
- "Add edge case coverage"

### Docs Agent Tasks
- "Update README for new feature"
- "Document X functionality"
- "Add usage examples"
- "Update CHANGELOG"

### Review Agent Tasks
- "Review this implementation"
- "Check for breaking changes"
- "Validate architecture decision"
- "Security review"

### Release Agent Tasks
- "Prepare v1.7.0 release"
- "Publish to npm"
- "Create GitHub release"
- "Update version numbers"

---

## Agent Invocation

The Coordinator should:

1. **Analyze the task** to determine complexity and scope
2. **Select appropriate agent** based on specialization
3. **Provide context** from globals.md and relevant files
4. **Track progress** in todo.json
5. **Validate output** before completion

---

## Creating New Agents

When adding new agents:

1. Define clear specialization
2. List key files and responsibilities
3. Provide specific guidelines
4. Add routing examples
5. Update this registry
