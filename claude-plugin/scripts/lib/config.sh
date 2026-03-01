#!/usr/bin/env bash
# Recall config reader — shared by all hook scripts.
# Reads ~/.claude/recall/config.json, falls back to env vars.
# Exports: RECALL_API_KEY, RECALL_SERVER_URL, RECALL_WORKSPACE, RECALL_GIT_REMOTE

set -euo pipefail

CONFIG_FILE="${HOME}/.claude/recall/config.json"
DEFAULT_SERVER_URL="https://recallmcp.com"

# Read config file if present
if [[ -f "${CONFIG_FILE}" ]]; then
  if command -v jq &>/dev/null; then
    RECALL_API_KEY="${RECALL_API_KEY:-$(jq -r '.api_key // empty' "${CONFIG_FILE}" 2>/dev/null || true)}"
    RECALL_SERVER_URL="${RECALL_SERVER_URL:-$(jq -r '.server_url // empty' "${CONFIG_FILE}" 2>/dev/null || true)}"
  else
    # jq not available — fall back to python3 or grep
    if command -v python3 &>/dev/null; then
      RECALL_API_KEY="${RECALL_API_KEY:-$(python3 -c "import json,sys; d=json.load(open('${CONFIG_FILE}')); print(d.get('api_key',''))" 2>/dev/null || true)}"
      RECALL_SERVER_URL="${RECALL_SERVER_URL:-$(python3 -c "import json,sys; d=json.load(open('${CONFIG_FILE}')); print(d.get('server_url',''))" 2>/dev/null || true)}"
    fi
  fi
fi

# Apply defaults
export RECALL_API_KEY="${RECALL_API_KEY:-}"
export RECALL_SERVER_URL="${RECALL_SERVER_URL:-${DEFAULT_SERVER_URL}}"

# Detect workspace from git remote and current directory
RECALL_GIT_REMOTE="${RECALL_GIT_REMOTE:-$(git config --get remote.origin.url 2>/dev/null || true)}"
RECALL_WORKSPACE="${RECALL_WORKSPACE:-$(pwd)}"

export RECALL_GIT_REMOTE
export RECALL_WORKSPACE
