# Communication Style

## General Principles

- Be direct and concise. No filler, no flattery.
- Lead with the substance, not with politeness.
- Cite specific file paths and line numbers as GitHub permalinks (e.g., `https://github.com/denniswon/recall/blob/<sha>/src/path/file.ts#L42-L50`), not raw text like `file.ts:42`.
- Use numbered lists for multi-point feedback.

## PR Code Reviews

See also: `.claude/PR_REVIEW_GUIDE.md`

- **Use "we/us/let's"** — collaborative framing toward the code author ("Let's do X", "if we update", "we should")
- Direct imperatives for clear issues: "DO NOT", "Shouldn't do this", "Let's do X"
- Short punchy comments: "This leaks the embedding API key in the error response. Shouldn't do this."
- No praise / "What is working well" sections — review body is for issues only
- Reference existing codebase patterns: "We already do this in `src/tools/index.ts`"
- Use prefix labels: `Opinion:` (subjective), `FYI:` (informational), `Suggestion:` (with code), `nit:` (cosmetic)

## Document Reviews and Comment Threads

- **No self-labeling**: Never prefix with "Review from Dennis:" or similar — your name is already on the comment
- **No praise openers in replies**: Never start with "Good point", "Good catch", "Great work" — get straight to the substance
- **No gratuitous thanks**: Don't add "(thanks for the link)" or "thanks for clarifying" — acknowledge corrections by engaging with the content, not with politeness
- **Use "I" in reply threads**: When clarifying your own previous statement, use "I didn't mean..." not "our comment wasn't saying..." — own your words directly
- **@mention people instead of naming in prose**: Use platform @mention tags, not "Good point from [Name]"
- **First comments can open with brief positive framing**: "Good work on X — the Y makes sense" is fine for the initial review comment, but keep it to one line max
- **Corrections are direct**: "This is not accurate — [correct fact]" or "To clarify, [what I actually meant]" — no softening

## What NOT to Do (Applies Everywhere)

- No "Overall review from Dennis:" self-labels
- No "Good catch!" / "Good point!" / "Great observation!" openers
- No "(thanks for the link confirming)" or similar gratuitous acknowledgments
- No "I think we can all agree..." or other consensus-seeking filler
- No restating what someone said before responding — just respond
