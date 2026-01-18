# RLM (Recursive Language Models) - Context Window Research

**Date**: 2026-01-18
**Source**: MIT CSAIL Paper - arxiv:2512.24601
**Purpose**: Solve context window limitations for LLMs using Recall MCP

---

## Paper Summary

### The Problem: Context Rot

- Even frontier models (GPT-5) suffer from "context rot" - performance degrades as context grows
- Models forget information, hallucinate, or get confused with long contexts
- Context windows are fundamentally limited (current max ~200K tokens)
- Longer context ≠ better performance (diminishing returns, higher costs)

### The RLM Solution

**Core Insight**: Long prompts should NOT be fed to the neural network directly. Instead:

1. Load prompt as a variable in an external environment (Python REPL)
2. LLM writes code to examine/filter/decompose the variable
3. LLM recursively calls itself on smaller chunks
4. Results are aggregated via code, not context

### Key Mechanisms

| Mechanism | Description | Token Savings |
|-----------|-------------|---------------|
| **Filtering** | Use regex/code to extract relevant portions | 90%+ reduction |
| **Chunking** | Split into fixed-size pieces, process each | Linear scaling |
| **Recursive Decomposition** | Break task into subtasks, recursively process | Log(n) depth |
| **Variable Storage** | Store intermediate results in variables | Zero context cost |
| **Answer Verification** | Cross-check answers against source | Improved accuracy |

### Performance Claims

- Handles inputs **2 orders of magnitude** beyond context windows (10M+ tokens)
- Outperforms base models by **28-59%** on information-dense tasks
- Works with "dumb" models (GPT-3.5) via smart decomposition
- Enables tasks impossible with context-only approaches

---

## Mapping to Recall MCP

### What Recall Already Has (~80%)

| RLM Requirement | Recall Equivalent | Status |
|-----------------|-------------------|--------|
| External storage | Redis-backed memory | ✅ Complete |
| Decomposition | `analyze_and_remember` | ✅ Basic |
| Semantic search | `search_memories` | ✅ Complete |
| Filtering | Category + tag filters | ✅ Complete |
| Graph navigation | `get_related_memories` | ✅ Complete |
| Result aggregation | `consolidate_memories` | ✅ Basic |
| History/rollback | `get_memory_history` | ✅ Complete |

### What's Missing (~20%)

| Gap | Required For | Priority |
|-----|--------------|----------|
| Execution chain tracking | RLM workflow orchestration | High |
| Context injection helpers | Formatted snippet extraction | High |
| Sub-task result merging | Answer aggregation | Medium |
| Recursive execution monitoring | Depth control, loop detection | Medium |
| Token estimation | Strategy selection | Low |

---

## Technical Architecture Insights

### Redis Key Design for Execution Chains

```
execution:{chainId}                    -> Hash (chain metadata)
execution:{chainId}:subtasks           -> Sorted Set (ordered subtasks)
execution:{chainId}:subtask:{id}       -> Hash (subtask details)
execution:{chainId}:results            -> Hash (aggregated results)
execution:{chainId}:context            -> String (large context ref)
```

### Type Definitions

```typescript
interface ExecutionContext {
  chainId: string;           // ULID for traceability
  parentChainId?: string;    // For recursive calls
  depth: number;             // Max 5 to prevent infinite recursion
  status: 'active' | 'completed' | 'failed';
  originalTask: string;
  contextRef: string;        // Pointer to large context
  createdAt: number;
}

interface Subtask {
  id: string;
  chainId: string;
  order: number;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  result?: string;
  memoryIds?: string[];      // Link to related memories
}
```

---

## Claude Code Integration Strategy

### Plugin Architecture

Based on Claude Code's plugin-first design, the optimal approach is:

```
plugins/recall-rlm/
├── agents/
│   ├── context-loader.md      # Load large contexts
│   ├── task-decomposer.md     # Break down tasks
│   └── result-aggregator.md   # Merge results
├── commands/
│   ├── /load-context          # Load large file as env variable
│   ├── /decompose             # Decompose current task
│   └── /rlm-status            # Show execution chain status
└── hooks/
    └── pre-prompt.ts          # Auto-inject relevant context
```

### Key Integration Points

1. **Pre-prompt Hook**: Automatically call `recall_relevant_context` before each prompt
2. **Context Loader**: Store large files in Redis, return reference ID
3. **Decompose Command**: Use Claude to break task into subtasks
4. **Auto-recall**: Proactively search memories based on current context

---

## Example RLM Workflow

```
User: "Analyze this 500KB log file and find all errors"

Step 1: create_execution_context(task, logfile_ref)
        → Returns: chainId, strategy="filter", ~125K tokens

Step 2: decompose_task(chainId, "filter")
        → Returns: 5 subtasks (ERROR, WARN, FATAL, etc.)

Step 3: For each subtask:
        inject_context_snippet(chainId, subtaskId, "ERROR")
        → Returns: 3000 token snippet

Step 4: Process each snippet, store intermediate results

Step 5: merge_results(chainId)
        → Returns: aggregated error analysis

Step 6: verify_answer(chainId, answer, queries)
        → Returns: verified=true
```

---

## Key Decisions Made

1. **Additive approach**: RLM features don't break existing Recall functionality
2. **Feature flag**: `RLM_ENABLED=true` to opt-in
3. **Max recursion depth**: 5 levels to prevent infinite loops
4. **Chunk size**: ~4000 tokens per snippet (fits in any context window)
5. **Strategy auto-selection**: Based on token estimation

---

## Open Questions

1. **Chunk overlap**: Should adjacent chunks overlap for context continuity?
2. **Caching**: Should decomposition results be cached for similar tasks?
3. **Parallel execution**: Can subtasks run in parallel?
4. **Failure handling**: What happens when a subtask fails mid-chain?

---

## References

- Paper: https://arxiv.org/abs/2512.24601
- Claude Code: https://github.com/anthropics/claude-code
- Recall MCP: https://github.com/joseairosa/recall

---

## Next Steps

1. Implement execution chain types in `src/types.ts`
2. Create `src/tools/rlm-tools.ts` with 5 new tools
3. Fork Claude Code, create `recall-rlm` plugin
4. Build pre-prompt hook for automatic context injection
5. End-to-end testing with large contexts (100KB+)
