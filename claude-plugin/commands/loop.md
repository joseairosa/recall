---
name: recall-loop
description: Periodic memory digest — designed for use with Claude Code's /loop scheduler. Shows recent memories and pending to-dos in a compact, scannable format.
usage: /recall-loop [window_minutes]
allowed_tools:
  - mcp__recall-remote__loop_digest
---

# /recall-loop

Run a periodic digest of your Recall memory. Shows what was stored recently and any pending to-dos. Designed to be scheduled with `/loop`.

## Usage

```
/recall-loop                  # Digest of last 60 minutes (default)
/recall-loop 30               # Digest of last 30 minutes
/recall-loop 120              # Digest of last 2 hours
```

## Scheduling with /loop

```
/loop 30m /recall-loop        # Check in every 30 minutes
/loop 1h /recall-loop         # Hourly digest
/loop 2h /recall-loop 120     # Every 2 hours, look back 2 hours
```

## What it shows

- **Recent memories** — decisions, patterns, insights stored in the window
- **Pending to-dos** — overdue and high-priority items that need attention

## Behavior

1. Parse the optional `window_minutes` argument (default: 60)
2. Call `mcp__recall-remote__loop_digest` with `{ window_minutes, include_todos: true }`
3. Present the formatted digest
4. If overdue to-dos exist, surface them prominently

## Example output

```
Recall Digest — Last 60m [14:30:00]
==================================================
MEMORIES  3 new
  [decision] Chose Redis for session caching with 30-minute TTL
  [insight] Auth middleware reads tenant context from req.tenant
  [code_pattern] Always use generateUlid() for new IDs

TO-DOS
  [OVERDUE] Review security audit report (high)
  Write tests for billing service (medium)

--------------------------------------------------
Tip: /loop 60m /recall-loop
```
