---
description: Review current PR changes for correctness, security, and code quality
---

Please use the pr-reviewer agent to review my changes against the main branch.

Run `git diff main...HEAD` to get the full diff, then analyze all changed files. Prioritize backward compatibility (Redis key patterns, context types), security (API key exposure, tenant isolation), and correctness (Zod validation, MCP error codes, embedding provider handling).

Provide feedback as plain prose with specific file:line references. No emoji headers, no bold-label patterns like "**Problem:**", no markdown headings in the output. Write like a senior engineer leaving terse, direct review comments.

Check for:

- Redis key pattern changes that break existing data
- Missing Zod schema validation on tool inputs
- Tenant isolation gaps in HTTP/SaaS paths
- Embedding provider API key leaks in logs or errors
- Unbounded collections or missing cleanup
- Missing `.js` extensions in ESM imports
- Proper MCP error code usage

Skip files that are auto-generated, formatted, or have only trivial changes.
