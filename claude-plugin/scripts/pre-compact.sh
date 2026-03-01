#!/usr/bin/env bash
# Recall pre-compact hook
# Saves full session state before Claude Code compacts the context window.
# Writes to two places:
#   1. ~/.claude/recall/pre-compact-state.json — read by compact-restore.sh
#      for immediate post-compaction context restoration
#   2. /api/memories — long-term storage so future sessions know a compaction
#      occurred and what was active at that point
#
# Registered in settings.json under:
#   hooks.PreCompact[].hooks[].command
#   timeout: 10

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load config — silently exit if something goes wrong
# shellcheck source=lib/config.sh
source "${SCRIPT_DIR}/lib/config.sh" || exit 0

# No API key — nothing to do
[[ -z "${RECALL_API_KEY}" ]] && exit 0

STATE_FILE="${HOME}/.claude/recall/state.json"
PRE_COMPACT_FILE="${HOME}/.claude/recall/pre-compact-state.json"

# ─── Read current session state ───────────────────────────────────────────────
SESSION_NAME=""
SESSION_MEMORIES=0
LAST_STORED=0

if [[ -f "${STATE_FILE}" ]]; then
  if command -v python3 &>/dev/null; then
    SESSION_NAME="$(python3 -c "import json; d=json.load(open('${STATE_FILE}')); print(d.get('session_name',''))" 2>/dev/null || true)"
    SESSION_MEMORIES="$(python3 -c "import json; d=json.load(open('${STATE_FILE}')); print(d.get('session_memories',0))" 2>/dev/null || echo 0)"
    LAST_STORED="$(python3 -c "import json; d=json.load(open('${STATE_FILE}')); print(d.get('last_stored',0))" 2>/dev/null || echo 0)"
  elif command -v jq &>/dev/null; then
    SESSION_NAME="$(jq -r '.session_name // empty' "${STATE_FILE}" 2>/dev/null || true)"
    SESSION_MEMORIES="$(jq -r '.session_memories // 0' "${STATE_FILE}" 2>/dev/null || echo 0)"
    LAST_STORED="$(jq -r '.last_stored // 0' "${STATE_FILE}" 2>/dev/null || echo 0)"
  fi
fi

SESSION_MEMORIES="${SESSION_MEMORIES:-0}"
LAST_STORED="${LAST_STORED:-0}"
NOW="$(date +%s 2>/dev/null || echo 0)"
CWD_PATH="$(pwd)"

# ─── Write local state file for compact-restore.sh ────────────────────────────
if command -v python3 &>/dev/null; then
  SESSION_NAME="${SESSION_NAME}" SESSION_MEMORIES="${SESSION_MEMORIES}" \
  LAST_STORED="${LAST_STORED}" NOW="${NOW}" \
  WORKSPACE="${RECALL_WORKSPACE}" CWD_PATH="${CWD_PATH}" \
  GIT_REMOTE="${RECALL_GIT_REMOTE}" PRE_COMPACT_FILE="${PRE_COMPACT_FILE}" \
  python3 -c "
import json, os
data = {
  'session_name':     os.environ.get('SESSION_NAME', ''),
  'session_memories': int(os.environ.get('SESSION_MEMORIES', 0) or 0),
  'last_stored':      int(os.environ.get('LAST_STORED', 0) or 0),
  'timestamp':        int(os.environ.get('NOW', 0) or 0),
  'workspace':        os.environ.get('WORKSPACE', ''),
  'cwd':              os.environ.get('CWD_PATH', ''),
  'git_remote':       os.environ.get('GIT_REMOTE', ''),
}
json.dump(data, open(os.environ['PRE_COMPACT_FILE'], 'w'))
" 2>/dev/null || true
elif command -v jq &>/dev/null; then
  jq -n \
    --arg  session_name     "${SESSION_NAME}" \
    --argjson session_memories "${SESSION_MEMORIES:-0}" \
    --argjson last_stored   "${LAST_STORED:-0}" \
    --argjson timestamp     "${NOW:-0}" \
    --arg  workspace        "${RECALL_WORKSPACE}" \
    --arg  cwd              "${CWD_PATH}" \
    --arg  git_remote       "${RECALL_GIT_REMOTE}" \
    '{session_name: $session_name, session_memories: $session_memories, last_stored: $last_stored, timestamp: $timestamp, workspace: $workspace, cwd: $cwd, git_remote: $git_remote}' \
    > "${PRE_COMPACT_FILE}" 2>/dev/null || true
fi

# ─── Store memory with richer content ─────────────────────────────────────────
CONTENT="Pre-compact checkpoint. Session: ${SESSION_NAME:-unknown}. Project: ${RECALL_GIT_REMOTE:-${RECALL_WORKSPACE}}. Memories this session: ${SESSION_MEMORIES}. CWD: ${CWD_PATH}."

if command -v jq &>/dev/null; then
  PAYLOAD="$(jq -n \
    --arg content "${CONTENT}" \
    '{content: $content, context_type: "information", importance: 6, tags: ["auto-hook", "pre-compact"], is_global: false}')"
elif command -v python3 &>/dev/null; then
  PAYLOAD="$(CONTENT="${CONTENT}" python3 -c "
import json, os
print(json.dumps({
  'content':      os.environ['CONTENT'],
  'context_type': 'information',
  'importance':   6,
  'tags':         ['auto-hook', 'pre-compact'],
  'is_global':    False
}))")"
else
  ESCAPED="${CONTENT//\"/\\\"}"
  PAYLOAD="{\"content\":\"${ESCAPED}\",\"context_type\":\"information\",\"importance\":6,\"tags\":[\"auto-hook\",\"pre-compact\"],\"is_global\":false}"
fi

curl \
  --silent \
  --max-time 5 \
  --output /dev/null \
  --request POST \
  --header "Content-Type: application/json" \
  --header "Authorization: Bearer ${RECALL_API_KEY}" \
  --header "X-Recall-Workspace: ${RECALL_WORKSPACE}" \
  --header "X-Recall-Git-Remote: ${RECALL_GIT_REMOTE}" \
  --data "${PAYLOAD}" \
  "${RECALL_SERVER_URL}/api/memories" \
  2>/dev/null || true
