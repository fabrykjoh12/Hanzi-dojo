#!/usr/bin/env node
// PROBE PATH GUARD — a deterministic PreToolUse decision for Edit/Write.
//
// This is a RECONNAISSANCE ARTEFACT, not the proposed mechanism. Its only job
// is to answer one question with runtime evidence: does a PreToolUse hook
// declared in a SUBAGENT'S OWN FRONTMATTER actually fire and actually deny?
//
// Everything here fails closed. Unknown tool, missing path, unparseable input,
// a path that cannot be canonicalised — all deny. Exit 2 is the hard block used
// for internal errors, so a crash in this file cannot become an allow.
import { realpathSync, existsSync, appendFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = realpathSync(process.env.CLAUDE_PROJECT_DIR || process.cwd())
const LOG = path.join(ROOT, 'probe-sandbox', 'guard-decisions.log')
const DENY_ALL = process.argv.includes('--deny-all')

/** The probe's entire write allowance. Deliberately one directory. */
const ALLOWED = ['probe-sandbox/allowed/**']

/** Never writable, whatever the allowance says. The governance floor, plus the
 *  guard's own implementation and the agent definitions that bind it. */
const FORBIDDEN = [
  '.agent/tasks/**', '.agent/roles.json',
  '.claude/settings.json', '.claude/settings.local.json',
  '.claude/agents/**', '.git/**',
  'tools/probe-path-guard.mjs',
]

const covers = (pattern, rel) =>
  pattern.endsWith('/**') ? rel === pattern.slice(0, -3) || rel.startsWith(pattern.slice(0, -2)) : rel === pattern

/** Resolve through symlinks even when the target does not exist yet: realpath
 *  the nearest existing ancestor, then re-append the rest. A plain resolve()
 *  would normalise `..` away textually and never see a symlinked directory. */
function canonical(p) {
  let abs = path.isAbsolute(p) ? p : path.resolve(ROOT, p)
  const tail = []
  let cur = abs
  for (let i = 0; i < 64; i++) {
    if (existsSync(cur)) return path.join(realpathSync(cur), ...tail.reverse())
    const parent = path.dirname(cur)
    if (parent === cur) return null
    tail.push(path.basename(cur))
    cur = parent
  }
  return null
}

const decide = (permissionDecision, permissionDecisionReason) => {
  try {
    appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), permissionDecision, permissionDecisionReason }) + '\n')
  } catch { /* logging must never change the decision */ }
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision, permissionDecisionReason },
  }) + '\n')
  process.exit(0)
}

let raw = ''
process.stdin.on('data', c => { raw += c })
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(raw)
    const tool = input.tool_name
    if (!['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
      return decide('deny', 'probe-guard: unclassifiable tool ' + JSON.stringify(tool) + ' — fail closed')
    }
    if (DENY_ALL) return decide('deny', 'probe-guard: NEGATIVE CONTROL — denying an otherwise allowed write')

    const file = input.tool_input?.file_path ?? input.tool_input?.notebook_path
    if (typeof file !== 'string' || file.trim() === '') {
      return decide('deny', 'probe-guard: no file_path in tool_input — fail closed')
    }

    const abs = canonical(file)
    if (abs === null) return decide('deny', 'probe-guard: path could not be canonicalised — fail closed')
    if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) {
      return decide('deny', 'probe-guard: resolves outside the repository (' + abs + ')')
    }
    const rel = path.relative(ROOT, abs).split(path.sep).join('/')

    for (const f of FORBIDDEN) {
      if (covers(f, rel)) return decide('deny', 'probe-guard: ' + rel + ' is on the forbidden floor (' + f + ')')
    }
    if (!ALLOWED.some(a => covers(a, rel))) {
      return decide('deny', 'probe-guard: ' + rel + ' is outside allowed_paths [' + ALLOWED.join(', ') + ']')
    }
    return decide('allow', 'probe-guard: ' + rel + ' is inside allowed_paths')
  } catch (err) {
    process.stderr.write('probe-guard: internal error, failing closed — ' + (err && err.message) + '\n')
    process.exit(2)
  }
})
