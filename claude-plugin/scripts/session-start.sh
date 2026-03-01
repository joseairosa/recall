#!/usr/bin/env bash
# Recall session-start hook
# Fetches formatted memory context from Recall and prints to stdout.
# Claude Code injects stdout from SessionStart hooks into the conversation context.
#
# Registered in settings.json under:
#   hooks.SessionStart[].hooks[].command
#   matcher: "startup|clear|compact"
#   timeout: 10

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Detect if running from a Claude Code plugin install vs curl|bash install.
# Plugin: scripts live in ~/.claude/plugins/recall/scripts/
# curl|bash: scripts live in ~/.claude/recall/hooks/
IS_PLUGIN_INSTALL=false
[[ "${SCRIPT_DIR}" == *"/plugins/"* ]] && IS_PLUGIN_INSTALL=true

# ─── Install rules file (plugin mode only) ────────────────────────────────────
# Copies plugin/recall/rules/recall.md → ~/.claude/rules/recall.md so Claude
# always has Recall's always-on directives injected into every session.
if "${IS_PLUGIN_INSTALL}"; then
  _RULES_SRC="${SCRIPT_DIR}/../rules/recall.md"
  _RULES_DST="${HOME}/.claude/rules/recall.md"
  if [[ -f "${_RULES_SRC}" ]]; then
    mkdir -p "${HOME}/.claude/rules" 2>/dev/null || true
    cp "${_RULES_SRC}" "${_RULES_DST}" 2>/dev/null || true
  fi
fi

# ─── Register observe hook in settings.json (plugin mode only) ───────────────
# Claude Code does not auto-activate PostToolUse hooks defined in a plugin's
# hooks.json — they must be present in ~/.claude/settings.json to fire.
# This block is idempotent: it only adds the entry if it is not already there.
if "${IS_PLUGIN_INSTALL}" && command -v python3 &>/dev/null; then
  python3 - <<'PYEOF' 2>/dev/null || true
import json, os

settings_path = os.path.expanduser("~/.claude/settings.json")
try:
    with open(settings_path) as f:
        settings = json.load(f)
except Exception:
    settings = {}

for event in ("PostToolUse", "SessionStart", "PreCompact", "Stop"):
    settings.setdefault("hooks", {}).setdefault(event, [])

base = 'bash "${HOME}/.claude/plugins/recall/scripts/'

def present(event, cmd):
    return any(
        any(h.get("command", "") == cmd for h in e.get("hooks", []))
        for e in settings["hooks"][event]
    )

changed = False

if not present("PostToolUse", base + 'observe.sh"'):
    settings["hooks"]["PostToolUse"].append({
        "matcher": "Write|Edit|MultiEdit|Task|Bash",
        "hooks": [{"type": "command", "command": base + 'observe.sh"', "async": True, "timeout": 10}]
    })
    changed = True

if not present("SessionStart", base + 'session-start.sh"'):
    settings["hooks"]["SessionStart"].append({
        "hooks": [{"type": "command", "command": base + 'session-start.sh"', "timeout": 15}]
    })
    changed = True

if not present("PreCompact", base + 'pre-compact.sh"'):
    settings["hooks"]["PreCompact"].append({
        "hooks": [{"type": "command", "command": base + 'pre-compact.sh"', "timeout": 15}]
    })
    changed = True

if not present("Stop", base + 'session-end.sh"'):
    settings["hooks"]["Stop"].append({
        "hooks": [{"type": "command", "command": base + 'session-end.sh"', "async": True, "timeout": 10}]
    })
    changed = True

if not present("Stop", base + 'stop.sh"'):
    settings["hooks"]["Stop"].append({
        "hooks": [{"type": "command", "command": base + 'stop.sh"', "timeout": 5}]
    })
    changed = True

if changed:
    with open(settings_path, "w") as f:
        json.dump(settings, f, indent=2)
PYEOF
fi

# Load config — silently exit if something goes wrong
# shellcheck source=lib/config.sh
source "${SCRIPT_DIR}/lib/config.sh" || exit 0

# No API key — nothing to do
[[ -z "${RECALL_API_KEY}" ]] && exit 0

# ─── Pure-bash semver comparison: returns 0 if $1 is strictly newer than $2 ──
_recall_version_newer() {
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

# ─── Read installed version from config.json ──────────────────────────────────
CONFIG_FILE="${HOME}/.claude/recall/config.json"
INSTALLED_VERSION="1.0.0"
if [[ -f "${CONFIG_FILE}" ]]; then
  if command -v jq &>/dev/null; then
    INSTALLED_VERSION="$(jq -r '.version // empty' "${CONFIG_FILE}" 2>/dev/null || true)"
  elif command -v python3 &>/dev/null; then
    INSTALLED_VERSION="$(python3 -c "import json; d=json.load(open('${CONFIG_FILE}')); print(d.get('version',''))" 2>/dev/null || true)"
  fi
fi
INSTALLED_VERSION="${INSTALLED_VERSION:-1.0.0}"

# For plugin installs, plugin.json is the ground truth for the installed version.
# config.json may not exist (user never ran install.sh) so it would default to 1.0.0.
# Self-heal: if the running script is newer than plugin.json (e.g. background update
# downloaded new scripts but plugin.json write failed), update plugin.json immediately
# so version detection is always accurate. SCRIPT_VERSION must match every release.
SCRIPT_VERSION="1.15.11"
if "${IS_PLUGIN_INSTALL}"; then
  _PLUGIN_JSON="${SCRIPT_DIR}/../.claude-plugin/plugin.json"
  if [[ -f "${_PLUGIN_JSON}" ]]; then
    if command -v python3 &>/dev/null; then
      _pv="$(python3 -c "import json; d=json.load(open('${_PLUGIN_JSON}')); print(d.get('version',''))" 2>/dev/null || true)"
    elif command -v jq &>/dev/null; then
      _pv="$(jq -r '.version // empty' "${_PLUGIN_JSON}" 2>/dev/null || true)"
    fi
    [[ -n "${_pv}" ]] && INSTALLED_VERSION="${_pv}"
    # Self-heal: update plugin.json if the running script is newer than what it records
    if _recall_version_newer "${SCRIPT_VERSION}" "${INSTALLED_VERSION}"; then
      if command -v python3 &>/dev/null; then
        _NV="${SCRIPT_VERSION}" _PJ="${_PLUGIN_JSON}" python3 -c "
import json, os
pj = os.environ['_PJ']; v = os.environ['_NV']
try:
    d = json.load(open(pj)); d['version'] = v; json.dump(d, open(pj, 'w'), indent=2)
except Exception: pass
" 2>/dev/null || true
      elif command -v jq &>/dev/null; then
        _tmp="$(jq --arg v "${SCRIPT_VERSION}" '.version = $v' "${_PLUGIN_JSON}" 2>/dev/null || true)"
        [[ -n "${_tmp}" ]] && echo "${_tmp}" > "${_PLUGIN_JSON}" || true
      fi
      INSTALLED_VERSION="${SCRIPT_VERSION}"
    fi
  fi
fi

# ─── State file (shared with observe.sh) ─────────────────────────────────────
STATE_FILE="${HOME}/.claude/recall/state.json"

# ─── Update check (every session, synchronous, 2s timeout) ───────────────────
# Runs on every session start so updates are picked up immediately after deploy.
# The 2s max-time is the only throttle needed — if the server is unreachable the
# check is a no-op and the session continues normally.
NOW_EPOCH="$(date +%s 2>/dev/null || echo 0)"

REMOTE_VERSION=""
REMOTE_CHANGELOG=""
if true; then
  REMOTE_JSON="$(curl --silent --max-time 2 --fail "${RECALL_SERVER_URL}/hooks/version?since=${INSTALLED_VERSION}" 2>/dev/null || true)"
  # Parse version and changelog only when we got a response
  if [[ -n "${REMOTE_JSON}" ]]; then
    if command -v python3 &>/dev/null; then
      REMOTE_VERSION="$(echo "${REMOTE_JSON}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('version',''))" 2>/dev/null || true)"
      REMOTE_CHANGELOG="$(echo "${REMOTE_JSON}" | python3 -c "
import json, sys
d = json.load(sys.stdin)
lines = d.get('data', {}).get('changelog', [])
print('\n'.join('  • ' + l for l in lines))
" 2>/dev/null || true)"
    elif command -v jq &>/dev/null; then
      REMOTE_VERSION="$(echo "${REMOTE_JSON}" | jq -r '.data.version // empty' 2>/dev/null || true)"
      REMOTE_CHANGELOG="$(echo "${REMOTE_JSON}" | jq -r '(.data.changelog // []) | map("  • " + .) | join("\n")' 2>/dev/null || true)"
    fi
  fi
  # Always write last_update_check (even on curl failure) so next session skips the 2s check.
  # Only touch available_version when REMOTE_VERSION is non-empty (curl succeeded).
  if command -v python3 &>/dev/null; then
    REMOTE_VERSION="${REMOTE_VERSION}" INSTALLED_VERSION="${INSTALLED_VERSION}" NOW_EPOCH="${NOW_EPOCH}" STATE_FILE="${STATE_FILE}" \
    python3 -c "
import json, os
sf = os.environ.get('STATE_FILE', os.path.expanduser('~/.claude/recall/state.json'))
try:
    d = json.load(open(sf))
except Exception:
    d = {}
d['last_update_check'] = int(os.environ['NOW_EPOCH'])
rv = os.environ.get('REMOTE_VERSION', '')
iv = os.environ.get('INSTALLED_VERSION', '1.0.0')
if rv:
    try:
        rv_parts = [int(x) for x in rv.split('.') if x]
        iv_parts = [int(x) for x in iv.split('.') if x]
        if rv_parts and rv_parts > iv_parts:
            d['available_version'] = rv
        elif 'available_version' in d:
            del d['available_version']
    except Exception:
        pass
json.dump(d, open(sf, 'w'))
" 2>/dev/null || true
  elif command -v jq &>/dev/null; then
    if [[ -f "${STATE_FILE}" ]]; then
      TMP="$(jq --argjson luc "${NOW_EPOCH}" --arg rv "${REMOTE_VERSION}" --arg iv "${INSTALLED_VERSION}" '
        . + {last_update_check: $luc} |
        if ($rv | length) > 0
        then (
          if (($rv | split(".") | map(tonumber)) > ($iv | split(".") | map(tonumber)))
          then . + {available_version: $rv}
          else del(.available_version)
          end
        )
        else .
        end
      ' "${STATE_FILE}" 2>/dev/null || true)"
    else
      TMP="{\"last_update_check\":${NOW_EPOCH}}"
    fi
    [[ -n "${TMP}" ]] && echo "${TMP}" > "${STATE_FILE}" || true
  fi
fi

# ─── Read auto_update preference from config.json (default: true) ────────────
# Env var RECALL_AUTO_UPDATE=false takes precedence over config.json.
AUTO_UPDATE="true"
if [[ -f "${CONFIG_FILE}" ]]; then
  if command -v jq &>/dev/null; then
    _au="$(jq -r '.auto_update // empty' "${CONFIG_FILE}" 2>/dev/null || true)"
    [[ "${_au}" == "false" ]] && AUTO_UPDATE="false"
  elif command -v python3 &>/dev/null; then
    _au="$(python3 -c "import json; d=json.load(open('${CONFIG_FILE}')); print(d.get('auto_update',''))" 2>/dev/null || true)"
    [[ "${_au}" == "False" || "${_au}" == "false" ]] && AUTO_UPDATE="false"
  fi
fi
# Env var override — takes precedence over config.json
[[ "${RECALL_AUTO_UPDATE:-}" == "false" ]] && AUTO_UPDATE="false"

# ─── Auto-update if a newer version was detected ─────────────────────────────
# REMOTE_VERSION is set above when the daily check ran and found a new version.
# AVAILABLE_VERSION is the fallback from a previous session's check.
AVAILABLE_VERSION="${REMOTE_VERSION}"
if [[ -z "${AVAILABLE_VERSION}" ]] && [[ -f "${STATE_FILE}" ]]; then
  if command -v jq &>/dev/null; then
    AVAILABLE_VERSION="$(jq -r '.available_version // empty' "${STATE_FILE}" 2>/dev/null || true)"
  elif command -v python3 &>/dev/null; then
    AVAILABLE_VERSION="$(python3 -c "import json; d=json.load(open('${STATE_FILE}')); print(d.get('available_version',''))" 2>/dev/null || true)"
  fi
fi
if [[ -n "${AVAILABLE_VERSION}" ]] && _recall_version_newer "${AVAILABLE_VERSION}" "${INSTALLED_VERSION}"; then
  echo ""
  echo "> 🔄 Recall update: ${INSTALLED_VERSION} → ${AVAILABLE_VERSION}"
  if [[ -n "${REMOTE_CHANGELOG}" ]]; then
    echo ">"
    echo "> What's new:"
    echo "${REMOTE_CHANGELOG}" | while IFS= read -r line; do echo ">$line"; done
  fi
  echo ">"
  if "${IS_PLUGIN_INSTALL}"; then
    if [[ "${AUTO_UPDATE}" == "false" ]]; then
      echo "> Auto-update is disabled. To update manually:"
      echo ">   /plugin install recall"
    else
      # Plugin mode: download updated scripts directly into SCRIPT_DIR in the background.
      # This makes plugin updates seamless — no user action required beyond restarting.
      UPDATE_LOG="${HOME}/.claude/recall/update.log"
      _PLUGIN_JSON="${SCRIPT_DIR}/../.claude-plugin/plugin.json"
      _NEW_VERSION="${AVAILABLE_VERSION}"
      (
        _ok=true
        for _sf in session-start.sh observe.sh statusline.sh stop.sh stop-summarize.sh pre-compact.sh compact-restore.sh session-end.sh; do
          curl -fsSL --max-time 10 "${RECALL_SERVER_URL}/hooks/file/${_sf}" \
            -o "${SCRIPT_DIR}/${_sf}" 2>/dev/null \
            && chmod +x "${SCRIPT_DIR}/${_sf}" 2>/dev/null \
            || { _ok=false; break; }
        done
        if "${_ok}"; then
          mkdir -p "${SCRIPT_DIR}/lib"
          curl -fsSL --max-time 10 "${RECALL_SERVER_URL}/hooks/file/lib/config.sh" \
            -o "${SCRIPT_DIR}/lib/config.sh" 2>/dev/null \
            && chmod +x "${SCRIPT_DIR}/lib/config.sh" 2>/dev/null \
            || _ok=false
        fi
        # Download rules file (markdown, no chmod needed; failure is non-fatal)
        if "${_ok}"; then
          mkdir -p "${SCRIPT_DIR}/../rules" 2>/dev/null || true
          curl -fsSL --max-time 10 "${RECALL_SERVER_URL}/hooks/file/rules/recall.md" \
            -o "${SCRIPT_DIR}/../rules/recall.md" 2>/dev/null || true
        fi
        if "${_ok}" && [[ -f "${_PLUGIN_JSON}" ]]; then
          if command -v python3 &>/dev/null; then
            _NV="${_NEW_VERSION}" _PJ="${_PLUGIN_JSON}" python3 -c "
import json, os
pj = os.environ['_PJ']; v = os.environ['_NV']
try:
    d = json.load(open(pj)); d['version'] = v; json.dump(d, open(pj, 'w'), indent=2)
except Exception: pass
" 2>/dev/null || true
          elif command -v jq &>/dev/null; then
            _tmp="$(jq --arg v "${_NEW_VERSION}" '.version = $v' "${_PLUGIN_JSON}" 2>/dev/null || true)"
            [[ -n "${_tmp}" ]] && echo "${_tmp}" > "${_PLUGIN_JSON}" || true
          fi
        fi
      ) > "${UPDATE_LOG}" 2>&1 &
      disown $! 2>/dev/null || true
      echo "> Updating in background — restart Claude Code once complete."
      echo "> To disable auto-update: set RECALL_AUTO_UPDATE=false in your shell profile"
      echo ">   or set auto_update: false in ~/.claude/recall/config.json"
    fi
  elif [[ "${AUTO_UPDATE}" == "false" ]]; then
    echo "> Auto-update is disabled. To update manually, run: /recall-update"
    echo ">   or: curl -fsSL ${RECALL_SERVER_URL}/install-hooks | bash -s -- --api-key \${RECALL_API_KEY}"
  else
    # Auto-update hooks in the background so the hook completes within its timeout.
    # install.sh is idempotent and safe to re-run.
    UPDATE_LOG="${HOME}/.claude/recall/update.log"
    (
      curl -fsSL --max-time 30 "${RECALL_SERVER_URL}/install-hooks" \
        | bash -s -- --api-key "${RECALL_API_KEY}" --server-url "${RECALL_SERVER_URL}"
    ) > "${UPDATE_LOG}" 2>&1 &
    disown $! 2>/dev/null || true
    echo "> Updating in background — restart Claude Code once complete."
    echo "> To disable auto-update: set RECALL_AUTO_UPDATE=false in your shell profile"
    echo ">   or set auto_update: false in ~/.claude/recall/config.json"
  fi
  echo ""
fi

# Reset session counter and generate a unique session name in state.json
# The session name (e.g. "happy-dog") identifies this Claude Code instance
# in the session registry so events can be routed to it specifically.
if command -v python3 &>/dev/null; then
  SESSION_NAME="$(python3 -c "
import json, os, random

ADJECTIVES = [
  'happy','lucky','brave','calm','eager','fancy','gentle','jolly',
  'kind','lively','merry','neat','proud','quiet','shiny','swift',
  'vivid','witty','zesty','bold','crisp','daring','electric','fuzzy',
  'golden','honest','icy','jazzy','keen','leafy','mighty','noble',
  'orange','peppy','quirky','rosy','savvy','tidy','ultra','vibrant',
  'warm','xenial','youthful','zealous','agile','bright','cosmic',
  'dazzling','earnest','fearless','graceful','humble','iconic',
]
ANIMALS = [
  'dog','cat','fox','owl','bear','deer','duck','frog','goat','hawk',
  'ibis','jay','kiwi','lamb','lynx','mole','newt','orca','pony',
  'quail','raven','seal','toad','vole','wren','yak','zebu','bison',
  'crane','dove','elk','finch','gnu','heron','iguana','jaguar',
  'koala','lemur','mink','narwhal','ocelot','panda','rabbit',
  'sloth','tapir','urial','viper','walrus','xerus','yapok',
]

adj = random.choice(ADJECTIVES)
animal = random.choice(ANIMALS)
print(f'{adj}-{animal}')
" 2>/dev/null || echo "recall-session")"
  python3 -c "
import json, os
sf = '${STATE_FILE}'
try:
    d = json.load(open(sf))
except Exception:
    d = {}
d['session_memories'] = 0
d['session_name'] = '${SESSION_NAME}'
json.dump(d, open(sf, 'w'))
" 2>/dev/null || true
elif command -v jq &>/dev/null; then
  SESSION_NAME="$(python3 -c "import random; a=['happy','lucky','brave','calm','eager']; n=['dog','cat','fox','owl','bear']; print(random.choice(a)+'-'+random.choice(n))" 2>/dev/null || echo "recall-session")"
  if [[ -f "${STATE_FILE}" ]]; then
    TMP="$(jq --arg sn "${SESSION_NAME}" '.session_memories = 0 | .session_name = $sn' "${STATE_FILE}" 2>/dev/null || true)"
  else
    TMP="{\"session_memories\":0,\"session_name\":\"${SESSION_NAME}\"}"
  fi
  [[ -n "${TMP}" ]] && echo "${TMP}" > "${STATE_FILE}" || true
fi

# ─── Register session with Recall server ─────────────────────────────────────
# Fire-and-forget: best-effort registration; if it fails the session still works.
if [[ -n "${SESSION_NAME:-}" && -n "${RECALL_API_KEY:-}" ]]; then
  SESSION_ID="$(python3 -c "import os; print(os.urandom(8).hex())" 2>/dev/null || echo "$$")"
  (curl --silent --max-time 3 --fail \
    --request POST \
    --header "Authorization: Bearer ${RECALL_API_KEY}" \
    --header "Content-Type: application/json" \
    --data "{\"name\":\"${SESSION_NAME}\",\"session_id\":\"${SESSION_ID}\",\"workspace_path\":\"${RECALL_WORKSPACE:-}\",\"git_remote\":\"${RECALL_GIT_REMOTE:-}\"}" \
    "${RECALL_SERVER_URL}/api/sessions" \
  ) > /dev/null 2>&1 &
  disown $! 2>/dev/null || true
fi

# ─── Fetch context and print activity indicator ────────────────────────────────
# Capture context first so we can show the banner even when context is empty.
CONTEXT="$(curl \
  --silent \
  --max-time 5 \
  --fail \
  --header "Authorization: Bearer ${RECALL_API_KEY}" \
  --header "X-Recall-Workspace: ${RECALL_WORKSPACE}" \
  --header "X-Recall-Git-Remote: ${RECALL_GIT_REMOTE}" \
  "${RECALL_SERVER_URL}/api/context?limit=20" \
  2>/dev/null || true)"

# Always print the activity indicator so users can confirm Recall is running.
echo "> 🧠 Recall ${INSTALLED_VERSION} active"

if [[ -n "${CONTEXT}" ]]; then
  echo ">"
  printf '%s\n' "${CONTEXT}"
fi
