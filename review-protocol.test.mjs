import { describe, it, expect } from 'vitest'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  VERDICTS,
  SEVERITIES,
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
    base_ref: 'main',
    head_ref: 'feature',
    verdict: 'APPROVE',
    dimensions,
    criteria: c.acceptance_criteria.map(x => ({
      criterion: x, status: 'met', evidence: 'src/thing.js:12 and the passing spec',
    })),
    findings: [],
    verification_run: [{ command: 'npm run verify:pr', exit_code: 0, evidence: '4120 tests passed' }],
    no_blocking_findings: true,
    ...over,
  }
}

const decide = (over = {}) => decideVerdict({
  contract: over.contract ?? contract(),
  result: over.result ?? cleanResult(over.contract ?? contract()),
  mechanical: over.mechanical ?? [],
  integrity: over.integrity ?? [],
  toolFailures: over.toolFailures ?? [],
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
  it('blocks when the review modified a file', () => {
    const before = { 'src/thing.js': 'aaa', 'docs/thing.md': 'bbb' }
    const after = { 'src/thing.js': 'ccc', 'docs/thing.md': 'bbb' }
    const found = reviewIntegrityFindings(before, after)
    expect(found).toHaveLength(1)
    expect(found[0].severity).toBe('blocker')
    expect(found[0].summary).toMatch(/modified a file/)
    expect(found[0].evidence).toContain('src/thing.js')
  })

  it('blocks when the review created or deleted a file', () => {
    expect(reviewIntegrityFindings({}, { 'new.js': 'x' })[0].summary).toMatch(/created a file/)
    expect(reviewIntegrityFindings({ 'old.js': 'x' }, {})[0].summary).toMatch(/deleted a file/)
  })

  it('blocks when the review re-sealed the contract under review', () => {
    const f = TASKS_DIR + '/example-task.json'
    const found = reviewIntegrityFindings({ [f]: 'sealed-a' }, { [f]: 'sealed-b' })
    expect(found[0].severity).toBe('blocker')
    expect(found[0].violates).toMatch(/re-seal a contract/)
  })

  it('blocks when integrity could not be established at all', () => {
    // Not knowing whether the reviewer wrote is the same as knowing it did.
    for (const [b, a] of [[null, {}], [{}, null], [undefined, undefined]]) {
      expect(reviewIntegrityFindings(b, a)[0].severity).toBe('blocker')
    }
  })

  it('passes an untouched tree', () => {
    expect(reviewIntegrityFindings({ 'a.js': 'x' }, { 'a.js': 'x' })).toEqual([])
  })

  it('the decision is BLOCKED regardless of what the reviewer concluded', () => {
    const c = contract()
    const integrity = reviewIntegrityFindings({ 'a.js': 'x' }, { 'a.js': 'y' })
    expect(decide({ contract: c, result: cleanResult(c), integrity }).verdict).toBe('BLOCKED')
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
      integrity: reviewIntegrityFindings({ 'a.js': 'x' }, { 'a.js': 'x' }),
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
    contract: c, baseRef: 'main', headRef: 'feature', changedPaths: ['src/thing.js'],
  })

  it('is a pure function of contract, refs and changed paths', () => {
    expect(brief()).toBe(brief())
  })

  it('takes no free-text parameter an implementer could editorialise through', () => {
    // The failure this prevents: an implementation summary that substitutes for
    // reading the diff. There is nowhere to put one.
    const withExtra = buildReviewBrief({
      contract: c, baseRef: 'main', headRef: 'feature', changedPaths: ['src/thing.js'],
      summary: 'It is all just cleanup, honestly', note: 'skip the scheduler bit',
    })
    expect(withExtra).toBe(brief())
    expect(withExtra).not.toMatch(/just cleanup|skip the scheduler/)
  })

  it('carries the contract verbatim, the refs, and the diff command', () => {
    const b = brief()
    expect(b).toContain(JSON.stringify(c, null, 2))
    expect(b).toContain('git diff main...feature')
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
      contract: c, baseRef: 'main', headRef: 'feature', changedPaths: ['src/elsewhere.js'],
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

describe('the CLI fails closed at the exit code', () => {
  const run = (args, opts = {}) =>
    spawnSync('node', ['tools/review-task.mjs', ...args], { encoding: 'utf8', ...opts })

  const withResultFile = (result, fn) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'review-cli-'))
    try {
      const file = path.join(dir, 'result.json')
      writeFileSync(file, typeof result === 'string' ? result : JSON.stringify(result))
      return fn(file, dir)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }

  it('exits non-zero with no arguments', () => {
    expect(run([]).status).not.toBe(0)
  })

  it('exits non-zero for an unknown subcommand', () => {
    expect(run(['approve-please']).status).not.toBe(0)
  })

  it('BLOCKS a decide against a contract that does not exist', () => {
    const r = withResultFile(cleanResult(contract()), (file) =>
      run(['decide', '--task', 'no-such-task', '--result', file]))
    expect(r.status).not.toBe(0)
    expect(r.stdout + r.stderr).toMatch(/BLOCKED/)
  })

  it('BLOCKS a decide whose result file will not parse', () => {
    const r = withResultFile('{ not json', (file) =>
      run(['decide', '--task', 'fresh-context-reviewer', '--result', file]))
    expect(r.status).not.toBe(0)
    expect(r.stdout).toMatch(/BLOCKED/)
  })

  it('BLOCKS rather than skipping the path check when refs are missing', () => {
    // The quiet failure this prevents: a decision that never checked paths
    // looking exactly like one that checked them and found nothing.
    const real = JSON.parse(readFileSync(TASKS_DIR + '/fresh-context-reviewer.json', 'utf8'))
    const r = withResultFile(cleanResult(real), (file) =>
      run(['decide', '--task', 'fresh-context-reviewer', '--result', file]))
    expect(r.status).not.toBe(0)
    expect(r.stdout).toMatch(/path compliance could not be checked/)
  })

  it('emits a brief for the real sealed contract', () => {
    const r = run(['brief', '--task', 'fresh-context-reviewer', '--base', 'HEAD', '--head', 'HEAD'])
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toMatch(/Independent review: fresh-context-reviewer/)
    expect(r.stdout).toMatch(/FIND CONCRETE REASONS THIS SHOULD NOT MERGE/)
  })

  it('snapshots tracked files so the integrity check has something to compare', () => {
    const r = run(['snapshot'])
    expect(r.status, r.stderr).toBe(0)
    const snap = JSON.parse(r.stdout)
    expect(Object.keys(snap).length).toBeGreaterThan(100)
    expect(snap['package.json']).toMatch(/^[0-9a-f]{40}$/)
  })
})

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
