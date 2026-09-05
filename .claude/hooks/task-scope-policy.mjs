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
 * establish" is never authorized. The three early allows above that point are
 * not exceptions to the rule but statements that the question was never this
 * policy's: a non-write tool; a call with no `agent_type`, which is the trusted
 * driver; and a recognised helper agent in a session with no contract bound to
 * it. The driver holds Bash and git by design, and pretending to police it
 * would be a claim the mechanism cannot support.
 *
 * WHO THIS POLICY GOVERNS, and why it is stated as an exemption. Enforcement
 * applies to every subagent EXCEPT a closed list of recognised helpers, rather
 * than only to the agent named `task-producer`. The narrower form would be
 * fail-open on a one-line Tier 2 edit: `agent_type` is the frontmatter `name:`
 * of the launched definition, so renaming the producer would silently exempt
 * it. Stated as an exemption, a rename produces MORE enforcement instead. What
 * this does not close — an edit that renames the producer *to* a recognised
 * helper name — is the pre-existing Tier 2 residual, since the same edit could
 * hand the producer Bash and defeat the guard outright. It is documented in
 * docs/AUTOMATION-AUTHORITY.md, not claimed closed.
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

/** Every tool_input key that can name a write target. All of them are checked. */
export const TARGET_KEYS = ['file_path', 'notebook_path']

/**
 * The agent this policy exists to constrain.
 *
 * `agent_type` is the frontmatter `name:` of the launched definition, NOT its
 * filename — an agent defined in `renamed-file.md` declaring
 * `name: inner-declared-name` emits exactly `inner-declared-name`. So this
 * constant must equal the name `.claude/agents/task-producer.md` declares, and
 * a spec asserts that rather than trusting the two to stay in step.
 *
 * It is deliberately NOT what the decision below keys on. See EXEMPT_AGENT_TYPES.
 */
export const PRODUCER_AGENT_TYPE = 'task-producer'

/**
 * The agents that are NOT task producers, and the reason this is an exemption
 * list rather than the obvious `agentType === PRODUCER_AGENT_TYPE`.
 *
 * That obvious form is fail-OPEN on a Tier 2 edit. `agent_type` comes from the
 * producer definition's frontmatter, and `.claude/agents/**` is Tier 2 — so
 * renaming one line of a file an ordinary task can be authorized to write would
 * make the producer stop matching and run with no contract enforcement at all,
 * silently. Inverting it fixes the direction of that failure: anything not
 * recognised here is enforced, so a rename yields MORE enforcement, not less,
 * and an unknown agent fails closed loudly instead of escaping quietly.
 *
 * The residual this does not close: an attacker who can edit the producer
 * definition could rename it TO one of these names. That is the same residual
 * already documented for Tier 2 — the same edit could simply give the producer
 * Bash and defeat the guard outright — so this changes nothing about it. It is
 * recorded in docs/AUTOMATION-AUTHORITY.md rather than claimed closed.
 *
 * The cost is maintenance: a genuinely new helper agent is denied until it is
 * added here. That failure is loud and cheap, which is the direction this
 * whole file errs in.
 *
 * PROVENANCE, because "is this list complete?" is otherwise unanswerable from
 * the repository. These are the agent types the harness offered on Claude Code
 * 2.1.259 at the time of writing, minus the producer. Nothing in the repository
 * enumerates the platform's built-ins, so this cannot be pinned by a spec the
 * way the producer's name is — a built-in added upstream, or one this
 * environment did not offer, will simply be absent. That is why the list is an
 * exemption rather than a denylist: an unlisted helper is denied, which is
 * visible the first time someone runs it, rather than exempted, which would
 * never be visible at all.
 */
export const EXEMPT_AGENT_TYPES = [
  'claude',
  'claude-code-guide',
  'Explore',
  // Not a platform built-in: `.claude/agents/fresh-context-reviewer.md` is a
  // repository-defined Tier 2 definition, listed here for the same reason as
  // the rest. It holds no write tool today, so it never reaches the branch
  // this list guards — but its name is Tier 2 like the producer's, and saying
  // so is cheaper than someone rediscovering it.
  'fresh-context-reviewer',
  'general-purpose',
  'Plan',
  'statusline-setup',
]

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

/**
 * TIER 1 — the protected control plane. A copy of PROTECTED_CONTROL_PLANE.
 *
 * The canonical validator checks tier containment as well as grant reach, and
 * the two are equivalent only while every grant maps inside the tier. That is
 * true today and nothing made it stay true, so the check is duplicated here and
 * a parity spec pins both the list and the subset relationship.
 */
export const PROTECTED_TIER = [
  '.claude/settings.json',
  '.claude/hooks/**',
]

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

/**
 * THE BOUND CONTRACT MUST BE VALID AS A WHOLE, or it authorises nothing.
 *
 * An earlier shape of this policy validated only the grant, and an invalid
 * grant merely "lost the grant" while ordinary allowed_paths kept working. That
 * is the wrong failure mode. A contract the canonical validator would reject is
 * not a narrower contract — it is a contract nobody has established the meaning
 * of, and a sealed file that says `allowed_paths: [".claude/settings.json"]`
 * would have handed a producer the control plane with no grant at all.
 *
 * So: any violation here denies the whole decision, ordinary paths included.
 * Returns violation strings; empty means the contract is safe to reason with.
 */
export function contractSecurityViolations(contract, { grants = GRANTS, root = '.', readFile = readFileSync } = {}) {
  const out = []
  if (!isPlainObject(contract)) return ['the bound contract is not an object']

  for (const field of ['allowed_paths', 'forbidden_paths']) {
    const v = contract[field]
    if (!Array.isArray(v)) { out.push(field + ' is not an array'); continue }
    for (const p of v) {
      if (!isNonEmptyString(p)) { out.push(field + ' contains a non-string entry'); continue }
      const g = pathGrammarError(p)
      if (g) out.push(field + ' entry "' + p + '" ' + g)
    }
  }

  // Ordinary allowed_paths may reach neither tier. The floor is unauthorisable
  // outright; Tier 1 is reachable only through a grant, so naming it in
  // allowed_paths is the exact escalation the tier exists to prevent.
  const allowed = Array.isArray(contract.allowed_paths) ? contract.allowed_paths.filter(isNonEmptyString) : []
  for (const a of allowed) {
    if (pathGrammarError(a)) continue
    for (const f of FLOOR) {
      if (covers(a, f) || covers(f, a)) out.push('allowed_paths entry "' + a + '" reaches the Tier 0 floor (' + f + ')')
    }
    for (const t of PROTECTED_TIER) {
      if (covers(a, t) || covers(t, a)) {
        out.push('allowed_paths entry "' + a + '" reaches the protected control plane (' + t +
          ') — that authority has exactly one spelling, and it is not allowed_paths')
      }
    }
  }

  if (!Object.prototype.hasOwnProperty.call(contract, 'control_plane')) return out
  const cp = contract.control_plane
  if (!isPlainObject(cp)) return [...out, 'control_plane is present but is not an object']

  for (const key of Object.keys(cp)) {
    if (!CONTROL_PLANE_KEYS.includes(key)) out.push('control_plane: unknown field: ' + key)
  }

  let roleModel
  try {
    roleModel = JSON.parse(readFile(path.join(root, ROLES_FILE), 'utf8'))
  } catch {
    return [...out, 'the role model could not be read, so no grant can be honoured']
  }
  const holder = controlPlaneRoleIn(roleModel)
  if (holder === null) out.push('the role model does not identify exactly one control-plane role')
  else if (contract.owner_role !== holder) {
    out.push('control_plane requires owner_role ' + JSON.stringify(holder) +
      ' (got ' + JSON.stringify(contract.owner_role) + ')')
  }
  const declaredRisk = RISK_LEVELS.indexOf(contract.risk)
  if (declaredRisk < 0 || declaredRisk < RISK_LEVELS.indexOf(CONTROL_PLANE_MIN_RISK)) {
    out.push('control_plane requires risk of at least ' + CONTROL_PLANE_MIN_RISK +
      ' (got ' + JSON.stringify(contract.risk) + ')')
  }

  const known = isNonEmptyString(cp.grant) && Object.prototype.hasOwnProperty.call(grants, cp.grant)
  if (!known) out.push('control_plane.grant is not a known grant (got ' + JSON.stringify(cp.grant) + ')')
  if (!isNonEmptyString(cp.justification)) out.push('control_plane.justification is missing')

  const paths = cp.protected_paths
  if (!Array.isArray(paths) || paths.length === 0 || !paths.every(isNonEmptyString)) {
    return [...out, 'control_plane.protected_paths must be a non-empty array of non-empty strings']
  }
  const mapped = known ? grants[cp.grant] : []
  const forbidden = Array.isArray(contract.forbidden_paths)
    ? contract.forbidden_paths.filter(f => isNonEmptyString(f) && !pathGrammarError(f))
    : []
  for (const p of paths) {
    const g = pathGrammarError(p)
    if (g) { out.push('control_plane.protected_paths entry "' + p + '" ' + g); continue }
    // Redundant today — FLOOR and PROTECTED_TIER are disjoint, so the tier
    // check below refuses every floor path anyway. Kept as defence in depth and
    // noted as such, so a later change that narrows the tier cannot silently
    // promote this line from redundant to load-bearing without a reader noticing.
    if (FLOOR.some(f => covers(f, p))) out.push('control_plane.protected_paths may never name "' + p + '" — it is on the absolute floor')
    if (!PROTECTED_TIER.some(t => covers(t, p))) out.push('control_plane.protected_paths entry "' + p + '" is not inside the protected control plane')
    if (known && !mapped.some(m => covers(m, p))) out.push('grant "' + cp.grant + '" does not authorise "' + p + '"')
    if (forbidden.some(f => covers(f, p))) out.push('"' + p + '" is granted and forbidden at once')
  }
  return out
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

  // Grammar-filtered, exactly as the validator filters it. Without this the two
  // disagree on a spelling like "./.claude/hooks/**": canonical drops it (the
  // "." segment fails the grammar) and honours the grant, while the runtime
  // would normalise the "./" away and refuse. Stricter, but a divergence all
  // the same, and the point of the parity work is that there is none.
  const forbidden = Array.isArray(contract.forbidden_paths)
    ? contract.forbidden_paths.filter(f => isNonEmptyString(f) && !pathGrammarError(f))
    : []
  for (const p of cp.protected_paths) {
    if (pathGrammarError(p)) return declared
    if (FLOOR.some(f => covers(f, p))) return declared
    if (!PROTECTED_TIER.some(t => covers(t, p))) return declared
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
export function resolveWithin(root, target, { realpath = realpathSync, lstat = lstatSync, cwd } = {}) {
  let realRoot
  try {
    realRoot = realpath(root)
  } catch {
    return { error: 'the repository root could not be resolved' }
  }
  // WHERE A RELATIVE PATH IS ANCHORED.
  //
  // Empirically, on Claude Code 2.1.258, this never arises: the runtime
  // canonicalises file_path to an absolute path before the hook sees it — a
  // producer that passes "relhere.txt" or "sub/relsub.txt" produces an absolute
  // path in the event, verified by probe and pinned by a regression spec.
  //
  // The branch exists anyway, because assuming a property of the runtime and
  // being wrong would mean reasoning about a different file than the one
  // written, and that error's direction is an ALLOW. A relative path is
  // anchored to the event's own cwd — but only after that cwd is itself proved
  // to resolve inside the repository. An unprovable cwd is a deny, not a guess.
  let anchor = realRoot
  if (!path.isAbsolute(target)) {
    // No cwd on the event and a relative path is exactly the ambiguity this
    // comment claims to refuse, so refuse it rather than assuming the root.
    // Real events always carry cwd — the probe confirmed it on every call — so
    // this costs nothing real and closes the one case where the guard would
    // have reasoned about a different file than the one written.
    if (cwd === undefined || cwd === null || String(cwd) === '') {
      return { error: 'a relative path was given with no cwd on the event, so it cannot be anchored' }
    }
    {
      let realCwd
      try {
        realCwd = realpath(String(cwd))
      } catch {
        return { error: 'a relative path was given and its cwd could not be resolved' }
      }
      const rel = path.relative(realRoot, realCwd)
      if (rel !== '' && (rel.startsWith('..') || path.isAbsolute(rel))) {
        return { error: 'a relative path was given and its cwd ' + realCwd + ' is outside the repository' }
      }
      anchor = realCwd
    }
  }
  const abs = path.isAbsolute(target) ? target : path.join(anchor, target)
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
 *   1. Not a write, or no agent_type at all  -> not this policy's business.
 *   2. TIER 0, lexically                    -> deny, before anything is parsed.
 *   3. Exempt helper in an unbound session   -> resolve, then deny TIER 0 and
 *                                              TIER 1 on the resolved path;
 *                                              otherwise allow.
 *   4. Binding                               -> deny if absent or malformed.
 *   5. Contract re-read and seal verified    -> deny on any mismatch.
 *   6. Realpath resolution                   -> deny if unresolvable or outside.
 *   7. TIER 0 again, on the RESOLVED path    -> deny; a symlink cannot launder it.
 *   8. forbidden_paths                       -> deny.
 *   9. Effective scope                       -> allow only on a positive match.
 *
 * A call with no `agent_type` is the trusted driver, which this policy does not
 * police: the driver holds Bash and git by design, and pretending otherwise
 * would be a claim the mechanism cannot support.
 *
 * WHAT STEP 3 IS AND IS NOT. It exempts a recognised helper from one thing:
 * the contract scope, which it has no contract to be measured against. It does
 * not exempt anything from the tiers. Step 2 catches only the spelling it was
 * handed, so step 3 resolves the path itself before allowing — otherwise
 * `src/door/config`, where `src/door` is a symlink to `.git`, spells nothing
 * forbidden and the authoritative check at step 7 never runs for this caller.
 * Tier 1 is refused there too: reaching the protected control plane takes an
 * explicit digest-covered grant, and an unbound session has none to offer. So
 * an unbound helper writes ordinary Tier 2 paths and nothing else — in
 * particular not `.claude/hooks/**`, which is this file.
 */
export function decide(event, { root, env = {}, grants = GRANTS, readFile, realpath, lstat } = {}) {
  // A hook event that is not an object is not something to reason about. `[]`,
  // `null` and `42` all parse as JSON and would otherwise read as "no
  // tool_name" — that is, as an allow — so the shape is checked before the
  // fields are.
  if (!isPlainObject(event)) return deny('the hook event is not an object')

  const toolName = event?.tool_name
  if (!WRITE_TOOLS.includes(toolName)) return allow('not a write tool')

  // ABSENT is the driver. A VALUE THAT IS NOT A NAME is not.
  //
  // A real main-thread call omits the key entirely — verified on 2.1.259,
  // where the driver's event carried no `agent_type` property at all. `null`
  // is treated the same as absent rather than denied: no observed runtime
  // sends it, and the cost of being wrong runs the wrong way. Denying it would
  // refuse the trusted driver outright on some future runtime that spells
  // "no agent" as null, which is a worse failure than allowing an event the
  // producer cannot forge in the first place — hook events come from the
  // runtime, so this branch is a robustness question, not an attack surface.
  //
  // Everything else that is not a usable name — an array, an object, a number,
  // an empty string — is a malformed event and denies. Folding those into the
  // absent case put `agent_type: ['task-producer']` through the one
  // unconditional allow this policy has.
  const agentType = event?.agent_type
  if (agentType === undefined || agentType === null) {
    return allow('no agent_type — trusted driver call, not a producer')
  }
  if (!isNonEmptyString(agentType)) {
    return deny('the hook event carries an agent_type that is not a name, so the caller cannot be identified')
  }

  // EVERY path key the event carries, not the first one found.
  //
  // `input.file_path ?? input.notebook_path` picks one and ignores the other,
  // so an event carrying an in-scope file_path beside an out-of-scope
  // notebook_path would be authorised on the path it did not write. Whether the
  // runtime ever sends both is not something this policy should depend on: the
  // error direction is an allow, and the doctrine in this file's header is that
  // an unprovable case denies rather than being guessed at. So collect them all
  // and require every one to clear every gate.
  const input = isPlainObject(event?.tool_input) ? event.tool_input : {}
  const targets = TARGET_KEYS.map(k => input[k]).filter(v => v !== undefined && v !== null)
  if (targets.length === 0) return deny('write tool call carries no file path')
  for (const t of targets) {
    if (!isNonEmptyString(t)) return deny('write tool call carries a path that is not a string')
  }

  // (2) Tier 0 on the REQUESTED spelling, before anything is parsed, so a floor
  // write is refused even when the session carries no binding at all. Made
  // repository-relative lexically — no filesystem access, no heuristics: an
  // absolute path under the root is stripped to its relative form, and anything
  // else is compared as given. Step 7 repeats this on the resolved path, which
  // is the authoritative check; this one exists so the floor never depends on
  // the binding being present or the filesystem being readable.
  for (const target of targets) {
    const lexical = lexicalRelative(root, String(target))
    for (const f of FLOOR) {
      if (covers(f, lexical)) {
        return deny('Tier 0: "' + target + '" is on the absolute floor (' + f + '), which no contract may authorize')
      }
    }
  }

  // (3) Is this caller a task producer at all?
  //
  // PRESENCE of the binding, deliberately, not its validity. A present-but-
  // malformed binding must reach parseBinding below and be DENIED, so the test
  // here is the same emptiness test parseBinding treats as "absent" — anything
  // else and a session could unbind itself by corrupting its own binding.
  const bindingRaw = env[BINDING_ENV]
  const bindingPresent = bindingRaw !== undefined && bindingRaw !== null && String(bindingRaw).trim() !== ''

  // Enforce unless this is a known helper agent in an unbound session. Stated
  // in this direction so an UNKNOWN agent_type is enforced rather than exempt:
  // the exemption list lives here, in the protected tier, but agent_type itself
  // is declared in Tier 2, so the recognised set is the safe thing to enumerate
  // and the unrecognised case is the safe default. See EXEMPT_AGENT_TYPES.
  //
  // A binding overrides the exemption: once a session is bound to a contract,
  // that contract governs every subagent in it, not merely the producer. A
  // helper spawned inside a bound session is doing that task's work.
  if (!bindingPresent && EXEMPT_AGENT_TYPES.includes(agentType)) {
    // An exemption from CONTRACT SCOPE is not an exemption from the tiers.
    //
    // Reaching the allow below without resolving the path first would have let
    // a symlink launder a floor write: the lexical check above sees only the
    // spelling it was handed, and `src/door/config` where `src/door -> .git`
    // spells nothing forbidden. That is the one escape a cold probe proved
    // live, and the resolved check further down — the authoritative one — is
    // downstream of this branch, so this branch has to do its own.
    //
    // Tier 1 is refused for the same reason it is refused anywhere: reaching
    // the protected control plane takes an explicit digest-covered grant, and
    // a session with no bound contract has no grant to offer.
    //
    // WHAT THAT IS WORTH, exactly. Through the four write tools, an unbound
    // helper reaches ordinary Tier 2 paths and nothing else. It is NOT a
    // statement about the caller, because this policy is an allowlist over
    // those four tools and passes everything else — Bash included — straight
    // through. The producer is constrained because its definition gives it no
    // shell; most of the exempted helpers are platform agents with no
    // definition in this repository and no such limit, so one of them can
    // write any of these paths through a shell without this file ever seeing
    // the call. The tier loops below are worth the caller's tool list, exactly
    // as the producer's case is, and that is the honest scope of the claim.
    for (const target of targets) {
      const { relative, error: resolveError } = resolveWithin(root, String(target), { realpath, lstat, cwd: event?.cwd })
      if (resolveError) return deny(resolveError)
      for (const f of FLOOR) {
        if (covers(f, relative)) {
          return deny('Tier 0: "' + target + '" resolves to ' + relative + ', on the absolute floor (' + f + ')')
        }
      }
      for (const p of PROTECTED_TIER) {
        if (covers(p, relative)) {
          return deny('Tier 1: "' + target + '" resolves to ' + relative + ', in the protected control plane (' + p +
            '), which only a granted contract may authorize — and "' + agentType + '" carries no bound contract')
        }
      }
    }
    return allow('"' + agentType + '" is not a task producer, and the session carries no contract binding')
  }

  const { binding, error: bindingError } = parseBinding(bindingRaw)
  if (bindingError) return deny(bindingError)

  const { contract, error: contractError } = loadBoundContract(binding, { root, readFile })
  if (contractError) return deny(contractError)

  // The whole contract, not just the grant. An invalid contract authorises
  // nothing at all — it does not quietly fall back to its ordinary paths.
  const contractViolations = contractSecurityViolations(contract, { grants, root, readFile })
  if (contractViolations.length > 0) {
    return deny('the bound contract ' + contract.id + ' is not valid, so it authorises nothing: ' +
      contractViolations.join('; '))
  }

  const scope = effectiveScope(contract, { grants, root, readFile })
  const forbidden = Array.isArray(contract.forbidden_paths)
    ? contract.forbidden_paths.filter(isNonEmptyString)
    : []

  const matched = []
  for (const target of targets) {
    const { relative, error: resolveError } = resolveWithin(root, String(target), { realpath, lstat, cwd: event?.cwd })
    if (resolveError) return deny(resolveError)

    // (7) Tier 0 again, on what the write will REALLY touch.
    for (const f of FLOOR) {
      if (covers(f, relative)) {
        return deny('Tier 0: "' + target + '" resolves to ' + relative + ', on the absolute floor (' + f + ')')
      }
    }

    for (const f of forbidden) {
      if (covers(f, relative)) {
        return deny('"' + relative + '" is forbidden by the bound contract (' + f + ')')
      }
    }

    const hit = scope.find(a => covers(a, relative))
    if (!hit) {
      return deny('"' + relative + '" is outside the scope of contract ' + contract.id +
        ' — allowed: ' + (scope.length ? scope.join(', ') : '(nothing)'))
    }
    matched.push(relative + ' (' + hit + ')')
  }
  return allow(matched.join(', ') + ' — inside the bound contract scope')
}
