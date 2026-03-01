#!/usr/bin/env bash
# Recall session-end hook — deregisters this session from the Recall server.
# Allows the server to know the session is no longer active.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load config — silently exit if something goes wrong
# shellcheck source=lib/config.sh
source "${SCRIPT_DIR}/lib/config.sh" || exit 0

# No API key — nothing to do
[[ -z "${RECALL_API_KEY}" ]] && exit 0

# ─── Read session name from state file ───────────────────────────────────────
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

# No session name — nothing to deregister
[[ -z "${SESSION_NAME}" ]] && exit 0

# ─── Deregister session (best-effort, synchronous with short timeout) ─────────
curl --silent --max-time 3 \
  --request DELETE \
  --header "Authorization: Bearer ${RECALL_API_KEY}" \
  "${RECALL_SERVER_URL}/api/sessions/${SESSION_NAME}" \
> /dev/null 2>&1 || true

exit 0
