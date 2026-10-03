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

- draws Recall's line in the band above the prompt, next to other plugins' lines:
  `🧠 Recall 1.18.0 · 2 stored · workspace confirmed · stored a memory (5s ago)`
- records a failing shell command (as `observe.sh` does) without starting a script for each one;
- confirms the workspace and runs a Recall call once more when it fails because the session lost its workspace.

A mod's MCP call asks for permission like any other. The mod makes one only for the retry, so it asks for `set_workspace` the first time a session loses its workspace, unless that is allowed. To allow it, add `"mcp__recall-remote__set_workspace"` to `permissions.allow` in your settings. Until Claude calls `set_workspace` at session start, the band says "workspace not confirmed".

While it runs it refreshes `~/.claude/recall/mod-heartbeat-<session id>` every 15 seconds. `observe.sh` and the Recall segment of `statusline.sh` stand down only while that file is fresh, and take over again if the mod stops. VS Code's chat panel, `claude -p`, older Claude Code, `--bare` and `--safe-mode` do not run mods, so the scripts work there as before.

Getting it on an existing install (nothing else to install):

```bash
claude plugin marketplace update recall-claude-plugin
claude plugin update recall@recall-claude-plugin
```

Then restart Claude Code, or run `/reload-plugins`. To check: `claude --version` is 2.1.287 or later, and `/plugin` lists recall among the active mods.

Tests: `cd plugin/recall && claude plugin test` (Claude Code's own test kit, no session or network).

### Lifecycle Hooks (`hooks/hooks.json`)

- **SessionStart** — injects relevant memory context at session start
- **PostToolUse** — records a failing Bash command with an output excerpt (stands down while the mod runs)
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
