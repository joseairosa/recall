# Initialize Session

This command initializes a new Claude Code session with full project context.

## Pre-computed Context

```bash
# Current git status
git branch --show-current && git status --short

# Recent commits
git log --oneline -5

# Check build status
ls -la dist/index.js 2>/dev/null && echo "Build: OK" || echo "Build: MISSING - run npm run build"

# Check Redis
redis-cli ping 2>/dev/null && echo "Redis: OK" || echo "Redis: NOT RUNNING"
```

## Session Initialization Steps

### 1. Greet the User

Say hi to José with a friendly, informal tone as specified in CLAUDE.md.

### 2. Load Project Context

Read and internalize:
- `CLAUDE.md` - Project guidelines and coding standards
- `.claude/globals.md` - Tech stack and constraints
- `.claude/agents/REGISTRY.md` - Available specialist agents

### 3. Fetch Recent Memories from Recall

Use the Recall MCP to get relevant context:

```
mcp__recall__recall_relevant_context({
  "query": "recent work, decisions, and learnings for this project",
  "limit": 10
})
```

Also search for any high-importance memories:

```
mcp__recall__search_memories({
  "query": "critical decisions patterns preferences",
  "limit": 5,
  "min_importance": 8
})
```

### 4. Load Active Todos

Read `.claude/todo.json` and display any pending tasks.

### 5. Display Session Summary

Present a concise summary:

```
## 🚀 Session Initialized

**Project**: Recall MCP Server v1.7.0
**Branch**: [current branch]
**Status**: [clean/dirty]

### 📋 Active Todos
- [ ] Task 1
- [ ] Task 2

### 🧠 Recent Context from Recall
- [Recent decisions/learnings]

### 🔧 Available Commands
- `/commit-push-pr` - Commit, push, and create PR
- `/verify-app` - Build and test verification
- `/code-simplifier` - Clean up code
- `/review-pr` - Review a pull request

Ready to work! What would you like to do?
```

## Guidelines

- Always use José's name
- Maintain informal, personal tone
- Proactively use Recall MCP without asking
- If Redis is down, warn but continue
- If build is missing, suggest running `npm run build`

## Error Handling

- If Recall MCP fails: Continue without memories, note the issue
- If git fails: Note we're not in a git repo
- If files missing: Create them or note what's missing
