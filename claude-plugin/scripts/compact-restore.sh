#!/usr/bin/env bash
# Recall compact-restore hook
# Fires on SessionStart with matcher: "compact" ONLY.
# Re-injects the pre-compaction session state captured by pre-compact.sh so
# Claude knows exactly where it left off after the context window was compacted.
# Claude Code injects stdout from SessionStart hooks into the conversation.
#
# It also stores Claude Code's own compact summary as a Recall memory, in the
# background, so the hook returns at once and nothing about it is printed.
#
# Registered (hooks.json, or settings.json for a standalone install) under:
#   hooks.SessionStart[].hooks[].command
#   matcher: "compact"
#   timeout: 5

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load config — silently exit if something goes wrong
# shellcheck source=lib/config.sh
source "${SCRIPT_DIR}/lib/config.sh" || exit 0

# ─── Store the compact summary ────────────────────────────────────────────────
# After each compact, the session file (transcript_path in the hook input) holds a "system" compact_boundary record,
# then a "user" record with isCompactSummary=true: the summary Claude Code wrote. The summary's parentUuid does not
# always point at the boundary, so the pair is the newest boundary and the first summary after it in the file. The
# boundary's uuid is the key: a marker directory per stored compact, made with mkdir (atomic), so a rerun of this hook
# for the same compact stores nothing. A failed POST removes the marker, so the next run tries again.
#
# Secrets never leave this machine: REDACT_PATTERNS is the same list as observe.sh's and the plugin's hooks/redact.js
# (hooks.test.sh compares them), plus .env-style KEY=value lines. If redaction cannot run, nothing is sent.
# SHORTCUT: python3 only (no jq path, unlike observe.sh), so a machine without python3 stores no summaries. Add a jq
# path if a user without python3 asks for this.
REDACT_PATTERNS='[
  ["-----BEGIN [A-Z ]*PRIVATE KEY-----(?:[\\s\\S]*?-----END [A-Z ]*PRIVATE KEY-----|[\\s\\S]*)", ""],
  ["(?<k>authorization\\s*[:=]\\s*)(?:(?:bearer|basic|token|digest)\\s+)?[^\\s\"\\x27,;]+", "i"],
  ["(?<k>\\bbearer\\s+)[A-Za-z0-9._~+/=-]{8,}", "i"],
  ["(?<k>\\b(?:set-)?cookie[\"\\x27]?[ \\t]*:[ \\t]*)[^\\r\\n\"\\x27]+", "i"],
  ["(?<k>\\b[a-z][a-z0-9+.-]*://)[^/\\s:@\"\\x27]+:[^/\\s@\"\\x27]+(?=@)", "i"],
  ["(?<k>\\bhooks\\.slack\\.com/(?:services|workflows|triggers)/)[A-Za-z0-9/_-]+", "i"],
  ["(?<k>\\b[a-z0-9_.-]*?(?:token|secret|password|passwd|api[_-]?key|access[_-]?key|private[_-]?key)=[\"\\x27]?)[^\\s\"\\x27&;,)]+", "i"],
  ["(?<k>\\b[a-z0-9_.-]*?(?:token|secret|password|passwd|api[_-]?key|access[_-]?key|private[_-]?key)[\"\\x27]?[ \\t]*[:=][ \\t]*[\"\\x27]?)[^\\s\"\\x27&;,)]{6,}", "i"],
  ["(?<k>\\b[A-Z][A-Z0-9_]*_(?:KEY|PASS|PWD|CREDENTIALS?)=[\"\\x27]?)[^\\s\"\\x27&;,)]+", ""],
  ["(?<k>(?:^|\\s)--?(?:[a-z0-9]+-)*(?:token|secret|password|passwd|pass|api-?key|access-?key)(?:=|\\s+)[\"\\x27]?)[^\\s\"\\x27]+", "i"],
  ["(?<k>\\b(?:mysql|mysqldump|mysqladmin|mariadb)\\b[^\\n]*?[ \\t]-p)[^\\s\"\\x27]+", ""],
  ["\\b(?:sk-ant-|sk-|ghp_|gho_|ghu_|ghs_|ghr_|github_pat_|glpat-|ya29\\.|xox[abpr]-|crsr_|ft_live_|ft_test_|ft_run_|rk_live_|rk_test_|sk_live_|sk_test_|whsec_)[A-Za-z0-9_.-]{8,}", ""],
  ["\\bAKIA[0-9A-Z]{16}\\b", ""],
  ["\\bAIza[0-9A-Za-z_-]{30,}", ""],
  ["\\beyJ[A-Za-z0-9_-]{5,}\\.[A-Za-z0-9_-]{5,}\\.[A-Za-z0-9_-]{5,}", ""],
  ["\\bnpm_[A-Za-z0-9]{30,}", ""]
]'
# Prints "<boundary uuid><TAB><payload JSON>". Exit 3: the newest boundary has no summary yet, and it prints the byte
# offset of that boundary's line, which the next look passes back in COMPACT_FROM. Any other failure: 1.
COMPACT_SUMMARY_PY='
import datetime, json, os, re, sys
try:
    hook = json.loads(os.environ["HOOK_INPUT"])
except Exception:
    sys.exit(1)
if not isinstance(hook, dict):
    sys.exit(1)
path = str(hook.get("transcript_path") or "")
if not path or not os.path.isfile(path):
    sys.exit(1)
start = int(os.environ.get("COMPACT_FROM") or 0)
boundary, summary, at, pos = None, None, 0, start
with open(path, "rb") as f:
    f.seek(start)
    for raw in f:
        here, pos = pos, pos + len(raw)
        if b"compact_boundary" not in raw and b"isCompactSummary" not in raw:
            continue
        try:
            rec = json.loads(raw.decode("utf-8", "replace"))
        except Exception:
            continue
        if not isinstance(rec, dict):
            continue
        if rec.get("type") == "system" and rec.get("subtype") == "compact_boundary":
            boundary, summary, at = rec, None, here
        elif rec.get("isCompactSummary") is True and boundary is not None and summary is None:
            summary = rec
if boundary is None:
    sys.exit(1)
key = str(boundary.get("uuid") or "")
if not re.fullmatch(r"[A-Za-z0-9-]{1,64}", key):
    sys.exit(1)
if summary is None:
    sys.stdout.write(str(at))
    sys.exit(3)
body = (summary.get("message") or {}).get("content")
if isinstance(body, list):
    body = "\n".join(str(b.get("text") or "") for b in body if isinstance(b, dict) and b.get("type") == "text")
text = body.strip() if isinstance(body, str) else ""
if not text:
    sys.exit(1)
ts = str(boundary.get("timestamp") or "")
date = ts[:10] if re.match(r"\d{4}-\d{2}-\d{2}", ts) else datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
trigger = str((boundary.get("compactMetadata") or {}).get("trigger") or "unknown")
session_id = str(hook.get("session_id") or boundary.get("sessionId") or "")
session_name = ""
try:
    session_name = str(json.load(open(os.path.expanduser("~/.claude/recall/state.json"))).get("session_name") or "")
except Exception:
    pass
workspace = os.environ.get("RECALL_WORKSPACE", "")
remote = os.environ.get("RECALL_GIT_REMOTE", "")
project = re.sub(r"\.git$", "", (remote or workspace).rstrip("/").rsplit("/", 1)[-1].rsplit(":", 1)[-1]) or "unknown"
content = "Compact summary (%s). Session: %s. Project: %s. Date: %s.\n\n%s" % (
    trigger, session_name or session_id or "unknown", remote or workspace, date, text[:100000])
# .env-style lines: the value after KEY= goes, the name stays.
content = re.sub(r"(?m)^([ \t]*(?:export[ \t]+)?[A-Z_][A-Z0-9_]*[ \t]*=)(?!=)[ \t]*\S.*$", r"\1[REDACTED]", content)
for p, fl in json.loads(os.environ["REDACT_PATTERNS"]):
    content = re.sub(p.replace("(?<k>", "(?P<k>"), lambda m: (m.groupdict().get("k") or "") + "[REDACTED]", content, flags=re.I if "i" in fl else 0)
tags = ["auto-hook", "compact-summary", "compact:" + key, "project:" + project, "date:" + date]
if re.fullmatch(r"[A-Za-z0-9_-]{1,128}", session_id):
    tags.append("session:" + session_id)
if workspace:
    tags.append("workspace:" + workspace)
payload = {"content": content, "context_type": "information", "importance": 6, "tags": tags, "is_global": False}
sys.stdout.write(key + "\t" + json.dumps(payload))
'

store_compact_summary() {
  local out="" rc=0 waited=0 from=0 key payload marker status
  local wait="${RECALL_COMPACT_WAIT_SECONDS:-30}"
  [[ "${wait}" =~ ^[0-9]+$ ]] || wait=30
  while :; do
    rc=0
    out="$(HOOK_INPUT="${HOOK_INPUT}" REDACT_PATTERNS="${REDACT_PATTERNS}" COMPACT_FROM="${from}" \
      RECALL_WORKSPACE="${RECALL_WORKSPACE}" RECALL_GIT_REMOTE="${RECALL_GIT_REMOTE}" python3 -c "${COMPACT_SUMMARY_PY}" 2>/dev/null)" || rc=$?
    # The summary record can land after the boundary. Look again once a second, from the boundary on, for up to
    # RECALL_COMPACT_WAIT_SECONDS (30). This runs in the background, so the session never waits for it.
    (( rc == 3 && waited < wait )) || break
    [[ "${out}" =~ ^[0-9]+$ ]] && from="${out}"
    waited=$((waited + 1))
    sleep 1
  done
  (( rc == 0 )) && [[ "${out}" == *$'\t'* ]] || return 0
  key="${out%%$'\t'*}"
  payload="${out#*$'\t'}"
  marker="${HOME}/.claude/recall/compact-stored"
  mkdir -p "${marker}" 2>/dev/null || return 0
  # Markers older than 30 days go; a compact that old is never rerun.
  find "${marker}" -mindepth 1 -maxdepth 1 -type d -mtime +30 -exec rmdir {} + 2>/dev/null || true
  mkdir "${marker}/${key}" 2>/dev/null || return 0
  # The payload goes on stdin, not argv, so the summary never shows in a process list.
  status="$(printf '%s' "${payload}" | curl \
    --silent \
    --max-time 10 \
    --output /dev/null \
    --write-out "%{http_code}" \
    --request POST \
    --header "Content-Type: application/json" \
    --header "Authorization: Bearer ${RECALL_API_KEY}" \
    --header "X-Recall-Workspace: ${RECALL_WORKSPACE}" \
    --header "X-Recall-Git-Remote: ${RECALL_GIT_REMOTE}" \
    --data-binary @- \
    "${RECALL_SERVER_URL}/api/memories" \
    2>/dev/null || echo "000")"
  [[ "${status}" =~ ^2 ]] || rmdir "${marker}/${key}" 2>/dev/null || true
}

# No API key, no stdin, or no python3: store nothing, and restore as before.
HOOK_INPUT=""
[[ -t 0 ]] || HOOK_INPUT="$(head -c 65536 2>/dev/null || true)"
if [[ -n "${RECALL_API_KEY}" && -n "${HOOK_INPUT}" ]] && command -v python3 &>/dev/null; then
  ( store_compact_summary ) </dev/null >/dev/null 2>&1 &
  disown $! 2>/dev/null || true
fi

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
