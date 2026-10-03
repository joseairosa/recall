#!/usr/bin/env bash
# Recall statusline hook
# Reads JSON session data from Claude Code via stdin.
#
# Two modes:
#
# WITH Pilot (previous_statusline_cmd set in config.json):
#   Runs Pilot directly so it can read Claude Code's env vars (model/context info).
#   If Pilot produces real status output, appends Recall segment to its last line.
#   If Pilot cannot detect Claude Code session context (e.g. outputs a help message
#   instead of real status), falls back to standalone mode.
#
# WITHOUT Pilot (standalone):
#   Produces a Pilot-style two-line status bar from the stdin JSON:
#   Line 1: {model} [{context bar}] {pct}%
#   Line 2: Recall: x.x.x [🧠 N [(Xs ago)]]
#
# Registered in settings.json under:
#   statusLine.command = ~/.claude/recall/hooks/statusline.sh

# Do NOT use set -e — this script must always produce output even on errors
CONFIG_FILE="${RECALL_CONFIG_FILE:-${HOME}/.claude/recall/config.json}"
STATE_FILE="${HOME}/.claude/recall/state.json"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IS_PLUGIN_INSTALL=false
[[ "${SCRIPT_DIR}" == *"/plugins/"* ]] && IS_PLUGIN_INSTALL=true

# --- Read stdin (JSON session data piped by Claude Code) ---
if [ -t 0 ]; then
  # Not piped (e.g. called manually from terminal) — use empty JSON
  STDIN_DATA="{}"
else
  STDIN_DATA="$(cat)"
fi

# --- Recall's Claude Code mod draws the Recall line above the prompt ---
# Recall shows once. When this Claude Code runs mods, Recall's mod (hooks/register.js, 1.18.0+) draws Recall's
# line above the prompt, so this script leaves its Recall segment and the /api/status call out, from the very
# first render (the status line renders before the mod's first heartbeat and does not refresh while idle).
# All three must hold:
#   - Claude Code 2.1.287 or later (the "version" Claude Code passes on stdin);
#   - the mods rollout flag Claude Code caches in .claude.json is on;
#   - an enabled recall plugin at 1.18.0 or later with hooks/register.js: user scope, a project or local scope
#     for this session's folder, or the plugin tree this script runs from (--plugin-dir).
# Otherwise (older Claude Code, mods off, no such install) the segment stays as before. No heartbeat here:
# observe.sh keeps its heartbeat check, because recording errors must fail open; this is only display.
MOD_DRAWS=false
if command -v python3 &>/dev/null; then
  _mod="$(printf '%s' "${STDIN_DATA}" | _RS_DIR="${SCRIPT_DIR}" python3 -c '
import json, os, sys

def ver(v):
    try:
        return tuple(int(p) for p in str(v).split("-")[0].split(".")[:3])
    except ValueError:
        return (0,)

def load(path):
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return {}

try:
    stdin = json.load(sys.stdin)
except Exception:
    stdin = {}
if ver(stdin.get("version", "")) < (2, 1, 287):
    sys.exit()
home = os.path.expanduser("~")
config_dir = os.environ.get("CLAUDE_CONFIG_DIR") or os.path.join(home, ".claude")
claude_json = os.path.join(os.environ["CLAUDE_CONFIG_DIR"], ".claude.json") if os.environ.get("CLAUDE_CONFIG_DIR") else os.path.join(home, ".claude.json")
if load(claude_json).get("cachedGrowthBookFeatures", {}).get("tengu_plugin_hooks_modules") is not True:
    sys.exit()

def has_mod(root, version):
    return ver(version) >= (1, 18, 0) and os.path.isfile(os.path.join(root, "hooks", "register.js"))

own = os.path.dirname(os.environ.get("_RS_DIR", ""))
if has_mod(own, load(os.path.join(own, ".claude-plugin", "plugin.json")).get("version", "")):
    print("yes")
    sys.exit()
folder = os.path.realpath((stdin.get("workspace") or {}).get("project_dir") or stdin.get("cwd") or os.getcwd())
enabled = load(os.path.join(config_dir, "settings.json")).get("enabledPlugins", {})
for plugin_id, entries in load(os.path.join(config_dir, "plugins", "installed_plugins.json")).get("plugins", {}).items():
    if not plugin_id.startswith("recall@") or enabled.get(plugin_id) is False:
        continue
    for e in entries if isinstance(entries, list) else []:
        here = e.get("scope") == "user" or (e.get("projectPath") and os.path.realpath(e["projectPath"]) == folder)
        if here and has_mod(e.get("installPath", ""), e.get("version", "")):
            print("yes")
            sys.exit()
' 2>/dev/null || true)"
  [[ "${_mod}" == "yes" ]] && MOD_DRAWS=true
fi

# --- Read version, API key, server URL, and previous command from config.json ---
VERSION=""
PREV_CMD=""
API_KEY=""
SERVER_URL=""
if [[ -f "${CONFIG_FILE}" ]]; then
  if command -v jq &>/dev/null; then
    VERSION="$(jq -r '.version // empty' "${CONFIG_FILE}" 2>/dev/null || true)"
    PREV_CMD="$(jq -r '.previous_statusline_cmd // empty' "${CONFIG_FILE}" 2>/dev/null || true)"
    API_KEY="$(jq -r '.api_key // empty' "${CONFIG_FILE}" 2>/dev/null || true)"
    SERVER_URL="$(jq -r '.server_url // empty' "${CONFIG_FILE}" 2>/dev/null || true)"
  elif command -v python3 &>/dev/null; then
    VERSION="$(python3 -c "import json; d=json.load(open('${CONFIG_FILE}')); print(d.get('version',''),end='')" 2>/dev/null || true)"
    PREV_CMD="$(python3 -c "import json; d=json.load(open('${CONFIG_FILE}')); print(d.get('previous_statusline_cmd',''),end='')" 2>/dev/null || true)"
    API_KEY="$(python3 -c "import json; d=json.load(open('${CONFIG_FILE}')); print(d.get('api_key',''),end='')" 2>/dev/null || true)"
    SERVER_URL="$(python3 -c "import json; d=json.load(open('${CONFIG_FILE}')); print(d.get('server_url',''),end='')" 2>/dev/null || true)"
  fi
fi
VERSION="${VERSION:-1.11.9}"
PREV_CMD="${PREV_CMD:-}"
API_KEY="${API_KEY:-}"
SERVER_URL="${SERVER_URL:-}"

# For plugin installs, plugin.json is the ground truth for the installed version.
# config.json may be stale (only updated by install.sh, not the plugin updater).
if "${IS_PLUGIN_INSTALL}"; then
  _PLUGIN_JSON="${SCRIPT_DIR}/../.claude-plugin/plugin.json"
  if [[ -f "${_PLUGIN_JSON}" ]]; then
    if command -v python3 &>/dev/null; then
      _pv="$(python3 -c "import json; d=json.load(open('${_PLUGIN_JSON}')); print(d.get('version',''),end='')" 2>/dev/null || true)"
    elif command -v jq &>/dev/null; then
      _pv="$(jq -r '.version // empty' "${_PLUGIN_JSON}" 2>/dev/null || true)"
    fi
    [[ -n "${_pv}" ]] && VERSION="${_pv}"
  fi
fi

# --- Read activity state ---
SESSION_MEMORIES=0
LAST_STORED=0
if [[ -f "${STATE_FILE}" ]]; then
  if command -v jq &>/dev/null; then
    SESSION_MEMORIES="$(jq -r '.session_memories // 0' "${STATE_FILE}" 2>/dev/null || echo 0)"
    LAST_STORED="$(jq -r '.last_stored // 0' "${STATE_FILE}" 2>/dev/null || echo 0)"
  elif command -v python3 &>/dev/null; then
    SESSION_MEMORIES="$(python3 -c "import json; d=json.load(open('${STATE_FILE}')); print(d.get('session_memories',0))" 2>/dev/null || echo 0)"
    LAST_STORED="$(python3 -c "import json; d=json.load(open('${STATE_FILE}')); print(d.get('last_stored',0))" 2>/dev/null || echo 0)"
  fi
fi
SESSION_MEMORIES="${SESSION_MEMORIES:-0}"
LAST_STORED="${LAST_STORED:-0}"

# --- Semver comparison: returns 0 if $1 is strictly newer than $2 ---
_version_newer() {
  local new_ver="$1" cur_ver="$2"
  [[ "${new_ver}" == "${cur_ver}" ]] && return 1
  local IFS='.'
  local -a na=($new_ver) ca=($cur_ver)
  for i in 0 1 2; do
    local n="${na[$i]:-0}" c="${ca[$i]:-0}"
    n="${n//[^0-9]/}"; n="${n:-0}"
    c="${c//[^0-9]/}"; c="${c:-0}"
    (( n > c )) && return 0
    (( n < c )) && return 1
  done
  return 1
}

# --- Fetch recent activity from API ---
ACTIVITY_LABEL=""
ACTIVITY_ELAPSED=""
LATEST_VERSION=""
if [[ -n "${API_KEY}" && -n "${SERVER_URL}" ]] && ! "${MOD_DRAWS}"; then
  STATUS_JSON="$(curl -sf "${SERVER_URL}/api/status" \
    -H "Authorization: Bearer ${API_KEY}" \
    --max-time 3 2>/dev/null || true)"
  if [[ -n "${STATUS_JSON}" ]]; then
    if command -v jq &>/dev/null; then
      ACTIVITY_LABEL="$(printf '%s' "${STATUS_JSON}" | jq -r '.data.label // empty' 2>/dev/null || true)"
      ACTIVITY_ELAPSED="$(printf '%s' "${STATUS_JSON}" | jq -r '.data.elapsed_s // empty' 2>/dev/null || true)"
      LATEST_VERSION="$(printf '%s' "${STATUS_JSON}" | jq -r '.data.latest_version // empty' 2>/dev/null || true)"
    elif command -v python3 &>/dev/null; then
      ACTIVITY_LABEL="$(printf '%s' "${STATUS_JSON}" | python3 -c "import json,sys; d=json.load(sys.stdin); print((d.get('data') or {}).get('label',''),end='')" 2>/dev/null || true)"
      ACTIVITY_ELAPSED="$(printf '%s' "${STATUS_JSON}" | python3 -c "import json,sys; d=json.load(sys.stdin); print((d.get('data') or {}).get('elapsed_s',''),end='')" 2>/dev/null || true)"
      LATEST_VERSION="$(printf '%s' "${STATUS_JSON}" | python3 -c "import json,sys; d=json.load(sys.stdin); print((d.get('data') or {}).get('latest_version',''),end='')" 2>/dev/null || true)"
    fi
  fi
fi

# --- Build Recall segment ---
RECALL_SEGMENT="Recall: ${VERSION}"
if [[ "${SESSION_MEMORIES}" -gt 0 ]] 2>/dev/null; then
  RECALL_SEGMENT="Recall: ${VERSION} 🧠 ${SESSION_MEMORIES}"
fi

# Append activity label if recent (< 60 seconds)
if [[ -n "${ACTIVITY_LABEL}" && -n "${ACTIVITY_ELAPSED}" ]]; then
  if [[ "${ACTIVITY_ELAPSED}" =~ ^[0-9]+$ ]] && [[ "${ACTIVITY_ELAPSED}" -lt 60 ]] 2>/dev/null; then
    if [[ "${ACTIVITY_ELAPSED}" -lt 2 ]]; then
      RECALL_SEGMENT="${RECALL_SEGMENT} · ${ACTIVITY_LABEL} (just now)"
    else
      RECALL_SEGMENT="${RECALL_SEGMENT} · ${ACTIVITY_LABEL} (${ACTIVITY_ELAPSED}s ago)"
    fi
  fi
fi

# Append update indicator if server version is newer than local
if [[ -n "${LATEST_VERSION}" ]] && _version_newer "${LATEST_VERSION}" "${VERSION}"; then
  RECALL_SEGMENT="${RECALL_SEGMENT} · ⬆ ${LATEST_VERSION} — Restart Claude Code to update."
fi

# --- Collect previous command output (if configured) ---
PREV_OUTPUT=""
if [[ -n "${PREV_CMD}" ]]; then
  # Pipe the same stdin JSON that Claude Code sent us into the previous command
  # so it gets the full session context (model, context window, etc.).
  # timeout 3: if the previous command hangs, fall through to standalone output.
  # timeout is not available on vanilla macOS (GNU coreutils required) — fall back to no timeout.
  if command -v timeout &>/dev/null; then
    PREV_OUTPUT="$(printf '%s' "${STDIN_DATA}" | timeout 3 bash -c "${PREV_CMD}" 2>/dev/null || true)"
  else
    PREV_OUTPUT="$(printf '%s' "${STDIN_DATA}" | bash -c "${PREV_CMD}" 2>/dev/null || true)"
  fi

  # Detect if the previous command returned a help/configuration message instead of
  # real status data. Pilot outputs this when it cannot detect Claude Code session
  # context (e.g. when called as a subprocess rather than directly by Claude Code).
  # Discard and fall through to standalone mode below.
  if printf '%s\n' "${PREV_OUTPUT}" | grep -q "designed to be called by Claude Code"; then
    PREV_OUTPUT=""
  fi
fi

# --- Output ---
if [[ -n "${PREV_OUTPUT}" ]]; then
  # Print previous command output (e.g. Pilot) in full, then Recall on its own line
  printf '%s\n' "${PREV_OUTPUT}"
  "${MOD_DRAWS}" || printf '%s\n' "${RECALL_SEGMENT}"
else
  # Standalone mode — Pilot not installed, unavailable, or cannot detect Claude Code
  # session context. Replicate Pilot's two-line style using the JSON Claude Code sent us.
  MODEL_NAME=""
  CONTEXT_PCT=""
  if command -v jq &>/dev/null; then
    MODEL_NAME="$(printf '%s' "${STDIN_DATA}" | jq -r '.model.display_name // empty' 2>/dev/null || true)"
    CONTEXT_PCT="$(printf '%s' "${STDIN_DATA}" | jq -r '.context_window.used_percentage // empty' 2>/dev/null || true)"
  elif command -v python3 &>/dev/null; then
    MODEL_NAME="$(printf '%s' "${STDIN_DATA}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('model',{}).get('display_name',''),end='')" 2>/dev/null || true)"
    CONTEXT_PCT="$(printf '%s' "${STDIN_DATA}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('context_window',{}).get('used_percentage',''),end='')" 2>/dev/null || true)"
  fi

  # Line 1: model name + 10-char context bar + percentage
  if [[ -n "${MODEL_NAME}" ]]; then
    if [[ -n "${CONTEXT_PCT}" ]] && [[ "${CONTEXT_PCT}" =~ ^[0-9]+$ ]]; then
      FILLED=$(( CONTEXT_PCT / 10 ))
      BAR=""
      for ((i=0; i<10; i++)); do
        if [[ $i -lt $FILLED ]]; then BAR="${BAR}▓"; else BAR="${BAR}░"; fi
      done
      printf '%s\n' "${MODEL_NAME} [${BAR}] ${CONTEXT_PCT}%"
    else
      printf '%s\n' "${MODEL_NAME}"
    fi
  fi

  # Line 2: Recall segment, unless the mod shows it above the prompt
  "${MOD_DRAWS}" || printf '%s\n' "${RECALL_SEGMENT}"
fi
