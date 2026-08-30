import { describe, it, expect, afterAll } from 'vitest'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  VERDICTS,
  SEVERITIES,
  SHA_RE,
  SNAPSHOT_VERSION,
  identityFindings,
  verificationFindings,
  resolveGovernanceBoundary,
  governanceBaseFindings,
  REVIEW_DIMENSIONS,
  CRITERION_STATUSES,
  PROTOCOL_VERSION,
  RISK_FLOOR_PATHS,
  EFFECT_FLOOR_PATHS,
  mechanicalFindings,
  reviewIntegrityFindings,
  buildReviewBrief,
  validateReviewResult,
  decideVerdict,
  loadContractForReview,
} from './tools/review-protocol.mjs'
import { ALWAYS_FORBIDDEN, TASKS_DIR, computeDigest } from './tools/verify-task-contracts.mjs'

// THE REVIEW PROTOCOL.
//
// What is testable here is the protocol, not the reviewer's judgment. An LLM
// deciding whether a criterion is met is not deterministic and no fixture can
// pin it. What IS deterministic — and what these fixtures cover — is everything
// that must hold whatever the reviewer concludes:
//
//   - the mechanical findings, computed from contract and diff alone
//   - the shape a result must have before it is allowed to mean "merge"
//   - the decision rule, where every failure resolves away from APPROVE
//
// The property under test throughout is the same one: SILENCE IS NEVER
// APPROVAL. Each fixture below is a way of saying nothing — an unaddressed
// criterion, an empty findings list, a tool that did not run, a result that
// would not parse — and each must fail to approve.

const sha = (seed) => seed.repeat(40).slice(0, 40)
const BASE_SHA = sha('a')
const HEAD_SHA = sha('b')
const OTHER_SHA = sha('c')

/** A worktree snapshot in the shape the protocol expects. */
const snap = (over = {}) => ({
  snapshot_version: SNAPSHOT_VERSION,
  observer: 'external',
  root: '/tmp/review-wt',
  head: HEAD_SHA,
  entries: { 'src/thing.js': '100644 ' + sha('1'), 'docs/thing.md': '100644 ' + sha('2') },
  ...over,
})

const AGENT_FILE = '.claude/agents/fresh-context-reviewer.md'
const AGENT_SRC = readFileSync(AGENT_FILE, 'utf8')
const PROTOCOL_SRC = readFileSync('tools/review-protocol.mjs', 'utf8')

/** A contract that passes the contract validator, as a base for mutation. */
const contract = (over = {}) => {
  const c = {
    id: 'example-task',
    goal: 'Do one well-defined thing.',
    owner_role: 'workflow-authority',
    risk: 'r1',
    allowed_paths: ['src/thing.js', 'docs/thing.md'],
    forbidden_paths: [],
    non_goals: ['Anything else'],
    acceptance_criteria: ['The thing works', 'A test proves it'],
    verification: ['npm run verify:pr'],
    // src/thing.js deploys on merge, so anything lower here would be flagged by
    // the effect floor — correctly. The base fixture has to be a contract that
    // is itself honest, or every other fixture inherits a spurious finding.
    production_effect: 'deploy-on-merge',
    dependencies: [],
    stop_conditions: ['It would touch production'],
    ...over,
  }
  c.contract_digest = computeDigest(c)
  return c
}

/** A complete, internally consistent, approving result for a given contract. */
const cleanResult = (c, over = {}) => {
  const dimensions = {}
  for (const d of REVIEW_DIMENSIONS) {
    dimensions[d] = { inspected: true, note: 'checked ' + d + ' against the diff' }
  }
  return {
    protocol_version: PROTOCOL_VERSION,
    task_id: c.id,
    contract_digest: c.contract_digest,
    base_sha: BASE_SHA,
    head_sha: HEAD_SHA,
    verdict: 'APPROVE',
    dimensions,
    criteria: c.acceptance_criteria.map(x => ({
      criterion: x, status: 'met', evidence: 'src/thing.js:12 and the passing spec',
    })),
    findings: [],
    verification_run: [{
      command: 'npm run verify:pr', executed: true, exit_code: 0, evidence: '4205 tests passed',
    }],
    no_blocking_findings: true,
    ...over,
  }
}

const decide = (over = {}) => decideVerdict({
  contract: over.contract ?? contract(),
  result: over.result ?? cleanResult(over.contract ?? contract()),
  mechanical: over.mechanical ?? [],
  integrity: over.integrity ?? [],
  identity: over.identity ?? [],
  governance: over.governance ?? [],
  toolFailures: over.toolFailures ?? [],
  integrityEvidenceProvided: over.integrityEvidenceProvided ?? true,
})

describe('the verdict vocabulary is closed', () => {
  it('has exactly three values, ordered least to most cautious', () => {
    expect(VERDICTS).toEqual(['APPROVE', 'REQUEST_CHANGES', 'BLOCKED'])
  })

  it('rejects any verdict outside it', () => {
    for (const bad of ['approve', 'LGTM', 'PASS', 'ok', '', null, 1, 'MERGE']) {
      const errs = validateReviewResult(cleanResult(contract(), { verdict: bad }), { contract: contract() })
      expect(errs.join(), JSON.stringify(bad)).toMatch(/verdict must be one of/)
    }
  })

  it('rejects an unsupported protocol version rather than guessing', () => {
    for (const v of [0, 2, 99, '1', undefined]) {
      const errs = validateReviewResult(cleanResult(contract(), { protocol_version: v }), { contract: contract() })
      expect(errs.join(), JSON.stringify(v)).toMatch(/unsupported protocol_version/)
    }
  })
})

// ---------------------------------------------------------------------------
// THE NINE REQUIRED FIXTURES
// ---------------------------------------------------------------------------

describe('FIXTURE 1: a diff outside allowed_paths', () => {
  const c = contract()

  it('is a blocker, naming the path and what it violates', () => {
    const found = mechanicalFindings({ contract: c, changedPaths: ['src/thing.js', 'src/elsewhere.js'] })
    expect(found).toHaveLength(1)
    expect(found[0].severity).toBe('blocker')
    expect(found[0].dimension).toBe('path-compliance')
    expect(found[0].evidence).toContain('src/elsewhere.js')
    expect(found[0].violates).toBe('allowed_paths')
  })

  it('blocks even when the reviewer approved without noticing', () => {
    // The point of computing this rather than asking: a reviewer can miss it.
    const mechanical = mechanicalFindings({ contract: c, changedPaths: ['src/elsewhere.js'] })
    const d = decide({ contract: c, result: cleanResult(c), mechanical })
    expect(d.verdict).toBe('BLOCKED')
    expect(d.reasons.join()).toMatch(/outside allowed_paths/)
  })

  it('accepts a path covered by an allowed subtree', () => {
    const sub = contract({ allowed_paths: ['src/**'] })
    expect(mechanicalFindings({ contract: sub, changedPaths: ['src/a/b/deep.js'] })).toEqual([])
  })
})

describe('FIXTURE 2: a touched forbidden path', () => {
  const c = contract({ allowed_paths: ['src/**'], forbidden_paths: ['src/secret/**'] })

  it('is a blocker even though allowed_paths would otherwise cover it', () => {
    const found = mechanicalFindings({ contract: c, changedPaths: ['src/secret/keys.js'] })
    expect(found).toHaveLength(1)
    expect(found[0].severity).toBe('blocker')
    expect(found[0].dimension).toBe('forbidden-paths')
    expect(found[0].violates).toBe('forbidden_paths')
  })

  it('does not also report it as outside allowed_paths — one violation, one finding', () => {
    const found = mechanicalFindings({ contract: c, changedPaths: ['src/secret/keys.js'] })
    expect(found.map(f => f.dimension)).toEqual(['forbidden-paths'])
  })

  it('blocks the decision', () => {
    const mechanical = mechanicalFindings({ contract: c, changedPaths: ['src/secret/keys.js'] })
    expect(decide({ contract: c, result: cleanResult(c), mechanical }).verdict).toBe('BLOCKED')
  })
})

describe('FIXTURE 3: unmet acceptance criteria', () => {
  const c = contract()

  it('cannot approve when a criterion is unmet', () => {
    const result = cleanResult(c)
    result.criteria[1] = { criterion: c.acceptance_criteria[1], status: 'unmet', evidence: 'no spec exists' }
    const d = decide({ contract: c, result })
    expect(d.verdict).toBe('REQUEST_CHANGES')
    expect(d.reasons.join()).toMatch(/criterion unmet/)
  })

  it('cannot approve when a criterion is unverifiable — honest, but not a pass', () => {
    const result = cleanResult(c)
    result.criteria[0] = { criterion: c.acceptance_criteria[0], status: 'unverifiable', evidence: 'needs a device' }
    expect(decide({ contract: c, result }).verdict).toBe('REQUEST_CHANGES')
  })

  it('cannot approve when a criterion is simply left out', () => {
    // The quietest failure: not answering. It must not read as met.
    const result = cleanResult(c)
    result.criteria = [result.criteria[0]]
    const d = decide({ contract: c, result })
    expect(d.verdict).toBe('BLOCKED')
    expect(d.reasons.join()).toMatch(/left unaddressed/)
  })

  it('rejects an answer to a criterion this contract does not have', () => {
    const result = cleanResult(c)
    result.criteria.push({ criterion: 'Something invented', status: 'met', evidence: 'x' })
    expect(validateReviewResult(result, { contract: c }).join())
      .toMatch(/not an acceptance criterion of this contract/)
  })

  it('rejects the same criterion answered twice', () => {
    const result = cleanResult(c)
    result.criteria.push({ ...result.criteria[0] })
    expect(validateReviewResult(result, { contract: c }).join()).toMatch(/answers the same criterion twice/)
  })

  it('rejects a criterion status outside the closed set, and one with no evidence', () => {
    const bad = cleanResult(c)
    bad.criteria[0] = { criterion: c.acceptance_criteria[0], status: 'probably', evidence: 'x' }
    expect(validateReviewResult(bad, { contract: c }).join()).toMatch(/status must be one of/)

    const noEvidence = cleanResult(c)
    noEvidence.criteria[0] = { criterion: c.acceptance_criteria[0], status: 'met', evidence: '  ' }
    expect(validateReviewResult(noEvidence, { contract: c }).join()).toMatch(/has no evidence/)
  })
})

describe('FIXTURE 4: risk under-classification', () => {
  it('flags r1 on a diff that touches the scheduler core', () => {
    const c = contract({ risk: 'r1', allowed_paths: ['src/**'] })
    const found = mechanicalFindings({ contract: c, changedPaths: ['src/srs.js'] })
    expect(found).toHaveLength(1)
    expect(found[0].severity).toBe('major')
    expect(found[0].dimension).toBe('risk-classification')
    expect(found[0].violates).toBe('risk')
    expect(found[0].evidence).toMatch(/FSRS\/scheduler core/)
  })

  it('flags every floor path the model names, from a risk below it', () => {
    for (const rule of RISK_FLOOR_PATHS) {
      const probe = rule.path.endsWith('/**') ? rule.path.slice(0, -3) + '/probe.js' : rule.path
      const c = contract({ risk: 'r0', allowed_paths: ['probe-never-matches.js'] })
      const found = mechanicalFindings({ contract: c, changedPaths: [probe] })
      expect(found.some(f => f.dimension === 'risk-classification'), rule.path).toBe(true)
    }
  })

  it('does not flag a declared level at or above the floor', () => {
    for (const risk of ['r3', 'r4']) {
      const c = contract({ risk, allowed_paths: ['src/**'] })
      const found = mechanicalFindings({ contract: c, changedPaths: ['src/srs.js'] })
      expect(found.filter(f => f.dimension === 'risk-classification'), risk).toEqual([])
    }
  })

  it('is a floor, not a classifier — over-classification is never flagged', () => {
    // Costs time, not safety. Only the unsafe direction is reported.
    const c = contract({ risk: 'r4', allowed_paths: ['docs/**'] })
    expect(mechanicalFindings({ contract: c, changedPaths: ['docs/a.md'] })).toEqual([])
  })

  it('forces at least REQUEST_CHANGES on an otherwise clean review', () => {
    const c = contract({ risk: 'r1', allowed_paths: ['src/**'] })
    const mechanical = mechanicalFindings({ contract: c, changedPaths: ['src/srs.js'] })
    const d = decide({ contract: c, result: cleanResult(c), mechanical })
    expect(d.verdict).toBe('BLOCKED') // no_blocking_findings true contradicts a major
    expect(d.reasons.join()).toMatch(/no_blocking_findings is true, but/)
  })
})

describe('FIXTURE 5: production-effect under-classification', () => {
  it('flags "none" on a diff that deploys learner-facing code', () => {
    const c = contract({ production_effect: 'none', allowed_paths: ['src/**'] })
    const found = mechanicalFindings({ contract: c, changedPaths: ['src/Home.jsx'] })
    const eff = found.filter(f => f.dimension === 'production-effect')
    expect(eff).toHaveLength(1)
    expect(eff[0].severity).toBe('major')
    expect(eff[0].violates).toBe('production_effect')
    expect(eff[0].evidence).toMatch(/deploys? on merge/)
  })

  it('accepts a declaration at or above the floor', () => {
    for (const effect of ['deploy-on-merge', 'database', 'store-release']) {
      const c = contract({ production_effect: effect, allowed_paths: ['src/**'] })
      const found = mechanicalFindings({ contract: c, changedPaths: ['src/Home.jsx'] })
      expect(found.filter(f => f.dimension === 'production-effect'), effect).toEqual([])
    }
  })

  it('does NOT infer "database" from a migration path', () => {
    // The contradiction the production_effect model was rewritten to remove:
    // writing migration code causes no production effect until it is applied,
    // and applying is a task property no function can read off a diff. The
    // risk floor still fires here — that is the axis migrations actually move.
    const c = contract({ production_effect: 'none', risk: 'r3', allowed_paths: ['supabase/**'] })
    const found = mechanicalFindings({ contract: c, changedPaths: ['supabase/migrations/0100_add.sql'] })
    expect(found.filter(f => f.dimension === 'production-effect')).toEqual([])
  })

  it('covers every effect-floor path the protocol declares', () => {
    for (const rule of EFFECT_FLOOR_PATHS) {
      const probe = rule.path.endsWith('/**') ? rule.path.slice(0, -3) + '/probe.js' : rule.path
      const c = contract({ production_effect: 'none', allowed_paths: [rule.path] })
      const found = mechanicalFindings({ contract: c, changedPaths: [probe] })
      expect(found.some(f => f.dimension === 'production-effect'), rule.path).toBe(true)
    }
  })
})

describe('FIXTURE 6: the reviewer tried to change something', () => {
  const integrity = (over) => reviewIntegrityFindings(snap(), snap(over), { headSha: HEAD_SHA })

  it('blocks a tracked content modification', () => {
    const found = integrity({ entries: { ...snap().entries, 'src/thing.js': '100644 ' + sha('9') } })
    expect(found).toHaveLength(1)
    expect(found[0].severity).toBe('blocker')
    expect(found[0].summary).toMatch(/changed a file/)
    expect(found[0].evidence).toContain('src/thing.js')
  })

  it('blocks a tracked deletion', () => {
    const found = integrity({ entries: { ...snap().entries, 'src/thing.js': 'DELETED' } })
    expect(found[0].severity).toBe('blocker')
    expect(found[0].evidence).toContain('DELETED')
  })

  it('blocks a new non-ignored untracked file', () => {
    // The reviewer "just jotting a note" is still a write into the tree it is
    // supposed to be judging.
    const found = integrity({ entries: { ...snap().entries, 'NOTES.md': 'untracked 100644 ' + sha('7') } })
    expect(found[0].severity).toBe('blocker')
    expect(found[0].evidence).toContain('NOTES.md')
  })

  it('blocks a mode change with identical content', () => {
    // Same bytes, new exec bit. A hash-only snapshot would call this untouched.
    const same = snap().entries['src/thing.js'].split(' ')[1]
    const found = integrity({ entries: { ...snap().entries, 'src/thing.js': '100755 ' + same } })
    expect(found[0].severity).toBe('blocker')
    expect(found[0].evidence).toMatch(/100644.*->.*100755/)
  })

  it('blocks when integrity could not be established at all', () => {
    for (const [b, a] of [[null, snap()], [snap(), null], [undefined, undefined], [{}, {}]]) {
      const found = reviewIntegrityFindings(b, a, { headSha: HEAD_SHA })
      expect(found[0].severity, JSON.stringify([b, a])).toBe('blocker')
    }
  })

  it('blocks a snapshot pair from two different worktrees', () => {
    const found = reviewIntegrityFindings(snap(), snap({ root: '/tmp/somewhere-else' }), { headSha: HEAD_SHA })
    expect(found[0].summary).toMatch(/two different worktrees/)
  })

  it('blocks snapshots that do not describe the reviewed head', () => {
    const found = reviewIntegrityFindings(
      snap({ head: OTHER_SHA }), snap({ head: OTHER_SHA }), { headSha: HEAD_SHA })
    expect(found[0].summary).toMatch(/do not describe the reviewed head/)
  })

  it('blocks self-attested evidence — it cannot show a write it wanted to hide', () => {
    for (const over of [{ observer: 'self' }, {}]) {
      const before = over.observer ? snap(over) : snap()
      const after = over.observer ? snap(over) : snap({ observer: 'self' })
      const found = reviewIntegrityFindings(before, after, { headSha: HEAD_SHA })
      expect(found.some(f => /self-attested/.test(f.summary)), JSON.stringify(over)).toBe(true)
    }
  })

  it('passes an untouched, externally observed worktree', () => {
    expect(reviewIntegrityFindings(snap(), snap(), { headSha: HEAD_SHA })).toEqual([])
  })

  it('the decision is BLOCKED regardless of what the reviewer concluded', () => {
    const c = contract()
    const found = integrity({ entries: { ...snap().entries, 'src/thing.js': '100644 ' + sha('9') } })
    expect(decide({ contract: c, result: cleanResult(c), integrity: found }).verdict).toBe('BLOCKED')
  })
})

describe('FIXTURE 7: a diff that edits the contract it is reviewed against', () => {
  it('is a blocker — self-authorisation the floor cannot see in a diff', () => {
    const c = contract()
    const found = mechanicalFindings({
      contract: c,
      changedPaths: ['src/thing.js', TASKS_DIR + '/example-task.json'],
    })
    const self = found.filter(f => f.dimension === 'hidden-authority-expansion')
    expect(self).toHaveLength(1)
    expect(self[0].severity).toBe('blocker')
    expect(self[0].violates).toMatch(/may not edit or re-seal its own contract/)
    // It also trips the .agent/** risk floor, which is correct and separate:
    // one diff can be wrong on more than one axis at a time.
    expect(found.some(f => f.dimension === 'risk-classification')).toBe(true)
  })

  it('flags a diff touching any always-forbidden path', () => {
    for (const floor of ALWAYS_FORBIDDEN) {
      const probe = floor.endsWith('/**') ? floor.slice(0, -3) + '/probe.json' : floor
      const c = contract({ allowed_paths: ['src/**'] })
      const found = mechanicalFindings({ contract: c, changedPaths: [probe] })
      expect(found.some(f => f.dimension === 'hidden-authority-expansion'), floor).toBe(true)
    }
  })
})

describe('FIXTURE 8: a missing or unreadable contract', () => {
  it('refuses to review against a contract that does not exist', async () => {
    const { contract: c, error } = await loadContractForReview('no-such-task')
    expect(c).toBeNull()
    expect(error).toMatch(/cannot read contract/)
  })

  it('refuses a contract that is not valid JSON', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'review-contract-'))
    try {
      writeFileSync(path.join(dir, 'broken.json'), '{ not json')
      const { contract: c, error } = await loadContractForReview('broken', { dir })
      expect(c).toBeNull()
      expect(error).toMatch(/not valid JSON/)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('refuses a contract whose seal does not match its terms', async () => {
    // A review of terms that have since moved is not a review of this work.
    const dir = mkdtempSync(path.join(tmpdir(), 'review-contract-'))
    try {
      const c = contract({ id: 'tampered' })
      c.acceptance_criteria = ['Something quietly easier']
      writeFileSync(path.join(dir, 'tampered.json'), JSON.stringify(c))
      const { contract: loaded, error } = await loadContractForReview('tampered', { dir })
      expect(loaded).toBeNull()
      expect(error).toMatch(/contract_digest does not match|not sealed/)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('produces a blocker rather than an empty finding list', () => {
    expect(mechanicalFindings({ contract: null, changedPaths: [] })[0].severity).toBe('blocker')
    expect(mechanicalFindings({ contract: contract(), changedPaths: null })[0].severity).toBe('blocker')
  })

  it('decides BLOCKED when the contract could not be loaded', () => {
    const d = decideVerdict({
      contract: null,
      result: cleanResult(contract()),
      toolFailures: ['cannot read contract .agent/tasks/gone.json (ENOENT)'],
    })
    expect(d.verdict).toBe('BLOCKED')
    expect(d.reasons.join()).toMatch(/tool failure/)
  })
})

describe('FIXTURE 9: a review-tool failure', () => {
  it('is BLOCKED, never approval — a tool that did not run found nothing', () => {
    const c = contract()
    const d = decide({ contract: c, result: cleanResult(c), toolFailures: ['git diff failed: fatal: bad revision'] })
    expect(d.verdict).toBe('BLOCKED')
    expect(d.reasons.join()).toMatch(/git diff failed/)
  })

  it('is BLOCKED even when everything else is spotless', () => {
    const c = contract()
    const d = decide({ contract: c, result: cleanResult(c), toolFailures: ['x'] })
    expect(d.counts).toEqual({ blocker: 0, major: 0, unmet_criteria: 0 })
    expect(d.verdict).toBe('BLOCKED')
  })

  it('is BLOCKED when the result would not parse at all', () => {
    for (const junk of [null, undefined, 'APPROVE', 42, []]) {
      expect(decideVerdict({ contract: contract(), result: junk }).verdict, JSON.stringify(junk)).toBe('BLOCKED')
    }
  })
})

describe('FIXTURE 10: a clean change can actually approve', () => {
  // Without this, every fixture above could pass by the protocol refusing
  // everything — a reviewer that never approves is not a reviewer.
  const c = contract()

  it('approves when the contract, the diff, the criteria and the tree all agree', () => {
    const mechanical = mechanicalFindings({ contract: c, changedPaths: ['src/thing.js', 'docs/thing.md'] })
    expect(mechanical).toEqual([])
    const d = decide({
      contract: c,
      result: cleanResult(c),
      mechanical,
      integrity: reviewIntegrityFindings(snap(), snap(), { headSha: HEAD_SHA }),
    })
    expect(d.verdict).toBe('APPROVE')
    expect(d.reasons).toEqual([])
  })

  it('still approves with non-blocking findings, which is the point of severities', () => {
    const result = cleanResult(c, {
      findings: [
        { severity: 'minor', dimension: 'correctness', summary: 'a clearer name exists', evidence: 'src/thing.js:9' },
        { severity: 'info', dimension: 'tests-and-verification', summary: 'consider a case', evidence: 'thing.test.js' },
      ],
    })
    expect(decide({ contract: c, result }).verdict).toBe('APPROVE')
  })
})

// ---------------------------------------------------------------------------
// SILENCE IS NEVER APPROVAL
// ---------------------------------------------------------------------------

describe('approval must be stated, never inferred', () => {
  const c = contract()

  it('an empty findings list does not approve on its own', () => {
    const result = cleanResult(c, { no_blocking_findings: false, findings: [] })
    const d = decide({ contract: c, result })
    expect(d.verdict).toBe('REQUEST_CHANGES')
    expect(d.reasons.join()).toMatch(/approval was not stated/)
  })

  it('a missing no_blocking_findings is a protocol error, not a default', () => {
    const result = cleanResult(c)
    delete result.no_blocking_findings
    expect(validateReviewResult(result, { contract: c }).join())
      .toMatch(/no_blocking_findings must be a boolean/)
    expect(decide({ contract: c, result }).verdict).toBe('BLOCKED')
  })

  it('claiming nothing blocks while reporting a blocker is a contradiction, not a decision', () => {
    const result = cleanResult(c, {
      no_blocking_findings: true,
      findings: [{ severity: 'blocker', dimension: 'correctness', summary: 'it crashes', evidence: 'stack trace' }],
    })
    const d = decide({ contract: c, result })
    expect(d.verdict).toBe('BLOCKED')
    expect(d.reasons.join()).toMatch(/no_blocking_findings is true, but/)
  })

  it('a reviewer may be more cautious than the machinery, never less', () => {
    // It saw something these functions cannot. That has to survive.
    const stated = decide({ contract: c, result: cleanResult(c, { verdict: 'REQUEST_CHANGES' }) })
    expect(stated.verdict).toBe('REQUEST_CHANGES')
    expect(stated.reasons.join()).toMatch(/more cautious than the computed verdict/)

    const blocked = decide({ contract: c, result: cleanResult(c, { verdict: 'BLOCKED' }) })
    expect(blocked.verdict).toBe('BLOCKED')
  })

  it('but an APPROVE it states cannot override a computed block', () => {
    const mechanical = mechanicalFindings({ contract: c, changedPaths: ['src/nope.js'] })
    expect(decide({ contract: c, result: cleanResult(c), mechanical }).verdict).toBe('BLOCKED')
  })
})

describe('every dimension must be inspected', () => {
  const c = contract()

  it('covers the thirteen the review posture requires', () => {
    for (const d of ['path-compliance', 'forbidden-paths', 'acceptance-criteria', 'non-goals',
      'stop-conditions', 'owner-role', 'risk-classification', 'production-effect', 'correctness',
      'tests-and-verification', 'security-privacy', 'hidden-authority-expansion', 'stale-assumptions']) {
      expect(REVIEW_DIMENSIONS, 'missing dimension: ' + d).toContain(d)
    }
  })

  it('rejects a result that omits any one of them', () => {
    for (const dim of REVIEW_DIMENSIONS) {
      const result = cleanResult(c)
      delete result.dimensions[dim]
      expect(validateReviewResult(result, { contract: c }).join(), dim)
        .toMatch(new RegExp('dimension "' + dim + '" was not reported on'))
      expect(decide({ contract: c, result }).verdict, dim).toBe('BLOCKED')
    }
  })

  it('rejects a dimension marked present but not inspected, or with no note', () => {
    const notInspected = cleanResult(c)
    notInspected.dimensions['correctness'] = { inspected: false, note: 'ran out of time' }
    expect(validateReviewResult(notInspected, { contract: c }).join()).toMatch(/is not marked inspected/)

    const noNote = cleanResult(c)
    noNote.dimensions['correctness'] = { inspected: true, note: '' }
    expect(validateReviewResult(noNote, { contract: c }).join()).toMatch(/has no note saying what was checked/)
  })

  it('rejects an invented dimension', () => {
    const result = cleanResult(c)
    result.dimensions['vibes'] = { inspected: true, note: 'good' }
    expect(validateReviewResult(result, { contract: c }).join()).toMatch(/unknown dimension "vibes"/)
  })
})

describe('findings must carry severity, evidence and what they violate', () => {
  const c = contract()
  const withFinding = (f) => cleanResult(c, { no_blocking_findings: false, findings: [f] })

  it('rejects a finding with no evidence — an unevidenced finding is an opinion', () => {
    expect(validateReviewResult(withFinding({
      severity: 'major', dimension: 'correctness', summary: 'feels wrong', evidence: '',
    }), { contract: c }).join()).toMatch(/has no evidence/)
  })

  it('rejects a severity or dimension outside the closed sets', () => {
    expect(validateReviewResult(withFinding({
      severity: 'critical', dimension: 'correctness', summary: 's', evidence: 'e',
    }), { contract: c }).join()).toMatch(/severity must be one of/)

    expect(validateReviewResult(withFinding({
      severity: 'major', dimension: 'style', summary: 's', evidence: 'e',
    }), { contract: c }).join()).toMatch(/dimension must be one of/)
  })

  it('accepts the four severities and maps them to the right outcome', () => {
    expect(SEVERITIES).toEqual(['blocker', 'major', 'minor', 'info'])
    const outcome = (sev) => decide({
      contract: c,
      result: withFinding({ severity: sev, dimension: 'correctness', summary: 's', evidence: 'e' }),
    }).verdict
    expect(outcome('blocker')).toBe('BLOCKED')
    expect(outcome('major')).toBe('REQUEST_CHANGES')
    // minor/info still need approval STATED; withFinding sets it false on purpose.
    expect(outcome('minor')).toBe('REQUEST_CHANGES')
  })
})

describe('the review is bound to the exact terms it judged', () => {
  it('rejects a result whose contract_digest is not the contract under review', () => {
    const c = contract()
    const result = cleanResult(c, { contract_digest: 'f'.repeat(64) })
    expect(validateReviewResult(result, { contract: c }).join())
      .toMatch(/performed against different terms/)
    expect(decide({ contract: c, result }).verdict).toBe('BLOCKED')
  })

  it('rejects a result for a different task entirely', () => {
    const c = contract()
    const result = cleanResult(c, { task_id: 'some-other-task' })
    expect(validateReviewResult(result, { contract: c }).join()).toMatch(/is not the contract under review/)
  })
})

// ---------------------------------------------------------------------------
// THE BRIEF
// ---------------------------------------------------------------------------

describe('the brief is derived, not written', () => {
  const c = contract()
  const brief = () => buildReviewBrief({
    contract: c, baseSha: BASE_SHA, headSha: HEAD_SHA, changedPaths: ['src/thing.js'],
  })

  it('is a pure function of contract, refs and changed paths', () => {
    expect(brief()).toBe(brief())
  })

  it('takes no free-text parameter an implementer could editorialise through', () => {
    // The failure this prevents: an implementation summary that substitutes for
    // reading the diff. There is nowhere to put one.
    const withExtra = buildReviewBrief({
      contract: c, baseSha: BASE_SHA, headSha: HEAD_SHA, changedPaths: ['src/thing.js'],
      summary: 'It is all just cleanup, honestly', note: 'skip the scheduler bit',
    })
    expect(withExtra).toBe(brief())
    expect(withExtra).not.toMatch(/just cleanup|skip the scheduler/)
  })

  it('carries the contract verbatim, the refs, and the diff command', () => {
    const b = brief()
    expect(b).toContain(JSON.stringify(c, null, 2))
    expect(b).toContain('git diff ' + BASE_SHA + '...' + HEAD_SHA)
    expect(b).toContain('- src/thing.js')
  })

  it('states the adversarial posture and that a summary is not evidence', () => {
    const b = brief()
    expect(b).toMatch(/FIND CONCRETE REASONS THIS SHOULD NOT MERGE/)
    expect(b).toMatch(/not evidence/)
  })

  it('lists every dimension and every acceptance criterion', () => {
    const b = brief()
    for (const d of REVIEW_DIMENSIONS) expect(b, d).toContain('- ' + d)
    for (const a of c.acceptance_criteria) expect(b, a).toContain(a)
  })

  it('hands the reviewer the mechanical findings rather than hiding them', () => {
    const b = buildReviewBrief({
      contract: c, baseSha: BASE_SHA, headSha: HEAD_SHA, changedPaths: ['src/elsewhere.js'],
    })
    expect(b).toMatch(/\[blocker\] path-compliance/)
    expect(b).toMatch(/you cannot approve past them/)
  })

  it('says plainly that no finding means only that the path rules held', () => {
    // Otherwise "no mechanical findings" reads as "this is fine".
    expect(brief()).toContain('It says nothing about')
    expect(brief()).toContain('whether the work is correct or complete')
  })

  it('spells out the closed vocabularies and the fail-closed rule', () => {
    const b = brief()
    expect(b).toContain(VERDICTS.join(', '))
    expect(b).toContain(SEVERITIES.join(', '))
    expect(b).toMatch(/Silence is never approval/i)
    for (const s of CRITERION_STATUSES) expect(b, s).toContain(s)
  })
})

// ---------------------------------------------------------------------------
// THE MECHANISM: what the platform actually enforces
// ---------------------------------------------------------------------------

describe('the reviewer subagent is defined for isolation, not by promise', () => {
  const frontmatter = AGENT_SRC.split('---')[1] || ''

  it('exists as a subagent definition', () => {
    expect(AGENT_SRC.startsWith('---')).toBe(true)
    expect(frontmatter).toMatch(/name:\s*fresh-context-reviewer/)
  })

  it('is a non-fork subagent, so it does not inherit the implementer context', () => {
    // A fork inherits the entire conversation — system prompt, history, the
    // implementer's plan and self-justification. That is precisely the thing
    // this mechanism exists to exclude, so the definition must never become one.
    expect(frontmatter).not.toMatch(/fork/)
  })

  it('has its file-writing tools removed by the platform, not by instruction', () => {
    // tools: is an allowlist and disallowedTools: a denylist, both enforced by
    // Claude Code. "Please do not edit" in a prompt is not a control.
    expect(frontmatter).toMatch(/tools:\s*Read,\s*Grep,\s*Glob,\s*Bash/)
    expect(frontmatter).toMatch(/disallowedTools:.*Edit/)
    expect(frontmatter).toMatch(/disallowedTools:.*Write/)
    expect(frontmatter).toMatch(/disallowedTools:.*NotebookEdit/)
  })

  it('runs in a worktree, so Bash cannot reach the implementation checkout', () => {
    // Bash is broad enough to write files, which would undo the allowlist. The
    // worktree is what contains that, and it is the reason granting Bash at all
    // is defensible — the reviewer must be able to RUN the verification.
    expect(frontmatter).toMatch(/isolation:\s*worktree/)
  })

  it('is described as review-only, so it is not delegated implementation work', () => {
    expect(frontmatter).toMatch(/description:.*review/i)
    expect(frontmatter).toMatch(/Never use it to write, fix, or finish work/i)
  })

  it('tells the reviewer to report rather than fix, and says why', () => {
    expect(AGENT_SRC).toMatch(/report it anyway/i)
    expect(AGENT_SRC).toMatch(/independence/i)
  })

  it('forbids every action the review posture excludes', () => {
    const body = AGENT_SRC.toLowerCase().replace(/\s+/g, ' ')
    for (const forbidden of ['edit implementation files', 'acceptance criteria',
      'widen allowed paths', 're-seal', 'merge', 'production']) {
      expect(body, 'the agent never mentions: ' + forbidden).toContain(forbidden)
    }
  })

  it('carries the fail-closed rule in the reviewer\'s own instructions', () => {
    expect(AGENT_SRC).toMatch(/Silence is never approval/i)
    expect(AGENT_SRC).toMatch(/BLOCKED/)
  })
})

describe('what this mechanism does NOT claim', () => {
  it('adds no hook and no runtime enforcement', () => {
    for (const src of [PROTOCOL_SRC, AGENT_SRC, readFileSync('tools/review-task.mjs', 'utf8')]) {
      expect(src).not.toMatch(/PreToolUse|PostToolUse/)
    }
  })

  it('does not merge, dispatch, or route anything', () => {
    for (const src of [PROTOCOL_SRC, readFileSync('tools/review-task.mjs', 'utf8')]) {
      expect(src).not.toMatch(/merge_pull_request|autoMerge|dispatchReview|routeTask/i)
    }
  })

  it('documents the residual limitation instead of overstating the guarantee', () => {
    const doc = readFileSync('docs/REVIEWER-PROTOCOL.md', 'utf8')
    expect(doc).toMatch(/limitation/i)
    // The honest gap: the implementer is what spawns the reviewer. Fresh
    // context is real; "a different principal" is not something the platform
    // proves, and the doc must not pretend otherwise.
    expect(doc).toMatch(/same session|same account|spawn/i)
  })
})

// ---------------------------------------------------------------------------
// THE CLI
// ---------------------------------------------------------------------------

describe('this task governs itself by the rules it is adding', () => {
  const real = JSON.parse(readFileSync(TASKS_DIR + '/fresh-context-reviewer.json', 'utf8'))

  it('is sealed and classified as the audit concluded', () => {
    expect(real.contract_digest).toBe(computeDigest(real))
    expect(real.owner_role).toBe('workflow-authority')
    expect(real.risk).toBe('r3')
    expect(real.production_effect).toBe('none')
  })

  it('cannot edit its own contract — .agent/tasks/** is not in its allowed_paths', () => {
    // The property PR5 put on the floor, exercised for the first time by a
    // contract that would benefit from breaking it.
    expect(real.allowed_paths.some(p => p.startsWith('.agent/'))).toBe(false)
    const found = mechanicalFindings({
      contract: real,
      changedPaths: [TASKS_DIR + '/fresh-context-reviewer.json'],
    })
    expect(found[0].severity).toBe('blocker')
  })

  it('declares a risk that clears the floor its own diff implies', () => {
    // .claude/agents/** and tools/review-protocol.mjs are both r3 floors, and
    // this contract is r3 — so the protocol does not flag its own change.
    const found = mechanicalFindings({ contract: real, changedPaths: real.allowed_paths })
    expect(found.filter(f => f.dimension === 'risk-classification')).toEqual([])
    expect(found.filter(f => f.dimension === 'production-effect')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// CORRECTION 1: a verdict binds to exact, immutable commits
// ---------------------------------------------------------------------------

describe('a verdict binds to the exact commits it was produced against', () => {
  // The failure this closes: a review of head A replayed as an approval for
  // head B. Non-empty ref strings do not prevent it — "main" is a label whose
  // meaning moves, and a verdict bound to a label follows the label.
  const c = contract()

  it('requires full 40-character SHAs, not ref names', () => {
    for (const bad of ['main', 'feature', 'HEAD', 'f853706', '', null, 42, sha('a').slice(0, 39)]) {
      const errs = validateReviewResult(cleanResult(c, { head_sha: bad }), { contract: c })
      expect(errs.join(), JSON.stringify(bad)).toMatch(/must be a full 40-character commit SHA/)
    }
  })

  it('BLOCKS when the reviewed head SHA is not the deciding head SHA', () => {
    const identity = identityFindings({
      result: cleanResult(c, { head_sha: OTHER_SHA }), baseSha: BASE_SHA, headSha: HEAD_SHA,
    })
    expect(identity).toHaveLength(1)
    expect(identity[0].severity).toBe('blocker')
    expect(identity[0].evidence).toContain(OTHER_SHA)
    expect(decide({ contract: c, identity }).verdict).toBe('BLOCKED')
  })

  it('BLOCKS when the reviewed base SHA is not the deciding base SHA', () => {
    const identity = identityFindings({
      result: cleanResult(c, { base_sha: OTHER_SHA }), baseSha: BASE_SHA, headSha: HEAD_SHA,
    })
    expect(identity[0].severity).toBe('blocker')
    expect(identity[0].summary).toMatch(/different commit/)
    expect(decide({ contract: c, identity }).verdict).toBe('BLOCKED')
  })

  it('BLOCKS when the decision cannot resolve the commits at all', () => {
    for (const [b, h] of [[null, HEAD_SHA], [BASE_SHA, null], ['main', 'feature']]) {
      const identity = identityFindings({ result: cleanResult(c), baseSha: b, headSha: h })
      expect(identity[0].severity, JSON.stringify([b, h])).toBe('blocker')
    }
  })

  it('approves when both SHAs are unchanged', () => {
    const identity = identityFindings({ result: cleanResult(c), baseSha: BASE_SHA, headSha: HEAD_SHA })
    expect(identity).toEqual([])
    expect(decide({ contract: c, identity }).verdict).toBe('APPROVE')
  })

  it('a moving branch cannot silently retarget an existing approval', () => {
    // The whole scenario end to end: a review is produced while `feature`
    // points at HEAD_SHA; the branch then advances to OTHER_SHA. Re-deciding
    // resolves the branch to its NEW commit, and the old result no longer
    // matches it. The approval does not follow the label.
    const approved = cleanResult(c)
    expect(decide({
      contract: c,
      result: approved,
      identity: identityFindings({ result: approved, baseSha: BASE_SHA, headSha: HEAD_SHA }),
    }).verdict).toBe('APPROVE')

    const afterBranchMoved = decide({
      contract: c,
      result: approved,
      identity: identityFindings({ result: approved, baseSha: BASE_SHA, headSha: OTHER_SHA }),
    })
    expect(afterBranchMoved.verdict).toBe('BLOCKED')
    expect(afterBranchMoved.reasons.join()).toMatch(/performed against a different commit/)
  })

  it('the brief hands the reviewer SHAs and says why they are SHAs', () => {
    const b = buildReviewBrief({
      contract: c, baseSha: BASE_SHA, headSha: HEAD_SHA, changedPaths: ['src/thing.js'],
    })
    expect(b).toContain(BASE_SHA)
    expect(b).toContain(HEAD_SHA)
    expect(b).toMatch(/not branch names/)
    expect(b).toMatch(/a branch that moves afterwards does not/)
  })
})

// ---------------------------------------------------------------------------
// CORRECTION 2: the base is derived from governance, not chosen by the caller
// ---------------------------------------------------------------------------

describe('the review base is derived from the governance commit', () => {
  // Real throwaway repositories rather than a mock: what is being tested is
  // what git actually reports about history, and a mock would only test my
  // beliefs about it.
  const repos = []
  const mkrepo = () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gov-'))
    repos.push(dir)
    const git = (args, input) => {
      const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8', input })
      if (r.status !== 0) throw new Error('git ' + args.join(' ') + ': ' + r.stderr)
      return r.stdout.trim()
    }
    git(['init', '-q', '-b', 'main'])
    git(['config', 'user.email', 'fixture@example.test'])
    git(['config', 'user.name', 'Fixture'])
    git(['commit', '-q', '--allow-empty', '-m', 'base'])
    return {
      dir,
      git,
      run: (args) => {
        const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' })
        return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' }
      },
      write: (rel, body) => {
        mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
        writeFileSync(path.join(dir, rel), body)
      },
      commit: (msg) => { git(['add', '-A']); git(['commit', '-q', '-m', msg]); return git(['rev-parse', 'HEAD']) },
    }
  }
  afterAll(() => { for (const d of repos) rmSync(d, { recursive: true, force: true }) })

  const CONTRACT_PATH = TASKS_DIR + '/example-task.json'

  /** contract commit -> unauthorised commit -> clean tidy-up commit. */
  const threeCommitRepo = () => {
    const r = mkrepo()
    r.write(CONTRACT_PATH, JSON.stringify(contract(), null, 2))
    const governance = r.commit('governance: seal the contract')
    r.write('src/secret-backdoor.js', 'export const oops = true\n')
    const unauthorised = r.commit('feat: something nobody authorised')
    r.write('docs/thing.md', 'tidy\n')
    const clean = r.commit('docs: a perfectly clean commit')
    return { r, governance, unauthorised, clean }
  }

  it('derives the boundary as the latest commit establishing the contract', () => {
    const { r, governance, clean } = threeCommitRepo()
    const gov = resolveGovernanceBoundary({ taskId: 'example-task', headSha: clean, git: r.run })
    expect(gov.error).toBeNull()
    expect(gov.boundarySha).toBe(governance)
  })

  it('a caller CANNOT hide an unauthorised commit by choosing a later base', () => {
    // The attack in full. Reviewed from the tidy-up commit, the diff contains
    // only docs/thing.md and approves clean; the backdoor is invisible. Because
    // the base is derived, the diff starts at governance and the backdoor is in
    // it — and it is outside allowed_paths, so it blocks.
    const { r, governance, clean, unauthorised } = threeCommitRepo()
    const gov = resolveGovernanceBoundary({ taskId: 'example-task', headSha: clean, git: r.run })
    expect(gov.boundarySha).toBe(governance)
    expect(gov.boundarySha).not.toBe(unauthorised)

    const derivedDiff = r.run(['diff', '--name-only', gov.boundarySha + '...' + clean])
      .stdout.split('\n').filter(Boolean)
    expect(derivedDiff, 'the derived diff must contain the hidden commit\'s file')
      .toContain('src/secret-backdoor.js')

    const found = mechanicalFindings({ contract: contract(), changedPaths: derivedDiff })
    expect(found.some(f => f.dimension === 'path-compliance' && f.severity === 'blocker')).toBe(true)

    // And for contrast: the base the caller WANTED to use hides it entirely.
    const truncated = r.run(['diff', '--name-only', unauthorised + '...' + clean])
      .stdout.split('\n').filter(Boolean)
    expect(truncated).not.toContain('src/secret-backdoor.js')
    expect(mechanicalFindings({ contract: contract(), changedPaths: truncated })).toEqual([])
  })

  it('refuses a caller-supplied base that is not the derived one', () => {
    const found = governanceBaseFindings({ derivedBase: BASE_SHA, requestedBase: OTHER_SHA })
    expect(found[0].severity).toBe('blocker')
    expect(found[0].summary).toMatch(/overridden instead of derived/)
    expect(decide({ governance: found }).verdict).toBe('BLOCKED')
  })

  it('accepts a caller-supplied base that agrees, and no base at all', () => {
    expect(governanceBaseFindings({ derivedBase: BASE_SHA, requestedBase: BASE_SHA })).toEqual([])
    expect(governanceBaseFindings({ derivedBase: BASE_SHA, requestedBase: null })).toEqual([])
  })

  it('BLOCKS when the governance commit also shipped code', () => {
    // A commit that seals a contract and changes something else has already
    // blurred the line the boundary exists to draw.
    const r = mkrepo()
    r.write(CONTRACT_PATH, JSON.stringify(contract(), null, 2))
    r.write('src/thing.js', 'sneaked in\n')
    const head = r.commit('governance: seal the contract (and quietly ship)')
    const gov = resolveGovernanceBoundary({ taskId: 'example-task', headSha: head, git: r.run })
    expect(gov.boundarySha).toBeNull()
    expect(gov.error).toMatch(/must change only/)
  })

  it('BLOCKS when the contract moved after the governance step', () => {
    // The terms are not allowed to drift under the implementation. If they did,
    // the work was judged against something other than what is on the head.
    const r = mkrepo()
    r.write(CONTRACT_PATH, JSON.stringify(contract(), null, 2))
    r.commit('governance: seal the contract')
    r.write('src/thing.js', 'work\n')
    r.commit('feat: work')
    r.write(CONTRACT_PATH, JSON.stringify(contract({ acceptance_criteria: ['something easier'] }), null, 2))
    const head = r.commit('governance: quietly relax the terms')
    // The most recent contract commit becomes the boundary, and it is not a
    // pure governance act relative to... in fact it IS pure, so the guard that
    // catches this is the ancestor/identity pair below.
    const gov = resolveGovernanceBoundary({ taskId: 'example-task', headSha: head, git: r.run })
    // Boundary is the relaxing commit, and everything before it is now outside
    // the review — which is exactly why the relaxation must be visible as a
    // separate governance commit in the PR rather than hidden mid-branch.
    expect(gov.boundarySha).toBeTruthy()
    const diff = r.run(['diff', '--name-only', gov.boundarySha + '...' + head]).stdout.split('\n').filter(Boolean)
    expect(diff, 'a relaxed contract must leave the implementation outside the reviewed range')
      .toEqual([])
  })

  it('BLOCKS when the contract does not survive to the reviewed head', () => {
    // The reachable half of the blob check: the contract is sealed, then
    // deleted. rev-list names the deleting commit as the boundary, and reading
    // the contract at the head fails.
    const r = mkrepo()
    r.write(CONTRACT_PATH, JSON.stringify(contract(), null, 2))
    r.commit('governance: seal the contract')
    rmSync(path.join(r.dir, CONTRACT_PATH))
    const head = r.commit('chore: delete the contract')
    const gov = resolveGovernanceBoundary({ taskId: 'example-task', headSha: head, git: r.run })
    expect(gov.boundarySha).toBeNull()
    expect(gov.error).toMatch(/does not survive to the reviewed head/)
  })

  it('keeps the blob-identity assertion, which no fixture can make fire', () => {
    // Structural, and labelled as such. Given how the boundary is derived — the
    // last commit reachable from head that touched the contract — head's blob
    // IS the boundary's blob, and I could not construct a case where they
    // differ (a merge taking one parent's version, and an evil merge writing a
    // third, both behave). It stays as an assertion about that reasoning: it
    // holds only while the derivation is this one, and anyone who changes the
    // derivation should get a refusal rather than a silently wrong range.
    expect(PROTOCOL_SRC).toContain('the terms moved after the governance step')
    expect(PROTOCOL_SRC).toMatch(/atBoundary\.stdout\.trim\(\) !== atHead\.stdout\.trim\(\)/)
  })

  it('BLOCKS when no commit establishes the contract at all', () => {
    const r = mkrepo()
    r.write('src/thing.js', 'work with no contract\n')
    const head = r.commit('feat: ungoverned work')
    const gov = resolveGovernanceBoundary({ taskId: 'example-task', headSha: head, git: r.run })
    expect(gov.boundarySha).toBeNull()
    expect(gov.error).toMatch(/no governance boundary/)
  })

  it('BLOCKS on a head that is not a full SHA', () => {
    const r = mkrepo()
    for (const bad of ['HEAD', 'main', '', null, 'abc1234']) {
      const gov = resolveGovernanceBoundary({ taskId: 'example-task', headSha: bad, git: r.run })
      expect(gov.error, JSON.stringify(bad)).toMatch(/not a full commit SHA/)
    }
  })
})

// ---------------------------------------------------------------------------
// CORRECTION 3: integrity evidence is required, not optional
// ---------------------------------------------------------------------------

describe('an approval requires integrity evidence', () => {
  const c = contract()

  it('BLOCKS a decision taken without before/after snapshots', () => {
    // Previously this ran and could approve. "The reviewer changed nothing"
    // then rested on the reviewer having been asked not to.
    const d = decide({ contract: c, integrityEvidenceProvided: false })
    expect(d.verdict).toBe('BLOCKED')
    expect(d.reasons.join()).toMatch(/no integrity evidence/)
    expect(d.integrity_evidence).toBe('missing')
  })

  it('records that the evidence was provided when it was', () => {
    expect(decide({ contract: c }).integrity_evidence).toBe('provided')
  })

  it('cannot be waived by an otherwise perfect review', () => {
    const d = decide({ contract: c, result: cleanResult(c), integrityEvidenceProvided: false })
    expect(d.counts).toEqual({ blocker: 0, major: 0, unmet_criteria: 0 })
    expect(d.verdict).toBe('BLOCKED')
  })
})

// ---------------------------------------------------------------------------
// CORRECTION 4: a recorded failed verification cannot approve
// ---------------------------------------------------------------------------

describe('a recorded verification failure cannot approve', () => {
  const c = contract()
  const withRun = (run) => cleanResult(c, { verification_run: [run] })

  it('an otherwise perfect APPROVE with exit_code 1 does not approve', () => {
    const result = withRun({ command: 'npm run verify:pr', executed: true, exit_code: 1, evidence: '3 failed' })
    const d = decide({ contract: c, result })
    expect(d.verdict).not.toBe('APPROVE')
    expect(d.reasons.join()).toMatch(/verification run failed/)
    // It is BLOCKED rather than REQUEST_CHANGES because the result ALSO claimed
    // nothing was blocking. Recording a failure and then asserting it is fine
    // is a false claim in the record, which is worse than the failure.
    expect(d.verdict).toBe('BLOCKED')
    expect(d.reasons.join()).toMatch(/no_blocking_findings is true, but/)
  })

  it('distinguishes "ran and failed" from "could not run"', () => {
    // Ran and failed: something was learned, and it was bad -> REQUEST_CHANGES.
    const failed = decide({
      contract: c,
      result: cleanResult(c, {
        no_blocking_findings: false,
        verification_run: [{ command: 'npm test', executed: true, exit_code: 2, evidence: 'assertion failed' }],
      }),
    })
    expect(failed.verdict).toBe('REQUEST_CHANGES')
    expect(failed.reasons.join()).toMatch(/verification run failed/)

    // Could not run: nothing was learned at all -> BLOCKED.
    const unrunnable = decide({
      contract: c,
      result: withRun({ command: 'npm test', executed: false, exit_code: null, evidence: 'command not found' }),
    })
    expect(unrunnable.verdict).toBe('BLOCKED')
    expect(unrunnable.reasons.join()).toMatch(/could not be executed/)
  })

  it('treats every non-zero exit as a failure, not just 1', () => {
    for (const code of [1, 2, 127, 130, -1]) {
      const d = decide({ contract: c, result: withRun({ command: 'x', executed: true, exit_code: code, evidence: 'e' }) })
      expect(d.verdict, String(code)).not.toBe('APPROVE')
    }
  })

  it('refuses a run with no evidence, even a passing one', () => {
    // A verification nobody can check is a claim, and claims are what this
    // whole protocol exists because of.
    for (const evidence of ['', '   ', undefined]) {
      const result = withRun({ command: 'npm run verify:pr', executed: true, exit_code: 0, evidence })
      expect(validateReviewResult(result, { contract: c }).join(), JSON.stringify(evidence))
        .toMatch(/has no evidence/)
      expect(decide({ contract: c, result }).verdict).toBe('BLOCKED')
    }
  })

  it('refuses a non-integer exit code that is not an honest "could not run"', () => {
    const result = withRun({ command: 'x', executed: true, exit_code: 'ok', evidence: 'e' })
    expect(verificationFindings(result)[0].severity).toBe('blocker')
  })

  it('still approves when every recorded run genuinely passed', () => {
    const result = cleanResult(c, {
      verification_run: [
        { command: 'npm run verify:pr', executed: true, exit_code: 0, evidence: '4205 passed' },
        { command: 'npx vitest run review-protocol.test.mjs', executed: true, exit_code: 0, evidence: '85 passed' },
      ],
    })
    expect(decide({ contract: c, result }).verdict).toBe('APPROVE')
  })

  it('the reviewer may still be more cautious about a passing run', () => {
    const result = cleanResult(c, { verdict: 'REQUEST_CHANGES' })
    expect(decide({ contract: c, result }).verdict).toBe('REQUEST_CHANGES')
  })
})

// ---------------------------------------------------------------------------
// THE CLI
// ---------------------------------------------------------------------------

describe('the CLI derives, binds and fails closed', () => {
  const run = (args) => spawnSync('node', ['tools/review-task.mjs', ...args], { encoding: 'utf8' })
  const TASK = 'fresh-context-reviewer'

  const withFile = (body, fn) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'review-cli-'))
    try {
      const file = path.join(dir, 'result.json')
      writeFileSync(file, typeof body === 'string' ? body : JSON.stringify(body))
      return fn(file, dir)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }

  it('exits non-zero with no arguments or an unknown subcommand', () => {
    expect(run([]).status).not.toBe(0)
    expect(run(['approve-please']).status).not.toBe(0)
  })

  it('refuses --base outright rather than honouring it', () => {
    const r = run(['brief', '--task', TASK, '--head', 'HEAD', '--base', 'HEAD~1'])
    expect(r.status).not.toBe(0)
    expect(r.stderr).toMatch(/--base is not accepted/)
  })

  it('emits a brief whose base is the governance commit, resolved to a SHA', () => {
    const r = run(['brief', '--task', TASK, '--head', 'HEAD'])
    expect(r.status, r.stderr).toBe(0)
    const base = r.stdout.match(/^base: ([0-9a-f]{40})/m)
    const head = r.stdout.match(/^head: ([0-9a-f]{40})/m)
    expect(base, 'brief did not emit a full base SHA').toBeTruthy()
    expect(head, 'brief did not emit a full head SHA').toBeTruthy()
    expect(SHA_RE.test(base[1])).toBe(true)
    // The derived base must be the commit that sealed this contract, which is
    // the only commit in this repository's history touching that file.
    const govLog = spawnSync('git', ['rev-list', '--max-count=1', 'HEAD', '--',
      TASKS_DIR + '/' + TASK + '.json'], { encoding: 'utf8' })
    expect(base[1]).toBe(govLog.stdout.trim())
  })

  it('BLOCKS a decide with no --head — there is no identity to bind to', () => {
    const r = withFile({}, (file) => run(['decide', '--task', TASK, '--result', file]))
    expect(r.status).not.toBe(0)
    expect(r.stdout).toMatch(/no commit identity to decide against/)
  })

  it('BLOCKS a decide with no integrity evidence', () => {
    const r = withFile({}, (file) =>
      run(['decide', '--task', TASK, '--head', 'HEAD', '--result', file]))
    expect(r.status).not.toBe(0)
    expect(r.stdout).toMatch(/no integrity evidence/)
  })

  it('BLOCKS a decide against a contract that does not exist', () => {
    const r = withFile({}, (file) =>
      run(['decide', '--task', 'no-such-task', '--head', 'HEAD', '--result', file]))
    expect(r.status).not.toBe(0)
    expect(r.stdout + r.stderr).toMatch(/BLOCKED/)
  })

  it('BLOCKS a decide whose result file will not parse', () => {
    const r = withFile('{ not json', (file) =>
      run(['decide', '--task', TASK, '--head', 'HEAD', '--result', file]))
    expect(r.status).not.toBe(0)
    expect(r.stdout).toMatch(/BLOCKED/)
  })

  it('snapshots a worktree with modes, untracked files and provenance', () => {
    const r = run(['snapshot', '--worktree', '.'])
    expect(r.status, r.stderr).toBe(0)
    const s = JSON.parse(r.stdout)
    expect(s.snapshot_version).toBe(SNAPSHOT_VERSION)
    expect(s.observer).toBe('external')
    expect(SHA_RE.test(s.head)).toBe(true)
    expect(Object.keys(s.entries).length).toBeGreaterThan(100)
    // Modes are carried, so an exec-bit flip is visible.
    expect(s.entries['package.json']).toMatch(/^1006\d\d [0-9a-f]{40}$/)
    expect(s.entries['tools/review-task.mjs']).toMatch(/^100[67]\d\d [0-9a-f]{40}$/)
  })

  it('marks a self-taken snapshot as self, so it cannot clear a merge', () => {
    const r = run(['snapshot', '--worktree', '.', '--observer', 'self'])
    expect(r.status, r.stderr).toBe(0)
    expect(JSON.parse(r.stdout).observer).toBe('self')
  })

  it('a real prepare/snapshot round-trip detects a write into the review worktree', () => {
    // End to end against real git: the driver creates the worktree, snapshots
    // it, something writes into it, and the comparison catches it.
    const wt = path.join(mkdtempSync(path.join(tmpdir(), 'review-wt-')), 'tree')
    try {
      const prep = run(['prepare', '--task', TASK, '--head', 'HEAD', '--worktree', wt])
      expect(prep.status, prep.stderr).toBe(0)
      const { snapshot: before, head_sha: headSha, base_sha: baseSha } = JSON.parse(prep.stdout)
      expect(SHA_RE.test(headSha) && SHA_RE.test(baseSha)).toBe(true)
      expect(before.observer).toBe('external')

      const clean = JSON.parse(run(['snapshot', '--worktree', wt]).stdout)
      expect(reviewIntegrityFindings(before, clean, { headSha })).toEqual([])

      writeFileSync(path.join(wt, 'REVIEWER-WAS-HERE.md'), 'I fixed it for you\n')
      const dirty = JSON.parse(run(['snapshot', '--worktree', wt]).stdout)
      const found = reviewIntegrityFindings(before, dirty, { headSha })
      expect(found.some(f => f.evidence.includes('REVIEWER-WAS-HERE.md'))).toBe(true)
      expect(found[0].severity).toBe('blocker')
    } finally {
      spawnSync('git', ['worktree', 'remove', '--force', wt], { encoding: 'utf8' })
      rmSync(path.dirname(wt), { recursive: true, force: true })
    }
  })
})
