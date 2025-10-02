# Smart Context Management Guide

Version 1.1.0 adds **intelligent context management** that transforms the MCP memory server from passive storage into an active context manager.

## 🎯 The Problem

LLMs like Claude have limited context windows. When the context fills up:
- Important information gets compacted/lost
- You repeat yourself constantly
- Patterns and decisions disappear
- Context doesn't survive across sessions

## ✨ The Solution

Three new tools + one auto-injected prompt that intelligently preserve and retrieve context.

---

## New Features

### 1. **`recall_relevant_context`** - Proactive Context Retrieval

Claude can proactively call this when it needs to recall relevant memories.

**When Claude uses it:**
- User asks: "How should I handle authentication?"
- Claude thinks: *Let me check if we have auth patterns*
- Claude calls: `recall_relevant_context({ current_task: "authentication", query: "jwt tokens" })`
- Returns: Relevant memories about JWT, bcrypt, session management

**Parameters:**
```typescript
{
  current_task: string,      // What I'm working on
  query?: string,            // Optional specific search
  limit?: number,            // How many results (default: 5)
  min_importance?: number    // Filter threshold (default: 6)
}
```

**Example:**
```
User: "Create a products table"

Claude internally:
→ Calls recall_relevant_context({
    current_task: "creating database table",
    query: "database schema primary key"
  })
→ Returns: "Always use ULIDs for primary keys"

Claude: "I'll create the products table with ULID primary key..."
```

---

### 2. **`analyze_and_remember`** - Intelligent Memory Extraction

Analyzes conversation text and automatically extracts structured memories.

**When to use:**
- After important discussions
- After making key decisions
- After establishing patterns
- Before context compaction

**What it does:**
- Uses Claude API to analyze conversation
- Extracts: directives, decisions, patterns, requirements, insights
- Auto-categorizes each extracted memory
- Auto-assigns importance scores (1-10)
- Auto-generates tags
- Stores everything automatically

**Parameters:**
```typescript
{
  conversation_text: string,     // Conversation to analyze
  auto_categorize?: boolean,     // Auto-assign types (default: true)
  auto_store?: boolean          // Auto-store memories (default: true)
}
```

**Example:**
```
User: "Let's discuss our authentication approach"
[Long discussion about JWT, bcrypt, sessions...]

User: "Remember the important parts of our conversation"

Claude → Calls: analyze_and_remember({
  conversation_text: "[conversation history]",
  auto_store: true
})

Extracts and stores:
- 3 directives (importance 9-10)
- 5 decisions (importance 7-9)
- 4 code patterns (importance 8)

Returns: "Remembered 12 key items from our conversation"
```

---

### 3. **`summarize_session`** - Session Snapshots

Create a summary and snapshot of your work session.

**When to use:**
- End of workday
- After completing a feature
- Before context compaction
- When switching projects

**What it does:**
- Gets recent memories from lookback period
- Uses Claude to generate summary
- Creates session snapshot
- Returns session ID for future reference

**Parameters:**
```typescript
{
  session_name?: string,              // Optional name
  auto_create_snapshot?: boolean,     // Create snapshot (default: true)
  lookback_minutes?: number          // How far back (default: 60)
}
```

**Example:**
```
User: "Summarize what we accomplished today"

Claude → Calls: summarize_session({
  session_name: "Auth System - Day 1",
  lookback_minutes: 480  // 8 hours
})

Returns:
{
  summary: "Built JWT authentication with HTTP-only cookies, implemented bcrypt password hashing with 12 rounds, created user registration endpoint with email validation",
  session_id: "01J...",
  memory_count: 23
}
```

---

### 4. **`workspace_context` Prompt** - Auto-Injected Context

Automatically injects critical workspace context at conversation start.

**What Claude sees:**
```markdown
# Workspace Context: /Users/jose/project-x

*Critical information to remember for this project*

## 🎯 Critical Directives
- **[Importance: 10/10]** Always use ULIDs for database primary keys
  *Tags: database, conventions, ulid*
- **[Importance: 10/10]** Never run migrations yourself, ask user first
  *Tags: migrations, workflow*

## 💡 Key Decisions
- **[2d ago]** Using Redis for cache layer (sub-ms latency requirement)
- **[1d ago]** JWT auth with HTTP-only cookies for security

## 🔧 Code Patterns & Conventions
- Drizzle: text('id').primaryKey() for ULID fields
  *Applies to: drizzle, database*
- Error handling: Use McpError with proper codes
  *Applies to: errors, mcp*
```

**Benefits:**
- Claude remembers your conventions automatically
- No need to repeat yourself every conversation
- Critical directives always visible
- Recent decisions automatically surfaced

---

## Usage Patterns

### Pattern 1: Proactive Pattern Recall

```
User: "Write a function to fetch user data"

Claude automatically:
1. Recalls: "Always use async/await, never .then()"
2. Recalls: "Error handling pattern: try-catch with McpError"
3. Uses patterns in implementation

Claude: "I'll write this using async/await:
async function fetchUser(id: string) {
  try {
    const response = await fetch(`/api/users/${id}`);
    ...
  } catch (error) {
    throw new McpError(ErrorCode.InternalError, error.message);
  }
}"
```

### Pattern 2: Session End Workflow

```
End of Day:

User: "Summarize today's work"

Claude → summarize_session()

Returns: "Session 'Feature X - Day 1' created
Built authentication system with JWT tokens, implemented user registration with email validation, set up password hashing with bcrypt (12 rounds). Session ID: 01J..."

Next Day:

User: "Continue working on Feature X"

Claude automatically sees workspace_context:
"Based on yesterday's work (Session 01J...), I see we're building authentication with JWT..."
```

### Pattern 3: Context Preservation Before Compaction

```
[Context window filling up]

User: "Before we lose context, remember what's important"

Claude → analyze_and_remember({
  conversation_text: "[last 100 messages]",
  auto_store: true
})

Extracts and stores:
- 15 directives
- 8 decisions
- 12 patterns
- 5 insights

Claude: "Remembered 40 key items. These will survive context compaction."
```

### Pattern 4: Cross-Session Context

```
Week 1:
User: "Remember: Use TypeScript strict mode always"
→ Stored as directive, importance 10

Week 2 (New conversation):
workspace_context auto-injects:
"## Critical Directives
- Use TypeScript strict mode always"

Claude: "I see we use TypeScript strict mode. I'll configure that..."
```

---

## Cost Estimate

**Per analyze_and_remember call:**
- Uses Claude Haiku (~5k input, ~500 output tokens)
- Cost: ~$0.01-0.02

**Per recall_relevant_context call:**
- Uses existing embeddings + Claude for keywords
- Cost: ~$0.001-0.005

**Per summarize_session call:**
- Uses Claude Haiku for summary
- Cost: ~$0.005-0.01

**Daily active development:**
- 5 analyze calls: $0.05-0.10
- 20 recall calls: $0.02-0.10
- 2 summarize calls: $0.01-0.02
- **Total: ~$0.10-0.25/day**

Worth it to save hours of re-explanation!

---

## Best Practices

### DO:
✅ Call `analyze_and_remember` after important discussions
✅ Call `summarize_session` at end of work sessions
✅ Use high importance (8-10) for critical directives
✅ Tag memories well for better retrieval
✅ Trust Claude to call `recall_relevant_context` proactively

### DON'T:
❌ Over-analyze (don't analyze every message)
❌ Store trivial information
❌ Forget to create session snapshots
❌ Ignore the workspace_context prompt

---

## Troubleshooting

### "Claude isn't calling recall_relevant_context"

Claude will call it when it thinks it needs context. You can prompt it:
- "Check if we have patterns for this"
- "Do we have any conventions about X?"
- "Have we discussed this before?"

### "analyze_and_remember extracts too much/too little"

Adjust by being specific:
- "Analyze our conversation and remember only the critical decisions"
- "Remember the important patterns we established"

### "workspace_context not showing up"

The prompt is auto-injected by Claude Code at conversation start. If not visible, check:
- MCP server is running (claude mcp list)
- Prompts capability is enabled
- Restart Claude Code

---

## Examples

### Full Workflow Example

**Day 1 - Building Auth System:**

```
User: "Let's build JWT authentication"
[Discussion about approach...]

User: "Remember these decisions"
→ analyze_and_remember() extracts:
  - Use JWT in HTTP-only cookies (decision, importance 9)
  - Bcrypt with 12 rounds (code_pattern, importance 8)
  - 24h token expiration (requirement, importance 7)

User: "Summarize today"
→ summarize_session() creates:
  Session: "Auth System - Day 1"
  Summary: "Designed JWT auth with HTTP-only cookies..."
```

**Day 2 - Continuing:**

```
[New conversation starts]

workspace_context auto-injects:
"## Key Decisions
- Use JWT in HTTP-only cookies
- Bcrypt with 12 rounds
..."

User: "Let's implement password hashing"

Claude → recall_relevant_context({
  current_task: "implementing password hashing",
  query: "password bcrypt"
})
→ Returns: "Bcrypt with 12 rounds"

Claude: "I'll use bcrypt with 12 rounds as we decided:
const hash = await bcrypt.hash(password, 12);"
```

---

## Integration with Hooks (Future)

You can set up hooks to automatically preserve context:

```json
// .claude/settings.local.json
{
  "hooks": {
    "PreCompact": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "echo 'Analyze our conversation and remember the important parts' | claude"
      }]
    }]
  }
}
```

This would automatically call `analyze_and_remember` before context compaction!

---

## What's Next?

Future enhancements:
- Automatic importance scoring
- Context freshness tracking
- Cross-workspace pattern learning
- Smart compaction analysis
- Web UI for memory management

---

**Ready to use smart context management?** Just start using the new tools!

Claude will automatically learn to call them when appropriate.
