// Recall's Claude Code mod (Recall 1.18.0, Claude Code 2.1.287 or later; older versions do not load it and keep
// running the scripts in ../scripts unchanged).
//
// In Claude Code's own process, it:
// - records a failing shell command (what scripts/observe.sh records), without starting a process per tool call;
// - confirms the workspace when a Recall call fails because the session lost it, and runs that call once more;
// - draws Recall's row in the band above the prompt, beside other mods' rows (scripts/statusline.sh's segment).
//
// While the mod runs it refreshes a heartbeat file for its session, ~/.claude/recall/mod-heartbeat-<session id>.
// observe.sh stands down only while that heartbeat is fresh, so a mod that unloads mid-session (a reload error, a
// crash, a policy change) leaves it in charge again. statusline.sh decides from what is installed instead (1.18.1):
// where this mod draws, it leaves the Recall segment out from the first render.
//
// The API key is read from ~/.claude/recall/config.json (or RECALL_API_KEY) and only ever goes in the
// Authorization header: nothing here logs it, draws it or returns it to Claude.

/** Recall's MCP server, as .mcp.json names it. */
const SERVER = 'recall-remote'
const DEFAULT_URL = 'https://recallmcp.com'
/** How often the heartbeat is written and the queue is sent. */
const TICK_MS = 15_000
/** How often Recall's recent activity and latest version are read for the band. */
const STATUS_MS = 30_000
/** The most failures held while Recall cannot be reached; older ones are dropped first. */
const QUEUE_MAX = 50
/** The error a Recall call answers with once its session has lost the workspace (see rules/recall.md). */
const WORKSPACE_LOST = /WORKSPACE_NOT_CONFIRMED|restored workspace/i
/** A failing command's output, as observe.sh detects it. */
const FAILED = /(^error:|npm ERR!|FAILED|command not found|non-zero exit|exit code [1-9])/im
/** Recall calls that store a memory, counted in the band. */
const STORES = /__(store_memory|quick_store_decision)$/

// Shared by the hooks below; a module reload starts them again.
let config
let workspace
let version = ''
let heartbeatFile = ''
let queue = []
let stored = 0
let lastError = ''
let confirmed = false
let activity
let latest = ''

/**
 * The API key and the server URL: config.json first, as scripts/lib/config.sh reads them. RECALL_CONFIG_FILE names
 * another config file, as it does for the scripts (a test, or a second account).
 */
async function loadConfig($) {
  const home = await $.env.get('HOME')
  let file = {}
  try {
    file = JSON.parse(await $.fs.read((await $.env.get('RECALL_CONFIG_FILE')) || home + '/.claude/recall/config.json'))
  } catch {
    // No config file: the environment may still hold a key.
  }
  const apiKey = file.api_key || (await $.env.get('RECALL_API_KEY')) || ''
  const url = file.server_url || (await $.env.get('RECALL_SERVER_URL')) || DEFAULT_URL
  return { home, apiKey, url: String(url).replace(/\/+$/, '') }
}

/** The git remote without a user or token in it, as lib/config.sh sends it. */
export function cleanRemote(remote) {
  return remote ? String(remote).replace(/^(https?:\/\/)[^/@]*@/i, '$1') : ''
}

/** The project the session files under: the repository's main working tree, or the session's root outside git. */
async function loadWorkspace($) {
  const repo = await $.session.repo().catch(() => null)
  if (repo) return { path: repo.root, git_remote: cleanRemote(repo.remote) }
  return { path: await $.session.root(), git_remote: '' }
}

/** The memory a finished shell command is worth, by observe.sh's rule: only a failure, with its output. */
export function observation(e, result) {
  if (e.tool !== 'Bash' || !e.command || !result || result.deny) return undefined
  const out = result.result && typeof result.result === 'object' ? result.result.stderr || result.result.stdout || '' : result.text || ''
  const excerpt = String(out).slice(0, 500)
  if (!excerpt || !FAILED.test(excerpt)) return undefined
  return { content: '[Bash error] ' + e.command.slice(0, 200) + '\nOutput: ' + excerpt.slice(0, 300), importance: 6 }
}

/** Newer by semver numbers, as statusline.sh compares. */
export function newer(a, b) {
  const x = String(a).split('.').map((n) => parseInt(n, 10) || 0)
  const y = String(b).split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i += 1) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0)
  return false
}

function headers() {
  return {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + config.apiKey,
    'X-Recall-Workspace': workspace ? workspace.path : '',
    'X-Recall-Git-Remote': workspace ? workspace.git_remote : '',
  }
}

/** Send what is queued. Runs on the timer and at session end, never on a tool's path. */
async function flush($) {
  if (!config || !config.apiKey || queue.length === 0) return
  const batch = queue
  queue = []
  for (const [i, item] of batch.entries()) {
    let ok = false
    try {
      const response = await $.http.fetch(config.url + '/api/memories', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ content: item.content, context_type: 'information', importance: item.importance, tags: ['auto-hook', 'bash', 'error'], is_global: false }),
      })
      ok = response.ok
      lastError = ok ? '' : 'Recall answered ' + response.status
    } catch {
      lastError = 'Recall unreachable'
    }
    if (ok) stored += 1
    else {
      // Keep this one and the rest for the next round, behind what came since.
      queue = [...batch.slice(i), ...queue].slice(-QUEUE_MAX)
      break
    }
  }
  $.ui.invalidate('ui.render')
}

/** Tell observe.sh and statusline.sh that the mod is running for this session. */
async function beat($) {
  if (!heartbeatFile) return
  await $.fs.write(heartbeatFile, String(Math.floor((await $.clock.now()) / 1000)))
}

/** Recall's recent activity and latest version, as statusline.sh reads them from /api/status. */
async function readStatus($) {
  if (!config || !config.apiKey) return
  try {
    const response = await $.http.fetch(config.url + '/api/status', { headers: { Authorization: 'Bearer ' + config.apiKey } })
    if (!response.ok) return
    const data = JSON.parse(response.text).data || {}
    const now = await $.clock.now()
    activity = data.label && Number.isFinite(Number(data.elapsed_s)) ? { label: String(data.label), at: now - Number(data.elapsed_s) * 1000 } : activity
    latest = data.latest_version ? String(data.latest_version) : latest
    $.ui.invalidate('ui.render')
  } catch {
    // The band keeps what it last knew.
  }
}

/** Confirm this session's workspace with Recall's MCP server. */
async function confirmWorkspace($) {
  if (!workspace) workspace = await loadWorkspace($)
  const r = await $.mcp.call(SERVER, 'set_workspace', workspace)
  confirmed = !r.isError
  $.ui.invalidate('ui.render')
  return confirmed
}

function ago(ms) {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 2 ? 'just now' : s < 60 ? s + 's ago' : Math.round(s / 60) + 'm ago'
}

// The band's ledger layout, shared with FlockTab's and Foley's rows (design "A · Ledger", picked 2026-10-03): one row
// per product, the name in a fixed column, then the product's key value, then dim detail joined by " · ".
/** The name column, in terminal cells, so every product's key value lines up down the band. */
const NAME_COLUMNS = 9
/** Recall's colour for its name in the band, from the shared design. */
const RECALL_COLOUR = '#9db8f2'
/** Cells between the terminal's edge and the row: where Claude Code 2.1.288 starts the status line (measured). */
const LEFT_INSET = 2
/** Narrower than this, the detail keeps only its first part ("3 saved"). */
const WIDE_COLUMNS = 100

/**
 * Recall's row, from what the mod knows now: the workspace's name as the key value, then detail. A warning only
 * when something failed (a store did not reach Recall, Recall unreachable). Nothing about the workspace before
 * Claude confirms it: "not confirmed" read as an error.
 */
export function bandRow(state, columns = WIDE_COLUMNS) {
  const wide = columns >= WIDE_COLUMNS
  const detail = []
  if (state.stored > 0) detail.push(state.stored + (wide ? ' saved this session' : ' saved'))
  if (wide && state.activity && state.now - state.activity.at < 60_000) detail.push(state.activity.label + ' (' + ago(state.now - state.activity.at) + ')')
  if (wide && state.version) detail.push(String(state.version).split('.').slice(0, 2).join('.'))
  if (state.latest && state.version && newer(state.latest, state.version)) detail.push((wide ? 'update ' + state.latest + ': ' : '') + '/plugin update recall')
  const warning = []
  if (state.queued > 0) warning.push(state.queued + ' waiting')
  if (state.error) warning.push(state.error)
  const key = String((state.workspace && state.workspace.path) || '').split('/').filter(Boolean).pop() || 'no workspace'
  return { key, detail: wide ? detail : detail.slice(0, 1), warning }
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    config = await loadConfig($)
    workspace = await loadWorkspace($)
    try {
      version = JSON.parse(await $.fs.read($.plugin.root + '/.claude-plugin/plugin.json')).version || ''
    } catch {
      version = ''
    }
    const id = await $.session.id()
    heartbeatFile = /^[A-Za-z0-9_-]+$/.test(id) ? config.home + '/.claude/recall/mod-heartbeat-' + id : ''
    if (config.apiKey) {
      await beat($).catch(() => undefined)
      // Off the start path: the first prompt waits for none of these. No set_workspace here: a mod's MCP call
      // asks for permission like any other, so it would ask every session. The model's own set_workspace, the
      // first thing rules/recall.md has it do, confirms the workspace (the tool.call hook below sees it).
      $.clock.after(0, () => {
        readStatus($).catch(() => undefined)
      })
      $.clock.every(TICK_MS, () => {
        beat($).catch(() => undefined)
        flush($).catch(() => undefined)
        $.ui.invalidate('ui.render')
      })
      $.clock.every(STATUS_MS, () => readStatus($).catch(() => undefined))
    }
    return next(e)
  })

  // A short session (claude -p) can end before the timer: send what is left, best effort (1.5 s for all
  // session.end hooks together).
  on('session.end', async ($, e, next) => {
    await flush($).catch(() => undefined)
    return next(e)
  })

  // observe.sh in process: after the command has run, queue it if it failed. The result goes back to Claude
  // at once and unchanged; sending happens on the timer.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const result = await next(e)
    const item = config && config.apiKey ? observation(e, result) : undefined
    if (item) queue = [...queue, item].slice(-QUEUE_MAX)
    return result
  })

  // The "restored workspace" rule (rules/recall.md) as code: a Recall call that failed because the session lost
  // its workspace confirms the workspace and runs once more. set_workspace itself is never retried.
  on('tool.call', { tool: /^mcp__recall-remote__/ }, async ($, e, next) => {
    const first = await next(e)
    const ok = (r) => Boolean(r && !r.deny && !(r.result && r.result.isError) && !WORKSPACE_LOST.test(String(r.text || '')))
    if (e.tool === 'mcp__' + SERVER + '__set_workspace') {
      if (ok(first)) confirmed = true
      return first
    }
    let out = first
    if (first && !first.deny && WORKSPACE_LOST.test(String(first.text || ''))) {
      let again = false
      try {
        again = await confirmWorkspace($)
      } catch {
        again = false
      }
      if (again) {
        $.ui.log('workspace confirmed again; the call was retried')
        out = await next(e)
      }
    }
    if (STORES.test(e.tool) && ok(out)) {
      stored += 1
      $.ui.invalidate('ui.render')
    }
    return out
  })

  // Recall's row in the band above the prompt. It stands on its own: no other mod has to be there, and the rows
  // other mods draw stay, below it. Under a survey, or with nothing of its own to draw, the band is theirs as drawn.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const props = e.props || {}
    if (!config || !config.apiKey || props.hasSurvey) return next(e)
    const theirs = withoutTopGap(await next(e))
    const columns = props.bodyColumns || (e.viewport && e.viewport.columns) || WIDE_COLUMNS
    const row = bandRow({ version, stored, workspace, activity, now: await $.clock.now(), queued: queue.length, latest, error: lastError }, columns)
    const elements = $.ui.resolve(e)
    // One blank row above the band, only when the band has a row to spare for it; squeezed, the rows win.
    const gap = typeof props.maxRows === 'number' && props.maxRows >= rowsOf(bandTree(elements, row, theirs), columns) + 1
    return bandTree(elements, row, theirs, gap)
  })
}

/**
 * The band's one blank row above it, shared by every product that follows the same rule (FlockTab, Recall, Foley,
 * none reading another's files): each wraps its rows and the inner mods' rows in a Box with marginTop 1, and takes
 * the inner tree's own top margin away, so only the outermost one stays. This takes it away.
 */
export function withoutTopGap(node) {
  if (Array.isArray(node)) return node.length > 0 ? [withoutTopGap(node[0]), ...node.slice(1)] : node
  if (!node || typeof node !== 'object' || node.type !== 'Box' || !node.props || !('marginTop' in node.props)) return node
  const { marginTop: _gap, ...props } = node.props
  return { ...node, props }
}

/**
 * How many rows a band tree takes at `columns` cells, the rule every product uses to decide whether the gap fits.
 *
 * rowsOf v2 final: one rule for FlockTab, Recall and Foley.
 * Children: read node.children; if undefined, read node.props.children.
 * Not drawable: null, undefined, false, '', [], a Text with empty text, a Box that counts 0 rows.
 * Every Box:
 * - Its marginTop adds to its rows, whether it is a row or a column, empty or not.
 * - Its paddingLeft narrows its inside: paddingLeft, else paddingX, else padding.
 * - Vertical padding adds to its content rows: paddingTop + paddingBottom, else 2 x paddingY, else 2 x padding.
 * - A numeric height sets the content rows to at least that height.
 * - With no drawable children: 0 content rows, plus its vertical padding, height and marginTop.
 * Column Box: its children's rows add up, each counted at the inside width.
 * Row Box (any Box that is not a column): children with a numeric width are counted in that width; a Text whose wrap
 * starts with "truncate" is its own 1 line and does not join the others' text; the text of the other children wraps
 * in (inside - their fixed widths). It takes the tallest, at least 1.
 * Text: a wrap that starts with "truncate" is 1 line. Otherwise ceil(length / width), at least 1. A string or number
 * is a Text.
 * Every width is at least 1 cell. Height is border-box: a Box's rows are max(content + vertical padding, height),
 * plus its marginTop.
 */
export function rowsOf(node, columns) {
  const width = Math.max(1, columns || 0)
  const num = (v) => typeof v === 'number'
  const kids = (n) => {
    const c = n.children !== undefined ? n.children : n.props && n.props.children
    return c === undefined ? [] : [].concat(c)
  }
  const text = (n) => (typeof n === 'string' || num(n) ? String(n) : Array.isArray(n) ? n.map(text).join('') : n && typeof n === 'object' ? text(kids(n)) : '')
  if (node === null || node === undefined || node === false || node === '') return 0
  if (Array.isArray(node)) return node.reduce((sum, child) => sum + rowsOf(child, width), 0)
  if (typeof node !== 'object') return Math.max(1, Math.ceil(String(node).length / width))
  const props = node.props || {}
  if (node.type !== 'Box') {
    const length = text(node).length
    if (length === 0) return 0
    return String(props.wrap || '').startsWith('truncate') ? 1 : Math.max(1, Math.ceil(length / width))
  }
  const top = num(props.marginTop) ? props.marginTop : 0
  const left = num(props.paddingLeft) ? props.paddingLeft : num(props.paddingX) ? props.paddingX : num(props.padding) ? props.padding : 0
  const inside = Math.max(1, width - left)
  const vertical =
    num(props.paddingTop) || num(props.paddingBottom)
      ? (props.paddingTop || 0) + (props.paddingBottom || 0)
      : num(props.paddingY)
        ? 2 * props.paddingY
        : num(props.padding)
          ? 2 * props.padding
          : 0
  const fixed = (c) => c && typeof c === 'object' && !Array.isArray(c) && c.props && num(c.props.width)
  const children = kids(node).filter((c) => rowsOf(c, fixed(c) ? c.props.width : inside) > 0)
  let content = 0
  if (children.length > 0 && props.flexDirection === 'column') {
    content = children.reduce((sum, c) => sum + rowsOf(c, inside), 0)
  } else if (children.length > 0) {
    const widths = children.filter(fixed)
    const truncated = (c) => c && typeof c === 'object' && c.type !== 'Box' && c.props && String(c.props.wrap || '').startsWith('truncate')
    const rest = text(children.filter((c) => !fixed(c) && !truncated(c))).length
    const wrapped = Math.ceil(rest / Math.max(1, inside - widths.reduce((sum, c) => sum + c.props.width, 0)))
    content = Math.max(1, wrapped, ...widths.map((c) => rowsOf(c, c.props.width)))
  }
  return top + Math.max(content + vertical, num(props.height) ? props.height : 0)
}

/**
 * Recall's row as a tree: the name in its own column, then one line of the key value, the dim detail, and a
 * warning only for a failure. The value starts right after the name column, no gap, as FlockTab's and Foley's do:
 * inset 2 + name 9 = column 11. `gap` puts the band's blank row above it (marginTop 1). Only props from the
 * reference's Elements table (Text: color, bold, dimColor; Box: flex layout, width, margin, padding): the engine
 * refuses a whole tree with one prop an element does not take, such as `key` on Text.
 */
export function bandTree({ Box, Text }, row, theirs, gap = false) {
  const value = [row.key]
  if (row.detail.length) value.push(Text({ dimColor: true, children: [' · ' + row.detail.join(' · ')] }))
  if (row.warning.length) value.push(Text({ color: 'yellow', children: [' · ' + row.warning.join(' · ')] }))
  const mine = Box({
    flexDirection: 'row',
    paddingLeft: LEFT_INSET,
    children: [
      Box({ width: NAME_COLUMNS, flexShrink: 0, children: [Text({ bold: true, color: RECALL_COLOUR, children: ['Recall'] })] }),
      Box({ flexShrink: 1, children: [Text({ children: value })] }),
    ],
  })
  return Box({ flexDirection: 'column', ...(gap ? { marginTop: 1 } : {}), children: theirs ? [mine, theirs] : [mine] })
}
