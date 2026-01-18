---
name: decompose
description: Decompose an RLM execution chain into subtasks and begin processing
usage: /decompose <chain_id> [strategy] [--auto]
allowed_tools:
  - mcp__recall__decompose_task
  - mcp__recall__inject_context_snippet
  - mcp__recall__update_subtask_result
  - mcp__recall__get_execution_status
---

# /decompose Command

Break down an RLM execution chain into subtasks and optionally process them automatically.

## Usage

```
/decompose <chain_id> [strategy] [--auto]
```

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| chain_id | Yes | The execution chain ID from /load-context |
| strategy | No | Override decomposition strategy |
| --auto | No | Automatically process all subtasks |

## Strategies

| Strategy | Description | Best For |
|----------|-------------|----------|
| filter | Extract by regex patterns | Log analysis, error finding |
| chunk | Sequential fixed-size pieces | Document reading |
| recursive | Nested decomposition | Complex analysis |
| aggregate | Combine multiple sources | Synthesis tasks |

## Examples

```
# Use recommended strategy
/decompose 01HXYZ12345

# Override with filter strategy
/decompose 01HXYZ12345 filter

# Auto-process all subtasks
/decompose 01HXYZ12345 --auto

# Filter strategy with auto-process
/decompose 01HXYZ12345 filter --auto
```

## Behavior

### Manual Mode (default)

1. Decompose task into subtasks
2. Display subtask list with descriptions
3. Wait for user to process each subtask manually

### Auto Mode (--auto)

1. Decompose task into subtasks
2. For each subtask:
   - Extract relevant context snippet
   - Analyze the snippet
   - Record the result
3. Report progress after each subtask
4. Suggest merging when complete

## Output

```
Task Decomposed
---------------
Chain ID: 01HXYZ12345
Strategy: filter
Subtasks: 5

1. [pending] Find ERROR level messages (query: ERROR|FATAL)
2. [pending] Find WARNING level messages (query: WARN|WARNING)
3. [pending] Find exception stack traces (query: Exception|Traceback)
4. [pending] Find failure indicators (query: failed|failure|crash)
5. [pending] Summarize error patterns (query: ERROR)

Next steps:
- Process each subtask with inject_context_snippet
- Or run /decompose 01HXYZ12345 --auto to auto-process
```

## Auto Mode Progress

```
Processing subtask 1/5: Find ERROR level messages
- Extracted 1,234 tokens (92% relevance)
- Found 47 error messages
- Result recorded

Processing subtask 2/5: Find WARNING level messages
...

All subtasks complete!
Run /rlm-status 01HXYZ12345 to see summary
Or call merge_results to aggregate findings
```

## Notes

- Auto mode is faster but gives less control
- Manual mode allows you to adjust analysis per subtask
- You can mix: decompose manually, then process some subtasks manually and some with --auto
- Use /rlm-status to check progress at any time
