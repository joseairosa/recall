import { MemoryStore } from '../persistence/memory-store.js';
import { formatWorkspaceContext } from './formatters.js';

const memoryStore = await MemoryStore.create();

const RLM_WORKFLOW_TEXT = `# RLM (Recursive Language Model) Workflow

## When to Use RLM

Use RLM when you encounter:
- Files larger than ~50KB (logs, data files, large codebases)
- Tasks requiring analysis of content that would exceed context limits
- Situations where you need to search/filter large content efficiently

## The Core Principle

**NEVER load large content directly into context.** Instead:
1. Store it externally via \`create_execution_context\`
2. Use code/queries to extract only relevant portions
3. Process in small chunks
4. Aggregate results without context bloat

## Step-by-Step Workflow

### Step 1: Create Execution Context
\`\`\`
create_execution_context(task="your task description", context="large content here")
→ Returns: chain_id, recommended_strategy, estimated_tokens
\`\`\`

### Step 2: Decompose Task
\`\`\`
decompose_task(chain_id="...", strategy="filter|chunk|recursive")
→ Returns: subtasks with queries for filtering content
\`\`\`

Strategies:
- **filter**: Use regex to extract relevant lines (best for logs, errors)
- **chunk**: Split into sequential pieces (best for documents)
- **recursive**: Nested decomposition (best for complex analysis)

### Step 3: Process Each Subtask
For each subtask:
\`\`\`
inject_context_snippet(chain_id="...", subtask_id="...", query="ERROR|WARN")
→ Returns: filtered snippet (small, fits in context)

# Analyze the snippet, then:
update_subtask_result(chain_id="...", subtask_id="...", result="your analysis")
\`\`\`

### Step 4: Merge Results
\`\`\`
merge_results(chain_id="...")
→ Returns: aggregated analysis from all subtasks
\`\`\`

### Step 5: Verify (Optional)
\`\`\`
verify_answer(chain_id="...", answer="...", verification_queries=["check1", "check2"])
→ Cross-checks answer against source content
\`\`\`

## Example: Analyzing a Large Log File

User: "Find all errors in this 500KB log file"

1. \`create_execution_context(task="Find errors", context=<log_content>)\`
2. \`decompose_task(chain_id, strategy="filter")\` → Creates subtasks for ERROR, WARN, etc.
3. For each subtask: \`inject_context_snippet\` + analyze + \`update_subtask_result\`
4. \`merge_results\` → Combined error analysis

**Result**: Processed 500KB using only ~4KB of context per step.

## Key Benefits

- **No context overflow**: Large content never enters the conversation
- **Faster processing**: Only relevant snippets are analyzed
- **Better accuracy**: Focused analysis on filtered content
- **Traceable**: Chain IDs track the entire workflow
`;

export const prompts = {
  workspace_context: {
    name: 'workspace_context',
    description: 'Critical workspace context: directives, decisions, and code patterns',
    arguments: [],
    handler: async () => {
      // Get important memories
      const directives = await memoryStore.getMemoriesByType('directive');
      const decisions = await memoryStore.getMemoriesByType('decision');
      const patterns = await memoryStore.getMemoriesByType('code_pattern');

      // Filter to high-importance only
      const importantDirectives = directives.filter(d => d.importance >= 8);
      const importantDecisions = decisions.filter(d => d.importance >= 7);
      const importantPatterns = patterns.filter(p => p.importance >= 7);

      // Get workspace path from memoryStore
      const stats = await memoryStore.getSummaryStats();
      const workspacePath = stats.workspace_path;

      // Format for Claude
      const contextText = formatWorkspaceContext(
        workspacePath,
        importantDirectives,
        importantDecisions,
        importantPatterns
      );

      return {
        description: 'Workspace-specific context and conventions',
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: contextText,
            },
          },
        ],
      };
    },
  },

  rlm_workflow: {
    name: 'rlm_workflow',
    description: 'Learn how to process large content using RLM (Recursive Language Model) without context overflow',
    arguments: [],
    handler: async () => {
      return {
        description: 'RLM workflow for processing large content',
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: RLM_WORKFLOW_TEXT,
            },
          },
        ],
      };
    },
  },
};

// Export list for MCP server
export async function listPrompts() {
  return Object.values(prompts).map(p => ({
    name: p.name,
    description: p.description,
    arguments: p.arguments,
  }));
}

// Export getter for MCP server
export async function getPrompt(name: string) {
  const prompt = prompts[name as keyof typeof prompts];
  if (!prompt) {
    throw new Error(`Unknown prompt: ${name}`);
  }

  return await prompt.handler();
}
