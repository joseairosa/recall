Here's how to run your migrated MCP server:

Quick Start

1. Start Redis (Required)

# Check if Redis is already running
redis-cli ping

# If not running, start it:
# macOS (with Homebrew)
brew services start redis

# Ubuntu/Debian
sudo systemctl start redis

# Or using Docker
docker run -d -p 6379:6379 redis:latest

2. Install the Server Globally (Optional but recommended)

# From the project directory
npm install -g .

# Or link it for development
npm link

3. Configure Claude Code

claude mcp add recall -- recall

recall uses redis://localhost:6379 as a default
if you have a different redis configuration
edit your /home/myuser/.claude.json

{
    "mcpServers": {
        "recall": {
        "command": "recall",
                "env": {
                "REDIS_URL": "redis://localhost:6379"
                }
        }
    }
}

by default "recall workspaces" are defined by the current directory
use "WORKSPACE_MODE": "hybrid" in env above to save memories locally or
globally
check :https://github.com/joseairosa/recall/blob/main/WORKSPACE_MODES.md

Test It!

Ask Claude:
"Store a memory that I prefer dart for all projects"

Then verify:
"What do you remember about my coding preferences?"