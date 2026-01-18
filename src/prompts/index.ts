import { MemoryStore } from '../persistence/memory-store.js';
import { formatWorkspaceContext } from './formatters.js';

const memoryStore = await MemoryStore.create();

const SESSION_MANAGEMENT_TEXT = `# Long Session Memory Management

## The Problem: Context Accumulation

During long work sessions:
- Context grows with every message
- Token costs increase linearly
- Important decisions get buried
- You repeat explanations and context

## The Solution: External Memory

Use Recall to store important information externally. Claude retrieves only what's relevant for the current task.

## Proactive Memory Workflow

### During Work: Store Important Bits

After significant decisions or learnings:
\`\`\`
store_memory(
  content="Decided to use PostgreSQL for user data because...",
  context_type="decision",
  importance=8,
  tags=["architecture", "database"]
)
\`\`\`

**What to Store (High Signal):**
- Decisions with reasoning
- User preferences discovered
- Code patterns established
- Constraints/requirements learned
- Bugs fixed and root causes

**What NOT to Store (Low Signal):**
- Code implementations (they're in files)
- General knowledge
- Temporary debugging info

### Periodically: Analyze Conversation

When the conversation has valuable context to preserve:
\`\`\`
analyze_and_remember(conversation_text="<recent important discussion>")
→ Automatically extracts and stores decisions, patterns, insights
\`\`\`

### Before New Tasks: Recall Context

Start tasks by getting relevant memories:
\`\`\`
recall_relevant_context(
  current_task="Implement user authentication",
  query="authentication security patterns"
)
→ Returns relevant decisions, patterns, preferences
\`\`\`

### End of Session: Checkpoint

Before ending a long session:
\`\`\`
summarize_session(session_name="Feature X implementation")
→ Creates snapshot of session context
\`\`\`

## Context Types

| Type | Use For | Example |
|------|---------|---------|
| \`directive\` | User instructions | "Always use TypeScript" |
| \`decision\` | Choices made | "Chose Redis over Memcached because..." |
| \`code_pattern\` | Established patterns | "Error handling uses Result type" |
| \`preference\` | User preferences | "Prefers concise responses" |
| \`requirement\` | Project constraints | "Must support IE11" |
| \`insight\` | Learnings | "API rate limit is 100/min" |

## Importance Scale

- **8-10**: Critical (always recalled) - Architecture decisions, user directives
- **5-7**: Important (recalled when relevant) - Patterns, preferences
- **1-4**: Low (rarely recalled) - Minor notes, temporary context

## Example Session Flow

\`\`\`
Session Start:
→ recall_relevant_context(current_task="Continue feature X")
→ Get previous decisions, patterns, constraints

During Work:
→ Make decision about auth approach
→ store_memory(content="Using JWT because...", context_type="decision", importance=8)

After Complex Discussion:
→ analyze_and_remember(conversation_text="<auth discussion>")

Session End:
→ summarize_session(session_name="Auth implementation day 1")
\`\`\`

## Token Savings

| Without Recall | With Recall |
|----------------|-------------|
| Repeat context every message | Retrieve only what's needed |
| 100K+ tokens over long session | ~5K tokens per task retrieval |
| Context window overflow | Unlimited session length |

## Key Principle

**Store high-signal, retrieve on-demand.** Don't store everything - store decisions, patterns, and constraints that would otherwise need repeating.
`;

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

const AUTOMATIC_WORKFLOW_TEXT = `# Automatic Recall Workflow

## CRITICAL: Call These Automatically

Recall now has **automatic hooks** that you should call without being asked:

### At Session Start: auto_session_start

**ALWAYS call this at the beginning of every session:**
\`\`\`
auto_session_start({ task_hint: "what user wants to work on" })
\`\`\`

This automatically retrieves:
- Active directives (what you MUST follow)
- Recent decisions (last 24h)
- Code patterns
- Critical items (importance 9+)

**When to call:** First thing after user's initial message, BEFORE starting work.

### After Making Decisions: quick_store_decision

**Call this after ANY significant choice:**
\`\`\`
quick_store_decision({
  decision: "What was decided",
  reasoning: "Why this choice was made",
  alternatives_considered: ["Option A", "Option B"]
})
\`\`\`

**When to call:**
- After architectural decisions
- After choosing between approaches
- After establishing patterns
- After resolving ambiguities

### Before Processing Large Content: should_use_rlm

**Call this BEFORE attempting to analyze large files:**
\`\`\`
should_use_rlm({
  content: "<large content>",
  task: "What you want to do with it"
})
\`\`\`

Returns whether you should:
- Process directly (small content)
- Consider RLM (medium content)
- Must use RLM (large content)

## The Automatic Flow

\`\`\`
1. USER SENDS FIRST MESSAGE
   → auto_session_start({ task_hint: "..." })
   → Get context, then proceed with task

2. MAKE A DECISION DURING WORK
   → Do the work
   → quick_store_decision({ decision: "...", reasoning: "..." })

3. ENCOUNTER LARGE CONTENT (file, log, etc.)
   → should_use_rlm({ content: "...", task: "..." })
   → If recommendation is "use_rlm", use RLM workflow

4. END OF SIGNIFICANT DISCUSSION
   → analyze_and_remember({ conversation_text: "..." })

5. END OF SESSION
   → summarize_session({ session_name: "..." })
\`\`\`

## What Makes This Automatic?

| Old Way (Manual) | New Way (Automatic) |
|------------------|---------------------|
| User says "recall context" | Claude calls auto_session_start automatically |
| User says "remember this decision" | Claude calls quick_store_decision after deciding |
| User manually invokes RLM | Claude checks should_use_rlm before processing |
| Context forgotten between sessions | Context automatically loaded at start |

## Key Principle

**Be proactive, not reactive.** Don't wait for the user to ask you to recall or store. Do it automatically:
- Start of session → auto_session_start
- Made a decision → quick_store_decision
- Large content → should_use_rlm
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

  session_management: {
    name: 'session_management',
    description: 'Learn how to manage long work sessions efficiently using external memory to reduce token usage',
    arguments: [],
    handler: async () => {
      return {
        description: 'Session memory management for long work sessions',
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: SESSION_MANAGEMENT_TEXT,
            },
          },
        ],
      };
    },
  },

  automatic_workflow: {
    name: 'automatic_workflow',
    description: 'CRITICAL: Learn the automatic Recall workflow - call auto_session_start at start, quick_store_decision after decisions, should_use_rlm before large content',
    arguments: [],
    handler: async () => {
      return {
        description: 'Automatic Recall workflow for proactive memory management',
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: AUTOMATIC_WORKFLOW_TEXT,
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
