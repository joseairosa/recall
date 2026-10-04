# Recall Plugin for Claude Code

Persistent memory, semantic search, and context management across Claude Code sessions.

## Installation

### From Marketplace

```bash
/plugin install recall@marketplace-name
```

### Manual (Local)

```bash
claude --plugin-dir /path/to/plugin/recall
```

Or copy to your plugins directory:

```bash
cp -r plugin/recall ~/.claude/plugins/recall
```

## Configuration

Run the setup command after installing the plugin:

```
/recall:setup
```

This will prompt for your API key (found at https://recallmcp.com/dashboard/keys), save it to `~/.claude/recall/config.json`, and verify the connection.

Alternatively, set your API key as an environment variable:

```bash
export RECALL_API_KEY="sk-your-api-key-here"
```

Optionally set a custom server URL (defaults to `https://recallmcp.com`):

```bash
export RECALL_SERVER_URL="https://your-instance.example.com"
```

To use a config file other than `~/.claude/recall/config.json`, name it in `RECALL_CONFIG_FILE`. The scripts and the mod both read it. It is a test hook first (pointing a session at a test instance or a local stand-in without touching your own config), and also serves a second account.

## What's Included

### MCP Server (`.mcp.json`)

Connects to the Recall MCP server at recallmcp.com (or self-hosted). Provides 21 primary tools:
- `set_workspace`, `get_workspace` -- workspace management
- `store_memory`, `search_memories`, `recall_relevant_context` -- memory CRUD
- `auto_session_start`, `summarize_session` -- session lifecycle (protocol self-teaching built-in)
- `check_duplicate` -- pre-write deduplication check
- `import_conversations` -- bulk import from Claude Code, ChatGPT, Slack exports
- `memory_graph` -- relationships with temporal validity (valid_from/valid_to, invalidate)
- `workflow`, `rlm_process` -- advanced workflows
- And more

### Claude Code Mod (`hooks/register.js`, Claude Code 2.1.287 or later)

`hooks/hooks.json` names `register.js` under `modules`, so Claude Code runs it inside its own process. In the terminal and the Desktop app it:

- draws Recall's row in the band above the prompt: its name in bold, the workspace, then dim detail. The row stands on its own, with or without other plugins' rows:
  `Recall    agentspend · 3 saved this session · 1.18`
  The workspace starts at the same column as the values in other products' rows (2 cells in, then a 9-cell name column). The band keeps one blank row above it, once, whichever products draw in it, and only when it has a row to spare: in a short window the rows come first. Under a survey Recall draws nothing there;
- records a failing shell command (as `observe.sh` does) without starting a script for each one;
- confirms the workspace and runs a Recall call once more when it fails because the session lost its workspace.

A mod's MCP call asks for permission like any other. The mod makes one only for the retry, so it asks for `set_workspace` the first time a session loses its workspace, unless that is allowed. To allow it, add `"mcp__recall-remote__set_workspace"` to `permissions.allow` in your settings.

While it runs it refreshes `~/.claude/recall/mod-heartbeat-<session id>` every 15 seconds. `observe.sh` stands down only while that file is fresh, and takes over again if the mod stops.

Recall shows once: `statusline.sh` leaves its Recall segment out, from the first render, when Claude Code is 2.1.287 or later, the mods rollout flag Claude Code caches in `.claude.json` is on, and Claude Code loads a recall plugin at 1.18.0 or later with `hooks/register.js` (an enabled install, or a folder in `CLAUDE_CODE_PLUGIN_DIRS`). Otherwise the segment shows as before. A status line set up before the plugin (`~/.claude/plugins/recall/scripts/statusline.sh`) is kept at the plugin's version by `session-start.sh`. VS Code's chat panel, `claude -p`, older Claude Code, `--bare` and `--safe-mode` do not run mods, so the scripts work there as before.

Getting it on an existing install (nothing else to install):

```bash
claude plugin marketplace update recall-claude-plugin
claude plugin update recall@recall-claude-plugin
```

Then restart Claude Code, or run `/reload-plugins`. Claude Code auto-updates only official marketplaces by default; to get new Recall versions on their own, turn auto-update on in `/plugin` → **Marketplaces** → recall-claude-plugin → **Enable auto-update**. Until then, when a newer Recall is out, the row above the prompt says `/plugin marketplace update recall-claude-plugin, then /plugin update recall`. To check: `claude --version` is 2.1.287 or later, and `/plugin` lists recall among the active mods.

Tests: `cd plugin/recall && claude plugin test` (Claude Code's own test kit, no session or network).

### Lifecycle Hooks (`hooks/hooks.json`)

- **SessionStart** — injects relevant memory context at session start
- **PostToolUse, PostToolUseFailure** — records a failing Bash command with an output excerpt (stands down while the mod runs). A command that exits non-zero fires PostToolUseFailure. Secrets in the command and its output are replaced with `[REDACTED]` first (`hooks/redact.js`, the same list as observe.sh's).
- **PreCompact** — saves state marker before context compaction
- **Stop** — deregisters session and polls for pending events

### RLM Agents (`agents/`)

- **context-loader** — loads large files into RLM for chunk-based processing
- **result-aggregator** — aggregates results from RLM processing chains
- **task-decomposer** — decomposes complex tasks into RLM-processable chunks

### Commands (`commands/`)

- `/setup` — configure your Recall API key and verify the connection
- `/decompose` — decompose a large file or task using RLM
- `/load-context` — load content into RLM memory for processing
- `/rlm-status` — check status of active RLM execution chains

### Status Line (`scripts/statusline.sh`)

Shows memory count and version info, where the mod does not draw (see above). Add to `~/.claude/settings.json` manually:

```json
{
  "statusLine": {
    "command": "bash \"~/.claude/plugins/recall/scripts/statusline.sh\"",
    "type": "command",
    "padding": 0
  }
}
```

## Migrating from MCP + Hooks Setup

If you previously used Recall via the install script (`scripts/install.sh`):

1. Install this plugin
2. Remove Recall hooks from `~/.claude/settings.json` (SessionStart, PostToolUse, PreCompact, Stop entries referencing `recall/hooks/`)
3. Remove the statusLine entry (or update path to plugin location)
4. Remove `~/.claude/recall/` directory
5. Set `RECALL_API_KEY` environment variable

## Links

- [recallmcp.com](https://recallmcp.com) — Cloud hosted service
- [GitHub](https://github.com/joseairosa/recall) — Open source repo
- [Documentation](https://recallmcp.com/docs) — Full docs
