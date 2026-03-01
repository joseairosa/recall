#!/usr/bin/env bash
# Recall stop-summarize hook
# Fires on Stop (async) — stores a session summary memory so the next session
# has an immediate "what was last done here" reference.
#
# Registered in settings.json under:
#   hooks.Stop[].hooks[].command
#   async: true  (must not delay exit)
#   timeout: 10

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load config — silently exit if something goes wrong
# shellcheck source=lib/config.sh
source "${SCRIPT_DIR}/lib/config.sh" || exit 0

# No API key — nothing to do
[[ -z "${RECALL_API_KEY}" ]] && exit 0

STATE_FILE="${HOME}/.claude/recall/state.json"
[[ ! -f "${STATE_FILE}" ]] && exit 0

# ─── Read session state ────────────────────────────────────────────────────────
SESSION_NAME=""
SESSION_MEMORIES=0
LAST_STORED=0

if command -v python3 &>/dev/null; then
  SESSION_NAME="$(python3 -c "import json; d=json.load(open('${STATE_FILE}')); print(d.get('session_name',''))" 2>/dev/null || true)"
  SESSION_MEMORIES="$(python3 -c "import json; d=json.load(open('${STATE_FILE}')); print(d.get('session_memories',0))" 2>/dev/null || echo 0)"
  LAST_STORED="$(python3 -c "import json; d=json.load(open('${STATE_FILE}')); print(d.get('last_stored',0))" 2>/dev/null || echo 0)"
elif command -v jq &>/dev/null; then
  SESSION_NAME="$(jq -r '.session_name // empty' "${STATE_FILE}" 2>/dev/null || true)"
  SESSION_MEMORIES="$(jq -r '.session_memories // 0' "${STATE_FILE}" 2>/dev/null || echo 0)"
  LAST_STORED="$(jq -r '.last_stored // 0' "${STATE_FILE}" 2>/dev/null || echo 0)"
fi

SESSION_MEMORIES="${SESSION_MEMORIES:-0}"

# Nothing was stored this session — no meaningful summary to create
[[ "${SESSION_MEMORIES}" -eq 0 ]] && exit 0

# ─── Build summary content ────────────────────────────────────────────────────
NOW="$(date +%s 2>/dev/null || echo 0)"
SESSION_LABEL="${SESSION_NAME:-unknown}"
PROJECT_LABEL="${RECALL_GIT_REMOTE:-${RECALL_WORKSPACE}}"

CONTENT="Session ended: ${SESSION_LABEL}. Project: ${PROJECT_LABEL}. Stored ${SESSION_MEMORIES} memories this session."

if (( LAST_STORED > 0 && NOW > 0 )); then
  ELAPSED=$(( NOW - LAST_STORED ))
  if (( ELAPSED < 3600 )); then
    CONTENT="${CONTENT} Last activity ${ELAPSED}s before exit."
  fi
fi

# ─── Build JSON payload ────────────────────────────────────────────────────────
if command -v jq &>/dev/null; then
  PAYLOAD="$(jq -n \
    --arg content "${CONTENT}" \
    '{content: $content, context_type: "information", importance: 7, tags: ["session-summary", "auto-hook"], is_global: false}')"
elif command -v python3 &>/dev/null; then
  PAYLOAD="$(CONTENT="${CONTENT}" python3 -c "
import json, os
print(json.dumps({
  'content': os.environ['CONTENT'],
  'context_type': 'information',
  'importance': 7,
  'tags': ['session-summary', 'auto-hook'],
  'is_global': False
}))")"
else
  ESCAPED="${CONTENT//\"/\\\"}"
  PAYLOAD="{\"content\":\"${ESCAPED}\",\"context_type\":\"information\",\"importance\":7,\"tags\":[\"session-summary\",\"auto-hook\"],\"is_global\":false}"
fi

# ─── POST — fire-and-forget ───────────────────────────────────────────────────
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
