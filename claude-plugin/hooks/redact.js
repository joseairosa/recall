// Secrets in a failing command or its output never leave this machine: each match becomes [REDACTED] before a memory
// is sent. The list is the same as REDACT_PATTERNS in scripts/observe.sh (hooks.test.sh compares them, and runs both
// against tests/redaction-fixtures.js). Each pattern is [source, flags], written so JavaScript, jq (Oniguruma) and
// Python read it alike: a named group "k" is text to keep in front of [REDACTED], and \x27 stands for a single quote.
// Bare hex is never redacted, so commit SHAs survive.
export const PATTERNS = [
  ["-----BEGIN [A-Z ]*PRIVATE KEY-----(?:[\\s\\S]*?-----END [A-Z ]*PRIVATE KEY-----|[\\s\\S]*)", ""],
  ["(?<k>authorization\\s*[:=]\\s*)(?:(?:bearer|basic|token|digest)\\s+)?[^\\s\"\\x27,;]+", "i"],
  ["(?<k>\\bbearer\\s+)[A-Za-z0-9._~+/=-]{8,}", "i"],
  ["(?<k>\\b[a-z][a-z0-9+.-]*://)[^/\\s:@\"\\x27]+:[^/\\s@\"\\x27]+(?=@)", "i"],
  ["(?<k>\\b[a-z0-9_.-]*?(?:token|secret|password|passwd|api[_-]?key|access[_-]?key|private[_-]?key)=[\"\\x27]?)[^\\s\"\\x27&;,)]+", "i"],
  ["(?<k>(?:^|\\s)--?(?:[a-z0-9]+-)*(?:token|secret|password|passwd|pass|api-?key|access-?key)(?:=|\\s+)[\"\\x27]?)[^\\s\"\\x27]+", "i"],
  ["\\b(?:sk-ant-|sk-|ghp_|gho_|ghu_|ghs_|ghr_|github_pat_|xox[abpr]-|crsr_|ft_live_|ft_test_|ft_run_|rk_live_|rk_test_|sk_live_|sk_test_|whsec_)[A-Za-z0-9_.-]{8,}", ""],
  ["\\bAKIA[0-9A-Z]{16}\\b", ""]
]

/** The text with every secret replaced by [REDACTED]. */
export function redact(text) {
  let out = String(text)
  for (const [source, flags] of PATTERNS) {
    out = out.replace(new RegExp(source, 'g' + flags), (...args) => {
      const groups = args[args.length - 1]
      return (groups && typeof groups === 'object' && groups.k ? groups.k : '') + '[REDACTED]'
    })
  }
  return out
}
