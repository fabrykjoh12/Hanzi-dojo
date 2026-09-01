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
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

export const TASKS_DIR = '.agent/tasks'
export const ROLES_FILE = '.agent/roles.json'

/**
 * The fields a contract is BOUND by. The digest covers exactly these, so a
 * change to any of them must be accompanied by a new digest.
 *
 * Deliberately excludes free-form annotation (`notes`, `links`) — a contract
 * should be annotatable without re-sealing, or nobody will annotate it.
 */
export const REQUIRED_BINDING_FIELDS = [
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

/**
 * OPTIONAL BINDING FIELDS — the schema-evolution rule, stated once.
 *
 * A required binding field is always folded into the digest, even when absent:
 * `canonicalise(undefined)` is the string "null", so the key still enters the
 * canonical form. That is correct for a field every contract must carry, and
 * fatal for one added later — adding `control_plane` to the required list
 * changes the digest of every contract already sealed, and re-sealing them
 * would mean writing `.agent/tasks/**`, which is on the floor and which no
 * contract may authorise. The schema could not be extended at all.
 *
 * So an OPTIONAL binding field is folded into the digest IF AND ONLY IF the key
 * is present. Absent, it contributes nothing and existing seals stand
 * byte-for-byte; present, it is bound exactly as any other term, and changing,
 * widening or removing it moves the digest.
 *
 * This is a general rule, not an accommodation for one field: anything added
 * here later inherits the same compatibility guarantee, and a spec proves it
 * against the contracts actually on disk.
 */
export const OPTIONAL_BINDING_FIELDS = ['control_plane']

/** Every field the digest binds, in canonical order. */
export const BINDING_FIELDS = [...REQUIRED_BINDING_FIELDS, ...OPTIONAL_BINDING_FIELDS]

/** Annotation. Deliberately OUTSIDE the digest — see the digest comment. */
export const OPTIONAL_FIELDS = ['notes', 'links', 'contract_digest']

/**
 * THE RISK MODEL. Canonical machine values, closed.
 *
 * These are the control-plane risk levels. An earlier revision of this file
 * invented low/medium/high; the real model was designed outside this
 * repository, which is why it could not be found here and why the field was
 * briefly left open rather than guessed at a second time.
 *
 *   r0  docs, comments, non-executable metadata only
 *   r1  pure logic or local UI — no auth, persistence, native/release, or
 *       external side effects
 *   r2  user-flow / bounded integration semantics: story matching, onboarding,
 *       auth flow, offline behaviour, SRS UI
 *   r3  high-impact system semantics or authority: FSRS/scheduler core,
 *       migration code, privacy/security, CI/workflow authority,
 *       native/release configuration
 *   r4  direct production authority: live Apply/data mutation, secrets and
 *       signing, store publication/release
 *
 * WHEN SEVERAL APPLY, TAKE THE HIGHEST. A change that is mostly local UI but
 * also touches the scheduler is r3, not r1 — the level describes the worst
 * thing the work can reach, not the bulk of it.
 *
 * Deliberately orthogonal to production_effect: risk is the authority the WORK
 * carries, production_effect the maximum production effect it is PERMITTED to
 * cause. Migration code written but not applied is r3 (migration code is
 * high-impact system semantics) with production_effect "none" (writing it
 * touches nothing live); a docs typo on main is r0 with "deploy-on-merge".
 */
export const RISK_LEVELS = ['r0', 'r1', 'r2', 'r3', 'r4']

/**
 * THE ROLE MODEL. Loaded from .agent/roles.json — the single canonical source.
 *
 * Deliberately NOT restated here. A hand-kept copy beside the real list is how
 * a taxonomy drifts: the two disagree, and the one the validator reads quietly
 * wins over the one people read. role-model.test.mjs fails if a second literal
 * role list appears in this file.
 *
 * A role is an authority DOMAIN — what kind of work this is and who may own it.
 * It is orthogonal to risk (worst reach) and production_effect (maximum effect
 * permitted), and it NEVER grants permission to exceed a contract's
 * allowed_paths, forbidden_paths, acceptance_criteria, stop_conditions, risk or
 * production_effect. Where a role and a contract disagree, the contract is
 * narrower and the contract wins.
 */
/**
 * The ONE role-model schema version this validator understands.
 *
 * Matched exactly, not as a floor. A floor ("any version >= 1") reads as
 * permissive but is the unsafe direction: a v2 model written for a loader that
 * does not exist yet would be interpreted by the v1 rules, silently, and
 * whatever v2 added — a field that narrows a role, a new separation rule —
 * would be ignored rather than enforced. Refusing an unknown version is the
 * fail-closed reading: bump this constant in the same change that teaches the
 * loader the new shape.
 */
export const ROLE_MODEL_VERSION = 1

/** Documentation a role must carry to be choosable at all. */
const ROLE_REQUIRED_TEXT = ['purpose', 'mental_model']
const ROLE_REQUIRED_LISTS = ['authority', 'non_authority', 'owns_examples', 'hand_off_examples']
/** Separation rules the model must state. Their CONTENT is asserted in specs. */
const REQUIRED_SEPARATION = ['implementer_is_not_reviewer', 'role_never_overrides_contract']

/**
 * Load and FULLY validate the role model, or refuse to run.
 *
 * Fail-closed, and it has to be here rather than in a spec: a spec runs later
 * and separately, so a malformed model would still have been handed to every
 * contract check in between. A validator that silently accepts a broken
 * authority model is worse than one that will not start — the enum it derives
 * would be short, misspelled or empty, and contracts naming real roles would
 * be rejected while the model itself went unmentioned.
 *
 * It deliberately does NOT know the eight role ids. Hardcoding them here would
 * recreate the second enum this design exists to avoid; .agent/roles.json stays
 * the canonical taxonomy and this only enforces its SHAPE.
 */
function loadRoleModel() {
  // Resolved relative to this module, so the validator works from any cwd.
  const here = path.dirname(fileURLToPath(import.meta.url))
  const file = path.resolve(here, '..', ROLES_FILE)
  const refuse = (why) => {
    throw new Error(ROLES_FILE + ': ' + why + ' — refusing to run against a malformed role model')
  }

  let parsed
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    refuse('could not be read or parsed (' + err.message + ')')
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) refuse('is not a JSON object')
  if (parsed.version !== ROLE_MODEL_VERSION) {
    refuse('unsupported role-model schema version ' + JSON.stringify(parsed.version) +
      '; this validator understands version ' + ROLE_MODEL_VERSION + ' only')
  }
  if (!Array.isArray(parsed.roles) || parsed.roles.length === 0) {
    refuse('has no roles')
  }

  const seen = new Set()
  for (const [i, role] of parsed.roles.entries()) {
    const at = 'roles[' + i + ']'
    if (!role || typeof role !== 'object' || Array.isArray(role)) refuse(at + ' is not an object')
    if (typeof role.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(role.id)) {
      refuse(at + '.id must be a non-empty lowercase kebab-case token (got ' +
        JSON.stringify(role.id) + ')')
    }
    if (seen.has(role.id)) refuse('duplicate role id "' + role.id + '"')
    seen.add(role.id)

    for (const field of ROLE_REQUIRED_TEXT) {
      if (typeof role[field] !== 'string' || role[field].trim() === '') {
        refuse(role.id + '.' + field + ' must be a non-empty string')
      }
    }
    for (const field of ROLE_REQUIRED_LISTS) {
      const list = role[field]
      if (!Array.isArray(list) || list.length === 0 ||
          !list.every(x => typeof x === 'string' && x.trim() !== '')) {
        refuse(role.id + '.' + field + ' must be a non-empty array of non-empty strings')
      }
    }
  }

  const sep = parsed.separation
  if (!sep || typeof sep !== 'object' || Array.isArray(sep)) refuse('separation must be an object')
  for (const rule of REQUIRED_SEPARATION) {
    if (typeof sep[rule] !== 'string' || sep[rule].trim() === '') {
      refuse('separation.' + rule + ' must be a non-empty string')
    }
  }

  return parsed
}

export const ROLE_MODEL = loadRoleModel()

/** The canonical role ids, DERIVED — never typed out a second time. */
export const OWNER_ROLES = ROLE_MODEL.roles.map(r => r.id)

/**
 * PRODUCTION_EFFECT: the maximum direct production effect this task is
 * PERMITTED to cause — whether during execution or as an automatic consequence
 * of merge.
 *
 * An earlier revision defined it as "what merging does" and then illustrated it
 * with an unapplied migration marked "database", which contradicted the
 * definition: writing migration code causes no production effect at all until
 * someone applies it. The definition is now permission-shaped, which covers
 * both halves — a task that runs Apply mutates production during execution; a
 * task merged to main deploys without anyone running anything.
 *
 *   none              no production access or direct production effect
 *   read-only         may inspect live production/external state, never mutate
 *   deploy-on-merge   merging automatically deploys learner-facing code
 *   database          permitted to mutate the live production database
 *   store-release     permitted to publish/release through an app store
 *   external-service  permitted to mutate another live external service
 *
 * Worked cases, so the contradiction cannot come back:
 *
 *   migration code written, explicitly NOT applied  -> none
 *                                (unless merge itself deploys, then that)
 *   a read-only production audit                    -> read-only
 *   an Apply task                                   -> database
 *
 * A task carrying MULTIPLE write-side effects should normally be split, or
 * stopped for review — one enum value is the wrong place to hide that.
 *
 * Still a closed set: unlike role and risk this is not a taxonomy anyone else
 * is designing, and its values name things that already exist here.
 */
export const PRODUCTION_EFFECTS = [
  'none',
  'read-only',
  'deploy-on-merge',
  'database',
  'store-release',
  'external-service',
]

/** The values that authorise a WRITE to something live. */
export const WRITE_SIDE_PRODUCTION_EFFECTS = [
  'database',
  'store-release',
  'external-service',
]

/**
 * TIER 0 — THE ABSOLUTE FLOOR. Paths no contract may ever authorise, through
 * allowed_paths or through any other mechanism, whatever else it says.
 *
 * This is the "cannot expand its own scope" rule. A task that could authorise
 * edits to .agent/tasks/** could rewrite its own acceptance criteria and call
 * the result compliant. Refused at the contract level, so the escalation
 * cannot even be expressed.
 *
 * NOT THE SAME AS TIER 1. .claude/settings.json used to sit here on the same
 * reasoning — a task that could edit it could widen the harness permission
 * allow-list. It no longer does, because that reasoning proved too blunt: the
 * file genuinely has to change when a runtime policy is installed, and a floor
 * entry makes that impossible rather than deliberate. It now lives in
 * PROTECTED_CONTROL_PLANE below, where the authority still cannot be spelled
 * in allowed_paths but CAN be granted narrowly, through a digest-covered
 * control_plane grant that names the role, the risk floor and the exact paths.
 *
 * So the two tiers are different claims, and the difference is the point:
 *
 *   Tier 0 (here) — never authorisable by a task contract. No grant exists,
 *                   and none can be written; the only route is root governance.
 *   Tier 1 (below) — not authorisable through ordinary allowed_paths, but
 *                    narrowly authorisable through a valid control_plane grant,
 *                    which is visible as its own term in the sealed diff.
 *
 * .agent/roles.json is on the floor for exactly the same reason as
 * .agent/tasks/**, one level up: it is the taxonomy that DEFINES authority
 * domains. A task able to edit it
 * could add itself a role, or rewrite the non-authority list that bounds the
 * role it already holds — self-authorisation by redefining the vocabulary
 * rather than by widening a path. Role-taxonomy governance therefore happens
 * outside an ordinary implementing contract, exactly as task-contract
 * definition changes already do.
 */
export const ALWAYS_FORBIDDEN = [
  '.agent/tasks/**',
  '.agent/roles.json',
  '.claude/settings.local.json',
  '.git/**',
]

/**
 * TIER 1 — THE PROTECTED CONTROL PLANE.
 *
 * Paths an ordinary task can never authorise, but which a specialised
 * workflow-authority task may be granted through `control_plane`. They are the
 * files that decide what agents may do at runtime.
 *
 * Why a second tier exists at all: `.claude/settings.json` used to sit on the
 * absolute floor, and an absolute floor entry can never be maintained. Closing
 * the file to everyone forever is not containment, it is a dead end — the only
 * way to change it would be to edit this validator, which is precisely the
 * escalation the floor exists to prevent. Tier 1 keeps ordinary tasks out while
 * leaving one narrow, reviewed, digest-covered door.
 *
 * Tier 0 does NOT move. A task still cannot rewrite its own contract, the role
 * taxonomy, the machine-local settings override, or git internals — no grant
 * reaches any of them, and the two tiers are asserted disjoint.
 *
 * Every entry obeys the decidable grammar (exact path or `dir/**`). A filename
 * wildcard such as `tools/runtime-policy*.mjs` is deliberately NOT used: the
 * grammar cannot reason about it, and a registry entry nobody can decide
 * containment against would make the tier best-effort rather than complete.
 *
 * WHAT IS DELIBERATELY NOT HERE YET: `.claude/agents/**`.
 *
 * Agent definitions hold the one capability boundary this harness has actually
 * measured — a subagent's `tools:` allowlist is platform-enforced — so they
 * belong in this tier on the merits. They are absent because adding them here
 * would retroactively invalidate `fresh-context-reviewer`, a contract sealed and
 * merged in PR #229 whose allowed_paths legitimately names
 * `.claude/agents/fresh-context-reviewer.md`. Repairing it means writing
 * `.agent/tasks/**`, which is Tier 0 and which no contract may authorise.
 *
 * So this is SEQUENCING, not a judgement that agent definitions are safe:
 * **agent definitions are NOT protected by this tier today**, and nothing here
 * should be read as claiming they are. A later root-governance step moves them
 * in, migrates that historical contract, and introduces the
 * `agent-definition-maintenance` grant at the same time — which must happen
 * before anyone claims producer adoption protects agent definitions.
 */
export const PROTECTED_CONTROL_PLANE = [
  '.claude/settings.json',
  '.claude/hooks/**',
]

/**
 * GRANT -> the paths that grant may reach. Closed, and narrow on purpose.
 *
 * A grant is not a label that unlocks the tier. Maintaining a reviewer's prompt
 * is not the same authority as installing a runtime policy, so the two cannot
 * borrow each other's reach, and there is no `control-plane-all`.
 *
 * Two grants, each reaching one part of the tier and neither reaching the other's.
 * `runtime-policy-maintenance` maintains the permission and hook DECLARATIONS in
 * `.claude/settings.json`; `runtime-hook-maintenance` maintains the hook scripts
 * those declarations point at. Related work, but not the same authority: a task
 * that writes a guard script has no business rewriting the permission allow-list,
 * and a task that edits settings has no business rewriting the code a hook runs.
 * A vocabulary is easier to widen deliberately than to narrow after something
 * depends on it, and `agent-definition-maintenance` still arrives with the paths
 * it would reach rather than ahead of them.
 *
 * TIER 1 IS NOW COVERED COLLECTIVELY, AND BY NO SINGLE GRANT. That distinction is
 * the whole design. Between them the two grants reach every path in the tier, so
 * "protected" no longer implies "unauthorizable" for any of it — but neither
 * grant alone reaches more than its own part, so no grant is a synonym for the
 * tier. Widening one of these to cover the other's paths, rather than adding a
 * third narrow grant, would collapse that distinction and make the mapping check
 * below unable to fire.
 *
 * The alternative considered and rejected for the hook script: leaving it in an
 * ordinary Tier 2 file and pointing settings at it. That needs no grant, and it
 * would let a task rewrite the very guard that constrains it.
 *
 * Any future authority-bearing path is added here deliberately — an exact file or
 * a dedicated subtree, never a wildcard, and never by widening a grant that
 * already exists for something else.
 */
export const CONTROL_PLANE_GRANTS = {
  'runtime-policy-maintenance': ['.claude/settings.json'],
  'runtime-hook-maintenance': ['.claude/hooks/**'],
}

/** Is `p` inside the protected tier? */
const inProtectedTier = (p) => PROTECTED_CONTROL_PLANE.some(t => covers(t, p))
/** Is `p` inside the absolute floor? */
const inAbsoluteFloor = (p) => ALWAYS_FORBIDDEN.some(f => covers(f, p))

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

/**
 * The digest over the binding fields.
 *
 * Required fields always; optional binding fields only when the key is present.
 * The presence test is `hasOwnProperty`, not a truthiness or `!== undefined`
 * check — an explicit `"control_plane": null` is a statement someone wrote down
 * and must be bound, while an absent key must leave the digest untouched.
 */
export function computeDigest(contract) {
  const bound = {}
  for (const f of REQUIRED_BINDING_FIELDS) bound[f] = contract?.[f]
  for (const f of OPTIONAL_BINDING_FIELDS) {
    if (contract && Object.prototype.hasOwnProperty.call(contract, f)) bound[f] = contract[f]
  }
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
  for (const field of REQUIRED_BINDING_FIELDS) {
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
  // Both closed: risk to the control-plane levels, owner_role to the canonical
  // role model in .agent/roles.json.
  if ('risk' in contract && !RISK_LEVELS.includes(contract.risk)) {
    out.push(at + 'risk must be one of ' + RISK_LEVELS.join(', ') +
      ' (got ' + JSON.stringify(contract.risk) + '). When several levels apply, take the highest.')
  }
  if ('owner_role' in contract && !OWNER_ROLES.includes(contract.owner_role)) {
    out.push(at + 'owner_role must be one of ' + OWNER_ROLES.join(', ') +
      ' (got ' + JSON.stringify(contract.owner_role) + '). Roles are defined in ' +
      ROLES_FILE + '; a role is an authority domain, never permission to exceed this contract.')
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

  // Tier 1 is not reachable through ordinary allowed_paths, whatever the role.
  // The grant is the ONLY spelling, which is what keeps control-plane authority
  // visible as its own term in the sealed diff instead of hiding among the
  // task's ordinary working files.
  for (const a of okAllowed) {
    for (const protectedPath of PROTECTED_CONTROL_PLANE) {
      if (covers(a, protectedPath) || covers(protectedPath, a)) {
        out.push(at + 'allowed_paths may not authorise the protected control-plane path ' +
          protectedPath + ' (via "' + a + '") — declare it in control_plane.protected_paths ' +
          'under a matching grant instead')
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

  // ---- control_plane -----------------------------------------------------
  out.push(...controlPlaneViolations(contract, at))

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

/**
 * WHICH ROLE MAY HOLD A CONTROL-PLANE GRANT — derived, not declared here.
 *
 * .agent/roles.json is the one canonical role source, and this file names no
 * role id anywhere (role-model.test.mjs enforces exactly that). So the holder
 * of control-plane authority is read back out of the role model: the single
 * role that claims the control plane in its own purpose or authority list.
 *
 * Ambiguity is not resolved, it is refused. Zero matches or more than one
 * returns null, and a null holder means NO contract may carry a grant. The
 * failure is loud where it matters — a contract that carries one stops
 * validating, so CI goes red — and silent only while nobody is claiming the
 * authority at all, which is the safe direction.
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

/** The role that owns the control plane in the role model as loaded. */
export const CONTROL_PLANE_ROLE = controlPlaneRoleIn(ROLE_MODEL)

/** The keys a control_plane declaration may carry. Closed. */
const CONTROL_PLANE_KEYS = ['grant', 'protected_paths', 'justification']

/** The lowest risk a control-plane grant may be declared at. */
export const CONTROL_PLANE_MIN_RISK = 'r3'

/**
 * Validate a `control_plane` declaration. Absent is valid and yields nothing.
 *
 * Everything here fails closed. A declaration that is malformed, names an
 * unknown grant, or reaches a path its grant does not map to is REJECTED
 * outright rather than partially honoured — a half-understood grant is an
 * authority nobody has actually reviewed.
 *
 * Note what this does NOT require: that a protected path appear verbatim in the
 * registry. A grant may name something NARROWER than its mapping — one agent
 * file rather than `.claude/agents/**` — because forcing every grant to the
 * widest available spelling would be the opposite of least privilege. What is
 * required is containment: inside the tier, and inside the grant's own reach.
 */
export function controlPlaneViolations(contract, at = '') {
  if (!isPlainObject(contract)) return []
  if (!Object.prototype.hasOwnProperty.call(contract, 'control_plane')) return []

  const cp = contract.control_plane
  const out = []
  if (!isPlainObject(cp)) {
    return [at + 'control_plane must be an object naming a grant and its protected_paths (got ' +
      JSON.stringify(cp) + ')']
  }

  for (const key of Object.keys(cp)) {
    if (!CONTROL_PLANE_KEYS.includes(key)) out.push(at + 'control_plane: unknown field: ' + key)
  }

  // The role and risk that a control-plane grant is only ever expressible at.
  // Risk is a FLOOR, not an equality: r4 keeps its canonical meaning of direct
  // production authority, and control-plane work does not become production
  // work by being sensitive.
  //
  // The ROLE is derived, never named here — see controlPlaneRoleIn. If it
  // cannot be established, no contract may hold a grant: could not establish
  // is not authorised.
  const cpRole = CONTROL_PLANE_ROLE
  if (cpRole === null) {
    out.push(at + 'control_plane cannot be honoured: ' + ROLES_FILE + ' no longer identifies ' +
      'exactly one role that owns the control plane, so there is no role this grant could ' +
      'belong to. Fix the role model, or the grant stays unauthorised.')
  } else if (contract.owner_role !== cpRole) {
    out.push(at + 'control_plane requires owner_role ' + JSON.stringify(cpRole) + ' (got ' +
      JSON.stringify(contract.owner_role) + ') — control-plane authority is not delegable to another domain')
  }
  const declared = RISK_LEVELS.indexOf(contract.risk)
  const floor = RISK_LEVELS.indexOf(CONTROL_PLANE_MIN_RISK)
  if (declared < 0 || declared < floor) {
    out.push(at + 'control_plane requires risk of at least ' + CONTROL_PLANE_MIN_RISK +
      ' (got ' + JSON.stringify(contract.risk) + ')')
  }

  // hasOwnProperty, not a bare lookup: CONTROL_PLANE_GRANTS is an object
  // literal, so `grant: "constructor"` (or "toString", "__proto__", …) would
  // otherwise resolve through Object.prototype, skip the unknown-grant guard
  // below, and reach the containment check as a function. The vocabulary is
  // closed to the keys actually written here, and to nothing else.
  const grant = cp.grant
  const known = isNonEmptyString(grant) &&
    Object.prototype.hasOwnProperty.call(CONTROL_PLANE_GRANTS, grant)
  const mapped = known ? CONTROL_PLANE_GRANTS[grant] : undefined
  if (!known) {
    out.push(at + 'control_plane.grant must be one of ' + Object.keys(CONTROL_PLANE_GRANTS).join(', ') +
      ' (got ' + JSON.stringify(grant) + ')')
  }
  if (!isNonEmptyString(cp.justification)) {
    out.push(at + 'control_plane.justification must say why this task needs control-plane authority')
  }

  const paths = cp.protected_paths
  if (!isStringArray(paths) || paths.length === 0) {
    out.push(at + 'control_plane.protected_paths must be a non-empty array of non-empty strings')
    return out
  }

  // allowed_paths needs no comparison here: naming a tier path there is already
  // refused by findContractViolations, whether spelled exactly or through a
  // covering subtree. A second check on the same ground could never be the
  // operative one, and dead validation reads like protection that is not there.
  const forbidden = Array.isArray(contract.forbidden_paths)
    ? contract.forbidden_paths.filter(isNonEmptyString).filter(f => !pathGrammarError(f))
    : []
  for (const p of paths) {
    const grammar = pathGrammarError(p)
    if (grammar) {
      out.push(at + 'control_plane.protected_paths entry "' + p + '" ' + grammar)
      continue
    }
    if (inAbsoluteFloor(p)) {
      out.push(at + 'control_plane.protected_paths may never name "' + p +
        '" — it is on the absolute floor, which no grant reaches')
      continue
    }
    if (!inProtectedTier(p)) {
      out.push(at + 'control_plane.protected_paths entry "' + p +
        '" is not inside the protected control plane (' + PROTECTED_CONTROL_PLANE.join(', ') + ')')
      continue
    }
    if (mapped !== undefined && !mapped.some(m => covers(m, p))) {
      out.push(at + 'grant "' + grant + '" does not authorise "' + p +
        '" — it reaches only ' + mapped.join(', '))
    }
    // The same contradiction allowed_paths is already checked for, one tier up:
    // an allowance that can never take effect. Mechanical review tests
    // forbidden_paths BEFORE scope, so a granted path the contract also forbids
    // is dead authority — which is a mistake to correct, not to reconcile.
    for (const f of forbidden) {
      if (normalisePath(f) === normalisePath(p) || covers(f, p)) {
        out.push(at + 'control_plane.protected_paths entry "' + p + '" is forbidden by "' + f +
          '" — the grant can never take effect')
      }
    }
  }
  return out
}

/**
 * The protected paths this contract has VALIDLY been granted — the empty list
 * unless the whole declaration checks out.
 *
 * Callers use this to widen an implementation's effective scope, so a partially
 * valid grant must widen nothing. Fail closed, not fail partial.
 */
export function grantedProtectedPaths(contract) {
  if (controlPlaneViolations(contract).length > 0) return []
  const paths = contract?.control_plane?.protected_paths
  return Array.isArray(paths) ? [...paths] : []
}

/** allowed_paths united with any validly granted protected paths. */
export function effectiveAllowedPaths(contract) {
  const allowed = Array.isArray(contract?.allowed_paths) ? contract.allowed_paths : []
  return [...allowed, ...grantedProtectedPaths(contract)]
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
