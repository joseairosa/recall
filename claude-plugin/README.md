# Recall RLM Plugin for Claude Code

A Claude Code plugin that enables RLM (Recursive Language Model) support using [Recall MCP](https://github.com/joseairosa/recall). Process files and content that exceed context window limits through intelligent decomposition and chunk-based analysis.

## Overview

Based on MIT CSAIL's research paper ([arxiv:2512.24601](https://arxiv.org/abs/2512.24601)), this plugin implements the key insight that **long prompts should not be fed directly to the neural network**. Instead, content is stored externally and processed through decomposition, filtering, and recursive analysis.

### Key Benefits

- **Handle 10M+ tokens**: Process files far beyond typical context limits
- **28-59% better accuracy**: On information-dense tasks vs. direct context
- **Intelligent decomposition**: Auto-detect optimal processing strategy
- **Full verification**: Cross-check answers against source content

## Installation

### Option A: Recall Cloud (Easiest - No Redis Required)

1. **Sign up** at [recallmcp.com](https://recallmcp.com)

2. **Get your API key** from the dashboard

3. **Configure Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "recall": {
      "url": "https://recallmcp.com/mcp",
      "headers": {
        "Authorization": "Bearer sk-recall-your-api-key-here"
      }
    }
  }
}
```

4. **Copy the plugin**:
```bash
cp -r claude-plugin ~/.claude/plugins/recall-rlm
```

5. **Restart Claude** to load the plugin.

---

### Option B: Self-Hosted (Local Redis/Valkey)

1. **Start Redis**:
```bash
# macOS
brew install redis && brew services start redis

# Docker
docker run -d -p 6379:6379 redis:latest
```

2. **Configure Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "recall": {
      "command": "npx",
      "args": ["@joseairosa/recall"],
      "env": {
        "REDIS_URL": "redis://localhost:6379",
        "VOYAGE_API_KEY": "your-voyage-key"
      }
    }
  }
}
```

3. **Copy the plugin**:
```bash
cp -r claude-plugin ~/.claude/plugins/recall-rlm
```

4. **Restart Claude** to load the plugin.

---

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `RECALL_API_KEY` | Cloud only | API key from recallmcp.com |
| `REDIS_URL` | Self-hosted | Redis connection (default: `redis://localhost:6379`) |
| `VOYAGE_API_KEY` | Optional | For semantic embeddings (recommended) |

## Usage

### Quick Start

```bash
# 1. Load a large file
/load-context /var/log/app.log "Find all errors and their causes"

# 2. Decompose into subtasks (auto-process)
/decompose 01HXYZ12345 --auto

# 3. Check results
/rlm-status 01HXYZ12345
```

### Commands

| Command | Description |
|---------|-------------|
| `/load-context <file> [task]` | Load large content into RLM system |
| `/decompose <chain_id> [strategy]` | Break task into subtasks |
| `/rlm-status <chain_id>` | Check execution progress |

### Decomposition Strategies

| Strategy | Best For | Example |
|----------|----------|---------|
| `filter` | Pattern matching | Log analysis, error finding |
| `chunk` | Sequential reading | Documents, long texts |
| `recursive` | Complex analysis | Code dependencies |
| `aggregate` | Synthesis | Combining multiple sources |

### Agents

The plugin includes three specialized agents:

1. **context-loader**: Loads large files into the RLM system
2. **task-decomposer**: Breaks tasks into subtasks and processes them
3. **result-aggregator**: Merges results and verifies answers

### Hooks

Automatic behaviors enabled by the plugin:

- **Context Injection**: Relevant memories injected before each prompt
- **Large File Detection**: Suggests RLM for large file operations
- **Decision Storage**: Prompts to store important decisions
- **Session Summary**: Reminds to summarize at end of complex work

## Workflow Example

### Analyzing Server Logs

```
User: I need to analyze our server logs from the past week. The file is 500KB.

1. /load-context /var/log/server-2024-01.log "Find errors and root causes"

   Output:
   - Chain ID: 01HXYZ12345
   - Tokens: ~125,000
   - Strategy: filter (recommended)

2. /decompose 01HXYZ12345 --auto

   Processing:
   - Subtask 1: Find ERROR messages (47 found)
   - Subtask 2: Find WARNING messages (23 found)
   - Subtask 3: Find exceptions (12 unique)
   - Subtask 4: Find failures (8 found)
   - Subtask 5: Summarize patterns

3. /rlm-status 01HXYZ12345 --detailed

   Results:
   - 90% confidence
   - 75% coverage
   - Primary issue: Database connection timeouts
   - Secondary: Memory pressure, rate limits
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Claude Code                              │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────────┐                 │
│  │ Agents  │  │Commands │  │   Hooks     │                 │
│  └────┬────┘  └────┬────┘  └──────┬──────┘                 │
└───────┼────────────┼──────────────┼─────────────────────────┘
        │            │              │
        └────────────┼──────────────┘
                     │
        ┌────────────▼────────────┐
        │      Recall MCP         │
        │  ┌──────────────────┐   │
        │  │   RLM Service    │   │
        │  │ - Execution Ctx  │   │
        │  │ - Decomposition  │   │
        │  │ - Aggregation    │   │
        │  └──────────────────┘   │
        │  ┌──────────────────┐   │
        │  │   Memory Store   │   │
        │  │ - Redis/Valkey   │   │
        │  │ - Embeddings     │   │
        │  └──────────────────┘   │
        └─────────────────────────┘
```

## RLM Tools Reference

| Tool | Description |
|------|-------------|
| `create_execution_context` | Initialize RLM chain with large content |
| `decompose_task` | Break into subtasks |
| `inject_context_snippet` | Extract relevant content for subtask |
| `update_subtask_result` | Record subtask analysis |
| `merge_results` | Aggregate all subtask results |
| `verify_answer` | Cross-check answer against source |
| `get_execution_status` | Check chain progress |

## Configuration

### Plugin Manifest

The plugin is configured via `.claude-plugin/plugin.json`:

```json
{
  "name": "recall-rlm",
  "mcpServers": {
    "recall": {
      "command": "npx",
      "args": ["@joseairosa/recall"],
      "env": {
        "REDIS_URL": "${REDIS_URL}",
        "VOYAGE_API_KEY": "${VOYAGE_API_KEY}",
        "RLM_ENABLED": "true"
      }
    }
  }
}
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `REDIS_URL` | Yes | Redis/Valkey connection URL |
| `VOYAGE_API_KEY` | No | For semantic embeddings (recommended) |
| `RLM_ENABLED` | No | Enable RLM features (default: true) |

## Limitations

- Maximum recursion depth: 5 levels
- Maximum context size per chunk: 8,000 tokens
- Requires Redis/Valkey for storage
- Embedding API calls for semantic search

## Contributing

Contributions welcome! See the main [Recall repository](https://github.com/joseairosa/recall).

## License

MIT - See LICENSE file.

## References

- [RLM Paper (MIT CSAIL)](https://arxiv.org/abs/2512.24601)
- [Recall MCP](https://github.com/joseairosa/recall)
- [Claude Code](https://github.com/anthropics/claude-code)
