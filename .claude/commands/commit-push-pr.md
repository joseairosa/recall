# Commit, Push, and Create PR

This command automates the git workflow: commit changes, push to remote, and create a PR.

## Pre-computed Context

```bash
# Current branch
git branch --show-current

# Git status (staged and unstaged)
git status --short

# Recent commits for style reference
git log --oneline -5

# Check if branch has upstream
git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || echo "No upstream"
```

## Instructions

1. **Analyze Changes**: Review the git status and diff to understand what's being committed
2. **Generate Commit Message**:
   - Follow conventional commits format (feat:, fix:, docs:, refactor:, test:, chore:)
   - First line: concise summary (50 chars max)
   - Body: explain WHY, not WHAT
   - Include `Co-Authored-By: Claude <noreply@anthropic.com>`
3. **Stage Files**: Add relevant files (avoid secrets, .env, credentials)
4. **Commit**: Create the commit with the generated message
5. **Push**: Push to remote, creating upstream if needed (`-u origin <branch>`)
6. **Create PR**: Use `gh pr create` with:
   - Clear title matching commit
   - Summary section with bullet points
   - Test plan section
   - Link to Claude Code footer

## PR Template

```markdown
## Summary
- [Brief description of changes]

## Test Plan
- [ ] Tests pass locally
- [ ] Manual verification completed

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## Safety Checks

- Never commit files matching: `.env*`, `*credentials*`, `*secret*`, `*.pem`, `*.key`
- Verify branch is not `main` or `master` before force operations
- Check for uncommitted changes before starting
