# docs-sync

Analyze branch changes and ensure all documentation and code comments are accurate and up to date.

## Phase 1: Gather Context

1. Read `.claude/rules/` directory thoroughly — these are mandatory guidelines for this repository.
2. Run `git log --oneline $(git merge-base HEAD main)..HEAD` to list all commits on this branch.
3. Run `git diff $(git merge-base HEAD main)..HEAD` to understand all code changes.
4. Run `git diff $(git merge-base HEAD main)..HEAD --stat` for a file-level summary.
5. For each commit, run `git show <sha> --stat` to understand the intent and scope of individual changes.

## Phase 2: Audit Documentation Files

Locate and read all documentation files:

- `CLAUDE.md` files (root and `.claude/`)
- `README.md` files (root and any subdirectories)
- All markdown files in `docs/` directory
- `CHANGELOG.md`, `QUICKSTART.md`, `WORKSPACE_MODES.md`
- Any other `.md` files relevant to the changed code

For each documentation file, evaluate:

- Does it accurately reflect the current state of the code?
- Are examples, usage instructions, and API references correct?
- Are there references to removed, renamed, or deprecated functionality?
- Is there new functionality that should be documented but is missing?

## Phase 3: Audit Code Comments

Review code files that were changed in this branch:

- Are existing comments still accurate after the changes?
- Are there complex sections that lack a "why" explanation?
- Remove stale or misleading comments.

**Comment principles:**

- Only comment where the "why" is non-obvious.
- Do not comment what the code literally does — the code shows that.
- Concise and clear. No filler phrases.
- No TODO comments unless they are actionable and tracked.

## Phase 4: Apply Updates

1. Update documentation files with accurate information.
2. Fix or remove stale code comments.
3. Add minimal necessary comments where "why" context is missing.
4. Ensure consistency in terminology across all docs and comments.

## Rules

- Follow all instructions in `.claude/rules/` without exception.
- Do not add verbose or redundant comments. Less is more.
- Do not fabricate features or behaviors — only document what exists.
- Preserve the existing style and tone of documentation unless it conflicts with accuracy.
- If a README or doc file does not exist but should, create it only if the gap is significant.
- No emojis in documentation or comments.
- No AI attribution anywhere.

## Phase 5: Evolve Agent Instructions

Review and contribute to the `.claude/` folder to improve future agent sessions:

**Rules (`.claude/rules/`):**

- Are there patterns, conventions, or lessons learned from this branch that should become rules?
- Are existing rules still accurate, or do they reference outdated practices?
- Add new rules for recurring decisions or non-obvious project conventions discovered during this work.

**Commands (`.claude/commands/`):**

- Are there repetitive workflows that could become reusable commands?
- Do existing commands need updates based on how the project has evolved?

**CLAUDE.md:**

- Update project context, architecture notes, or key entry points if they have changed.
- Keep it concise — this is orientation context, not exhaustive documentation.

**Principles:**

- Rules should be actionable and specific, not vague.
- Prefer fewer, high-value rules over comprehensive but noisy ones.
- Commands should encode workflows that are stable and repeatable.
- Do not add speculative or one-off guidance.

## Output

After completing updates, provide a summary:

- Files modified
- Key documentation changes made
- Comments added, updated, or removed
- `.claude/` contributions (new rules, updated commands, CLAUDE.md changes)
- Any gaps or ambiguities that require human decision
