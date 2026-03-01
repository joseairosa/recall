#!/usr/bin/env bash
# Recall observe hook (PostToolUse)
# Reads Claude Code tool event from stdin, selectively POSTs observations to Recall.
#
# Registered in settings.json under:
#   hooks.PostToolUse[].hooks[].command
#   matcher: "Write|Edit|MultiEdit|Task|Bash"
#   async: true  (non-blocking — Claude does not wait for this hook)
#   timeout: 10

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load config — silently exit if something goes wrong
# shellcheck source=lib/config.sh
source "${SCRIPT_DIR}/lib/config.sh" || exit 0

# No API key — nothing to do
[[ -z "${RECALL_API_KEY}" ]] && exit 0

# Read JSON from stdin (Claude Code passes {"tool_name","tool_input","tool_response"})
STDIN_DATA="$(cat)"

# Extract tool_name and tool_input
if command -v jq &>/dev/null; then
  TOOL_NAME="$(echo "${STDIN_DATA}" | jq -r '.tool_name // empty' 2>/dev/null || true)"
  TOOL_INPUT="$(echo "${STDIN_DATA}" | jq -r '.tool_input // {}' 2>/dev/null || true)"
elif command -v python3 &>/dev/null; then
  TOOL_NAME="$(echo "${STDIN_DATA}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('tool_name',''))" 2>/dev/null || true)"
  TOOL_INPUT="$(echo "${STDIN_DATA}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(json.dumps(d.get('tool_input',{})))" 2>/dev/null || true)"
else
  # Minimal grep fallback
  TOOL_NAME="$(echo "${STDIN_DATA}" | grep -o '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"tool_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' || true)"
  TOOL_INPUT=""
fi

[[ -z "${TOOL_NAME}" ]] && exit 0

# Build observation content based on tool type
OBSERVATION_CONTENT=""
IMPORTANCE=3
IS_ERROR=false

case "${TOOL_NAME}" in
  Write|Edit|MultiEdit)
    # Capture file path — signals which areas of the codebase are active.
    # Low importance (2) since path alone has limited semantic content.
    if command -v jq &>/dev/null; then
      FILE_PATH="$(echo "${TOOL_INPUT}" | jq -r '.file_path // empty' 2>/dev/null || true)"
    elif command -v python3 &>/dev/null; then
      FILE_PATH="$(echo "${TOOL_INPUT}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('file_path',''))" 2>/dev/null || true)"
    else
      FILE_PATH=""
    fi
    [[ -z "${FILE_PATH}" ]] && exit 0
    OBSERVATION_CONTENT="[${TOOL_NAME}] ${FILE_PATH}"
    IMPORTANCE=2
    ;;

  Task)
    # Capture task description (truncated to 200 chars)
    if command -v jq &>/dev/null; then
      PROMPT="$(echo "${TOOL_INPUT}" | jq -r '.prompt // .description // empty' 2>/dev/null || true)"
    elif command -v python3 &>/dev/null; then
      PROMPT="$(echo "${TOOL_INPUT}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('prompt') or d.get('description',''))" 2>/dev/null || true)"
    else
      PROMPT=""
    fi
    [[ -z "${PROMPT}" ]] && exit 0
    OBSERVATION_CONTENT="[Task] ${PROMPT:0:200}"
    ;;

  Bash)
    # Extract command
    if command -v jq &>/dev/null; then
      COMMAND="$(echo "${TOOL_INPUT}" | jq -r '.command // empty' 2>/dev/null || true)"
    elif command -v python3 &>/dev/null; then
      COMMAND="$(echo "${TOOL_INPUT}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('command',''))" 2>/dev/null || true)"
    else
      COMMAND=""
    fi
    [[ -z "${COMMAND}" ]] && exit 0

    # Only capture high-signal commands — ignore routine git plumbing, installs, branch ops
    if ! echo "${COMMAND}" | grep -qE '(git commit|npm run build|npx vitest|npm test|bun test|deploy|docker (build|run))'; then
      exit 0
    fi

    # ── Detect failures from tool output ──────────────────────────────────────
    # High-signal: a failed build/test/commit is important to remember.
    # Bump importance to 6 and tag as "error" when failure indicators are found.
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

    if [[ -n "${TOOL_OUTPUT}" ]] && echo "${TOOL_OUTPUT}" | grep -qiE '(^error:|npm ERR!|FAILED|command not found|non-zero exit|exit code [1-9])'; then
      IS_ERROR=true
      IMPORTANCE=6
    fi

    OBSERVATION_CONTENT="[Bash] ${COMMAND:0:200}"
    ;;

  *)
    exit 0
    ;;
esac

[[ -z "${OBSERVATION_CONTENT}" ]] && exit 0

# Compute lowercase tool tag for per-tool filtering
TOOL_TAG="$(echo "${TOOL_NAME}" | tr '[:upper:]' '[:lower:]')"

# Build JSON payload with variable importance and optional error tag
if command -v jq &>/dev/null; then
  if "${IS_ERROR}"; then
    PAYLOAD="$(jq -n \
      --arg content "${OBSERVATION_CONTENT}" \
      --arg tool_tag "${TOOL_TAG}" \
      --argjson importance "${IMPORTANCE}" \
      '{content: $content, context_type: "information", importance: $importance, tags: ["auto-hook", $tool_tag, "error"], is_global: false}')"
  else
    PAYLOAD="$(jq -n \
      --arg content "${OBSERVATION_CONTENT}" \
      --arg tool_tag "${TOOL_TAG}" \
      --argjson importance "${IMPORTANCE}" \
      '{content: $content, context_type: "information", importance: $importance, tags: ["auto-hook", $tool_tag], is_global: false}')"
  fi
elif command -v python3 &>/dev/null; then
  PAYLOAD="$(OBSERVATION_CONTENT="${OBSERVATION_CONTENT}" TOOL_TAG="${TOOL_TAG}" IMPORTANCE="${IMPORTANCE}" IS_ERROR="${IS_ERROR}" python3 -c "
import json, os
tags = ['auto-hook', os.environ['TOOL_TAG']]
if os.environ.get('IS_ERROR', 'false') == 'true':
    tags.append('error')
print(json.dumps({
  'content':      os.environ['OBSERVATION_CONTENT'],
  'context_type': 'information',
  'importance':   int(os.environ.get('IMPORTANCE', 3)),
  'tags':         tags,
  'is_global':    False
}))")"
else
  # Minimal JSON construction — escape quotes in content
  ESCAPED="${OBSERVATION_CONTENT//\"/\\\"}"
  if "${IS_ERROR}"; then
    PAYLOAD="{\"content\":\"${ESCAPED}\",\"context_type\":\"information\",\"importance\":${IMPORTANCE},\"tags\":[\"auto-hook\",\"${TOOL_TAG}\",\"error\"],\"is_global\":false}"
  else
    PAYLOAD="{\"content\":\"${ESCAPED}\",\"context_type\":\"information\",\"importance\":${IMPORTANCE},\"tags\":[\"auto-hook\",\"${TOOL_TAG}\"],\"is_global\":false}"
  fi
fi

# POST observation — fire-and-forget, ignore errors
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
