#!/usr/bin/env bash
# Recall observe hook (PostToolUse, PostToolUseFailure)
# Reads Claude Code tool event from stdin, POSTs Bash FAILURES to Recall.
#
# Policy (2026-08-30): errors + digest only. Per-call capture of
# Read/Grep/Glob/Write/Edit/Bash-success produced 99% of stored memories
# (561k records, 8.5GB) while being retrieved essentially never, and it
# crowded real memories out of every search. A failing command is the one
# tool event worth remembering; the session digest lives in
# stop-summarize.sh.
#
# Registered (hooks.json, or settings.json for a standalone install) under:
#   hooks.PostToolUse[].hooks[].command and hooks.PostToolUseFailure[].hooks[].command
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

# Recall's Claude Code mod (hooks/register.js, Claude Code 2.1.287+) records these failures in process and
# refreshes ~/.claude/recall/mod-heartbeat-<session id> every 15 s. While that heartbeat is fresh this script
# stands down; a stale one (the mod unloaded mid-session) puts this script back in charge.
if command -v jq &>/dev/null; then
  SESSION_ID="$(echo "${STDIN_DATA}" | jq -r '.session_id // empty' 2>/dev/null || true)"
elif command -v python3 &>/dev/null; then
  SESSION_ID="$(echo "${STDIN_DATA}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('session_id',''))" 2>/dev/null || true)"
else
  SESSION_ID=""
fi
if [[ "${SESSION_ID}" =~ ^[A-Za-z0-9_-]+$ ]]; then
  _beat="$(cat "${HOME}/.claude/recall/mod-heartbeat-${SESSION_ID}" 2>/dev/null || true)"
  if [[ "${_beat}" =~ ^[0-9]+$ ]] && (( $(date +%s) - _beat < 45 )); then
    exit 0
  fi
fi

# Extract the command
if command -v jq &>/dev/null; then
  COMMAND="$(echo "${STDIN_DATA}" | jq -r '.tool_input.command // empty' 2>/dev/null || true)"
elif command -v python3 &>/dev/null; then
  COMMAND="$(echo "${STDIN_DATA}" | python3 -c "import json,sys; d=json.load(sys.stdin); print((d.get('tool_input') or {}).get('command',''))" 2>/dev/null || true)"
else
  COMMAND=""
fi
[[ -z "${COMMAND}" ]] && exit 0

# A command that exits non-zero, times out or is refused fires PostToolUseFailure, not PostToolUse (Claude Code
# 2.1.288). That event has no tool_response: the output is in "error", and the event itself says the call failed.
# An interrupt (the person pressed Esc) is not a failing command.
if command -v jq &>/dev/null; then
  HOOK_EVENT="$(echo "${STDIN_DATA}" | jq -r '.hook_event_name // empty' 2>/dev/null || true)"
  IS_INTERRUPT="$(echo "${STDIN_DATA}" | jq -r '.is_interrupt // false' 2>/dev/null || true)"
elif command -v python3 &>/dev/null; then
  HOOK_EVENT="$(echo "${STDIN_DATA}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('hook_event_name',''))" 2>/dev/null || true)"
  IS_INTERRUPT="$(echo "${STDIN_DATA}" | python3 -c "import json,sys; d=json.load(sys.stdin); print('true' if d.get('is_interrupt') is True else 'false')" 2>/dev/null || true)"
else
  HOOK_EVENT=""
  IS_INTERRUPT="false"
fi
FAILED_EVENT=false
if [[ "${HOOK_EVENT}" == "PostToolUseFailure" ]]; then
  [[ "${IS_INTERRUPT}" == "true" ]] && exit 0
  FAILED_EVENT=true
fi

# Detect failure from tool output. No failure -> nothing to store.
TOOL_OUTPUT=""
if "${FAILED_EVENT}"; then
  if command -v jq &>/dev/null; then
    TOOL_OUTPUT="$(echo "${STDIN_DATA}" | jq -r '(.error // "") | tostring | .[:20000]' 2>/dev/null || true)"
  elif command -v python3 &>/dev/null; then
    TOOL_OUTPUT="$(echo "${STDIN_DATA}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(str(d.get('error') or '')[:20000])" 2>/dev/null || true)"
  fi
  [[ -z "${TOOL_OUTPUT}" ]] && TOOL_OUTPUT="(no error text)"
elif command -v python3 &>/dev/null; then
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
  print(out[:20000])
except Exception:
  print('')
" 2>/dev/null || true)"
elif command -v jq &>/dev/null; then
  TOOL_OUTPUT="$(echo "${STDIN_DATA}" | jq -r \
    '(.tool_response // .tool_output // "") | if type == "object" then (.stderr // .stdout // "") else . end | .[:20000]' \
    2>/dev/null || true)"
fi

if ! "${FAILED_EVENT}" && { [[ -z "${TOOL_OUTPUT}" ]] || ! echo "${TOOL_OUTPUT:0:500}" | grep -qiE '(^error:|npm ERR!|FAILED|command not found|non-zero exit|exit code [1-9])'; }; then
  exit 0
fi

# Secrets in the command or its output never leave this machine: each match becomes [REDACTED] before the POST, and
# if redaction cannot run, nothing is sent. The list is the same as PATTERNS in the plugin's hooks/redact.js
# (hooks.test.sh compares them and runs both against plugin/recall/tests/redaction-fixtures.js). A named group "k"
# is text kept in front of [REDACTED]; \x27 stands for a single quote. Bare hex is never redacted, so SHAs survive.
REDACT_PATTERNS='[
  ["-----BEGIN [A-Z ]*PRIVATE KEY-----(?:[\\s\\S]*?-----END [A-Z ]*PRIVATE KEY-----|[\\s\\S]*)", ""],
  ["(?<k>authorization\\s*[:=]\\s*)(?:(?:bearer|basic|token|digest)\\s+)?[^\\s\"\\x27,;]+", "i"],
  ["(?<k>\\bbearer\\s+)[A-Za-z0-9._~+/=-]{8,}", "i"],
  ["(?<k>\\b[a-z][a-z0-9+.-]*://)[^/\\s:@\"\\x27]+:[^/\\s@\"\\x27]+(?=@)", "i"],
  ["(?<k>\\b[a-z0-9_.-]*?(?:token|secret|password|passwd|api[_-]?key|access[_-]?key|private[_-]?key)=[\"\\x27]?)[^\\s\"\\x27&;,)]+", "i"],
  ["(?<k>(?:^|\\s)--?(?:[a-z0-9]+-)*(?:token|secret|password|passwd|pass|api-?key|access-?key)(?:=|\\s+)[\"\\x27]?)[^\\s\"\\x27]+", "i"],
  ["\\b(?:sk-ant-|sk-|ghp_|gho_|ghu_|ghs_|ghr_|github_pat_|xox[abpr]-|crsr_|ft_live_|ft_test_|ft_run_|rk_live_|rk_test_|sk_live_|sk_test_|whsec_)[A-Za-z0-9_.-]{8,}", ""],
  ["\\bAKIA[0-9A-Z]{16}\\b", ""]
]'
redact() {
  if command -v python3 &>/dev/null; then
    REDACT_PATTERNS="${REDACT_PATTERNS}" python3 -c '
import json, os, re, sys
s = sys.stdin.read()
for p, f in json.loads(os.environ["REDACT_PATTERNS"]):
    s = re.sub(p.replace("(?<k>", "(?P<k>"), lambda m: (m.groupdict().get("k") or "") + "[REDACTED]", s, flags=re.I if "i" in f else 0)
sys.stdout.write(s)'
  elif command -v jq &>/dev/null; then
    jq -Rrs --argjson pats "${REDACT_PATTERNS}" 'reduce $pats[] as $p (.; gsub($p[0]; "\(.k // "")[REDACTED]"; $p[1]))'
  else
    return 1
  fi
}
COMMAND="$(printf '%s' "${COMMAND}" | redact 2>/dev/null)" || exit 0
TOOL_OUTPUT="$(printf '%s' "${TOOL_OUTPUT}" | redact 2>/dev/null)" || exit 0

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
