// The task-contract validator.
//
// A task contract is the machine-readable statement of what a piece of agent
// work is allowed to be: its goal, the paths it may touch, what it must NOT do,
// what "done" means, and what should make it stop. Today those things live in
// prose — .claude/commands/*.md, docs/PM-BOARD.md, a paragraph in a chat — and
// prose cannot be checked, diffed meaningfully, or held to.
//
// WHAT THIS ENFORCES, AND WHAT IT DOES NOT
//
// It enforces that a CONTRACT is well-formed and internally consistent, and it
// makes any change to a contract's binding terms VISIBLE. It does not, and
// cannot at this stage, stop an agent from editing files: there is no hook, no
// role enforcement and no reviewer agent yet. The honest description is
// tamper-EVIDENT, not tamper-proof.
//
// Three mechanisms carry that:
//
//   1. contract_digest — a hash over the binding fields. Edit an acceptance
//      criterion without recomputing it and validation fails; recompute it and
//      the diff carries a changed digest line that a reviewer sees. Either way
//      the rewrite is not silent, which is the property being bought.
//
//   2. the always-forbidden floor — no contract, whatever its allowed_paths
//      say, may authorise edits to task contracts themselves, to the harness
//      permission file, or to git internals. A task cannot grant itself more
//      authority than it was given, because the grant itself is rejected.
//
//   3. path-contradiction rules — an allowance that can never take effect is a
//      bug in the contract, not a detail to be resolved at runtime.
//
// Exported as pure functions over already-parsed objects so the specs can drive
// every failure path without writing broken files to disk.

import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'

export const TASKS_DIR = '.agent/tasks'

/**
 * The fields a contract is BOUND by. The digest covers exactly these, so a
 * change to any of them must be accompanied by a new digest.
 *
 * Deliberately excludes free-form annotation (`notes`, `links`) — a contract
 * should be annotatable without re-sealing, or nobody will annotate it.
 */
export const BINDING_FIELDS = [
  'id',
  'goal',
  'owner_role',
  'risk',
  'allowed_paths',
  'forbidden_paths',
  'non_goals',
  'acceptance_criteria',
  'verification',
  'production_effect',
  'dependencies',
  'stop_conditions',
]

export const OPTIONAL_FIELDS = ['notes', 'links', 'contract_digest']

/**
 * owner_role and risk are REQUIRED and syntactically constrained, but their
 * vocabularies are deliberately NOT closed here.
 *
 * An earlier revision of this file invented both — six role names and
 * low/medium/high. That was wrong twice over: the role layer is a later phase
 * that will define and enforce its own vocabulary, and a second competing role
 * model invented in the task format would have to be migrated away the moment
 * that lands. For risk, the intended model is a control-plane risk taxonomy
 * that does not exist in this repository yet (searched: no R0-R4 model, no risk
 * tiers in docs/, and "control plane" here means only the Gate 3 key revision).
 *
 * Guessing a second time would be the same mistake with different values. So
 * the field shape is fixed — a lowercase kebab-case token, required, present in
 * every contract, covered by the digest — and the closed set is left to the
 * layer that will consume it. Tightening a syntactic constraint into an enum
 * later is a pure addition; unpicking a wrong enum from committed contracts is
 * not.
 */
export const TOKEN = /^[a-z0-9]+(-[a-z0-9]+)*$/

/**
 * production_effect DOES stay a closed set. Unlike role and risk it is not a
 * taxonomy anyone else is designing — it is a statement of blast radius, and
 * its values map to things that already exist in this repository: a merge to
 * main deploys, a migration touches the database, a store release goes through
 * review. A contract that cannot say which of those it does is not describing
 * the work.
 */
export const PRODUCTION_EFFECTS = [
  'none',
  'deploy-on-merge',
  'database',
  'store-release',
  'external-service',
]

/**
 * Paths no contract may ever place in allowed_paths, whatever else it says.
 *
 * This is the "cannot expand its own scope" rule. A task that could authorise
 * edits to .agent/tasks/** could rewrite its own acceptance criteria and call
 * the result compliant; one that could authorise .claude/settings.json could
 * widen the harness permission allow-list. Both are refused at the contract
 * level, so the escalation cannot even be expressed.
 */
export const ALWAYS_FORBIDDEN = [
  '.agent/tasks/**',
  '.claude/settings.json',
  '.claude/settings.local.json',
  '.git/**',
]

/**
 * THE PATH GRAMMAR. Exactly two accepted forms:
 *
 *   an exact repository-relative POSIX path      src/App.jsx
 *   a directory subtree                          src/**
 *
 * Nothing else. No `*` segments, no `?`, no character classes or braces, no
 * backslashes, no drive letters, no bare `**`.
 *
 * This is not tidiness. `covers()` below reasons about containment, and it can
 * only reason exactly about these two forms — so anything it cannot decide must
 * not be expressible. With the grammar closed, the ALWAYS_FORBIDDEN floor is
 * COMPLETE: every accepted expression either matches exactly one path, or
 * matches exactly one subtree, and in both cases containment against a floor
 * entry is decidable rather than approximated.
 *
 * The escape hatch this closes: `.agent/tasks/*` and `.agent/*` both reach task
 * contracts, and neither is covered by prefix logic that only understands
 * `/**`. Under the old permissive grammar they were accepted and then silently
 * not analysed.
 */
const PATH_SEGMENT = /^[A-Za-z0-9._-]+$/
export function pathGrammarError(p) {
  const raw = String(p)
  if (raw !== raw.trim()) return 'has leading or trailing whitespace'
  if (raw === '') return 'is empty'
  if (raw.includes('\\')) return 'uses a backslash; paths are POSIX and repository-relative'
  if (/^[A-Za-z]:/.test(raw)) return 'looks like a Windows drive path'
  if (raw.startsWith('/')) return 'is absolute; paths must be repository-relative'
  const body = raw.endsWith('/**') ? raw.slice(0, -3) : raw
  if (raw === '**') return 'is a bare "**"; name a directory subtree instead'
  if (body === '') return 'names no directory before "/**"'
  const segments = body.split('/')
  for (const seg of segments) {
    if (seg === '') return 'contains an empty path segment'
    if (seg === '..') return 'escapes the repository with ".."'
    if (seg === '.') return 'contains a "." segment'
    if (!PATH_SEGMENT.test(seg)) {
      return 'contains unsupported glob syntax in "' + seg +
        '" — only an exact path or a directory ending in "/**" can be reasoned about'
    }
  }
  return null
}

const isPlainObject = v => !!v && typeof v === 'object' && !Array.isArray(v)
const isNonEmptyString = v => typeof v === 'string' && v.trim().length > 0
const isStringArray = v => Array.isArray(v) && v.every(isNonEmptyString)

/** Canonical JSON: sorted keys, no incidental whitespace. */
export function canonicalise(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalise).join(',') + ']'
  if (isPlainObject(value)) {
    return '{' + Object.keys(value).sort()
      .map(k => JSON.stringify(k) + ':' + canonicalise(value[k]))
      .join(',') + '}'
  }
  return JSON.stringify(value === undefined ? null : value)
}

/** The digest over the binding fields only. */
export function computeDigest(contract) {
  const bound = {}
  for (const f of BINDING_FIELDS) bound[f] = contract?.[f]
  return createHash('sha256').update(canonicalise(bound)).digest('hex')
}

/**
 * Normalise a glob for comparison: strip a leading ./, collapse duplicate
 * slashes. Does NOT expand — comparison is structural, not filesystem-based,
 * so the result never depends on which files happen to exist.
 */
export function normalisePath(p) {
  return String(p).replace(/^\.\//, '').replace(/\/{2,}/g, '/')
}

/** Does pattern `outer` cover everything pattern `inner` covers? */
export function covers(outer, inner) {
  const o = normalisePath(outer)
  const i = normalisePath(inner)
  if (o === i) return true
  if (o.endsWith('/**')) {
    const prefix = o.slice(0, -2)          // keep the trailing slash
    return i.startsWith(prefix)
  }
  if (o === '**') return true
  return false
}

/**
 * Every rule, over an already-parsed contract. Returns violation strings —
 * empty means the contract is well-formed. `knownIds` lets dependency
 * resolution be checked across the whole set; `npmScripts` lets verification
 * commands be checked against reality.
 */
export function findContractViolations(contract, { fileName, knownIds = [], npmScripts = null, skipDigest = false } = {}) {
  const out = []
  const at = fileName ? fileName + ': ' : ''

  if (!isPlainObject(contract)) return [at + 'contract must be a JSON object']

  // ---- unknown / missing keys -------------------------------------------
  const allowedKeys = new Set([...BINDING_FIELDS, ...OPTIONAL_FIELDS])
  for (const key of Object.keys(contract)) {
    if (!allowedKeys.has(key)) out.push(at + 'unknown field: ' + key)
  }
  for (const field of BINDING_FIELDS) {
    if (!(field in contract)) out.push(at + 'missing required field: ' + field)
  }

  // ---- scalars -----------------------------------------------------------
  if ('id' in contract) {
    if (!isNonEmptyString(contract.id) || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(contract.id)) {
      out.push(at + 'id must be lowercase kebab-case: ' + JSON.stringify(contract.id))
    } else if (fileName) {
      const stem = path.basename(fileName).replace(/\.json$/, '')
      if (stem !== contract.id) out.push(at + 'id "' + contract.id + '" does not match filename "' + stem + '"')
    }
  }
  if ('goal' in contract && !isNonEmptyString(contract.goal)) {
    out.push(at + 'goal must be a non-empty string')
  }
  // Syntactic only, by design — see the note on TOKEN above. The closed set
  // arrives with the layer that enforces it.
  for (const field of ['owner_role', 'risk']) {
    if (!(field in contract)) continue
    if (!isNonEmptyString(contract[field]) || !TOKEN.test(contract[field])) {
      out.push(at + field + ' must be a lowercase kebab-case token (got ' +
        JSON.stringify(contract[field]) + ')')
    }
  }
  if ('production_effect' in contract && !PRODUCTION_EFFECTS.includes(contract.production_effect)) {
    out.push(at + 'production_effect must be one of ' + PRODUCTION_EFFECTS.join(', ') + ' (got ' +
      JSON.stringify(contract.production_effect) + ')')
  }

  // ---- arrays that must carry something ----------------------------------
  for (const field of ['non_goals', 'acceptance_criteria', 'verification', 'stop_conditions', 'allowed_paths']) {
    if (!(field in contract)) continue
    if (!isStringArray(contract[field])) {
      out.push(at + field + ' must be an array of non-empty strings')
    } else if (contract[field].length === 0) {
      // An empty acceptance_criteria means "anything counts as done"; an empty
      // allowed_paths means "no work is authorised". Both are contradictions.
      out.push(at + field + ' must not be empty')
    }
  }
  // forbidden_paths and dependencies may legitimately be empty, but must exist
  // and be arrays — an absent key is ambiguous, an empty one is a statement.
  for (const field of ['forbidden_paths', 'dependencies']) {
    if (field in contract && !isStringArray(contract[field]) && !(Array.isArray(contract[field]) && contract[field].length === 0)) {
      out.push(at + field + ' must be an array of strings (may be empty)')
    }
  }

  // ---- paths -------------------------------------------------------------
  const allowed = Array.isArray(contract.allowed_paths) ? contract.allowed_paths.filter(isNonEmptyString) : []
  const forbidden = Array.isArray(contract.forbidden_paths) ? contract.forbidden_paths.filter(isNonEmptyString) : []

  // The grammar gate. Everything downstream — the floor, the contradiction
  // rules — assumes each expression is one of the two decidable forms.
  for (const [field, list] of [['allowed_paths', allowed], ['forbidden_paths', forbidden]]) {
    for (const p of list) {
      const err = pathGrammarError(p)
      if (err) out.push(at + field + ' entry "' + p + '" ' + err)
    }
  }
  // A path that failed the grammar cannot be reasoned about, so containment is
  // not attempted for it — reporting one clear cause beats a second, derived
  // complaint about a pattern nobody should have written.
  const okAllowed = allowed.filter(p => !pathGrammarError(p))
  const okForbidden = forbidden.filter(p => !pathGrammarError(p))

  // The floor. Refused even if the contract also forbids it — an allowance
  // that names one of these is a mistake to be corrected, not reconciled.
  for (const a of okAllowed) {
    for (const floor of ALWAYS_FORBIDDEN) {
      if (covers(a, floor) || covers(floor, a)) {
        out.push(at + 'allowed_paths may never authorise ' + floor + ' (via "' + a +
          '") — a task cannot widen its own contract or the harness permissions')
      }
    }
  }

  // Contradictions. A carve-out (forbidden INSIDE allowed) is normal and fine;
  // what is contradictory is an allowance that can never take effect.
  for (const a of okAllowed) {
    for (const f of okForbidden) {
      if (normalisePath(a) === normalisePath(f)) {
        out.push(at + 'path "' + a + '" is both allowed and forbidden')
      } else if (covers(f, a)) {
        out.push(at + 'allowed path "' + a + '" is entirely inside forbidden path "' + f +
          '" — the allowance can never take effect')
      }
    }
  }

  // ---- verification ------------------------------------------------------
  if (isStringArray(contract.verification) && npmScripts) {
    for (const cmd of contract.verification) {
      const m = cmd.match(/^npm run ([\w:-]+)$/)
      if (m && !(m[1] in npmScripts)) {
        out.push(at + 'verification names an npm script that does not exist: ' + cmd)
      }
    }
  }

  // ---- dependencies ------------------------------------------------------
  if (Array.isArray(contract.dependencies)) {
    for (const dep of contract.dependencies) {
      if (!isNonEmptyString(dep)) continue
      if (dep === contract.id) out.push(at + 'a task cannot depend on itself')
      else if (knownIds.length && !knownIds.includes(dep)) {
        out.push(at + 'dependency does not resolve to a known task: ' + dep)
      }
    }
  }

  // ---- the seal ----------------------------------------------------------
  // skipDigest is for the --seal pre-flight ONLY: the digest is about to be
  // recomputed, so complaining that it is stale would be noise. Every other
  // rule still runs, which is what makes sealing unable to bless a bad file.
  if (skipDigest) return out
  if (!('contract_digest' in contract)) {
    out.push(at + 'missing contract_digest — run `npm run verify:tasks -- --seal` and commit the result')
  } else if (!/^[0-9a-f]{64}$/.test(String(contract.contract_digest))) {
    out.push(at + 'contract_digest must be a 64-character sha256 hex digest')
  } else {
    const expected = computeDigest(contract)
    if (expected !== contract.contract_digest) {
      out.push(at + 'contract_digest does not match the binding fields — they were edited ' +
        'without re-sealing. Expected ' + expected + ', found ' + contract.contract_digest + '. ' +
        'Re-sealing is a deliberate act and shows up in review as a changed digest.')
    }
  }

  return out
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function loadAll(dir) {
  let names = []
  try {
    names = (await readdir(dir)).filter(n => n.endsWith('.json'))
  } catch {
    return { missing: true, files: [] }
  }
  const files = []
  for (const name of names.sort()) {
    const full = path.join(dir, name)
    const raw = await readFile(full, 'utf8')
    let parsed = null
    let parseError = null
    try { parsed = JSON.parse(raw) } catch (err) { parseError = err.message }
    files.push({ name, full, raw, parsed, parseError })
  }
  return { missing: false, files }
}

/** Parse + validate a freshly-read set. Returns { files, problems }. */
async function loadAndCheck({ skipDigest }) {
  const { missing, files } = await loadAll(TASKS_DIR)
  if (missing) return { missing: true, files: [], problems: [] }

  let npmScripts = null
  try { npmScripts = JSON.parse(await readFile('package.json', 'utf8')).scripts } catch { /* optional */ }

  const problems = []
  for (const f of files) {
    if (!f.parsed) problems.push(f.name + ': invalid JSON — ' + f.parseError)
  }
  const knownIds = files.filter(f => f.parsed && f.parsed.id).map(f => f.parsed.id)
  for (const f of files) {
    if (!f.parsed) continue
    problems.push(...findContractViolations(f.parsed, { fileName: f.name, knownIds, npmScripts, skipDigest }))
  }
  return { missing: false, files, problems }
}

function report(problems) {
  process.stderr.write('verify-task-contracts: ' + problems.length + ' problem(s)\n\n' +
    problems.map(p => '  FAIL  ' + p).join('\n') + '\n')
}

async function main(argv = process.argv.slice(2)) {
  const seal = argv.includes('--seal')

  if (!seal) {
    const { missing, files, problems } = await loadAndCheck({ skipDigest: false })
    if (missing) {
      process.stdout.write('verify-task-contracts: no ' + TASKS_DIR + ' directory — nothing to check.\n')
      return
    }
    if (problems.length) { report(problems); process.exitCode = 1; return }
    process.stdout.write('verify-task-contracts: ' + files.length +
      ' contract(s) valid, sealed and internally consistent.\n')
    return
  }

  // ---- --seal -----------------------------------------------------------
  //
  // Sealing is the one operation that WRITES, so it is the one that must never
  // launder a broken contract into an apparently-valid one. A digest computed
  // over a contract that authorises .agent/tasks/** would make that contract
  // pass every subsequent check — the seal would be certifying the escalation.
  //
  // So: validate EVERYTHING except the digest first, refuse to write anything
  // at all if a single contract is unsound, and re-validate the written result
  // in full before reporting success.
  const preflight = await loadAndCheck({ skipDigest: true })
  if (preflight.missing) {
    process.stdout.write('verify-task-contracts: no ' + TASKS_DIR + ' directory — nothing to seal.\n')
    return
  }
  if (preflight.problems.length) {
    report(preflight.problems)
    process.stderr.write('\nverify-task-contracts: refusing to seal — no files were modified.\n' +
      'A digest over an invalid contract would certify it. Fix the problems above, then seal.\n')
    process.exitCode = 1
    return
  }

  const { writeFile } = await import('node:fs/promises')
  const sealed = []
  for (const f of preflight.files) {
    const digest = computeDigest(f.parsed)
    if (f.parsed.contract_digest === digest) continue
    await writeFile(f.full, JSON.stringify({ ...f.parsed, contract_digest: digest }, null, 2) + '\n')
    sealed.push(f.name + ' -> ' + digest.slice(0, 12) + '…')
  }

  // Re-read from disk and check in full. If writing produced anything that does
  // not validate, say so rather than reporting a successful seal.
  const after = await loadAndCheck({ skipDigest: false })
  if (after.problems.length) {
    report(after.problems)
    process.stderr.write('\nverify-task-contracts: the sealed set does not validate. ' +
      'Inspect ' + TASKS_DIR + ' before committing.\n')
    process.exitCode = 1
    return
  }

  for (const line of sealed) process.stdout.write('sealed ' + line + '\n')
  process.stdout.write('verify-task-contracts: ' + (sealed.length || 'no') +
    ' contract(s) re-sealed; ' + after.files.length + ' valid. ' +
    'Review the digest changes before committing.\n')
}

if (process.argv[1] && process.argv[1].endsWith('verify-task-contracts.mjs')) {
  main().catch(err => {
    process.stderr.write(String((err && err.stack) || err) + '\n')
    process.exitCode = 1
  })
}
