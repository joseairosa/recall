#!/usr/bin/env bash
# Recall config reader — shared by all hook scripts.
# Reads ~/.claude/recall/config.json; config.json takes priority over env vars.
# Exports: RECALL_API_KEY, RECALL_SERVER_URL, RECALL_WORKSPACE, RECALL_GIT_REMOTE

set -euo pipefail

CONFIG_FILE="${HOME}/.claude/recall/config.json"
DEFAULT_SERVER_URL="https://recallmcp.com"

# Read config file — config.json takes priority over environment variables.
# This prevents stale env vars (set at shell startup) from overriding a
# key that was rotated/healed during the session.
_cfg_api_key=""
_cfg_server_url=""
if [[ -f "${CONFIG_FILE}" ]]; then
  if command -v jq &>/dev/null; then
    _cfg_api_key="$(jq -r '.api_key // empty' "${CONFIG_FILE}" 2>/dev/null || true)"
    _cfg_server_url="$(jq -r '.server_url // empty' "${CONFIG_FILE}" 2>/dev/null || true)"
  elif command -v python3 &>/dev/null; then
    _cfg_api_key="$(python3 -c "import json,sys; d=json.load(open('${CONFIG_FILE}')); print(d.get('api_key',''))" 2>/dev/null || true)"
    _cfg_server_url="$(python3 -c "import json,sys; d=json.load(open('${CONFIG_FILE}')); print(d.get('server_url',''))" 2>/dev/null || true)"
  fi
fi

# config.json key takes priority; fall back to env var; then empty
export RECALL_API_KEY="${_cfg_api_key:-${RECALL_API_KEY:-}}"
export RECALL_SERVER_URL="${_cfg_server_url:-${RECALL_SERVER_URL:-${DEFAULT_SERVER_URL}}}"
unset _cfg_api_key _cfg_server_url

# The workspace is the project, not the folder the agent happens to be in. Hooks run in the
# shell's current directory, which follows every `cd`, so $(pwd) alone filed memories under
# src/lib/fonts, worktrees, scratchpads and /tmp as separate workspaces. Start from the
# directory Claude Code was launched in and resolve it to its git checkout: the main checkout
# for a worktree, the repo root for a subfolder. Outside git, the launch directory itself.
_recall_base="${CLAUDE_PROJECT_DIR:-}"
[[ -n "${_recall_base}" && -d "${_recall_base}" ]] || _recall_base="$(pwd)"
_recall_root=""
# --git-common-dir is the main checkout's .git from any worktree or subfolder; `cd` into it
# makes it absolute on every git version (older ones print it relative).
_recall_common="$(cd "${_recall_base}" 2>/dev/null && cd "$(git rev-parse --git-common-dir 2>/dev/null)" 2>/dev/null && pwd || true)"
if [[ "${_recall_common##*/}" == ".git" ]]; then
  _recall_root="${_recall_common%/.git}"
else
  # A submodule or unusual layout: its own top level.
  _recall_root="$(git -C "${_recall_base}" rev-parse --show-toplevel 2>/dev/null || true)"
fi
RECALL_GIT_REMOTE="${RECALL_GIT_REMOTE:-$(git -C "${_recall_base}" config --get remote.origin.url 2>/dev/null || true)}"
# A repo cloned with a token keeps it in its https remote; never send it on (ssh remotes carry none).
RECALL_GIT_REMOTE="$(printf '%s' "${RECALL_GIT_REMOTE}" | sed -E 's#^([Hh][Tt][Tt][Pp][Ss]?://)[^/@]*@#\1#')"
RECALL_WORKSPACE="${RECALL_WORKSPACE:-${_recall_root:-${_recall_base}}}"
unset _recall_base _recall_root _recall_common

export RECALL_GIT_REMOTE
export RECALL_WORKSPACE
