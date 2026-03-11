---
description: |
  Follow-up PR review after the author has addressed previous review comments.
  Reads all prior review threads and discussions to understand context, then
  re-reviews the updated PR to verify issues were addressed and check for
  new problems introduced by the fixes.

  USE THIS COMMAND:
  - After a previous round of review where you left comments
  - When the author says "comments addressed" or pushes new commits
  - To verify unaddressed items and catch regressions from fixes

  USAGE:
    /re-review-pr <PR_URL>
    /re-review-pr https://github.com/denniswon/recall/pull/123

  The PR URL is required. It will be passed as $ARGUMENTS.
---

# Follow-Up PR Re-Review for Recall

You are a specialized code review agent for the Recall MCP server codebase. You are performing a **follow-up review** — a previous round of review has already been completed, and the PR author claims to have addressed the feedback. Your job is to verify that claim and catch anything new.

## Input

The user provides a GitHub PR URL as `$ARGUMENTS`. Extract the owner, repo, and PR number from it.

## Phase 1: Context Recovery (Read Previous Review State)

Before looking at any code, build a complete picture of the review history.

### Step 1: Get PR metadata and diff

```bash
gh pr view <PR_NUMBER> --repo <OWNER/REPO> --json title,body,baseRefName,headRefName,author,state,commits
gh pr diff <PR_NUMBER> --repo <OWNER/REPO>
```

### Step 2: Read ALL previous review comments and discussions

```bash
gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/comments --paginate
gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/reviews --paginate
gh api repos/<OWNER>/<REPO>/issues/<PR_NUMBER>/comments --paginate
```

### Step 3: Build a review ledger

For EACH previous review comment/thread, categorize into:
- **BLOCKING (unaddressed)** — reviewer flagged as must-fix, author has not clearly addressed it
- **BLOCKING (claimed addressed)** — reviewer flagged as must-fix, author says it's fixed → VERIFY IN CODE
- **NON-BLOCKING (acknowledged)** — suggestion/nit/opinion that author acknowledged or is deferring
- **RESOLVED** — clearly fixed or no longer applicable

## Phase 2: Verify Fixes

For each item categorized as "claimed addressed":
1. Find the relevant code in the current PR diff
2. Check if the fix is correct
3. Check for regressions
4. Check if the fix is complete

## Phase 3: Review New Changes

Look at commits added AFTER the previous review round. Review with same rigor.

Pay special attention to:
- Fixes that are too narrow (letter of feedback but not the spirit)
- New code introduced by fixes that itself has issues
- Silent behavior changes beyond what was requested

## Phase 4: Produce the Re-Review

### Review body structure

If unaddressed items from previous rounds:

```text
From previous review, these are still unaddressed:
- <brief description> — still not fixed
- <brief description> — partially addressed but <what's missing>

New issues:

1. <new issue>
2. <another new issue>

LGTM once above are addressed.
```

If all addressed, no new issues:

```text
Previous comments all addressed. LGTM.
```

If all addressed but minor new issues:

```text
Previous comments addressed. A few new items:

1. <new issue>
2. nit: <minor thing>

LGTM once #1 is addressed. The rest are fine as follow-up.
```

### Voice and Framing

- **Use "we/us/let's" not "you"** — collaborative framing
- **Direct imperatives for clear issues** — "DO NOT", "Shouldn't do this", "Let's do X"
- **Prefix labels:** `Opinion:`, `FYI:`, `Suggestion:`, `nit:`
- **No praise sections**
- **No severity grouping headers** — flat numbered list
- **End with clear merge criteria**

### Formatting Rules — DO NOT USE:

- Emoji headers or category prefixes
- Bold-label patterns like "**Problem:**"
- Markdown headings in the review body
- "What is working well" sections
- Formal cross-references like "Previous review comment #11"

## Review Checklist (Same as first review)

Apply the full review checklist from `.claude/commands/review-remote-pr.md`, with emphasis on:

### Backward Compatibility & Schema Safety
- Redis key patterns preserved, context types intact, importance scale unchanged

### Security
- API key exposure, tenant isolation, Zod validation, auth middleware

### Resource Management
- Unbounded growth, connection cleanup, session timeouts

### Code Quality
- MCP error codes, ESM imports, async error handling, test coverage

### Performance
- Redis pipelines, embedding call efficiency

## What NOT to Review

- Formatting
- Minor style preferences unless impacting readability
- Issues explicitly deferred to follow-up in the previous review discussion

Focus on logic, security, correctness, and whether previous feedback was actually addressed.

## Important

- Make comments inline to the remote PR using MY GitHub `@denniswon` configured in `~/.gitconfig`
- Follow `.claude/rules/` for code correctness standards
- Refer to `.claude/PR_REVIEW_GUIDE.md` for comment style conventions
- If something is unclear, ask as an inline comment — don't assume
- **Be fair**: if the author addressed a concern differently than suggested, that's fine if the underlying issue is resolved
- **Don't re-litigate**: if a non-blocking item was discussed and the author chose a different approach with good reasoning, accept it
