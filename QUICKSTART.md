# Quick Start Guide

## Setup (5 minutes)

### 1. Start Redis

```bash
# macOS
brew services start redis

# Or Docker
docker run -d -p 6379:6379 redis:latest

# Verify Redis is running
redis-cli ping  # Should return PONG
```

### 2. Set Environment Variables

```bash
# Copy example env file
cp .env.example .env

# Edit .env and add your OpenAI API key
# REDIS_URL=redis://localhost:6379
# OPENAI_API_KEY=sk-your-key-here
```

### 3. Configure Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["/Users/joseairosa/Development/mcp/mem/dist/index.js"],
      "env": {
        "REDIS_URL": "redis://localhost:6379",
        "OPENAI_API_KEY": "sk-your-openai-key"
      }
    }
  }
}
```

### 4. Restart Claude Desktop

Completely quit and reopen Claude Desktop to load the MCP server.

---

## First Test

Ask Claude:

> "Store a memory that I prefer informal communication. Make it importance 8 and tag it with 'preference' and 'communication'"

Claude should use the `store_memory` tool and return a success message with a memory ID.

Then ask:

> "Search for memories about communication preferences"

Claude should use the `search_memories` tool and find your stored memory.

---

## Common Usage Patterns

### Store Important Directive

> "Remember: Always use ULIDs for database IDs, never auto-increment. This is critical (importance 10)"

### Store Code Pattern

> "Store a code pattern: In this project, use Drizzle ORM with text('id').primaryKey() for ULID fields. Tag it with 'drizzle', 'database', and 'patterns'"

### Search Previous Context

> "What do you remember about database conventions?"

### Get Recent Context

> "Show me the last 10 memories we've stored"

### Create Session Snapshot

> "Create a session called 'Feature X Development - Day 1' with the last 5 memories"

### Retrieve Session

> "Show me memories from the 'Feature X Development - Day 1' session"

---

## Verification

Check if server is running:

```bash
# Check Claude Desktop logs
tail -f ~/Library/Logs/Claude/mcp*.log

# Should see:
# Redis Client Connected
# Redis Client Ready
# MCP Memory Server started successfully
```

---

## Troubleshooting

### "Failed to connect to Redis"

```bash
# Check Redis is running
redis-cli ping

# Start Redis if not running
brew services start redis
```

### "OPENAI_API_KEY environment variable is required"

Make sure your API key is set in the Claude Desktop config, not just in `.env`.

### Server not appearing in Claude

1. Check config file syntax (valid JSON)
2. Verify absolute path to `dist/index.js`
3. Completely quit and restart Claude Desktop
4. Check logs: `~/Library/Logs/Claude/`

---

## Next Steps

- Store project-specific conventions and directives
- Create sessions at the end of each work day
- Use semantic search to find relevant past context
- Tag memories for easy retrieval
- Mark critical information with high importance scores

---

**Ready to use!** Your Claude now has a persistent memory brain.
