# Review PR

This command performs a thorough code review of a pull request.

## Usage

```
/review-pr [PR_NUMBER or URL]
```

## Pre-computed Context

```bash
# Get PR details
gh pr view $PR_NUMBER --json title,body,additions,deletions,files,commits

# Get the diff
gh pr diff $PR_NUMBER
```

## Review Framework

### 1. Understand the Change

- What problem does this PR solve?
- Does the title/description accurately reflect the changes?
- Is the scope appropriate (not too large)?

### 2. Architecture Review

- Does this follow project patterns?
- Are concerns properly separated?
- Is the solution appropriately simple?
- Any breaking changes?

### 3. Code Quality

For each file changed:

- [ ] Follows project code style
- [ ] No dead code or debug statements
- [ ] Proper error handling
- [ ] No security vulnerabilities (injection, XSS, secrets)
- [ ] Performance considerations addressed

### 4. Testing

- [ ] Tests cover the happy path
- [ ] Tests cover error cases
- [ ] Tests cover edge cases
- [ ] No flaky test patterns

### 5. Documentation

- [ ] Code is self-documenting with good names
- [ ] Complex logic has comments explaining WHY
- [ ] README/docs updated if needed
- [ ] CHANGELOG updated for user-facing changes

## Review Output Format

```markdown
## PR Review: #{PR_NUMBER}

### Summary
[1-2 sentence summary of the change]

### ✅ Strengths
- [What's done well]

### 🟡 Suggestions (Non-blocking)
- [Improvements that could be made]

### 🔴 Issues (Blocking)
- [Must be fixed before merge]

### Files Reviewed
| File | Assessment |
|------|------------|
| path/to/file.ts | ✅ Good / 🟡 Minor issues / 🔴 Needs work |

### Recommendation
[ ] ✅ Approve
[ ] 🟡 Approve with suggestions
[ ] 🔴 Request changes
```

## For This Project (Recall MCP)

Pay special attention to:
- Redis key pattern changes (breaking!)
- Context type modifications (backward compatibility)
- Index update atomicity (use pipelines)
- Memory ID generation (must stay consistent)
- Error codes (use MCP standard codes)
