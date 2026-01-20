---
name: rlm-status
description: Check the status and progress of an RLM execution chain
usage: /rlm-status <chain_id> [--detailed]
allowed_tools:
  - mcp__recall__get_execution_status
  - mcp__recall__merge_results
  - mcp__recall__verify_answer
---

# /rlm-status Command

Check the status, progress, and results of an RLM execution chain.

## Usage

```
/rlm-status <chain_id> [--detailed]
```

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| chain_id | Yes | The execution chain ID |
| --detailed | No | Show full subtask details and results |

## Examples

```
# Quick status check
/rlm-status 01HXYZ12345

# Detailed view with all subtask info
/rlm-status 01HXYZ12345 --detailed
```

## Output (Standard)

```
RLM Execution Status
--------------------
Chain ID: 01HXYZ12345
Status: active
Task: Find all errors and their causes
Strategy: filter

Progress
--------
Total: 5 subtasks
Completed: 3 (60%)
In Progress: 1
Pending: 1
Failed: 0

[=====>    ] 60%

Estimated remaining: ~8,000 tokens

Next Steps
----------
- Continue processing remaining subtasks
- Or call merge_results when complete
```

## Output (Detailed)

```
RLM Execution Status (Detailed)
-------------------------------
Chain ID: 01HXYZ12345
Status: active
Task: Find all errors and their causes
Strategy: filter
Created: 2024-01-18 10:30:00
Estimated Tokens: 50,000

Subtasks
--------
1. [completed] Find ERROR level messages
   - Tokens: 1,234
   - Result: Found 47 error messages across 3 categories...

2. [completed] Find WARNING level messages
   - Tokens: 890
   - Result: Found 23 warnings, mostly related to...

3. [completed] Find exception stack traces
   - Tokens: 2,100
   - Result: Identified 12 unique exceptions...

4. [in_progress] Find failure indicators
   - Tokens: 750
   - Result: (processing...)

5. [pending] Summarize error patterns
   - Tokens: -
   - Result: (not started)

Summary
-------
Tokens Used: 4,974 / 50,000 (10% coverage)
Estimated Remaining: ~8,000 tokens
```

## Output (Completed Chain)

```
RLM Execution Complete
----------------------
Chain ID: 01HXYZ12345
Status: completed
Task: Find all errors and their causes

Results
-------
Confidence: 90%
Coverage: 75% of context examined
Subtasks: 5/5 completed

Merged Result Summary:
- 47 ERROR messages found
- 23 WARNING messages
- 12 unique exceptions
- Primary root cause: Database connection timeout
- Secondary issues: Memory pressure, API rate limits

Actions
-------
- View full results: call get_merged_results
- Verify findings: call verify_answer
- Store insights: call store_memory
```

## Notes

- Use --detailed when you need to review individual subtask results
- Completed chains show merged results automatically
- Failed subtasks are highlighted with error messages
- Coverage percentage indicates how much of the original content was examined
