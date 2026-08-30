#!/usr/bin/env bash
# Recall stop-summarize hook
# Stores a session summary memory so the next session has an immediate
# "what was last done here" reference.
#
# Registered in settings.json under:
#   hooks.SessionEnd[].hooks[].command
#   async: true  (must not delay exit)
#   timeout: 10
#
# History: this used to fire on Stop, which is every TURN end - so a long
# session stored dozens of near-identical "Session ended" memories, each at
# importance 7 and therefore each carrying an ~11KB embedding. It now fires
# on SessionEnd at importance 3 (below the embedding threshold), and the
# summarized_memories guard below keeps even a stale Stop registration from
# storing more than once per change.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load config - silently exit if something goes wrong
# shellcheck source=lib/config.sh
source "${SCRIPT_DIR}/lib/config.sh" || exit 0

# No API key - nothing to do
[[ -z "${RECALL_API_KEY}" ]] && exit 0

STATE_FILE="${HOME}/.claude/recall/state.json"
[[ ! -f "${STATE_FILE}" ]] && exit 0

# --- Read session state -------------------------------------------------------
SESSION_NAME=""
SESSION_MEMORIES=0
LAST_STORED=0
SUMMARIZED=0

if command -v python3 &>/dev/null; then
  SESSION_NAME="$(python3 -c "import json; d=json.load(open('${STATE_FILE}')); print(d.get('session_name',''))" 2>/dev/null || true)"
  SESSION_MEMORIES="$(python3 -c "import json; d=json.load(open('${STATE_FILE}')); print(d.get('session_memories',0))" 2>/dev/null || echo 0)"
  LAST_STORED="$(python3 -c "import json; d=json.load(open('${STATE_FILE}')); print(d.get('last_stored',0))" 2>/dev/null || echo 0)"
  SUMMARIZED="$(python3 -c "import json; d=json.load(open('${STATE_FILE}')); print(d.get('summarized_memories',0))" 2>/dev/null || echo 0)"
elif command -v jq &>/dev/null; then
  SESSION_NAME="$(jq -r '.session_name // empty' "${STATE_FILE}" 2>/dev/null || true)"
  SESSION_MEMORIES="$(jq -r '.session_memories // 0' "${STATE_FILE}" 2>/dev/null || echo 0)"
  LAST_STORED="$(jq -r '.last_stored // 0' "${STATE_FILE}" 2>/dev/null || echo 0)"
  SUMMARIZED="$(jq -r '.summarized_memories // 0' "${STATE_FILE}" 2>/dev/null || echo 0)"
fi

SESSION_MEMORIES="${SESSION_MEMORIES:-0}"
SUMMARIZED="${SUMMARIZED:-0}"

# Nothing was stored this session - no meaningful summary to create
[[ "${SESSION_MEMORIES}" -eq 0 ]] && exit 0

# Already summarized this exact count - a repeat firing (e.g. a stale Stop
# registration running every turn) has nothing new to say.
[[ "${SESSION_MEMORIES}" -eq "${SUMMARIZED}" ]] && exit 0

# --- Build summary content ----------------------------------------------------
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

# --- Build JSON payload -------------------------------------------------------
# Importance 3: a bookkeeping marker, deliberately below the embedding
# threshold (4). Nobody semantically searches for "Session ended".
if command -v jq &>/dev/null; then
  PAYLOAD="$(jq -n \
    --arg content "${CONTENT}" \
    '{content: $content, context_type: "information", importance: 3, tags: ["session-summary", "auto-hook"], is_global: false}')"
elif command -v python3 &>/dev/null; then
  PAYLOAD="$(CONTENT="${CONTENT}" python3 -c "
import json, os
print(json.dumps({
  'content': os.environ['CONTENT'],
  'context_type': 'information',
  'importance': 3,
  'tags': ['session-summary', 'auto-hook'],
  'is_global': False
}))")"
else
  ESCAPED="${CONTENT//\"/\\\"}"
  PAYLOAD="{\"content\":\"${ESCAPED}\",\"context_type\":\"information\",\"importance\":3,\"tags\":[\"session-summary\",\"auto-hook\"],\"is_global\":false}"
fi

# --- POST, then record what was summarized ------------------------------------
HTTP_STATUS="$(curl \
  --silent \
  --max-time 5 \
  --output /dev/null \
  --write-out "%{http_code}" \
  --request POST \
  --header "Content-Type: application/json" \
  --header "Authorization: Bearer ${RECALL_API_KEY}" \
  --header "X-Recall-Workspace: ${RECALL_WORKSPACE}" \
  --header "X-Recall-Git-Remote: ${RECALL_GIT_REMOTE}" \
  --data "${PAYLOAD}" \
  "${RECALL_SERVER_URL}/api/memories" \
  2>/dev/null || echo "000")"

if [[ "${HTTP_STATUS}" =~ ^2 ]] && command -v python3 &>/dev/null; then
  SESSION_MEMORIES="${SESSION_MEMORIES}" STATE_FILE="${STATE_FILE}" python3 -c "
import json, os
sf = os.environ['STATE_FILE']
try:
    d = json.load(open(sf))
except Exception:
    d = {}
d['summarized_memories'] = int(os.environ['SESSION_MEMORIES'])
json.dump(d, open(sf, 'w'))
" 2>/dev/null || true
fi
