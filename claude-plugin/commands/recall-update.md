Manually trigger a Recall plugin update, or toggle auto-update on/off.

## Instructions

### 1. Detect install type

Check whether this is a plugin install or a curl|bash install:

```bash
[[ "${HOME}/.claude/plugins/recall/scripts/session-start.sh" -ef "$(which recall 2>/dev/null || true)" ]] \
  && echo "plugin" || true
ls "${HOME}/.claude/plugins/recall/scripts/session-start.sh" 2>/dev/null && echo "plugin" || echo "curl"
```

If the file exists at `~/.claude/plugins/recall/scripts/`, it is a **plugin install**.
Otherwise it is a **curl|bash install** with scripts at `~/.claude/recall/hooks/`.

### 2. Trigger the update

**Plugin install:**
Tell the user to run `/plugin install recall` in Claude Code — this re-installs the plugin at the latest version.

**curl|bash install:**
Read `RECALL_SERVER_URL` from `~/.claude/recall/config.json` (default: `https://recallmcp.com`), then run:

```bash
RECALL_SERVER_URL="$(python3 -c "import json; d=json.load(open('${HOME}/.claude/recall/config.json')); print(d.get('server_url','https://recallmcp.com'))" 2>/dev/null || echo "https://recallmcp.com")"
RECALL_API_KEY="$(python3 -c "import json; d=json.load(open('${HOME}/.claude/recall/config.json')); print(d.get('api_key',''))" 2>/dev/null || echo "")"
curl -fsSL "${RECALL_SERVER_URL}/install-hooks" | bash -s -- --api-key "${RECALL_API_KEY}" --server-url "${RECALL_SERVER_URL}"
```

After the update completes, tell the user to **restart Claude Code** for the new hooks to take effect.

### 3. Show current version info (optional)

```bash
# Plugin: read from plugin.json
python3 -c "import json; d=json.load(open('${HOME}/.claude/plugins/recall/.claude-plugin/plugin.json')); print('Installed:', d.get('version','?'))" 2>/dev/null || true

# curl|bash: read from config.json
python3 -c "import json; d=json.load(open('${HOME}/.claude/recall/config.json')); print('Installed:', d.get('version','?'))" 2>/dev/null || true

# Available: check state.json
python3 -c "import json; d=json.load(open('${HOME}/.claude/recall/state.json')); print('Available:', d.get('available_version', 'up to date'))" 2>/dev/null || true
```

### 4. Toggle auto-update

If the user asks to **disable** auto-updates, explain both options and let them choose:

**Option A — env var (shell profile, survives config resets):**
```bash
# Add to ~/.zshrc or ~/.bashrc:
export RECALL_AUTO_UPDATE=false
```
Then source the profile or restart the terminal.

**Option B — config file:**
```bash
python3 - <<'EOF'
import json, os
path = os.path.expanduser("~/.claude/recall/config.json")
try:
    d = json.load(open(path))
except Exception:
    d = {}
d["auto_update"] = False
json.dump(d, open(path, "w"), indent=2)
print("auto_update set to false in", path)
EOF
```

If the user asks to **re-enable** auto-updates:

**Option A — env var:** Remove or unset `RECALL_AUTO_UPDATE` from the shell profile.

**Option B — config file:**
```bash
python3 - <<'EOF'
import json, os
path = os.path.expanduser("~/.claude/recall/config.json")
try:
    d = json.load(open(path))
    d.pop("auto_update", None)
    json.dump(d, open(path, "w"), indent=2)
    print("auto_update removed from", path, "(auto-update enabled)")
except Exception as e:
    print("Could not update config:", e)
EOF
```

## Notes

- The env var `RECALL_AUTO_UPDATE=false` takes precedence over `config.json`
- When auto-update is disabled, Recall still notifies about new versions at session start — it just won't download them automatically
- `/recall-update` can be run at any time regardless of whether auto-update is on or off
