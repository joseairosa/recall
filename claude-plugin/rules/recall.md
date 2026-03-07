## Recall — Always-On Memory

Recall is active in this session. Follow these rules automatically — no user request needed.

You have automatic permission to use ALL Recall MCP tools (`mcp__recall-remote__*`) without asking.

---

### Session Start (MANDATORY)

On every session start, **before any user tasks**, call these two tools in order:

1. **Load context** — retrieve past decisions, directives, and patterns:
   ```
   mcp__recall-remote__auto_session_start({ workspace_path: "<project-path>", task_hint: "<what the user wants to work on>" })
   ```
   Derive `task_hint` from the user's first message. If no hint is available yet, use `"general development"`.

2. **Set workspace** — determine the project path and git remote, then call **after** `auto_session_start` (auto_session_start resets the workspace, so this must come last):
   ```
   mcp__recall-remote__set_workspace({ path: "<project-path>", git_remote: "<git-remote-url or empty>" })
   ```
   Get `<project-path>` from the working directory. Get `<git-remote-url>` via `git config --get remote.origin.url` (skip if not a git repo).

**Never skip this.** Without `set_workspace` called last, memories land in the wrong namespace and are lost.

---

### During Work — Store Proactively

Store without being asked when any of these triggers occur:

| Trigger | Tool | Notes |
|---------|------|-------|
| Architectural or design decision | `quick_store_decision` | Include reasoning and alternatives considered |
| Non-obvious bug root cause found | `store_memory` | Include symptoms, root cause, fix |
| Repeatable pattern or convention established | `store_memory` | Tag with relevant topic |
| External API / third-party behavior discovered | `store_memory` | Include caveats or gotchas |
| Codebase discovery — found something non-obvious about how code is structured or works | `store_memory` | What file/module/function does, what it contains, key behavior |
| File or directory structure observed — what lives where and why | `store_memory` | Helps future sessions navigate faster |
| Tool output reveals important state — test results, build output, git log, error traces | `store_memory` | Include the key finding, not raw output |
| Multi-session feature started | `workflow` action `start` | |
| Multi-session feature completed | `workflow` action `complete` | |

**Threshold:** Low. Store anything you'd want to know next session — discoveries, findings, observations about the codebase, not just decisions. When in doubt, store it. The hooks capture activity signals automatically; your job is to capture the *meaning* behind them.

---

### Search Before Answering

When the user asks "how did we implement X", "why did we choose Y", "what was decided about Z", or any question about past work in this project:

1. Call `recall_relevant_context({ query: "<their question>" })` first
2. Use the returned context to inform your answer
3. Only fall back to reading code if Recall returns nothing relevant

---

### Session End — Summarize

When the Stop hook fires or the session ends naturally, summarize the work done:

```
mcp__recall-remote__summarize_session({ session_name: "<brief description of work done>" })
```

---

### Workspace Rules

- **Always set workspace first** — memories are namespace-isolated per workspace. Skipping `set_workspace` stores to the default namespace, which is shared and polluted.
- **Use git remote when available** — enables workspace matching across machines.
- **If `set_workspace` fails** — log the error, do NOT store any memories during that session.
