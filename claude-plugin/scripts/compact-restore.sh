#!/usr/bin/env bash
# Recall compact-restore hook
# Fires on SessionStart with matcher: "compact" ONLY.
# Re-injects the pre-compaction session state captured by pre-compact.sh so
# Claude knows exactly where it left off after the context window was compacted.
# Claude Code injects stdout from SessionStart hooks into the conversation.
#
# Registered in settings.json under:
#   hooks.SessionStart[].hooks[].command
#   matcher: "compact"
#   timeout: 5

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load config — silently exit if something goes wrong
# shellcheck source=lib/config.sh
source "${SCRIPT_DIR}/lib/config.sh" || exit 0

PRE_COMPACT_STATE="${HOME}/.claude/recall/pre-compact-state.json"

# No saved state — nothing to restore (first compaction or pre-compact not installed)
[[ ! -f "${PRE_COMPACT_STATE}" ]] && exit 0

# Read and immediately delete — single-use (one compaction → one restore)
STATE_CONTENT="$(cat "${PRE_COMPACT_STATE}" 2>/dev/null || true)"
rm -f "${PRE_COMPACT_STATE}" 2>/dev/null || true

[[ -z "${STATE_CONTENT}" ]] && exit 0

# ─── Parse saved state ────────────────────────────────────────────────────────
SESSION_NAME=""
MEMORIES_COUNT=0
CWD_PATH=""
GIT_REMOTE=""

if command -v python3 &>/dev/null; then
  SESSION_NAME="$(echo "${STATE_CONTENT}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('session_name',''))" 2>/dev/null || true)"
  MEMORIES_COUNT="$(echo "${STATE_CONTENT}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('session_memories',0))" 2>/dev/null || echo 0)"
  CWD_PATH="$(echo "${STATE_CONTENT}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('cwd',''))" 2>/dev/null || true)"
  GIT_REMOTE="$(echo "${STATE_CONTENT}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('git_remote',''))" 2>/dev/null || true)"
elif command -v jq &>/dev/null; then
  SESSION_NAME="$(echo "${STATE_CONTENT}" | jq -r '.session_name // empty' 2>/dev/null || true)"
  MEMORIES_COUNT="$(echo "${STATE_CONTENT}" | jq -r '.session_memories // 0' 2>/dev/null || echo 0)"
  CWD_PATH="$(echo "${STATE_CONTENT}" | jq -r '.cwd // empty' 2>/dev/null || true)"
  GIT_REMOTE="$(echo "${STATE_CONTENT}" | jq -r '.git_remote // empty' 2>/dev/null || true)"
fi

MEMORIES_COUNT="${MEMORIES_COUNT:-0}"

# ─── Print restore context to stdout ─────────────────────────────────────────
# Claude Code injects stdout from SessionStart hooks into the conversation context.
echo "> 🧠 [Recall] Context restored after compaction"
echo ">"
[[ -n "${SESSION_NAME}" ]] && echo "> Session: ${SESSION_NAME}"
[[ -n "${GIT_REMOTE}" ]]  && echo "> Project: ${GIT_REMOTE}"
[[ -n "${CWD_PATH}" ]]    && echo "> Working directory: ${CWD_PATH}"
(( MEMORIES_COUNT > 0 ))  && echo "> Memories stored this session so far: ${MEMORIES_COUNT}"
echo ">"
echo "> Continue from where you left off — your memory context has been preserved."
