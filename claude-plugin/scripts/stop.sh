#!/usr/bin/env bash
# Recall stop hook — polls for pending events and feeds them to Claude as tasks.
#
# When an event is pending (Honeybadger alert, manual trigger, etc.) this hook
# returns {"decision":"block","reason":"<event>"} which prevents Claude from
# stopping and injects the event as its next task.
#
# stop_hook_active in the hook input JSON guards against infinite loops:
# Claude Code sets this to true when a stop hook already blocked once, so we
# skip polling and allow the stop.
#
# Registered in settings.json under:
#   hooks.Stop[].hooks[].command  (synchronous — NO async:true)
#   timeout: 5

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load config — silently exit (allow stop) if something goes wrong
# shellcheck source=lib/config.sh
source "${SCRIPT_DIR}/lib/config.sh" || exit 0

# No API key — nothing to do, allow stop
[[ -z "${RECALL_API_KEY}" ]] && exit 0

# ─── Read hook input from stdin ───────────────────────────────────────────────
# Claude Code provides JSON: {"stop_hook_active": true/false, ...}
# Reading via python3 is safer than piping to jq when special chars are present.
HOOK_INPUT=""
if [ -t 0 ]; then
  # No stdin (manual invocation) — proceed
  HOOK_INPUT="{}"
else
  HOOK_INPUT="$(cat)"
fi

# ─── Guard: stop_hook_active prevents infinite loops ─────────────────────────
# When Claude Code sets stop_hook_active=true it means a Stop hook already
# blocked once this turn. We must allow the stop to avoid an infinite loop.
STOP_HOOK_ACTIVE="false"
if command -v python3 &>/dev/null; then
  STOP_HOOK_ACTIVE="$(echo "${HOOK_INPUT}" | python3 -c \
    "import json,sys; d=json.load(sys.stdin); print(str(d.get('stop_hook_active',False)).lower())" \
    2>/dev/null || echo "false")"
elif command -v jq &>/dev/null; then
  STOP_HOOK_ACTIVE="$(echo "${HOOK_INPUT}" | jq -r '.stop_hook_active // false' 2>/dev/null || echo "false")"
fi

[[ "${STOP_HOOK_ACTIVE}" == "true" ]] && exit 0

# ─── Read session name from state file ────────────────────────────────────────
STATE_FILE="${HOME}/.claude/recall/state.json"
SESSION_NAME=""

if [[ -f "${STATE_FILE}" ]]; then
  if command -v python3 &>/dev/null; then
    SESSION_NAME="$(python3 -c "
import json
try:
  d = json.load(open('${STATE_FILE}'))
  print(d.get('session_name', ''))
except Exception:
  print('')
" 2>/dev/null || true)"
  elif command -v jq &>/dev/null; then
    SESSION_NAME="$(jq -r '.session_name // empty' "${STATE_FILE}" 2>/dev/null || true)"
  fi
fi

# ─── Self-heal: generate + register session name for pre-existing sessions ────
# Sessions started before this feature was deployed won't have a session_name in
# state.json. Generate one now so they start getting session-targeted events.
if [[ -z "${SESSION_NAME}" ]] && command -v python3 &>/dev/null; then
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
print(random.choice(ADJECTIVES) + '-' + random.choice(ANIMALS))
" 2>/dev/null || echo "")"

  if [[ -n "${SESSION_NAME}" ]]; then
    # Persist name so future hook invocations reuse it
    python3 -c "
import json, os
sf = '${STATE_FILE}'
try:
    d = json.load(open(sf)) if os.path.exists(sf) else {}
except Exception:
    d = {}
d['session_name'] = '${SESSION_NAME}'
json.dump(d, open(sf, 'w'))
" 2>/dev/null || true

    # Register with server (fire-and-forget)
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
fi

# ─── Build events URL with optional workspace and session context ──────────────
EVENTS_URL="${RECALL_SERVER_URL}/api/events/next"
QUERY_PARAMS=""

if [[ -n "${RECALL_WORKSPACE:-}" ]]; then
  if command -v python3 &>/dev/null; then
    ENCODED_WS="$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "${RECALL_WORKSPACE}" 2>/dev/null || echo "${RECALL_WORKSPACE// /+}")"
  else
    ENCODED_WS="${RECALL_WORKSPACE// /+}"
  fi
  QUERY_PARAMS="workspace=${ENCODED_WS}"
fi

if [[ -n "${RECALL_GIT_REMOTE:-}" ]]; then
  if command -v python3 &>/dev/null; then
    ENCODED_GR="$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "${RECALL_GIT_REMOTE}" 2>/dev/null || echo "${RECALL_GIT_REMOTE// /+}")"
  else
    ENCODED_GR="${RECALL_GIT_REMOTE// /+}"
  fi
  QUERY_PARAMS="${QUERY_PARAMS:+${QUERY_PARAMS}&}git_remote=${ENCODED_GR}"
fi

if [[ -n "${SESSION_NAME:-}" ]]; then
  if command -v python3 &>/dev/null; then
    ENCODED_SN="$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "${SESSION_NAME}" 2>/dev/null || echo "${SESSION_NAME}")"
  else
    ENCODED_SN="${SESSION_NAME}"
  fi
  QUERY_PARAMS="${QUERY_PARAMS:+${QUERY_PARAMS}&}session_name=${ENCODED_SN}"
fi

[[ -n "${QUERY_PARAMS}" ]] && EVENTS_URL="${EVENTS_URL}?${QUERY_PARAMS}"

# ─── Poll for next pending event ──────────────────────────────────────────────
RESPONSE="$(curl \
  --silent \
  --max-time 4 \
  --fail \
  --header "Authorization: Bearer ${RECALL_API_KEY}" \
  "${EVENTS_URL}" \
  2>/dev/null || true)"

[[ -z "${RESPONSE}" ]] && exit 0

# ─── Parse response ───────────────────────────────────────────────────────────
HAS_EVENT="no"
EVENT_TYPE=""
EVENT_TITLE=""
EVENT_BODY=""
EVENT_URL=""

if command -v python3 &>/dev/null; then
  HAS_EVENT="$(echo "${RESPONSE}" | python3 -c \
    "import json,sys; d=json.load(sys.stdin); print('yes' if d.get('success') and d.get('data') else 'no')" \
    2>/dev/null || echo "no")"
  if [[ "${HAS_EVENT}" == "yes" ]]; then
    EVENT_TYPE="$(echo "${RESPONSE}" | python3 -c \
      "import json,sys; d=json.load(sys.stdin); print(d['data'].get('type','custom'))" \
      2>/dev/null || echo "custom")"
    EVENT_TITLE="$(echo "${RESPONSE}" | python3 -c \
      "import json,sys; d=json.load(sys.stdin); print(d['data'].get('title',''))" \
      2>/dev/null || echo "")"
    EVENT_BODY="$(echo "${RESPONSE}" | python3 -c \
      "import json,sys; d=json.load(sys.stdin); print(d['data'].get('body',''))" \
      2>/dev/null || echo "")"
    EVENT_URL="$(echo "${RESPONSE}" | python3 -c \
      "import json,sys; d=json.load(sys.stdin); print(d['data'].get('url','') or '')" \
      2>/dev/null || echo "")"
  fi
elif command -v jq &>/dev/null; then
  HAS_EVENT="$(echo "${RESPONSE}" | jq -r 'if .success and .data then "yes" else "no" end' 2>/dev/null || echo "no")"
  if [[ "${HAS_EVENT}" == "yes" ]]; then
    EVENT_TYPE="$(echo "${RESPONSE}" | jq -r '.data.type // "custom"' 2>/dev/null || echo "custom")"
    EVENT_TITLE="$(echo "${RESPONSE}" | jq -r '.data.title // ""' 2>/dev/null || echo "")"
    EVENT_BODY="$(echo "${RESPONSE}" | jq -r '.data.body // ""' 2>/dev/null || echo "")"
    EVENT_URL="$(echo "${RESPONSE}" | jq -r '.data.url // ""' 2>/dev/null || echo "")"
  fi
fi

[[ "${HAS_EVENT}" != "yes" ]] && exit 0

# ─── Build the reason text injected as Claude's next task ────────────────────
REASON="🔔 Recall event received [${EVENT_TYPE}]: ${EVENT_TITLE}"
if [[ -n "${EVENT_BODY}" ]]; then
  REASON="${REASON}

${EVENT_BODY}"
fi
if [[ -n "${EVENT_URL}" ]]; then
  REASON="${REASON}

Reference: ${EVENT_URL}"
fi
REASON="${REASON}

Please investigate and address the above. When done, continue your normal workflow."

# ─── Output block decision as JSON ───────────────────────────────────────────
# python3 handles proper JSON escaping of multi-line reason strings.
if command -v python3 &>/dev/null; then
  python3 -c "
import json, sys
reason = sys.argv[1]
print(json.dumps({'decision': 'block', 'reason': reason}))
" "${REASON}"
elif command -v jq &>/dev/null; then
  jq -n --arg reason "${REASON}" '{"decision":"block","reason":$reason}'
else
  # Fallback: basic escaping (newlines → \n, quotes → \")
  ESCAPED="${REASON//\\/\\\\}"
  ESCAPED="${ESCAPED//\"/\\\"}"
  ESCAPED="${ESCAPED//$'\n'/\\n}"
  printf '{"decision":"block","reason":"%s"}\n' "${ESCAPED}"
fi
