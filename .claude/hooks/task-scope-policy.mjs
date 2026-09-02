/**
 * THE RUNTIME TASK-SCOPE POLICY — protected control plane, Tier 1.
 *
 * Decides whether one tool call by an untrusted producer subagent may write one
 * path, from the sealed task contract the launcher bound to this session.
 *
 * WHY THIS FILE IS HERE AND NOT IN tools/.
 *
 * This is the runtime authorization path. If it lived in an ordinary Tier 2
 * module, a task authorized to edit that module could rewrite the guard that
 * constrains it — the exact escalation the tier model exists to prevent, one
 * layer down. So the decision logic sits inside `.claude/hooks/`, reachable
 * only through the `runtime-hook-maintenance` grant, and it imports nothing but
 * Node builtins. A spec reads this file and fails on any other import.
 *
 * The price is a small duplicated representation of path and seal semantics
 * that `tools/verify-task-contracts.mjs` also implements. That duplication is
 * deliberate and it is held honest by parity specs over every contract on disk
 * and over generated path pairs: if the two ever disagree, a test fails. Two
 * divergent security models maintained silently would be worse than either.
 *
 * WHAT THIS DOES NOT CLAIM. Nothing here is active until the hook is registered
 * in `.claude/settings.json`, which is a separate task under a different grant.
 * Until then this module is inert code with proofs attached. And a launcher that
 * passes `--settings '{"disableAllHooks":true}'` silences the hook entirely;
 * project settings cannot pin it back. That is a trusted-launcher residual,
 * documented rather than papered over, and out of the producer's reach only
 * because it is a process-launch flag and the producer has no Bash.
 *
 * FAIL CLOSED ON EVERY SECURITY QUESTION IT ANSWERS. Once `decide()` has
 * established that this is a producer's write, every route out of it is a deny
 * unless the write is positively established as in scope — "could not
 * establish" is never authorized. The two early allows above that point are not
 * exceptions to the rule but statements that the question was never this
 * policy's: a non-write tool, and a call with no `agent_type`, which is the
 * trusted driver. The driver holds Bash and git by design, and pretending to
 * police it would be a claim the mechanism cannot support.
 *
 * PLATFORM ASSUMPTION, stated because it is not enforced: path comparison is
 * byte-exact and case-sensitive, matching the contract grammar and Linux, where
 * CI runs. On a case-insensitive volume a differently-cased spelling of a floor
 * path could in principle resolve to itself and evade the comparison. Registration
 * should either normalise case or restate this assumption for the platforms it
 * covers.
 */

import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'

// ---------------------------------------------------------------------------
// TIER 0 — the absolute floor. Checked first, before the binding is even parsed,
// because no contract and no grant can authorize any of it. A copy of
// ALWAYS_FORBIDDEN, pinned to the canonical list by a parity spec.
// ---------------------------------------------------------------------------
export const FLOOR = [
  '.agent/tasks/**',
  '.agent/roles.json',
  '.claude/settings.local.json',
  '.git/**',
]

/** The env var the trusted launcher sets. Never read from producer-writable state. */
export const BINDING_ENV = 'HANZI_TASK_BINDING'

/** Where a contract may live. A binding naming anything else is refused. */
export const TASKS_DIR = '.agent/tasks'

/** The canonical role source. Tier 0, so it cannot be edited by any task. */
export const ROLES_FILE = '.agent/roles.json'

/** Risk order, and the floor a control-plane grant may be declared at. */
export const RISK_LEVELS = ['r0', 'r1', 'r2', 'r3', 'r4']
export const CONTROL_PLANE_MIN_RISK = 'r3'

/** The only keys a control_plane declaration may carry. Closed. */
export const CONTROL_PLANE_KEYS = ['grant', 'protected_paths', 'justification']

/** Tool calls that write. Anything else is not this policy's business. */
export const WRITE_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit']

/**
 * GRANT -> the paths it reaches. A protected copy of CONTROL_PLANE_GRANTS.
 *
 * Duplicated rather than imported for the reason in the header: importing it
 * from `tools/` would put the runtime authorization path back under ordinary
 * task authority. A parity spec asserts this equals the canonical registry, so
 * a grant added there without adding it here fails a test.
 */
export const GRANTS = {
  'runtime-policy-maintenance': ['.claude/settings.json'],
  'runtime-hook-maintenance': ['.claude/hooks/**'],
}

const REQUIRED_BINDING_FIELDS = [
  'id', 'goal', 'owner_role', 'risk', 'allowed_paths', 'forbidden_paths',
  'non_goals', 'acceptance_criteria', 'verification', 'production_effect',
  'dependencies', 'stop_conditions',
]
const OPTIONAL_BINDING_FIELDS = ['control_plane']

const isPlainObject = v => !!v && typeof v === 'object' && !Array.isArray(v)
const isNonEmptyString = v => typeof v === 'string' && v.trim().length > 0

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

/** The seal, recomputed here rather than trusted from the file. */
export function computeDigest(contract) {
  const bound = {}
  for (const f of REQUIRED_BINDING_FIELDS) bound[f] = contract?.[f]
  for (const f of OPTIONAL_BINDING_FIELDS) {
    if (contract && Object.prototype.hasOwnProperty.call(contract, f)) bound[f] = contract[f]
  }
  return createHash('sha256').update(canonicalise(bound)).digest('hex')
}

const PATH_SEGMENT = /^[A-Za-z0-9._-]+$/

/** The decidable grammar: an exact path, or a `dir/**` subtree. Nothing else. */
export function pathGrammarError(p) {
  const raw = String(p)
  if (raw !== raw.trim()) return 'has leading or trailing whitespace'
  if (raw === '') return 'is empty'
  if (raw.includes('\\')) return 'uses a backslash'
  if (/^[A-Za-z]:/.test(raw)) return 'looks like a Windows drive path'
  if (raw.startsWith('/')) return 'is absolute'
  if (raw === '**') return 'is a bare "**"'
  const body = raw.endsWith('/**') ? raw.slice(0, -3) : raw
  if (body === '') return 'names no directory before "/**"'
  for (const seg of body.split('/')) {
    if (seg === '') return 'contains an empty path segment'
    if (seg === '..') return 'escapes the repository with ".."'
    if (seg === '.') return 'contains a "." segment'
    if (!PATH_SEGMENT.test(seg)) return 'contains unsupported glob syntax in "' + seg + '"'
  }
  return null
}

export function normalisePath(p) {
  return String(p).replace(/^\.\//, '').replace(/\/{2,}/g, '/')
}

/** Does pattern `outer` cover everything `inner` covers? */
export function covers(outer, inner) {
  const o = normalisePath(outer)
  const i = normalisePath(inner)
  if (o === i) return true
  if (o.endsWith('/**')) return i.startsWith(o.slice(0, -2))
  if (o === '**') return true
  return false
}

/**
 * Repository-relative form of a path, computed lexically. No filesystem access,
 * so it works before the binding is parsed and cannot be defeated by an
 * unreadable directory — but it also cannot see through a symlink, which is why
 * resolveWithin exists and why the floor is checked twice.
 */
export function lexicalRelative(root, target) {
  const t = String(target)
  if (!path.isAbsolute(t)) return normalisePath(t)
  const rel = path.relative(root, t)
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return normalisePath(t)
  return normalisePath(rel.split(path.sep).join('/'))
}

/**
 * Which role may hold a control-plane grant — derived from the role model, not
 * named here, exactly as the canonical validator derives it: the single role
 * claiming the control plane in its own purpose or authority. Ambiguity is
 * refused rather than guessed, and a null holder means no grant is honoured.
 */
const CLAIMS_CONTROL_PLANE = /control[-\s]plane/i
export function controlPlaneRoleIn(roleModel) {
  const roles = Array.isArray(roleModel?.roles) ? roleModel.roles : []
  const claiming = roles.filter((r) => {
    const authority = Array.isArray(r?.authority) ? r.authority : []
    return [r?.purpose, ...authority].some(t => typeof t === 'string' && CLAIMS_CONTROL_PLANE.test(t))
  })
  return claiming.length === 1 && isNonEmptyString(claiming[0].id) ? claiming[0].id : null
}

const deny = (reason) => ({ allow: false, reason })
const allow = (reason) => ({ allow: true, reason })

/**
 * THE BINDING. One sealed contract, named exactly, by the trusted launcher.
 *
 * Confidentiality is not the claim here — the value may well be visible to
 * anything that can read the process environment. The property that matters is
 * that the producer cannot CHOOSE or MUTATE it: it is set on the launcher
 * process before the session exists, and a Bash-less producer has no tool that
 * reads or writes process environment at all.
 *
 * There is deliberately no discovery of any kind. No directory scan, no
 * newest-file heuristic, no inference from the prompt, the cwd or the branch,
 * and no fallback when the binding is absent — every one of those would let the
 * thing being governed influence which rules govern it.
 */
export function parseBinding(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { error: 'no ' + BINDING_ENV + ' in the environment — the session is not bound to a task contract' }
  }
  let parsed
  try {
    parsed = JSON.parse(String(raw))
  } catch {
    return { error: BINDING_ENV + ' is not valid JSON' }
  }
  if (!isPlainObject(parsed)) return { error: BINDING_ENV + ' must be a JSON object' }
  for (const f of ['contract_id', 'contract_digest', 'contract_path']) {
    if (!isNonEmptyString(parsed[f])) return { error: BINDING_ENV + '.' + f + ' is missing or not a string' }
  }
  const id = parsed.contract_id.trim()
  if (!PATH_SEGMENT.test(id) || id.includes('.')) {
    return { error: BINDING_ENV + '.contract_id is not a bare contract id' }
  }
  if (!/^[0-9a-f]{64}$/.test(parsed.contract_digest.trim())) {
    return { error: BINDING_ENV + '.contract_digest is not a sha256 hex digest' }
  }
  // The canonical path is DERIVED and then compared, never taken on trust: a
  // binding that could name any path could name a file the producer wrote.
  const expected = TASKS_DIR + '/' + id + '.json'
  if (normalisePath(parsed.contract_path.trim()) !== expected) {
    return { error: BINDING_ENV + '.contract_path must be exactly ' + expected }
  }
  return { binding: { id, digest: parsed.contract_digest.trim(), path: expected } }
}

/**
 * Re-read the bound contract and verify its seal against the binding.
 *
 * Re-read on every decision, not cached: a contract edited mid-session must not
 * keep authorizing work under the terms it used to carry. The digest is
 * recomputed from the file's own content and must equal BOTH the digest the
 * file claims and the digest the launcher bound.
 */
export function loadBoundContract(binding, { root, readFile = readFileSync } = {}) {
  const abs = path.join(root, binding.path)
  let text
  try {
    text = readFile(abs, 'utf8')
  } catch {
    return { error: 'bound contract ' + binding.path + ' could not be read' }
  }
  let contract
  try {
    contract = JSON.parse(text)
  } catch {
    return { error: 'bound contract ' + binding.path + ' is not valid JSON' }
  }
  if (!isPlainObject(contract)) return { error: 'bound contract ' + binding.path + ' is not an object' }
  if (contract.id !== binding.id) {
    return { error: 'bound contract id "' + contract.id + '" does not match the binding id "' + binding.id + '"' }
  }
  if (!isNonEmptyString(contract.contract_digest)) {
    return { error: 'bound contract ' + binding.path + ' is unsealed' }
  }
  const actual = computeDigest(contract)
  if (actual !== contract.contract_digest) {
    return { error: 'bound contract ' + binding.path + ' has a stale seal — its fields were edited without re-sealing' }
  }
  if (actual !== binding.digest) {
    return { error: 'bound contract digest ' + actual + ' does not match the launcher-bound digest ' + binding.digest }
  }
  return { contract }
}

/**
 * The effective scope: allowed_paths united with VALIDLY granted protected
 * paths. A grant widens scope only when the whole declaration checks out, which
 * mirrors the sealed-contract semantics exactly — a half-understood grant is
 * authority nobody reviewed.
 *
 * This is a runtime re-derivation, not a call into the validator. Parity specs
 * hold the two to the same answer, over the contracts on disk AND over
 * deliberately invalid ones — the second half matters, because a parity check
 * that only ever sees valid contracts cannot notice a runtime path that is more
 * permissive than the validator for the contracts the validator rejects.
 */
export function effectiveScope(contract, { grants = GRANTS, root = '.', readFile = readFileSync } = {}) {
  // allowed_paths is filtered by the GRAMMAR, not merely by being a string. A
  // spelling the canonical grammar rejects — a bare "**" above all — would
  // otherwise authorise everything below Tier 0 at runtime while the validator
  // refuses the contract outright.
  const declared = Array.isArray(contract.allowed_paths)
    ? contract.allowed_paths.filter(p => isNonEmptyString(p) && !pathGrammarError(p))
    : []
  if (!Object.prototype.hasOwnProperty.call(contract, 'control_plane')) return declared
  const cp = contract.control_plane
  if (!isPlainObject(cp)) return declared

  // ROLE AND RISK. The canonical grantedProtectedPaths() returns nothing when
  // controlPlaneViolations() reports ANYTHING, and those violations include the
  // owning role and the r3 floor. Checking only the shape here would honour, at
  // runtime, a grant the validator refuses — and the gap is widest exactly
  // where it matters: a low-risk contract in an unrelated domain claiming
  // authority over the guard's own decision logic.
  let roleModel
  try {
    roleModel = JSON.parse(readFile(path.join(root, ROLES_FILE), 'utf8'))
  } catch {
    return declared
  }
  const holder = controlPlaneRoleIn(roleModel)
  if (holder === null || contract.owner_role !== holder) return declared
  const declaredRisk = RISK_LEVELS.indexOf(contract.risk)
  if (declaredRisk < 0 || declaredRisk < RISK_LEVELS.indexOf(CONTROL_PLANE_MIN_RISK)) return declared

  for (const key of Object.keys(cp)) {
    if (!CONTROL_PLANE_KEYS.includes(key)) return declared
  }

  const mapped = isNonEmptyString(cp.grant) &&
    Object.prototype.hasOwnProperty.call(grants, cp.grant)
    ? grants[cp.grant]
    : undefined
  if (mapped === undefined) return declared
  if (!Array.isArray(cp.protected_paths) || cp.protected_paths.length === 0) return declared
  if (!cp.protected_paths.every(isNonEmptyString)) return declared
  if (!isNonEmptyString(cp.justification)) return declared

  const forbidden = Array.isArray(contract.forbidden_paths)
    ? contract.forbidden_paths.filter(isNonEmptyString)
    : []
  for (const p of cp.protected_paths) {
    if (pathGrammarError(p)) return declared
    if (FLOOR.some(f => covers(f, p))) return declared
    if (!mapped.some(m => covers(m, p))) return declared
    if (forbidden.some(f => covers(f, p))) return declared
  }
  return [...declared, ...cp.protected_paths]
}

/**
 * Resolve a path to what it will ACTUALLY be written to, following symlinks.
 *
 * This is the one escape a cold probe proved live: the runtime hands the hook
 * the path the model asked for, unresolved, so a symlink inside an in-scope
 * directory pointing out of it slips a textual prefix check. For a file that
 * does not exist yet, the parent is resolved instead and the basename
 * reattached. Anything that cannot be resolved is a deny, not a guess.
 */
export function resolveWithin(root, target, { realpath = realpathSync, lstat = lstatSync } = {}) {
  let realRoot
  try {
    realRoot = realpath(root)
  } catch {
    return { error: 'the repository root could not be resolved' }
  }
  const abs = path.isAbsolute(target) ? target : path.join(realRoot, target)
  let resolved
  try {
    resolved = realpath(abs)
  } catch {
    // realpath throws ENOENT for two very different things: a file that does
    // not exist yet, which is ordinary and must be allowed to resolve through
    // its parent; and a symlink whose TARGET does not exist, which is a door
    // pointing somewhere unknowable. Treating them alike is a bypass — the
    // write follows the dangling link to wherever it points, while the guard
    // reasoned about the link's own in-scope path. lstat is what tells them
    // apart, because it does not follow the link.
    let isDanglingLink = false
    try {
      isDanglingLink = lstat(abs).isSymbolicLink()
    } catch {
      isDanglingLink = false
    }
    if (isDanglingLink) {
      return { error: '"' + target + '" is a symlink whose target cannot be resolved' }
    }
    const parent = path.dirname(abs)
    try {
      resolved = path.join(realpath(parent), path.basename(abs))
    } catch {
      return { error: 'neither "' + target + '" nor its parent directory could be resolved' }
    }
  }
  const rel = path.relative(realRoot, resolved)
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    return { error: '"' + target + '" resolves to ' + resolved + ', outside the repository' }
  }
  return { relative: normalisePath(rel.split(path.sep).join('/')) }
}

/**
 * THE DECISION.
 *
 * Order is load-bearing and each step is a gate, not a hint:
 *
 *   1. Not a write, or not a producer call  -> not this policy's business.
 *   2. TIER 0                               -> deny, before anything is parsed.
 *   3. Binding                              -> deny if absent or malformed.
 *   4. Contract re-read and seal verified   -> deny on any mismatch.
 *   5. Realpath resolution                  -> deny if unresolvable or outside.
 *   6. TIER 0 again, on the RESOLVED path   -> deny; a symlink cannot launder it.
 *   7. forbidden_paths                      -> deny.
 *   8. Effective scope                      -> allow only on a positive match.
 *
 * A call with no `agent_type` is the trusted driver, which this policy does not
 * police: the driver holds Bash and git by design, and pretending otherwise
 * would be a claim the mechanism cannot support.
 */
export function decide(event, { root, env = {}, grants = GRANTS, readFile, realpath } = {}) {
  const toolName = event?.tool_name
  if (!WRITE_TOOLS.includes(toolName)) return allow('not a write tool')

  const agentType = event?.agent_type
  if (!isNonEmptyString(agentType)) return allow('no agent_type — trusted driver call, not a producer')

  const input = isPlainObject(event?.tool_input) ? event.tool_input : {}
  const target = input.file_path ?? input.notebook_path
  if (!isNonEmptyString(target)) return deny('write tool call carries no file path')

  // (2) Tier 0 on the REQUESTED spelling, before anything is parsed, so a floor
  // write is refused even when the session carries no binding at all. Made
  // repository-relative lexically — no filesystem access, no heuristics: an
  // absolute path under the root is stripped to its relative form, and anything
  // else is compared as given. Step 6 repeats this on the resolved path, which
  // is the authoritative check; this one exists so the floor never depends on
  // the binding being present or the filesystem being readable.
  const lexical = lexicalRelative(root, String(target))
  for (const f of FLOOR) {
    if (covers(f, lexical)) {
      return deny('Tier 0: "' + target + '" is on the absolute floor (' + f + '), which no contract may authorize')
    }
  }

  const { binding, error: bindingError } = parseBinding(env[BINDING_ENV])
  if (bindingError) return deny(bindingError)

  const { contract, error: contractError } = loadBoundContract(binding, { root, readFile })
  if (contractError) return deny(contractError)

  const { relative, error: resolveError } = resolveWithin(root, String(target), { realpath })
  if (resolveError) return deny(resolveError)

  // (6) Tier 0 again, on what the write will REALLY touch.
  for (const f of FLOOR) {
    if (covers(f, relative)) {
      return deny('Tier 0: "' + target + '" resolves to ' + relative + ', on the absolute floor (' + f + ')')
    }
  }

  const forbidden = Array.isArray(contract.forbidden_paths)
    ? contract.forbidden_paths.filter(isNonEmptyString)
    : []
  for (const f of forbidden) {
    if (covers(f, relative)) {
      return deny('"' + relative + '" is forbidden by the bound contract (' + f + ')')
    }
  }

  const scope = effectiveScope(contract, { grants, root, readFile })
  for (const a of scope) {
    if (covers(a, relative)) {
      return allow('"' + relative + '" is inside the bound contract scope (' + a + ')')
    }
  }
  return deny('"' + relative + '" is outside the scope of contract ' + contract.id +
    ' — allowed: ' + (scope.length ? scope.join(', ') : '(nothing)'))
}
