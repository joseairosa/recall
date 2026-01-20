---
name: load-context
description: Load a large file or content into the RLM system for chunk-based analysis
usage: /load-context <file_path_or_glob> [task_description]
allowed_tools:
  - Read
  - Glob
  - mcp__recall__create_execution_context
---

# /load-context Command

Load large files into Recall's RLM (Recursive Language Model) system for processing content that exceeds context window limits.

## Usage

```
/load-context <file_path> [task_description]
/load-context <glob_pattern> [task_description]
```

## Examples

```
/load-context /var/log/app.log "Find all errors and their causes"
/load-context src/**/*.ts "Analyze code patterns and potential issues"
/load-context ./large-document.pdf "Summarize key points"
```

## Behavior

When invoked, this command will:

1. **Read the specified content**:
   - Single file: Read the entire file
   - Glob pattern: Find matching files and concatenate content

2. **Analyze content size**:
   - If <25K tokens: Suggest direct analysis (RLM not needed)
   - If >25K tokens: Proceed with RLM

3. **Create execution context**:
   - Store content externally in Recall
   - Generate chain_id for tracking
   - Detect optimal decomposition strategy

4. **Return setup information**:
   - Chain ID for subsequent commands
   - Estimated token count
   - Recommended strategy
   - Suggested next steps

## Output

After loading, you'll receive:

```
RLM Context Created
-------------------
Chain ID: 01HXYZ...
Tokens: ~125,000
Strategy: filter (recommended)

Next steps:
1. Run /decompose 01HXYZ... to break down the analysis
2. Or manually call decompose_task with a custom strategy
```

## Notes

- Large files (>1MB) may take time to process
- The task description helps optimize the decomposition strategy
- Use glob patterns to analyze multiple related files together
- Chain IDs are needed for all subsequent RLM operations
