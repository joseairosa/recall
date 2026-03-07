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

# Detect workspace from git remote and current directory
RECALL_GIT_REMOTE="${RECALL_GIT_REMOTE:-$(git config --get remote.origin.url 2>/dev/null || true)}"
RECALL_WORKSPACE="${RECALL_WORKSPACE:-$(pwd)}"

export RECALL_GIT_REMOTE
export RECALL_WORKSPACE
