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

## What's Included

### MCP Server (`.mcp.json`)

Connects to the Recall MCP server at recallmcp.com (or self-hosted). Provides 16+ tools:
- `set_workspace`, `get_workspace` — workspace management
- `store_memory`, `search_memories`, `recall_relevant_context` — memory CRUD
- `auto_session_start`, `summarize_session` — session lifecycle
- `workflow`, `rlm_process` — advanced workflows
- And more

### Lifecycle Hooks (`hooks/hooks.json`)

- **SessionStart** — injects relevant memory context at session start
- **PostToolUse** — observes file edits and tool usage for automatic memory capture
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

Shows memory count and version info. Add to `~/.claude/settings.json` manually:

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
