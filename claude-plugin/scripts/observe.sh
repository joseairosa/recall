#!/usr/bin/env bash
# Recall observe hook (PostToolUse)
# Reads Claude Code tool event from stdin, POSTs Bash FAILURES to Recall.
#
# Policy (2026-08-30): errors + digest only. Per-call capture of
# Read/Grep/Glob/Write/Edit/Bash-success produced 99% of stored memories
# (561k records, 8.5GB) while being retrieved essentially never, and it
# crowded real memories out of every search. A failing command is the one
# tool event worth remembering; the session digest lives in
# stop-summarize.sh.
#
# Registered in settings.json under:
#   hooks.PostToolUse[].hooks[].command
#   matcher: "Bash"
#   async: true  (non-blocking - Claude does not wait for this hook)
#   timeout: 10

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load config - silently exit if something goes wrong
# shellcheck source=lib/config.sh
source "${SCRIPT_DIR}/lib/config.sh" || exit 0

# No API key - nothing to do
[[ -z "${RECALL_API_KEY}" ]] && exit 0

# Read JSON from stdin (Claude Code passes {"tool_name","tool_input","tool_response"})
STDIN_DATA="$(cat)"

# Extract tool_name
if command -v jq &>/dev/null; then
  TOOL_NAME="$(echo "${STDIN_DATA}" | jq -r '.tool_name // empty' 2>/dev/null || true)"
elif command -v python3 &>/dev/null; then
  TOOL_NAME="$(echo "${STDIN_DATA}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('tool_name',''))" 2>/dev/null || true)"
else
  TOOL_NAME="$(echo "${STDIN_DATA}" | grep -o '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"tool_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' || true)"
fi

# Only Bash failures are captured. Everything else is noise at storage time.
[[ "${TOOL_NAME}" != "Bash" ]] && exit 0

# Extract the command
if command -v jq &>/dev/null; then
  COMMAND="$(echo "${STDIN_DATA}" | jq -r '.tool_input.command // empty' 2>/dev/null || true)"
elif command -v python3 &>/dev/null; then
  COMMAND="$(echo "${STDIN_DATA}" | python3 -c "import json,sys; d=json.load(sys.stdin); print((d.get('tool_input') or {}).get('command',''))" 2>/dev/null || true)"
else
  COMMAND=""
fi
[[ -z "${COMMAND}" ]] && exit 0

# Detect failure from tool output. No failure -> nothing to store.
TOOL_OUTPUT=""
if command -v python3 &>/dev/null; then
  TOOL_OUTPUT="$(echo "${STDIN_DATA}" | python3 -c "
import json, sys
try:
  d = json.load(sys.stdin)
  # Claude Code may use 'tool_response' or 'tool_output' depending on version
  r = d.get('tool_response') or d.get('tool_output', '')
  if isinstance(r, dict):
    out = r.get('stderr', '') or r.get('stdout', '') or ''
  else:
    out = str(r)
  print(out[:500])
except Exception:
  print('')
" 2>/dev/null || true)"
elif command -v jq &>/dev/null; then
  TOOL_OUTPUT="$(echo "${STDIN_DATA}" | jq -r \
    '(.tool_response // .tool_output // "") | if type == "object" then (.stderr // .stdout // "") else . end | .[:500]' \
    2>/dev/null || true)"
fi

if [[ -z "${TOOL_OUTPUT}" ]] || ! echo "${TOOL_OUTPUT}" | grep -qiE '(^error:|npm ERR!|FAILED|command not found|non-zero exit|exit code [1-9])'; then
  exit 0
fi

# A failed command plus its output excerpt - enough context to be findable
# and useful later, unlike a bare command line.
OBSERVATION_CONTENT="[Bash error] ${COMMAND:0:200}
Output: ${TOOL_OUTPUT:0:300}"
IMPORTANCE=6

# Build JSON payload
if command -v jq &>/dev/null; then
  PAYLOAD="$(jq -n \
    --arg content "${OBSERVATION_CONTENT}" \
    --argjson importance "${IMPORTANCE}" \
    '{content: $content, context_type: "information", importance: $importance, tags: ["auto-hook", "bash", "error"], is_global: false}')"
elif command -v python3 &>/dev/null; then
  PAYLOAD="$(OBSERVATION_CONTENT="${OBSERVATION_CONTENT}" IMPORTANCE="${IMPORTANCE}" python3 -c "
import json, os
print(json.dumps({
  'content':      os.environ['OBSERVATION_CONTENT'],
  'context_type': 'information',
  'importance':   int(os.environ.get('IMPORTANCE', 6)),
  'tags':         ['auto-hook', 'bash', 'error'],
  'is_global':    False
}))")"
else
  # Minimal JSON construction - escape quotes and newlines in content
  ESCAPED="${OBSERVATION_CONTENT//\"/\\\"}"
  ESCAPED="${ESCAPED//$'\n'/\\n}"
  PAYLOAD="{\"content\":\"${ESCAPED}\",\"context_type\":\"information\",\"importance\":${IMPORTANCE},\"tags\":[\"auto-hook\",\"bash\",\"error\"],\"is_global\":false}"
fi

# POST observation - fire-and-forget, ignore errors
# Capture HTTP status code to conditionally update local state
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

# On success (2xx), update local state file for statusline activity indicator
if [[ "${HTTP_STATUS}" =~ ^2 ]]; then
  STATE_FILE="${HOME}/.claude/recall/state.json"
  NOW="$(date +%s 2>/dev/null || echo 0)"
  COUNT=1
  if [[ -f "${STATE_FILE}" ]]; then
    if command -v jq &>/dev/null; then
      COUNT="$(jq -r '.session_memories // 0' "${STATE_FILE}" 2>/dev/null || echo 0)"
      COUNT=$(( COUNT + 1 ))
    elif command -v python3 &>/dev/null; then
      COUNT="$(python3 -c "import json; d=json.load(open('${STATE_FILE}')); print(d.get('session_memories',0)+1)" 2>/dev/null || echo 1)"
    fi
  fi
  if command -v python3 &>/dev/null; then
    NOW="${NOW}" COUNT="${COUNT}" STATE_FILE="${STATE_FILE}" python3 -c "
import json, os
sf = os.environ.get('STATE_FILE', os.path.expanduser('~/.claude/recall/state.json'))
try:
    d = json.load(open(sf))
except Exception:
    d = {}
d['last_stored'] = int(os.environ['NOW'])
d['session_memories'] = int(os.environ['COUNT'])
json.dump(d, open(sf, 'w'))
" 2>/dev/null || true
  elif command -v jq &>/dev/null; then
    if [[ -f "${STATE_FILE}" ]]; then
      TMP="$(jq --argjson ls "${NOW}" --argjson sm "${COUNT}" \
        '. + {last_stored: $ls, session_memories: $sm}' "${STATE_FILE}" 2>/dev/null || true)"
    else
      TMP="{\"last_stored\":${NOW},\"session_memories\":${COUNT}}"
    fi
    [[ -n "${TMP}" ]] && echo "${TMP}" > "${STATE_FILE}" || true
  fi
fi
