# Recall 🧠

**Give Claude perfect recall with persistent memory that survives context limits and session restarts.**

Your AI assistant can now remember important context, decisions, and patterns across all conversations—no more repeating yourself or losing critical information when the context window fills up.

---

## What is This?

Recall is a **brain extension** for Claude that stores memories in Redis. It solves the context window problem by:

- 📝 **Remembering** directives, decisions, code patterns, and important information
- 🔍 **Retrieving** relevant context automatically when you need it
- 🔄 **Persisting** across sessions - memories survive restarts and context compaction
- 🗂️ **Organizing** by workspace - Project A memories don't pollute Project B

---

## Quick Start (5 Minutes)

### 1. Prerequisites

- **Redis** running locally (default: `localhost:6379`)
- **Node.js** 18 or higher
- **Claude Code** or **Claude Desktop**

**Option 1: Local Redis (Recommended for getting started)**
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

**Option 2: Cloud Redis (No local install needed)**

Use a free Redis cloud service:
- **[Upstash](https://upstash.com/)** - Free tier with 10,000 commands/day
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

### 2. Install

```bash
npm install -g @joseairosa/recall
```

Or from source:
```bash
git clone <repo-url>
cd mem
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

## How to Use

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

## Available Tools (13)

Claude has access to these memory tools:

### Core Memory
- **`store_memory`** - Store a single memory
- **`store_batch_memories`** - Store multiple memories at once
- **`update_memory`** - Update existing memory
- **`delete_memory`** - Remove a memory
- **`search_memories`** - Search using semantic similarity
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

---

## Available Resources (9)

Browse memories directly using MCP resources:

- **`memory://recent`** - Recent memories (default 50)
- **`memory://by-type/{type}`** - Filter by context type
- **`memory://by-tag/{tag}`** - Filter by tag
- **`memory://important`** - High importance (≥8)
- **`memory://sessions`** - All sessions
- **`memory://session/{id}`** - Specific session
- **`memory://summary`** - Statistics overview
- **`memory://search?q=query`** - Semantic search
- **`memory://analytics`** - Usage analytics dashboard (v1.2+)

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
- **Share memories across machines**? Use cloud Redis with the same `REDIS_URL`
- **No local install**? Use Upstash, Redis Cloud, or Railway (free tiers available)
- **Team collaboration**? Share Redis URL and workspace path with your team

See [Configuration](#configuration) section for cloud Redis setup.

### Future: Global Memories

Coming in v1.3.0: Support for **global memories** that work across all workspaces (e.g., personal preferences, team conventions). See [WORKSPACE_MODES.md](WORKSPACE_MODES.md) for details.

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

---

## Configuration

### Environment Variables

- **`REDIS_URL`** - Redis connection (default: `redis://localhost:6379`)
- **`ANTHROPIC_API_KEY`** - Claude API key for analysis and embeddings

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

---

## How It Works

1. **Storage**: Memories stored in Redis with workspace isolation
2. **Embeddings**: Hybrid approach using Claude-extracted keywords + trigrams (128-dim vectors)
3. **Search**: Cosine similarity for semantic retrieval
4. **Context**: Auto-injected at conversation start via MCP prompts
5. **Analysis**: Claude Haiku analyzes conversations for memory extraction

### Cost Estimate

Very affordable! Estimated **~$0.20/day** for active development:
- Uses Claude Haiku (cheapest model) for analysis
- Hybrid embeddings reduce API calls
- Redis in-memory storage is fast and free

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

- **v1.2.0** (Current) - TTL support, Export/Import, Consolidation, Analytics
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
│   │   └── export-import-tools.ts    # Advanced tools
│   ├── resources/
│   │   ├── index.ts            # MCP resources
│   │   └── analytics.ts        # Analytics resource
│   └── prompts/
│       ├── index.ts            # MCP prompts
│       └── formatters.ts       # Context formatters
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
