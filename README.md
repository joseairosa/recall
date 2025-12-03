# Recall 🧠 (Redis or Valkey Compatible)

**Give Claude perfect recall with persistent memory that survives context limits and session restarts.**

Your AI assistant can now remember important context, decisions, and patterns across all conversations—no more repeating yourself or losing critical information when the context window fills up.

---

## ⚠️ Security & Privacy Disclaimer

**IMPORTANT: READ BEFORE USE**

Recall stores conversation memories in either **Redis** or **Valkey**, which may contain sensitive information including:

- Code snippets, API keys, credentials, and secrets discussed in conversations
- Business logic, architecture decisions, and proprietary information
- Personal data, team member names, and organizational details
- Any other context shared with Claude during conversations

**You are responsible for:**

1. **Redis/Valkey Security**: Ensure your memory store is properly secured with authentication, TLS encryption, and network access controls  
2. **Data Ownership**: Only use Redis/Valkey servers that YOU control or have explicit permission to use  
3. **Access Control**: Understand who has access to your memory store and stored memories  
4. **Sensitive Data**: Never store memories on shared/public instances if they contain sensitive information  
5. **Compliance**: Ensure your use complies with your organization's data policies and relevant regulations (GDPR, CCPA, etc.)

**Disclaimer of Liability:**  
THIS SOFTWARE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND. THE AUTHOR (JOSÉ AIROSA) IS NOT LIABLE FOR:

- Data breaches, leaks, or unauthorized access to stored memories  
- Loss of data or corrupted memories  
- Compliance violations or regulatory issues  
- Any damages arising from the use or misuse of this software

By using Recall, you acknowledge that you understand these risks and accept full responsibility for:

- Securing your Redis or Valkey infrastructure  
- Managing access to stored memories  
- Protecting sensitive information  
- Compliance with applicable laws and regulations

**Best Practices:**

- Use dedicated Redis or Valkey instances with strong authentication  
- Enable TLS/SSL encryption (`rediss://`) for remote connections  
- Regularly audit stored memories for sensitive data  
- Implement access controls and firewall rules  
- Use separate databases for different security contexts  
- Consider data retention policies and periodic cleanup  
- Never share connection strings publicly

---

## What is This?

Recall is a **brain extension** for Claude that stores memories in Redis or Valkey. It solves the context window problem by:

- 📝 **Remembering** directives, decisions, code patterns, and important information  
- 🔍 **Retrieving** relevant context automatically when you need it  
- 🔄 **Persisting** across sessions – memories survive restarts and context compaction  
- 🗂️ **Organizing** by workspace – Project A memories don't pollute Project B

---

## Quick Start (5 Minutes)

### 1. Prerequisites

- **Redis** or **Valkey** running locally (`localhost:6379`)  
- **Node.js** 18 or higher  
- **Claude Code** or **Claude Desktop**

**Option A: Local Redis**

```bash
# macOS
brew install redis
brew services start redis

# Ubuntu/Debian
sudo apt-get install redis-server
sudo systemctl start redis

# Docker
docker run -d -p 6379:6379 redis:latest
```

**Option B: Local Valkey**

```bash
# macOS
brew install valkey
brew services start valkey

# Docker
docker run -d -p 6379:6379 valkey/valkey:latest
```

**Option C: Cloud Redis (No local install needed)**

Use a free Redis cloud service:

- **[Upstash](https://upstash.com/)** - Free tier with 500,000 commands/month
- **[Redis Cloud](https://redis.com/try-free/)** - Free 30MB database
- **[Railway](https://railway.app/)** - Free Redis with credit

Then use the provided connection URL in your config:

```json
{
  "env": {
    "REDIS_URL": "rediss://default:password@your-redis-host.com:6379"
  }
}
```

**Option D: Cloud Valkey (No local install needed)**

Most cloud providers offer Valkey services with free or low-cost trials available:

- **[AWS ElastiCache](https://aws.amazon.com/elasticache/)** - Use free tier to try it out
- **[AWS Free Tier](https://aws.amazon.com/free/)** - General AWS free tier options


### 2. Install

**Option A: Using Claude CLI (Recommended)**

```bash
npx @modelcontextprotocol/create-server @joseairosa/recall
```

Or use the MCP command directly in your Claude configuration (no installation needed):

```json
{
  "mcpServers": {
    "recall": {
      "command": "npx",
      "args": ["-y", "@joseairosa/recall"]
    }
  }
}
```

**Option B: Global installation**

```bash
npm install -g @joseairosa/recall
```

**Option C: From source**

```bash
git clone https://github.com/joseairosa/recall.git
cd recall
npm install
npm run build
```

### 3. Configure Claude

Add to your Claude configuration file:

**Claude Code** (`~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`):
```json
{
  "mcpServers": {
    "recall": {
      "command": "recall",
      "env": {
        "REDIS_URL": "redis://localhost:6379",
        "ANTHROPIC_API_KEY": "your-api-key-here"
      }
    }
  }
}
```
or for Valkey:
```json
{
  "mcpServers": {
    "recall": {
      "command": "recall",
      "env": {
        "BACKEND_TYPE":"valkey",
        "VALKEY_HOST":"localhost",
        "VALKEY_PORT":6379 ,
        "ANTHROPIC_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):
```json
{
  "mcpServers": {
    "recall": {
      "command": "npx",
      "args": ["-y", "@joseairosa/recall"],
      "env": {
        "REDIS_URL": "redis://localhost:6379",
        "ANTHROPIC_API_KEY": "your-api-key-here"
      }
    }
  }
}
```
or for Valkey:
```json
{
  "mcpServers": {
    "recall": {
      "command": "recall",
      "env": {
        "BACKEND_TYPE":"valkey",
        "VALKEY_HOST":"localhost",
        "VALKEY_PORT":6379 ,
        "ANTHROPIC_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### 4. Restart Claude

Restart Claude Code or Claude Desktop to load the MCP server.

### 5. Test It!

Ask Claude:
```
"Store a memory that I prefer using TypeScript for all new projects"
```

Then in a new conversation:
```
"What do you know about my coding preferences?"
```

✨ **It remembers!**

---

## Upgrading

### Automatic Updates (Recommended)

If you use **`npx -y @joseairosa/recall`** in your config, you **automatically get the latest version** on every Claude restart. No action needed! 🎉

```json
{
  "mcpServers": {
    "recall": {
      "command": "npx",
      "args": ["-y", "@joseairosa/recall"]  // ← Always fetches latest
    }
  }
}
```

### Manual Updates

**If using global installation:**

```bash
# Update to latest version
npm update -g @joseairosa/recall

# Or install specific version
npm install -g @joseairosa/recall@1.3.0

# Check installed version
npm list -g @joseairosa/recall
```

**If using from source:**

```bash
cd recall
git pull origin main
npm install
npm run build
```

**After updating:**
1. Restart Claude Code or Claude Desktop
2. Verify new version: Ask Claude "What Recall version are you using?"
3. Check CHANGELOG.md for new features and breaking changes

### Version-Specific Upgrades

**Upgrading to v1.3.0:**
- No breaking changes, fully backward compatible
- To use global memories: Add `WORKSPACE_MODE=hybrid` to your config
- See [Migration Guide](#migrating-from-v121-to-v130) below

---

## How to Use

### ⚠️ Best Practices: Avoid Context Bloat

**Be selective with memory storage to keep Claude efficient.**

**Store HIGH-SIGNAL context:**
- ✅ Project preferences (coding style, tech stack, architecture patterns)
- ✅ Critical decisions ("We chose PostgreSQL over MongoDB because...")
- ✅ Important constraints (API limits, business rules, security requirements)
- ✅ Learned patterns from bugs/solutions

**Don't store LOW-SIGNAL content:**
- ❌ Code snippets (put those in files instead)
- ❌ Obvious facts or general knowledge
- ❌ Temporary context (only needed in current session)
- ❌ Duplicates of what's in documentation

**Keep memories concise:**
- ✅ Good: "API rate limit is 1000 req/min, prefer caching for frequent data"
- ❌ Bad: "Here's the entire implementation of our caching layer: [50 lines of code]"

**Remember:** Recall is for high-level context, not a code repository. Quality over quantity keeps your context window efficient.

---

### Store Important Information

Claude can automatically extract and store memories, or you can be explicit:

**Natural language:**
```
"Remember that our API base URL is https://api.example.com/v2"
```

```
"Store this as a directive: Always use functional components in React"
```

**What Claude does:** Uses the `store_memory` tool to save this information with appropriate context type and importance.

**Store globally (v1.3+):**
```
"Remember globally: I prefer TypeScript strict mode for all projects"
```

```
"Store this as a global preference: Always use ULIDs for database IDs"
```

**What Claude does:** Uses `store_memory` with `is_global: true` to make it accessible across all workspaces (requires `WORKSPACE_MODE=hybrid` or `global`).

### Recall Context

Claude automatically retrieves relevant memories, but you can also ask:

```
"What do you remember about our database schema?"
```

```
"Recall any decisions we made about error handling"
```

**What Claude does:** Uses `recall_relevant_context` or `search_memories` to find related information.

### Analyze Conversations

Before context compaction, preserve important details:

```
"Analyze our conversation and remember the important parts"
```

**What Claude does:** Uses `analyze_and_remember` to extract structured memories from the conversation.

### Organize Sessions

Group related work:

```
"Summarize this session and save it as 'Authentication Refactoring'"
```

**What Claude does:** Uses `summarize_session` to create a session snapshot with all relevant memories.

### Get Time Window Context (v1.6+)

Retrieve all memories from a specific time period:

```
"Give me the context for the last 2 hours"
```

```
"Show me everything from the last 30 minutes, formatted as markdown"
```

```
"Get all high-importance memories from the last hour, grouped by type"
```

**What Claude does:** Uses `get_time_window_context` to retrieve and format memories from the specified time window.

**Options:**
- Time specification: hours, minutes, or explicit timestamps
- Output formats: markdown (default), JSON, or plain text
- Grouping: chronological, by type, by importance, or by tags
- Filtering: minimum importance, specific context types

**Example outputs:**
- **Markdown**: Clean formatted context ready to paste into documentation
- **JSON**: Structured data for external processing
- **Text**: Simple plain text summary

Perfect for building context files from work sessions or exporting specific time periods.

### Convert Memories (v1.3+)

**Promote workspace memory to global:**
```
"Convert this memory to global: mem_abc123"
```

**What Claude does:** Uses `convert_to_global` to move the memory from workspace-specific to globally accessible.

**Convert back to workspace:**
```
"Convert this global memory to workspace-specific: mem_xyz789"
```

**What Claude does:** Uses `convert_to_workspace` to move the memory from global to current workspace.

### Link Related Memories (v1.4+)

**Create relationships between memories:**
```
"Link these two memories: pattern mem_abc123 is an example of implementation mem_xyz789"
```

**What Claude does:** Uses `link_memories` to create an `example_of` relationship between the memories.

**Find related memories:**
```
"Show me all memories related to mem_abc123"
```

**What Claude does:** Uses `get_related_memories` to traverse the relationship graph and find connected memories.

**Remove a relationship:**
```
"Unlink relationship rel_123abc"
```

**What Claude does:** Uses `unlink_memories` to remove the relationship while keeping both memories intact.

### Version History & Rollback (v1.5+)

**View version history:**
```
"Show me the version history for memory mem_abc123"
```

**What Claude does:** Uses `get_memory_history` to retrieve all versions with timestamps and change reasons.

**Rollback to previous version:**
```
"Rollback memory mem_abc123 to version ver_xyz789"
```

**What Claude does:** Uses `rollback_memory` to restore the memory to the specified version while preserving relationships.

### Memory Templates (v1.5+)

**Create a template:**
```
"Create a template for bug reports with fields: {{title}}, {{severity}}, {{steps}}"
```

**What Claude does:** Uses `create_template` to save a reusable template with placeholders.

**Use a template:**
```
"Create a memory from bug template: title='Login fails', severity='high', steps='1. Click login 2. Error appears'"
```

**What Claude does:** Uses `create_from_template` to instantiate a memory with filled-in variables.

### Categories (v1.5+)

**Assign category:**
```
"Categorize memory mem_abc123 as 'authentication'"
```

**What Claude does:** Uses `set_memory_category` to organize the memory.

**List categories:**
```
"Show me all categories with memory counts"
```

**What Claude does:** Uses `list_categories` to display all categories and their sizes.

**Get memories by category:**
```
"Show me all memories in the 'authentication' category"
```

**What Claude does:** Uses `get_memories_by_category` to retrieve all memories in that category.

### Advanced Search (v1.5+)

**Fuzzy search:**
```
"Search for 'authentification' with fuzzy matching"
```

**What Claude does:** Uses `search_memories` with `fuzzy: true` to find similar words despite typos.

**Regex search:**
```
"Find memories matching the pattern 'API.*v[0-9]+'"
```

**What Claude does:** Uses `search_memories` with `regex` parameter for pattern-based search.

**Category filtering:**
```
"Search for 'login' only in the 'authentication' category"
```

**What Claude does:** Uses `search_memories` with both `query` and `category` parameters.

---

## Memory Types

Memories are categorized for better organization:

| Type | Purpose | Example |
|------|---------|---------|
| **`directive`** | Rules, guidelines, preferences | "Always use TypeScript strict mode" |
| **`decision`** | Important choices and rationale | "Chose PostgreSQL over MongoDB for ACID" |
| **`code_pattern`** | Reusable code patterns | "Use async/await, not .then()" |
| **`requirement`** | Feature requirements | "Must support 10k concurrent users" |
| **`information`** | General facts and context | "API endpoint is /api/v2/users" |
| **`heading`** | Project structure markers | "Authentication Module" |
| **`error`** | Known issues and solutions | "CORS fixed by adding headers" |
| **`todo`** | Tasks and reminders | "Add rate limiting to API" |
| **`insight`** | Learnings and observations | "Bottleneck is in database indexes" |
| **`preference`** | Personal or team preferences | "Prefer concise communication" |

---

## Available Tools (27)

Claude has access to these memory tools:

### Core Memory
- **`store_memory`** - Store a single memory
- **`store_batch_memories`** - Store multiple memories at once
- **`update_memory`** - Update existing memory (auto-creates version in v1.5+)
- **`delete_memory`** - Remove a memory
- **`search_memories`** - Search using semantic similarity (enhanced in v1.5+ with category/fuzzy/regex)
- **`organize_session`** - Create session groups

### Smart Context (v1.1+)
- **`recall_relevant_context`** - Proactively retrieve relevant memories
- **`analyze_and_remember`** - Extract and store memories from conversation
- **`summarize_session`** - Create session snapshot

### Advanced (v1.2+)
- **`export_memories`** - Backup to JSON
- **`import_memories`** - Restore from JSON
- **`find_duplicates`** - Detect similar memories
- **`consolidate_memories`** - Merge multiple memories

### Global Memories (v1.3+)
- **`convert_to_global`** - Convert workspace memory to global
- **`convert_to_workspace`** - Convert global memory to workspace-specific

### Memory Relationships (v1.4+)
- **`link_memories`** - Create relationships between memories
- **`get_related_memories`** - Traverse relationship graph
- **`unlink_memories`** - Remove relationships
- **`get_memory_graph`** - Get full memory graph structure

### Version History (v1.5+)
- **`get_memory_history`** - View version history of a memory
- **`rollback_memory`** - Rollback to a previous version

### Templates (v1.5+)
- **`create_template`** - Create reusable memory template
- **`create_from_template`** - Instantiate memory from template
- **`list_templates`** - List available templates

### Categories (v1.5+)
- **`set_memory_category`** - Assign category to a memory
- **`list_categories`** - List all categories with counts
- **`get_memories_by_category`** - Retrieve memories by category

---

## Available Resources (17)

Browse memories directly using MCP resources:

### Workspace Resources
- **`memory://recent`** - Recent memories (default 50)
- **`memory://by-type/{type}`** - Filter by context type
- **`memory://by-tag/{tag}`** - Filter by tag
- **`memory://important`** - High importance (≥8)
- **`memory://sessions`** - All sessions
- **`memory://session/{id}`** - Specific session
- **`memory://summary`** - Statistics overview
- **`memory://search?q=query`** - Semantic search
- **`memory://analytics`** - Usage analytics dashboard (v1.2+)

### Global Resources (v1.3+)
- **`memory://global/recent`** - Recent global memories (cross-workspace)
- **`memory://global/by-type/{type}`** - Global memories by context type
- **`memory://global/by-tag/{tag}`** - Global memories by tag
- **`memory://global/important`** - Important global memories
- **`memory://global/search?q=query`** - Search global memories

### Relationship Resources (v1.4+)
- **`memory://relationships`** - List all memory relationships
- **`memory://memory/{id}/related`** - Get related memories
- **`memory://graph/{id}`** - Get memory graph structure

---

## Workspace Isolation

Memories are **automatically isolated by directory**. Working in different projects? No problem:

```
/Users/you/project-a/  → Workspace A memories
/Users/you/project-b/  → Workspace B memories
```

Memories from Project A **never pollute** Project B. Each workspace gets its own isolated memory space.

### Using Remote Redis

Want to:
- **Share memories across machines**? Use cloud Redis with the same `REDIS_URL` or Cloud Valkey with the same host/port
- **No local install**? Use Upstash, Redis Cloud, or Railway (free tiers available) - see also Valkey cloud instances
- **Team collaboration**? Share Redis URL (or valkey host/port) and workspace path with your team

See [Configuration](#configuration) section for cloud Redis setup.

### Organizational Shared Memory

**Recall enables teams to build collective knowledge** that all Claude instances can access. Perfect for:

**🏢 Organization-wide learning:**
- Share coding standards, architecture decisions, and best practices across the entire team
- Build a living knowledge base that grows with every conversation
- New team members instantly access organizational context and conventions

**👥 Team collaboration:**
- Multiple developers using Claude can contribute to and benefit from shared memories
- Consistent answers to "how do we do X?" across all team members
- Preserve institutional knowledge even as team composition changes

**🔄 Cross-project patterns:**
- Share common patterns and solutions across different projects
- Build reusable memory templates for similar workflows
- Reduce repetitive explanations of organizational context

**Setup for shared organizational memory:**

1. **Deploy shared instance:**
  ***a) Redis ***
   ```bash
   # Use any cloud Redis service (Upstash, Redis Cloud, etc.)
   # Or deploy your own Redis server
   ```

  ***b) Valkey ***
    ```bash
   # Use any cloud Valkey service (Elasticache, Memorystore for valkey, etc.)
   # Or deploy your own Valkey server
   ```

2. **Share Connection information with team:**
  ***a) Redis ***
   ```json
   {
     "env": {
       "REDIS_URL": "rediss://your-org-redis.com:6379"
     }
   }
   ```

  ***b) Valkey ***
   ```json
   {
     "env": {
       "BACKEND_TYPE":"valkey",
       "VALKEY_HOST":"valkey-remote-host",
       "VALKEY_PORT":6379
     }
   }
   ``` 

3. **Define shared workspace path:**
   - Option A: Use a fixed workspace path for org-wide memories
   - Option B: Wait for v1.3.0 global memories feature for automatic sharing
   - Option C: Use project-based isolation but share Redis/Valkey for cross-project search

**Example workflow:**
```
Developer A: "Remember: Our API rate limit is 1000 requests/minute"
           [Stored in shared Redis]

Developer B: "What's our API rate limit?"
           [Claude retrieves from shared memory]
           "Your API rate limit is 1000 requests/minute"
```

**Security considerations:**
- Use Redis authentication and TLS (rediss://) for sensitive data
- Build valkey with TLS support(https://valkey.io/topics/encryption/)
- Consider separate Redis/Valkey databases for different teams/projects
- Implement access controls at the Redis/Valkey level
- Audit memory contents periodically for sensitive information

See [WORKSPACE_MODES.md](WORKSPACE_MODES.md) for future plans on enhanced organizational memory features.

### Global Memories (v1.3+)

**Cross-workspace memory sharing** enables memories that work across all workspaces. Perfect for:
- Personal preferences and coding standards
- Team conventions and organizational knowledge
- Shared patterns and solutions

**Workspace Modes:**
- **`isolated`** (default) - Workspace-only memories, no cross-workspace access
- **`global`** - All memories shared globally, no workspace isolation
- **`hybrid`** - Both workspace-specific AND global memories (best of both worlds)

**Configure workspace mode:**
```json
{
  "env": {
    "WORKSPACE_MODE": "hybrid"
  }
}
```

**Create global memories:**
```
"Remember globally: I prefer TypeScript strict mode for all projects"
```
Claude stores with `is_global: true`, accessible across all workspaces.

**Convert existing memories:**
```
"Convert this memory to global: [memory_id]"
```

**Browse global memories:**
- Use `memory://global/recent` resource
- Use `memory://global/search?q=query` for semantic search
- Global resources only work in `global` or `hybrid` modes

See [WORKSPACE_MODES.md](WORKSPACE_MODES.md) for detailed documentation.

---

## Advanced Features (v1.2)

### TTL (Temporary Memories)

Store memories that auto-expire:

```
"Remember for the next hour: API is in maintenance mode"
```

Claude will add `ttl_seconds: 3600` and Redis automatically removes it after 1 hour.

**Use cases:**
- Temporary debugging notes
- Session-specific context
- Time-sensitive reminders

### Export/Import

**Backup your memories:**
```
"Export all important memories to JSON"
```

**Restore or migrate:**
```
"Import these memories: [paste JSON]"
```

**Use cases:**
- Regular backups
- Move memories between workspaces
- Share knowledge bases with team
- Archive old projects

### Duplicate Detection

**Find similar memories:**
```
"Find duplicate memories with similarity above 90%"
```

**Auto-merge duplicates:**
```
"Find and merge duplicate memories automatically"
```

**Use cases:**
- Clean up redundant memories
- Consolidate related information
- Optimize memory storage

### Analytics Dashboard

**See usage patterns:**
```
"Show me memory analytics"
```

Get insights on:
- Memory trends (24h, 7d, 30d)
- Most active types
- Top tags
- Importance distribution
- Daily activity breakdown

---

## Examples

### Example 1: Project Setup
```
You: "Remember: This project uses Prisma for database, tRPC for API, and Next.js for frontend"

Claude: [Stores 3 memories with type 'code_pattern']
         ✓ Stored: Prisma for database (importance: 8)
         ✓ Stored: tRPC for API (importance: 8)
         ✓ Stored: Next.js for frontend (importance: 8)

You (later): "What's our tech stack?"

Claude: [Retrieves memories]
        "Your project uses:
         - Prisma for database
         - tRPC for API
         - Next.js for frontend"
```

### Example 2: Code Patterns
```
You: "Store this error handling pattern we use:
     try { ... } catch (error) { logger.error(...); throw new AppError(...) }"

Claude: [Stores as 'code_pattern', importance: 9]
        ✓ Stored: Standard error handling pattern

You (in new file): "Add error handling here"

Claude: [Recalls pattern]
        "I'll use your standard error handling pattern with logger and AppError..."
```

### Example 3: Session Organization
```
You: "We just finished refactoring auth. Summarize and save this session."

Claude: [Creates session with all relevant memories]
        ✓ Session created: "Auth Refactoring - 2025-01-15"
        ✓ 8 memories captured
        ✓ Summary: Refactored authentication to use JWT with refresh tokens

You (weeks later): "What did we change in the auth refactoring?"

Claude: [Retrieves session memories]
        "In the auth refactoring session, you:
         - Switched from sessions to JWT tokens
         - Added refresh token rotation
         - Implemented secure cookie storage
         - Updated middleware for new auth flow"
```

### Example 4: Global Memories (v1.3+)
```
# In project A (with WORKSPACE_MODE=hybrid)
You: "Remember globally: I prefer async/await over .then() in all projects"

Claude: [Stores with is_global: true]
        ✓ Stored globally: async/await preference (importance: 9)

# Switch to project B
You: "What are my coding preferences?"

Claude: [Retrieves global memories]
        "Your global coding preferences include:
         - Prefer async/await over .then() in all projects"

# Project-specific memory
You: "Remember for this project only: Use MongoDB with Mongoose"

Claude: [Stores with is_global: false]
        ✓ Stored: MongoDB with Mongoose (workspace-only, importance: 8)

# Back in project A
You: "What database are we using?"

Claude: [Only sees project A memories, not project B's MongoDB]
        "I don't see any database information stored for this workspace."
```

---

## Configuration

### Environment Variables

- **`REDIS_URL`** - Redis connection (default: `redis://localhost:6379`)
- **`BACKEND_TYPE`** - Specifies which backend to use - set to `valkey` for Valkey (default: `redis`) - not needed if using redis.
- **`VALKEY_HOST`** - Valkey host (default: `localhost`)
- **`VALKEY_PORT`** - Valkey port (default: `6379`) 
- **`ANTHROPIC_API_KEY`** - Claude API key for analysis and embeddings
- **`WORKSPACE_MODE`** (v1.3+) - Workspace memory mode (default: `isolated`)
  - `isolated` - Workspace-only memories, no cross-workspace access
  - `global` - All memories shared globally across workspaces
  - `hybrid` - Both workspace-specific AND global memories

### Redis Setup Options

**Local Redis (default):**
```bash
redis-server
```

**Custom port:**
```bash
redis-server --port 6380
```
Then set: `REDIS_URL=redis://localhost:6380`

**Remote Redis:**
```json
{
  "env": {
    "REDIS_URL": "redis://username:password@host:port/db"
  }
}
```

**Redis Cloud/AWS ElastiCache:**
```json
{
  "env": {
    "REDIS_URL": "rediss://your-redis-cloud.com:6379"
  }
}
```


### Valkey Setup Options
- see valkey installation options here https://valkey.io/topics/installation/

---

## How It Works

1. **Storage**: Memories stored in Redis/Valkey with workspace isolation
2. **Embeddings**: Hybrid approach using Claude-extracted keywords + trigrams (128-dim vectors)
3. **Search**: Cosine similarity for semantic retrieval
4. **Context**: Auto-injected at conversation start via MCP prompts
5. **Analysis**: Claude Haiku analyzes conversations for memory extraction

### Cost Estimate

Very affordable! Estimated **~$0.20/day** for active development:
- Uses Claude Haiku (cheapest model) for analysis
- Hybrid embeddings reduce API calls
- Redis/Valkey in-memory storage is fast and free

---

## Security Considerations

### Data Sensitivity

Recall stores all conversation context that Claude deems important, which may include:
- **Credentials**: API keys, passwords, tokens mentioned in conversations
- **Code**: Proprietary algorithms, business logic, security implementations
- **Personal Information**: Names, emails, organizational structures
- **Business Secrets**: Strategic decisions, financial data, competitive information

**Critical Security Rules:**

1. **Never use public/shared Redis instances** for sensitive projects
2. **Never share Redis connection strings** in public repositories or documentation
3. **Always use authentication** - Configure Redis with `requirepass`
4. **Always use TLS** for remote connections - Use `rediss://` not `redis://`
5. **Audit regularly** - Review stored memories for inadvertently captured secrets

### Redis Security Configuration

**Local Redis (Development):**
```bash
# Enable authentication
redis-server --requirepass your-strong-password

# Use in config:
# REDIS_URL=redis://:your-strong-password@localhost:6379
```

**Production Redis (Cloud/Remote):**
```json
{
  "env": {
    "REDIS_URL": "rediss://:password@your-redis-host.com:6379"
  }
}
```

**Additional Redis security:**
- Bind to specific IPs: `bind 127.0.0.1 ::1` (local only)
- Disable dangerous commands: `rename-command FLUSHALL ""`
- Use firewall rules to restrict access
- Enable Redis ACLs for fine-grained permissions (Redis 6+)
- Regular backups with encrypted storage

### Valkey Security Configuration
See Valkey security here https://valkey.io/topics/security/, https://valkey.io/topics/acl/, https://valkey.io/topics/persistence/

### Organizational Deployments

When deploying for team/organizational use:

**Infrastructure Security:**
- Deploy Redis/Valkey in private VPC/network
- Use dedicated Redis/Valkey instance (not shared with other services)
- Enable Redis/Valkey encryption at rest
- Implement network segmentation and access controls
- Use VPN or private network access for remote connections

**Access Management:**
- Document who has Redis/Valkey access
- Use separate Redis/Valkey databases for different teams/security levels
- Implement audit logging for Redis/Valkey access
- Regular access reviews and credential rotation
- Consider using Redis/Valkey Enterprise with RBAC

**Data Governance:**
- Define data retention policies
- Implement automated cleanup of old/stale memories
- Create backup and disaster recovery procedures
- Document compliance requirements (GDPR, HIPAA, SOC2, etc.)
- Train users on what not to store in memories

**Example: Multi-team isolation using Redis databases:**
```json
{
  "engineering-team": {
    "REDIS_URL": "rediss://:password@redis.company.com:6379/0"
  },
  "product-team": {
    "REDIS_URL": "rediss://:password@redis.company.com:6379/1"
  },
  "exec-team": {
    "REDIS_URL": "rediss://:password@redis-exec.company.com:6379/0"
  }
}
```

### Incident Response

If you suspect a security breach:

1. **Immediately rotate Redis credentials**
2. **Audit Redis/Valkey access logs** for unauthorized access
3. **Review stored memories** for exposed sensitive data
4. **Flush compromised data** using `export_memories` + selective deletion
5. **Update all team members** with new credentials
6. **Review and strengthen** security controls

### Compliance Considerations

**GDPR (EU):**
- Memories may contain personal data - ensure lawful basis for processing
- Implement data subject access rights (export/delete memories)
- Document data processing activities
- Ensure adequate security measures

**CCPA (California):**
- Disclose data collection and storage practices
- Provide mechanisms for data deletion
- Honor do-not-sell requests

**HIPAA (Healthcare):**
- Do not store PHI (Protected Health Information) in memories
- Use BAA-compliant Redis hosting if healthcare-related
- Implement encryption at rest and in transit

**SOC2/ISO27001:**
- Document security controls and procedures
- Implement access logging and monitoring
- Regular security assessments and audits

### Developer Responsibilities

As a developer using Recall, you must:

✅ **Do:**
- Use secure, authenticated Redis/Valkey instances
- Enable TLS for all remote connections
- Regularly audit stored memories
- Implement proper access controls
- Train your team on security best practices
- Have incident response procedures
- Comply with your organization's security policies

❌ **Don't:**
- Use public Redis/Valkey instances for any sensitive data
- Store credentials or secrets in memories (use environment variables/secret managers instead)
- Share Redis/Valkey connection strings publicly
- Ignore security warnings or skip authentication
- Store regulated data (PII, PHI, PCI) without proper controls

---

## Troubleshooting

### "Cannot connect to Redis"

**Solution 1: Start local Redis**
```bash
redis-server
```

Test connection:
```bash
redis-cli ping
# Should return: PONG
```

**Solution 2: Use cloud Redis (no install needed)**

Sign up for free cloud Redis:
1. **Upstash** (easiest): https://upstash.com
   - Create database
   - Copy `REDIS_URL` from dashboard
   - Update your config with the URL

2. **Redis Cloud**: https://redis.com/try-free
   - Free 30MB database
   - Get connection string

3. **Railway**: https://railway.app
   - Add Redis service
   - Use provided connection URL

```json
{
  "env": {
    "REDIS_URL": "rediss://your-upstash-url.upstash.io:6379"
  }
}
```

No local Redis installation required! ✨

### "Tools not showing up in Claude"

**Solution:**
1. Check config file path is correct
2. Verify `ANTHROPIC_API_KEY` is set
3. Restart Claude **completely** (quit and reopen)
4. Check Claude's MCP logs for errors

**Config file locations:**
- **Claude Code**: `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- **Claude Desktop (macOS)**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Claude Desktop (Windows)**: `%APPDATA%\Claude\claude_desktop_config.json`

### "Memories not persisting"

**Solution:** Check workspace isolation - you may be in a different directory.

Memories are scoped to the working directory where Claude was launched. To see your workspace:

```
"What's my current memory workspace?"
```

### "Out of context" or "Context window full"

**Solution:** Use smart context management:

```
"Analyze our conversation and remember the important parts"
```

This extracts key information before context compaction.

---

## Performance

Typical performance characteristics:

- **Store Memory**: ~200ms (includes embedding generation)
- **Batch Store (10)**: ~500ms
- **Get by ID**: <1ms (Redis in-memory)
- **Recent (50)**: ~10ms
- **Semantic Search (1k memories)**: ~500ms
- **Semantic Search (10k memories)**: ~2s

---

## Version History

- **v1.4.0** (Current) - Memory relationships, knowledge graphs, link related memories
- **v1.3.0** - Global memories, cross-workspace sharing, workspace modes
- **v1.2.0** - TTL support, Export/Import, Consolidation, Analytics
- **v1.1.0** - Smart context management (recall, analyze, summarize)
- **v1.0.0** - Initial release with core memory operations

**[See CHANGELOG.md for detailed changes](CHANGELOG.md)**

---

## Learn More

- **[Feature Documentation](FEATURES_V1.2.md)** - Detailed v1.2 feature guide
- **[Context Management](CONTEXT_MANAGEMENT.md)** - Smart context guide (v1.1)
- **[Changelog](CHANGELOG.md)** - Complete version history

---

## Development

```bash
# Clone and install
git clone <repo-url>
cd mem
npm install

# Build
npm run build

# Development mode (watch)
npm run dev
```

### Testing

Comprehensive test suite available in [tests/](tests/). See [tests/README.md](tests/README.md) for details.

**Quick test run:**
```bash
# Static checks (fast, no dependencies)
./tests/test-v1.5.0-simple.sh

# Runtime tests (requires Redis)
ANTHROPIC_API_KEY="test-key" node tests/test-runtime.js
```

**Testing workflow for releases:**
1. Static checks (file existence, types, build)
2. Runtime tests (server startup, tool availability)
3. Integration tests (full feature testing)
4. Manual tests (Claude Desktop interaction)

See complete workflow in [tests/README.md](tests/README.md#testing-workflow-for-new-releases).

### Project Structure
```
/mem/
├── src/
│   ├── index.ts                 # Server entry point
│   ├── types.ts                 # TypeScript types & schemas
│   ├── redis/
│   │   ├── client.ts           # Redis connection
│   │   └── memory-store.ts     # Storage logic
│   ├── embeddings/
│   │   └── generator.ts        # Claude embeddings
│   ├── analysis/
│   │   └── conversation-analyzer.ts  # AI analysis
│   ├── tools/
│   │   ├── index.ts            # Core tools
│   │   ├── context-tools.ts    # Smart context tools
│   │   ├── export-import-tools.ts    # Advanced tools
│   │   ├── relationship-tools.ts     # Knowledge graphs (v1.4)
│   │   ├── version-tools.ts         # Version history (v1.5)
│   │   ├── template-tools.ts        # Memory templates (v1.5)
│   │   └── category-tools.ts        # Categories (v1.5)
│   ├── resources/
│   │   ├── index.ts            # MCP resources
│   │   └── analytics.ts        # Analytics resource
│   └── prompts/
│       ├── index.ts            # MCP prompts
│       └── formatters.ts       # Context formatters
├── tests/                       # Test suite
│   ├── README.md               # Testing documentation
│   ├── test-v1.5.0-simple.sh   # Static checks
│   ├── test-runtime.js         # Runtime tests
│   ├── test-v1.5.0.js          # Integration tests
│   └── test-v1.5.0-manual.md   # Manual checklist
└── dist/                        # Built output
```

---

## Support

- **Issues**: Report bugs or request features on GitHub
- **Questions**: Open a discussion for help
- **Documentation**: Check the docs folder for detailed guides

---

## License

MIT - See LICENSE file

---

**Built with ❤️ by José Airosa for Claude users tired of repeating context**

*Powered by: TypeScript, Redis, Anthropic Claude, Model Context Protocol*
