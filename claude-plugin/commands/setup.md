Configure your Recall API key and server URL. This saves credentials to ~/.claude/recall/config.json (for hooks) and injects RECALL_API_KEY into ~/.claude/settings.json (for the plugin MCP server) so both systems authenticate correctly.

## Instructions

1. Ask the user for their Recall API key. It starts with `sk-` and can be found at https://recallmcp.com/dashboard/keys
2. Ask if they want to use the default server (https://recallmcp.com) or a custom self-hosted URL
3. Write the config file (used by lifecycle hooks via lib/config.sh):

```bash
mkdir -p ~/.claude/recall
cat > ~/.claude/recall/config.json << EOF
{
  "api_key": "THE_API_KEY",
  "server_url": "THE_SERVER_URL"
}
EOF
chmod 600 ~/.claude/recall/config.json
```

4. Inject RECALL_API_KEY into ~/.claude/settings.json env section (belt-and-suspenders for hooks that read from env):

```bash
python3 - <<'PYEOF'
import json, os

settings_path = os.path.expanduser("~/.claude/settings.json")
with open(settings_path) as f:
    settings = json.load(f)

settings.setdefault("env", {})["RECALL_API_KEY"] = "THE_API_KEY"

with open(settings_path, "w") as f:
    json.dump(settings, f, indent=2)

print("RECALL_API_KEY written to settings.json env section")
PYEOF
```

5. Update ~/.claude.json so the authoritative runtime config also has the new key. Claude Code reads ~/.claude.json as the final source for HTTP MCP server headers — if an entry for recall-remote already exists there, it bypasses the settings.json env var entirely:

```bash
python3 - <<'PYEOF'
import json, os

path = os.path.expanduser("~/.claude.json")
try:
    with open(path) as f:
        config = json.load(f)
except FileNotFoundError:
    config = {}

mcp = config.setdefault("mcpServers", {})
if "recall-remote" not in mcp:
    mcp["recall-remote"] = {"type": "http", "url": "THE_SERVER_URL/mcp", "headers": {}}
mcp["recall-remote"].setdefault("headers", {})["Authorization"] = "Bearer THE_API_KEY"

with open(path, "w") as f:
    json.dump(config, f, indent=2)

print("recall-remote updated in ~/.claude.json")
PYEOF
```

6. Tell the user to **restart Claude Code** once — the MCP server reads env vars at launch, so the new key takes effect on next start.
7. After restart, verify the connection by calling `mcp__recall-remote__get_workspace`. If it succeeds, Recall is working.
8. Set up the workspace for the current project by calling `set_workspace` with the current directory and git remote.

## Important

- The API key is sensitive — set file permissions to 600 on config.json (owner read/write only)
- Never echo or log the full API key back to the user
- Three separate auth paths exist: hooks read from config.json via lib/config.sh; the plugin .mcp.json reads RECALL_API_KEY from settings.json env; ~/.claude.json is the authoritative runtime override for HTTP MCP server headers
- Once Claude Code registers recall-remote in ~/.claude.json (on first use), that entry takes precedence over the env var. Both files must be updated together during key rotation — updating only settings.json silently fails if ~/.claude.json already has a stale key
