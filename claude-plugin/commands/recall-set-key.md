Update your Recall API key across every location Claude Code reads it from. Run this whenever you generate a new key from https://recallmcp.com/dashboard/keys.

## Instructions

### 1. Ask for the new key

Use AskUserQuestion to prompt for the new API key. It starts with `sk-`. Never echo the full key back to the user in plain text.

### 2. Validate the key format

If the key does not start with `sk-`, stop and tell the user it looks invalid and to double-check they copied the full key from the dashboard.

### 3. Update all locations

Run each block below in order. Every location must be updated — missing any one of them will cause silent auth failures on next restart.

**a) ~/.claude/recall/config.json** — read by lifecycle hooks (session-start, observe, session-end) via lib/config.sh:

```bash
python3 - <<'PYEOF'
import json, os, stat

path = os.path.expanduser("~/.claude/recall/config.json")
os.makedirs(os.path.dirname(path), exist_ok=True)
try:
    with open(path) as f:
        config = json.load(f)
except Exception:
    config = {}

config["api_key"] = "THE_API_KEY"
config.setdefault("server_url", "https://recallmcp.com")

with open(path, "w") as f:
    json.dump(config, f, indent=2)
os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)
print("✓ ~/.claude/recall/config.json")
PYEOF
```

**b) ~/.claude/settings.json env section** — used by the plugin .mcp.json `${RECALL_API_KEY}` reference:

```bash
python3 - <<'PYEOF'
import json, os

path = os.path.expanduser("~/.claude/settings.json")
try:
    with open(path) as f:
        settings = json.load(f)
except Exception:
    settings = {}

settings.setdefault("env", {})["RECALL_API_KEY"] = "THE_API_KEY"

with open(path, "w") as f:
    json.dump(settings, f, indent=2)
print("✓ ~/.claude/settings.json")
PYEOF
```

**c) ~/.claude.json mcpServers entry** — the authoritative runtime config; takes precedence over env vars once registered:

```bash
python3 - <<'PYEOF'
import json, os

path = os.path.expanduser("~/.claude.json")
try:
    with open(path) as f:
        config = json.load(f)
except Exception:
    config = {}

mcp = config.setdefault("mcpServers", {})
if "recall-remote" not in mcp:
    mcp["recall-remote"] = {
        "type": "http",
        "url": "https://recallmcp.com/mcp",
        "headers": {}
    }
mcp["recall-remote"].setdefault("headers", {})["Authorization"] = "Bearer THE_API_KEY"

with open(path, "w") as f:
    json.dump(config, f, indent=2)
print("✓ ~/.claude.json")
PYEOF
```

**d) ~/.zshrc** — covers terminal sessions (find and replace existing line, or append):

```bash
python3 - <<'PYEOF'
import os, re

path = os.path.expanduser("~/.zshrc")
line = 'export RECALL_API_KEY=THE_API_KEY\n'
pattern = re.compile(r'^export RECALL_API_KEY=.*$', re.MULTILINE)

try:
    with open(path) as f:
        content = f.read()
    if pattern.search(content):
        content = pattern.sub(line.rstrip(), content)
    else:
        content = content.rstrip('\n') + '\n' + line
except FileNotFoundError:
    content = line

with open(path, 'w') as f:
    f.write(content)
print("✓ ~/.zshrc")
PYEOF
```

**e) ~/.zshenv** — covers non-interactive shells and GUI app launches (Spotlight, Dock); same find-or-append logic:

```bash
python3 - <<'PYEOF'
import os, re

path = os.path.expanduser("~/.zshenv")
line = 'export RECALL_API_KEY=THE_API_KEY\n'
pattern = re.compile(r'^export RECALL_API_KEY=.*$', re.MULTILINE)

try:
    with open(path) as f:
        content = f.read()
    if pattern.search(content):
        content = pattern.sub(line.rstrip(), content)
    else:
        content = content.rstrip('\n') + '\n' + line
except FileNotFoundError:
    content = line

with open(path, 'w') as f:
    f.write(content)
print("✓ ~/.zshenv")
PYEOF
```

### 4. Confirm and instruct restart

Tell the user:
- All 5 locations updated successfully
- They must **restart Claude Code** for the MCP connection to use the new key (the MCP reads auth at startup)
- After restart, the `recall-remote` MCP server should show ✔ connected

### Important notes

- Replace every occurrence of `THE_API_KEY` in the code blocks above with the actual key the user provided before running
- Never print the full key to the user — if you need to confirm it, show only the first 10 characters followed by `...`
- If any step fails, report which one failed and what the error was — do not silently skip steps
