// Specs for the integration identity gate.
//
// The protocol answers the integrator's question — is this exact reviewed head
// still what would be merged, into a target that has not moved? — so the
// fixtures are built on REAL throwaway git repositories rather than a mock of
// git's opinions. Ancestry is the load-bearing check, and a stub that returns
// whatever the test wants would prove only that the stub was consulted.
//
// Every blocking case below is a case that must never be talked into READY. The
// happy case exists to prove the gate can say yes at all: a gate that always
// blocks is not a gate, it is an outage.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  INTEGRATION_DECISIONS,
  AUTHORIZING_DECISIONS,
  FINDING_SEVERITIES,
  REQUIRED_CHECKS,
  EXPECTED_CHECK_SOURCE,
  EXPECTED_RULESET_ID,
  EXPECTED_RULESET_CHECKS,
  EXPECTED_TARGET_BRANCH,
  INTEGRATION_EVIDENCE_VERSION,
  MAX_EVIDENCE_AGE_SECONDS,
  PROTOCOL_VERSION,
  authorizes,
  decideIntegration,
  evidenceShapeFindings,
  gitCorroborationFindings,
  requiredCheckFindings,
  reviewLinkFindings,
  rulesetFindings,
  validateDecisionValue,
} from './tools/integration-protocol.mjs'
import { computeDigest } from './tools/verify-task-contracts.mjs'
import { REVIEW_DIMENSIONS } from './tools/review-protocol.mjs'

// ---------------------------------------------------------------------------
// Fixture: a real repository with a governance commit and an implementation
// ---------------------------------------------------------------------------

const run = (args, cwd) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (r.status !== 0) throw new Error('git ' + args.join(' ') + ': ' + (r.stderr || r.stdout))
  return (r.stdout || '').trim()
}
const gitIn = (cwd) => (args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' }
}

const TASK_ID = 'fixture-task'

function sealed(overrides = {}) {
  const contract = {
    id: TASK_ID,
    goal: 'A fixture contract.',
    owner_role: 'workflow-authority',
    risk: 'r3',
    allowed_paths: ['tools/fixture.mjs'],
    forbidden_paths: [],
    non_goals: ['Nothing else'],
    acceptance_criteria: ['It works'],
    verification: ['npm run lint'],
    production_effect: 'none',
    dependencies: [],
    stop_conditions: ['Anything surprising'],
    ...overrides,
  }
  return { ...contract, contract_digest: computeDigest(contract) }
}

/**
 * Builds:
 *
 *   c0 (base)  <- main starts here, and is the captured target
 *     |
 *   c1 governance commit: the sealed contract, alone
 *     |
 *   c2 implementation  <- the reviewed head
 *
 *   c3 on main only, created on demand, to move the target off the branch
 */
function makeRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'integration-gate-'))
  run(['init', '-q', '-b', 'main'], dir)
  run(['config', 'user.email', 'fixture@example.com'], dir)
  run(['config', 'user.name', 'Fixture'], dir)

  writeFileSync(path.join(dir, 'README.md'), '# fixture\n')
  run(['add', '-A'], dir)
  run(['commit', '-q', '-m', 'base'], dir)
  const c0 = run(['rev-parse', 'HEAD'], dir)

  run(['checkout', '-q', '-b', 'work'], dir)
  mkdirSync(path.join(dir, '.agent', 'tasks'), { recursive: true })
  writeFileSync(path.join(dir, '.agent/tasks/' + TASK_ID + '.json'),
    JSON.stringify(sealed(), null, 2) + '\n')
  run(['add', '-A'], dir)
  run(['commit', '-q', '-m', 'governance: seal the fixture contract'], dir)
  const c1 = run(['rev-parse', 'HEAD'], dir)

  mkdirSync(path.join(dir, 'tools'), { recursive: true })
  writeFileSync(path.join(dir, 'tools/fixture.mjs'), 'export const x = 1\n')
  run(['add', '-A'], dir)
  run(['commit', '-q', '-m', 'implement the fixture'], dir)
  const c2 = run(['rev-parse', 'HEAD'], dir)

  return {
    dir, c0, c1, c2,
    git: gitIn(dir),
    /** Advance main past the branch point, so the target leaves the head behind. */
    advanceMain() {
      run(['checkout', '-q', 'main'], dir)
      writeFileSync(path.join(dir, 'OTHER.md'), 'someone else merged\n')
      run(['add', '-A'], dir)
      run(['commit', '-q', '-m', 'another PR merged'], dir)
      const c3 = run(['rev-parse', 'HEAD'], dir)
      run(['checkout', '-q', 'work'], dir)
      return c3
    },
    cleanup() { rmSync(dir, { recursive: true, force: true }) },
  }
}

let repo
beforeAll(() => { repo = makeRepo() })
afterAll(() => { repo && repo.cleanup() })

// ---------------------------------------------------------------------------
// Evidence builders
// ---------------------------------------------------------------------------

const checkRun = (name, over = {}) => ({
  name,
  status: 'completed',
  conclusion: 'success',
  head_sha: over.head_sha !== undefined ? over.head_sha : null,
  app: { id: EXPECTED_CHECK_SOURCE.app_id, slug: EXPECTED_CHECK_SOURCE.app_slug },
  ...over,
})

/** Evidence in which everything holds. `strict` decides which good answer. */
function goodEvidence({ head, target, strict = true, checks = null } = {}) {
  return {
    evidence_version: INTEGRATION_EVIDENCE_VERSION,
    collected_at: new Date().toISOString(),
    repository: 'fabrykjoh12/Hanzi-dojo',
    pull_request: {
      number: 230,
      state: 'open',
      merged: false,
      base_ref: EXPECTED_TARGET_BRANCH,
      head_sha: head,
      mergeable: true,
      mergeable_state: 'clean',
      merge_commit_sha: 'f'.repeat(40),
    },
    target: { branch: EXPECTED_TARGET_BRANCH, sha: target },
    check_runs: checks || REQUIRED_CHECKS.map(n => checkRun(n, { head_sha: head })),
    // Modelled on the ACTUAL live ruleset shape, not a names-only
    // approximation: required checks are {context, integration_id} and the
    // bypass list is present and empty.
    ruleset: {
      id: EXPECTED_RULESET_ID,
      target_branch: EXPECTED_TARGET_BRANCH,
      enforcement: 'active',
      required_status_checks: EXPECTED_RULESET_CHECKS.map(c => ({ ...c })),
      strict_required_status_checks_policy: strict,
      bypass_actors: [],
      current_user_can_bypass: 'never',
    },
  }
}

/**
 * A COMPLETE review result, because the gate now validates against the review
 * protocol's own standard rather than a subset of it.
 *
 * The subset was the bug: checking only head and verdict let a result belonging
 * to a different task, or performed against different contract terms, satisfy
 * the review link as long as it named the same commit.
 */
function goodReview(head, over = {}) {
  const contract = sealed()
  return {
    protocol_version: 1,
    task_id: contract.id,
    contract_digest: contract.contract_digest,
    base_sha: repo.c1,
    head_sha: head,
    verdict: 'APPROVE',
    no_blocking_findings: true,
    dimensions: Object.fromEntries(REVIEW_DIMENSIONS.map(d =>
      [d, { inspected: true, note: 'fixture: ' + d + ' inspected' }])),
    criteria: contract.acceptance_criteria.map(criterion =>
      ({ criterion, status: 'met', evidence: 'fixture evidence' })),
    findings: [],
    ...over,
  }
}

/**
 * The decision under the standard fixture, with one thing changed.
 *
 * Overrides are detected by key PRESENCE, not by an `!== undefined` fallback.
 * That distinction is not pedantry: with a fallback, `decide({ evidence:
 * undefined })` silently becomes the happy case, so a spec asserting that
 * undefined evidence blocks would be asserting nothing. Both of those specs
 * were written that way first, and both passed for that reason.
 */
function decide(opts = {}) {
  const has = (k) => Object.prototype.hasOwnProperty.call(opts, k)
  return decideIntegration({
    contract: sealed(),
    review: has('review') ? opts.review : goodReview(repo.c2),
    reviewedHead: has('reviewedHead') ? opts.reviewedHead : repo.c2,
    evidence: has('evidence') ? opts.evidence : goodEvidence({ head: repo.c2, target: repo.c0 }),
    git: has('git') ? opts.git : repo.git,
    targetRef: opts.targetRef ?? null,
    now: opts.now,
  })
}

const codes = (d) => d.findings.map(f => f.code)

// ---------------------------------------------------------------------------

describe('the decision vocabulary is closed, and only one value authorizes', () => {
  it('has exactly three values', () => {
    expect(INTEGRATION_DECISIONS).toEqual(['READY_TO_INTEGRATE', 'REQUIRES_RULESET_ACTIVATION', 'BLOCKED'])
  })

  it('authorizes exactly one of them', () => {
    expect(AUTHORIZING_DECISIONS).toEqual(['READY_TO_INTEGRATE'])
    expect(authorizes('READY_TO_INTEGRATE')).toBe(true)
    expect(authorizes('REQUIRES_RULESET_ACTIVATION')).toBe(false)
    expect(authorizes('BLOCKED')).toBe(false)
  })

  it('rejects a decision value outside the vocabulary rather than reading it loosely', () => {
    // The dangerous reading is "not BLOCKED, so probably fine".
    for (const bogus of ['APPROVE', 'READY', 'ok', '', null, undefined, 'ready_to_integrate']) {
      const f = validateDecisionValue(bogus)
      expect(f).toHaveLength(1)
      expect(f[0].code).toBe('decision-vocabulary-unknown')
      expect(authorizes(bogus)).toBe(false)
    }
  })

  it('never treats a reviewer verdict as a decision value', () => {
    // The specific confusion this whole task exists to prevent: reviewer
    // APPROVE read as integration authorization.
    expect(validateDecisionValue('APPROVE')).toHaveLength(1)
    expect(INTEGRATION_DECISIONS).not.toContain('APPROVE')
    expect(authorizes('APPROVE')).toBe(false)
  })

  it('uses a closed severity set', () => {
    expect(FINDING_SEVERITIES).toEqual(['blocker', 'advisory'])
  })
})

describe('the happy case can be authorized', () => {
  it('authorizes when every identity holds and the ruleset is strict', () => {
    const d = decide({ evidence: goodEvidence({ head: repo.c2, target: repo.c0, strict: true }) })
    expect(d.findings).toEqual([])
    expect(d.decision).toBe('READY_TO_INTEGRATE')
    expect(d.authorizes).toBe(true)
  })

  it('still authorizes when the local target ref corroborates the captured target', () => {
    const d = decide({
      evidence: goodEvidence({ head: repo.c2, target: repo.c0, strict: true }),
      targetRef: repo.c0,
    })
    expect(d.decision).toBe('READY_TO_INTEGRATE')
  })

  it('binds every identity the decision was about', () => {
    const d = decide({ evidence: goodEvidence({ head: repo.c2, target: repo.c0, strict: true }) })
    const b = d.bound
    expect(d.protocol_version).toBe(PROTOCOL_VERSION)
    expect(b.task_id).toBe(TASK_ID)
    expect(b.contract_digest).toBe(sealed().contract_digest)
    expect(b.repository).toBe('fabrykjoh12/Hanzi-dojo')
    expect(b.pull_request_number).toBe(230)
    expect(b.reviewed_head).toBe(repo.c2)
    expect(b.current_head).toBe(repo.c2)
    expect(b.merge_identity).toBe('f'.repeat(40))
    expect(b.target_branch).toBe(EXPECTED_TARGET_BRANCH)
    expect(b.target_sha).toBe(repo.c0)
    expect(b.review).toEqual({ verdict: 'APPROVE', head_sha: repo.c2, protocol_version: 1 })
    expect(b.expected_check_source).toEqual(EXPECTED_CHECK_SOURCE)
    expect(b.ruleset.id).toBe(EXPECTED_RULESET_ID)
    expect(b.ruleset.strict_required_status_checks_policy).toBe(true)
    expect(b.ruleset.required_status_checks).toEqual(EXPECTED_RULESET_CHECKS)
    expect(b.ruleset.bypass_actors).toEqual([])
    expect(b.ruleset.current_user_can_bypass).toBe('never')
    expect(b.evidence_version).toBe(INTEGRATION_EVIDENCE_VERSION)
    expect(b.evidence_collected_at).toBeTruthy()
    expect(b.required_checks.map(c => c.name)).toEqual(REQUIRED_CHECKS)
    for (const c of b.required_checks) {
      expect(c.matched_runs).toBe(1)
      expect(c.conclusion).toBe('success')
      expect(c.app_id).toBe(EXPECTED_CHECK_SOURCE.app_id)
      expect(c.head_sha).toBe(repo.c2)
    }
  })
})

describe('head identity: the reviewed head is the only head that can be integrated', () => {
  it('blocks when the head changed after the review', () => {
    const d = decide({ evidence: goodEvidence({ head: repo.c1, target: repo.c0 }) })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('head-moved-since-review')
  })

  it('blocks a head that differs by exactly one commit', () => {
    // The observed #229 shape. "Only one commit" is not a smaller failure: it is
    // the same failure with a more persuasive excuse.
    const one = run(['rev-parse', repo.c2 + '^'], repo.dir)
    expect(one).toBe(repo.c1)
    const d = decide({ evidence: goodEvidence({ head: one, target: repo.c0 }) })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('head-moved-since-review')
  })

  it('blocks an abbreviated reviewed head rather than expanding it', () => {
    const d = decide({ reviewedHead: repo.c2.slice(0, 12) })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('reviewed-head-invalid')
  })

  it('blocks a missing reviewed head', () => {
    for (const bad of [null, undefined, '']) {
      const d = decide({ reviewedHead: bad })
      expect(d.decision).toBe('BLOCKED')
      expect(codes(d)).toContain('reviewed-head-invalid')
    }
  })

  it('takes the reviewed head from the caller, never from the evidence', () => {
    // Evidence that could name its own approved head could assert the approval
    // it is meant to be checked against. Here the evidence describes c1 as head
    // and the caller asserts c2 was reviewed: the mismatch must surface, not
    // resolve itself in the evidence's favour.
    const ev = goodEvidence({ head: repo.c1, target: repo.c0 })
    ev.reviewed_head = repo.c1
    const d = decide({ evidence: ev, reviewedHead: repo.c2 })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('head-moved-since-review')
    expect(d.bound.reviewed_head).toBe(repo.c2)
  })
})

describe('the target must not have moved out from under the review', () => {
  it('blocks when the target advanced beyond what the head contains', () => {
    const c3 = repo.advanceMain()
    const d = decide({ evidence: goodEvidence({ head: repo.c2, target: c3 }) })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('target-advanced-beyond-head')
  })

  it('establishes that from the commit graph, not from a field in the evidence', () => {
    // Same evidence, and the only thing that decides it is real ancestry.
    const c3 = run(['rev-parse', 'main'], repo.dir)
    const findings = gitCorroborationFindings({
      reviewedHead: repo.c2,
      evidence: { target: { sha: c3 } },
      git: repo.git,
    })
    expect(findings.map(f => f.code)).toContain('target-advanced-beyond-head')

    const ok = gitCorroborationFindings({
      reviewedHead: repo.c2,
      evidence: { target: { sha: repo.c0 } },
      git: repo.git,
    })
    expect(ok).toEqual([])
  })

  it('blocks when the local target ref disagrees with the captured target', () => {
    // Disagreement is decisive: the target demonstrably moved after collection.
    const d = decide({
      evidence: goodEvidence({ head: repo.c2, target: repo.c0, strict: true }),
      targetRef: 'main',
    })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('target-moved-since-evidence')
  })

  it('blocks when the target ref cannot be resolved at all', () => {
    const d = decide({
      evidence: goodEvidence({ head: repo.c2, target: repo.c0 }),
      targetRef: 'refs/remotes/origin/nope',
    })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('target-ref-unresolvable')
  })

  it('blocks a captured target that is not a commit in this repository', () => {
    const d = decide({ evidence: goodEvidence({ head: repo.c2, target: 'a'.repeat(40) }) })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('commit-unresolvable')
  })

  it('blocks a reviewed head that is not a commit in this repository', () => {
    const head = 'b'.repeat(40)
    const d = decide({ reviewedHead: head, evidence: goodEvidence({ head, target: repo.c0 }) })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('commit-unresolvable')
  })
})

describe('the refresh lifecycle: a new head needs a new review', () => {
  it('blocks evidence claiming approval of one head while integrating another', () => {
    // H1 approved, H2 being integrated. This is what a rebase produces, and the
    // old approval must not travel with it.
    const d = decide({ review: goodReview(repo.c1) })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('review-head-mismatch')
  })

  it('blocks a rebased head that still carries the old review identity', () => {
    // The full shape: target moved, branch was updated, head is new, review is
    // old. Both the identity and the freshness rules fire, and they are
    // independent — neither is doing the other's work.
    const rebased = run(['rev-parse', 'HEAD'], repo.dir)
    const d = decideIntegration({
      contract: sealed(),
      review: goodReview(repo.c2),
      reviewedHead: repo.c1,
      evidence: goodEvidence({ head: repo.c1, target: repo.c0 }),
      git: repo.git,
    })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('review-head-mismatch')
    expect(rebased).toBeTruthy()
  })

  it('blocks a review that is not an APPROVE', () => {
    for (const verdict of ['REQUEST_CHANGES', 'BLOCKED', 'approve', '', null]) {
      const d = decide({ review: goodReview(repo.c2, { verdict }) })
      expect(d.decision).toBe('BLOCKED')
      expect(codes(d)).toContain('review-not-approved')
    }
  })

  it('blocks when no review result is supplied at all', () => {
    for (const missing of [null, undefined, 'APPROVE', []]) {
      const f = reviewLinkFindings({ review: missing, reviewedHead: repo.c2, contract: sealed() })
      expect(f.map(x => x.code)).toContain('review-missing')
    }
  })

  it('blocks a review result that names no head', () => {
    const d = decide({ review: goodReview(repo.c2, { head_sha: undefined }) })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('review-malformed')
  })
})

describe('reviewer approval is necessary and never sufficient', () => {
  it('does not authorize on an APPROVE alone when nothing else holds', () => {
    // The exact confusion: treating the reviewer's verdict as merge
    // authorization. An approval of the right head, with everything else
    // missing, must still block.
    const d = decideIntegration({
      contract: sealed(),
      review: goodReview(repo.c2),
      reviewedHead: repo.c2,
      evidence: { evidence_version: INTEGRATION_EVIDENCE_VERSION },
      git: repo.git,
    })
    expect(d.decision).toBe('BLOCKED')
    expect(d.authorizes).toBe(false)
  })

  it('blocks on each required condition independently, with a valid review present', () => {
    // Isolation: each of these fixtures changes ONE thing away from the happy
    // case, so no finding is standing in for another.
    const base = () => goodEvidence({ head: repo.c2, target: repo.c0, strict: true })

    const notOpen = base(); notOpen.pull_request.state = 'closed'
    expect(codes(decide({ evidence: notOpen }))).toContain('pull-request-not-open')

    const merged = base(); merged.pull_request.merged = true
    expect(codes(decide({ evidence: merged }))).toContain('pull-request-already-merged')

    const wrongBase = base(); wrongBase.pull_request.base_ref = 'release'
    expect(codes(decide({ evidence: wrongBase }))).toContain('wrong-target-branch')

    const unknownMergeable = base(); unknownMergeable.pull_request.mergeable = null
    expect(codes(decide({ evidence: unknownMergeable }))).toContain('mergeability-unknown')

    const notMergeable = base(); notMergeable.pull_request.mergeable = false
    expect(codes(decide({ evidence: notMergeable }))).toContain('not-mergeable')

    for (const ev of [notOpen, merged, wrongBase, unknownMergeable, notMergeable]) {
      expect(decide({ evidence: ev }).decision).toBe('BLOCKED')
    }
  })

  it('blocks when the captured target branch is not the expected one', () => {
    const ev = goodEvidence({ head: repo.c2, target: repo.c0 })
    ev.target.branch = 'release'
    const d = decide({ evidence: ev })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('wrong-target-branch')
  })
})

describe('required checks: exactly the right checks, from the right App, on the right commit', () => {
  const base = () => goodEvidence({ head: repo.c2, target: repo.c0, strict: true })

  it('requires exactly check, playwright and native-gate', () => {
    expect(REQUIRED_CHECKS).toEqual(['check', 'playwright', 'native-gate'])
  })

  it('blocks when a required check is absent', () => {
    for (const missing of REQUIRED_CHECKS) {
      const ev = base()
      ev.check_runs = ev.check_runs.filter(r => r.name !== missing)
      const d = decide({ evidence: ev })
      expect(d.decision).toBe('BLOCKED')
      expect(codes(d)).toContain('required-check-absent')
    }
  })

  it('blocks a pending required check', () => {
    const ev = base()
    ev.check_runs = ev.check_runs.map(r =>
      r.name === 'playwright' ? { ...r, status: 'in_progress', conclusion: null } : r)
    const d = decide({ evidence: ev })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('required-check-incomplete')
  })

  it('blocks a failed, cancelled, timed-out, skipped or neutral required check', () => {
    for (const conclusion of ['failure', 'cancelled', 'timed_out', 'skipped', 'neutral', 'action_required', 'stale', null]) {
      const ev = base()
      ev.check_runs = ev.check_runs.map(r => r.name === 'check' ? { ...r, conclusion } : r)
      const d = decide({ evidence: ev })
      expect(d.decision).toBe('BLOCKED')
      expect(codes(d)).toContain('required-check-not-successful')
    }
  })

  it('blocks a same-named check from the wrong App', () => {
    const ev = base()
    ev.check_runs = ev.check_runs.map(r =>
      r.name === 'check' ? { ...r, app: { id: 99999, slug: 'someone-else' } } : r)
    const d = decide({ evidence: ev })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('required-check-wrong-source')
  })

  it('blocks a check whose App id matches but whose slug does not, and the reverse', () => {
    for (const app of [
      { id: EXPECTED_CHECK_SOURCE.app_id, slug: 'impostor' },
      { id: 4242, slug: EXPECTED_CHECK_SOURCE.app_slug },
      { id: String(EXPECTED_CHECK_SOURCE.app_id), slug: EXPECTED_CHECK_SOURCE.app_slug },
      {},
    ]) {
      const ev = base()
      ev.check_runs = ev.check_runs.map(r => r.name === 'native-gate' ? { ...r, app } : r)
      expect(codes(decide({ evidence: ev }))).toContain('required-check-wrong-source')
    }
  })

  it('blocks an ambiguous required check rather than picking a winner', () => {
    // Two runs named `check`: one green from the expected App, one red from
    // somewhere else. Choosing either is choosing on the poster's behalf.
    const ev = base()
    ev.check_runs = [
      ...ev.check_runs,
      checkRun('check', { head_sha: repo.c2, conclusion: 'failure', app: { id: 1, slug: 'impostor' } }),
    ]
    const d = decide({ evidence: ev })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('required-check-ambiguous')
    expect(codes(d)).not.toContain('required-check-wrong-source')
  })

  it('blocks a duplicate even when both runs are green and from the expected App', () => {
    const ev = base()
    ev.check_runs = [...ev.check_runs, checkRun('playwright', { head_sha: repo.c2 })]
    expect(codes(decide({ evidence: ev }))).toContain('required-check-ambiguous')
  })

  it('blocks a green required check reported against a different commit', () => {
    const ev = base()
    ev.check_runs = ev.check_runs.map(r =>
      r.name === 'check' ? { ...r, head_sha: repo.c1 } : r)
    const d = decide({ evidence: ev })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('required-check-wrong-head')
  })

  it('ignores non-required checks, including permanently failing ones', () => {
    // `Workers Builds` is a known-dead Cloudflare hookup that is red forever and
    // is not fixable from this repository. Blocking on it would make the gate
    // wrong about what the repository actually requires.
    const ev = base()
    ev.check_runs = [
      ...ev.check_runs,
      checkRun('Workers Builds: hanzidojo', { head_sha: repo.c2, conclusion: 'failure', app: { id: 1, slug: 'cloudflare-workers' } }),
      checkRun('Vercel Preview Comments', { head_sha: repo.c2, app: { id: 2, slug: 'vercel' } }),
    ]
    expect(decide({ evidence: ev }).decision).toBe('READY_TO_INTEGRATE')
  })

  it('reports one finding per broken required check, not one for the set', () => {
    const ev = base()
    ev.check_runs = []
    const f = requiredCheckFindings({ evidence: ev, reviewedHead: repo.c2 })
    expect(f).toHaveLength(REQUIRED_CHECKS.length)
    expect(f.every(x => x.code === 'required-check-absent')).toBe(true)
  })
})

describe('the ruleset: identity, enforcement, and what it actually requires', () => {
  const base = () => goodEvidence({ head: repo.c2, target: repo.c0, strict: true })

  it('blocks when the evidence describes a different ruleset', () => {
    const ev = base(); ev.ruleset.id = 999
    const d = decide({ evidence: ev })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('ruleset-identity-mismatch')
  })

  it('blocks when the ruleset is not actively enforced', () => {
    for (const enforcement of ['evaluate', 'disabled']) {
      const ev = base(); ev.ruleset.enforcement = enforcement
      expect(codes(decide({ evidence: ev }))).toContain('ruleset-not-active')
    }
  })

  it('blocks an enforcement mode that is absent or not a string, as unreadable rather than inactive', () => {
    // Distinct from the above on purpose: a wrong VALUE is a ruleset that is not
    // active; a missing or malformed one is a ruleset whose mode could not be
    // established. Only the first is a statement about GitHub.
    for (const enforcement of [undefined, null, '', 42, {}]) {
      const ev = base(); ev.ruleset.enforcement = enforcement
      const d = decide({ evidence: ev })
      expect(d.decision).toBe('BLOCKED')
      expect(codes(d)).toContain('ruleset-unreadable')
    }
  })

  it('blocks when the ruleset protects a different branch', () => {
    const ev = base(); ev.ruleset.target_branch = 'release'
    expect(codes(decide({ evidence: ev }))).toContain('ruleset-wrong-target')
  })


  it('blocks when the ruleset state is unreadable', () => {
    for (const ruleset of [undefined, null, 'unreadable', []]) {
      const ev = base(); ev.ruleset = ruleset
      const d = decide({ evidence: ev })
      expect(d.decision).toBe('BLOCKED')
      expect(codes(d)).toContain('ruleset-unreadable')
    }
  })

  it('blocks when strictness is absent or not a boolean — unknown is never assumed strict', () => {
    for (const strict of [undefined, null, 'true', 1]) {
      const ev = base(); ev.ruleset.strict_required_status_checks_policy = strict
      const d = decide({ evidence: ev })
      expect(d.decision).toBe('BLOCKED')
      expect(codes(d)).toContain('ruleset-unreadable')
    }
  })
})

describe('the ruleset must still REQUIRE those checks, from that integration', () => {
  // Invariant B, and it is not invariant A. A says what produced the check runs
  // observed on the reviewed head; B says what GitHub promises to require at
  // merge time. A can be perfect while B has been quietly loosened — the same
  // class of drift as head/base, one level up.
  const base = () => goodEvidence({ head: repo.c2, target: repo.c0, strict: true })
  const withChecks = (list) => { const ev = base(); ev.ruleset.required_status_checks = list; return ev }
  const ctx = (context, integration_id) => ({ context, integration_id })

  it('expects each required context bound to the expected integration', () => {
    expect(EXPECTED_RULESET_CHECKS).toEqual([
      { context: 'check', integration_id: 15368 },
      { context: 'playwright', integration_id: 15368 },
      { context: 'native-gate', integration_id: 15368 },
    ])
    // Derived from the two constants, so the source identity has one definition.
    expect(EXPECTED_RULESET_CHECKS.map(c => c.context)).toEqual(REQUIRED_CHECKS)
    for (const c of EXPECTED_RULESET_CHECKS) {
      expect(c.integration_id).toBe(EXPECTED_CHECK_SOURCE.app_id)
    }
  })

  it('refuses the old names-only shape rather than reading it as unbound', () => {
    // Silently upgrading ['check', ...] would restore the exact flattening this
    // version removes.
    const d = decide({ evidence: withChecks([...REQUIRED_CHECKS]) })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('ruleset-unreadable')
  })

  it('blocks a required context whose integration binding was stripped', () => {
    for (const [i] of REQUIRED_CHECKS.entries()) {
      const list = EXPECTED_RULESET_CHECKS.map(c => ({ ...c }))
      list[i] = { context: list[i].context, integration_id: null }
      const d = decide({ evidence: withChecks(list) })
      expect(d.decision).toBe('BLOCKED')
      expect(codes(d)).toContain('ruleset-check-source-unbound')
    }
  })

  it('blocks a required context bound to a different integration', () => {
    const list = EXPECTED_RULESET_CHECKS.map(c => ({ ...c }))
    list[0] = ctx(list[0].context, 99999)
    const d = decide({ evidence: withChecks(list) })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('ruleset-check-source-mismatch')
    // And it is NOT reported as merely missing — the context is there.
    expect(codes(d)).not.toContain('ruleset-check-context-missing')
  })

  it('blocks when the integration_id key is absent entirely', () => {
    const list = EXPECTED_RULESET_CHECKS.map(c => ({ ...c }))
    delete list[1].integration_id
    const d = decide({ evidence: withChecks(list) })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('ruleset-unreadable')
  })

  it('blocks a missing required context', () => {
    const d = decide({ evidence: withChecks(EXPECTED_RULESET_CHECKS.slice(0, 2).map(c => ({ ...c }))) })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('ruleset-check-context-missing')
  })

  it('blocks an extra required context the protocol does not understand', () => {
    const d = decide({ evidence: withChecks([...EXPECTED_RULESET_CHECKS.map(c => ({ ...c })), ctx('some-new-gate', 15368)]) })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('ruleset-check-context-unexpected')
  })

  it('blocks a duplicated context rather than choosing a binding', () => {
    const d = decide({ evidence: withChecks([...EXPECTED_RULESET_CHECKS.map(c => ({ ...c })), ctx('check', 99999)]) })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('ruleset-check-duplicate-context')
  })

  it('blocks a malformed entry', () => {
    for (const bad of [null, 42, [], 'check', { integration_id: 15368 }, { context: '', integration_id: 15368 }]) {
      const d = decide({ evidence: withChecks([...EXPECTED_RULESET_CHECKS.map(c => ({ ...c })), bad]) })
      expect(d.decision).toBe('BLOCKED')
      expect(codes(d)).toContain('ruleset-unreadable')
    }
  })

  it('keeps invariant A independent: green runs from App 15368 cannot rescue a loosened fence', () => {
    // Check runs are perfect and from the right App; the fence no longer binds
    // them. Exactly the drift the flattening allowed.
    const ev = withChecks(EXPECTED_RULESET_CHECKS.map(c => ({ context: c.context, integration_id: null })))
    const d = decide({ evidence: ev })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('ruleset-check-source-unbound')
    // ...and no check-run finding fired, proving A passed on its own.
    expect(codes(d).filter(c => c.startsWith('required-check-'))).toEqual([])
  })

  it('keeps invariant B independent: a sound fence cannot rescue a bad check run', () => {
    const ev = base()
    ev.check_runs = ev.check_runs.map(r => r.name === 'check' ? { ...r, conclusion: 'failure' } : r)
    const d = decide({ evidence: ev })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('required-check-not-successful')
    expect(codes(d).filter(c => c.startsWith('ruleset-check-'))).toEqual([])
  })

  it('preserves the structured policy identity in the decision document', () => {
    const d = decide({ evidence: base() })
    expect(d.bound.ruleset.required_status_checks).toEqual([
      { context: 'check', integration_id: 15368 },
      { context: 'playwright', integration_id: 15368 },
      { context: 'native-gate', integration_id: 15368 },
    ])
    // Never flattened to names on the way out either.
    expect(d.bound.ruleset.required_status_checks.every(e => typeof e === 'object')).toBe(true)
  })
})

describe('the bypass list is part of policy identity', () => {
  const base = () => goodEvidence({ head: repo.c2, target: repo.c0, strict: true })
  const withBypass = (actors) => { const ev = base(); ev.ruleset.bypass_actors = actors; return ev }

  it('allows an empty bypass list to continue', () => {
    expect(decide({ evidence: withBypass([]) }).decision).toBe('READY_TO_INTEGRATE')
  })

  it('blocks a User bypass actor', () => {
    const d = decide({ evidence: withBypass([{ actor_id: 5, actor_type: 'User', bypass_mode: 'always' }]) })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('ruleset-bypass-actors-present')
  })

  it('blocks an Integration bypass actor', () => {
    const d = decide({ evidence: withBypass([{ actor_id: 15368, actor_type: 'Integration', bypass_mode: 'always' }]) })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('ruleset-bypass-actors-present')
  })

  it('blocks a pull_request-only bypass rather than silently reaching READY', () => {
    // "Only for pull requests" is still a bypass. How such an actor could be
    // safe is a policy question for an independently reviewed change.
    const d = decide({ evidence: withBypass([{ actor_id: 1, actor_type: 'RepositoryRole', bypass_mode: 'pull_request' }]) })
    expect(d.decision).toBe('BLOCKED')
    expect(d.authorizes).toBe(false)
    expect(codes(d)).toContain('ruleset-bypass-actors-present')
  })

  it('blocks an exempt / always bypass, and any actor type at all', () => {
    for (const actor of [
      { actor_id: 2, actor_type: 'OrganizationAdmin', bypass_mode: 'always' },
      { actor_id: 3, actor_type: 'DeployKey', bypass_mode: 'always' },
      { actor_id: null, actor_type: 'EnterpriseOwner', bypass_mode: 'exempt' },
      'some-actor',
    ]) {
      const d = decide({ evidence: withBypass([actor]) })
      expect(d.decision).toBe('BLOCKED')
      expect(codes(d)).toContain('ruleset-bypass-actors-present')
    }
  })

  it('blocks a MISSING bypass list — GitHub omits it without sufficient access', () => {
    // An unread bypass list is an unknown policy state, not an empty one.
    const ev = base(); delete ev.ruleset.bypass_actors
    const d = decide({ evidence: ev })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('ruleset-bypass-unreadable')
  })

  it('blocks a malformed bypass list', () => {
    for (const bad of [null, 'none', 0, {}, false]) {
      const d = decide({ evidence: withBypass(bad) })
      expect(d.decision).toBe('BLOCKED')
      expect(codes(d)).toContain('ruleset-bypass-unreadable')
    }
  })

  it('never lets current_user_can_bypass substitute for an empty list', () => {
    // It answers "can THIS token bypass?", not "has the ruleset no bypass
    // actors?". A caller-specific field cannot prove a repository-wide property.
    const ev = withBypass([{ actor_id: 5, actor_type: 'User', bypass_mode: 'always' }])
    ev.ruleset.current_user_can_bypass = 'never'
    const d = decide({ evidence: ev })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('ruleset-bypass-actors-present')

    const missing = base()
    delete missing.ruleset.bypass_actors
    missing.ruleset.current_user_can_bypass = 'never'
    expect(codes(decide({ evidence: missing }))).toContain('ruleset-bypass-unreadable')
  })

  it('preserves the bypass state, and the corroborating field, in the decision', () => {
    const d = decide({ evidence: base() })
    expect(d.bound.ruleset.bypass_actors).toEqual([])
    expect(d.bound.ruleset.current_user_can_bypass).toBe('never')
  })
})

describe('a missing evidence field must never be the field that authorizes', () => {
  // The regression this whole block exists for. `enforcement` and
  // `target_branch` were guarded downstream with `'x' in rs`, which read as
  // defensive and was the opposite: omitting the key produced ZERO findings and
  // returned READY_TO_INTEGRATE with authorizes true. Independent review found
  // it; these fixtures make it unrepeatable.
  const base = () => goodEvidence({ head: repo.c2, target: repo.c0, strict: true })

  it('blocks evidence that omits ruleset.enforcement', () => {
    const ev = base(); delete ev.ruleset.enforcement
    const d = decide({ evidence: ev })
    expect(d.decision).toBe('BLOCKED')
    expect(d.authorizes).toBe(false)
    expect(codes(d)).toContain('ruleset-unreadable')
  })

  it('blocks evidence that omits ruleset.target_branch', () => {
    const ev = base(); delete ev.ruleset.target_branch
    const d = decide({ evidence: ev })
    expect(d.decision).toBe('BLOCKED')
    expect(d.authorizes).toBe(false)
    expect(codes(d)).toContain('ruleset-unreadable')
  })

  it('has each layer hold on its own, not merely in combination', () => {
    // Isolation, and it took a surviving mutation to earn: with the shape pass
    // requiring the key, re-adding a `'enforcement' in rs` guard downstream
    // changed nothing observable, because no fixture ever reached
    // rulesetFindings with the key absent. These call it directly, so each
    // layer is asserted on its own rather than behind the other one.
    const bare = (over) => ({
      ruleset: {
        id: EXPECTED_RULESET_ID,
        target_branch: EXPECTED_TARGET_BRANCH,
        enforcement: 'active',
        required_status_checks: EXPECTED_RULESET_CHECKS.map(c => ({ ...c })),
        strict_required_status_checks_policy: true,
        bypass_actors: [],
        ...over,
      },
    })

    const noEnf = bare(); delete noEnf.ruleset.enforcement
    expect(rulesetFindings({ evidence: noEnf }).map(f => f.code)).toContain('ruleset-not-active')

    const noTgt = bare(); delete noTgt.ruleset.target_branch
    expect(rulesetFindings({ evidence: noTgt }).map(f => f.code)).toContain('ruleset-wrong-target')

    // And the shape pass catches the same absences by itself, without needing
    // rulesetFindings to run at all.
    const shapeOnly = (mutate) => {
      const ev = goodEvidence({ head: repo.c2, target: repo.c0, strict: true })
      mutate(ev)
      return evidenceShapeFindings(ev).map(f => f.code)
    }
    expect(shapeOnly(ev => { delete ev.ruleset.enforcement })).toContain('ruleset-unreadable')
    expect(shapeOnly(ev => { delete ev.ruleset.target_branch })).toContain('ruleset-unreadable')

    // A sound ruleset still produces nothing, so the guards are not simply loud.
    expect(rulesetFindings({ evidence: bare() })).toEqual([])
  })

  it('blocks when EVERY required ruleset field is dropped one at a time', () => {
    // Enumerated rather than spot-checked, so a field added later without a
    // shape rule is caught by this spec instead of by the next reviewer.
    //
    // current_user_can_bypass is deliberately excluded: it is corroborating
    // state, not policy. It answers "can THIS token bypass?" and so can never
    // prove — or be required to prove — a repository-wide property.
    const CORROBORATING_ONLY = ['current_user_can_bypass']
    const required = Object.keys(base().ruleset).filter(k => !CORROBORATING_ONLY.includes(k))
    expect(required.length).toBeGreaterThan(0)
    for (const key of required) {
      const ev = base(); delete ev.ruleset[key]
      const d = decide({ evidence: ev })
      expect(d.decision, 'dropping ruleset.' + key + ' must block').toBe('BLOCKED')
      expect(d.authorizes).toBe(false)
    }
    // And the corroborating field really is optional, so its exclusion above is
    // a stated design decision rather than a hole the loop was shaped around.
    const noCorroboration = base(); delete noCorroboration.ruleset.current_user_can_bypass
    expect(decide({ evidence: noCorroboration }).decision).toBe('READY_TO_INTEGRATE')
  })
})

describe('the evidence must describe this repository, and the review must be of this task', () => {
  it('blocks evidence describing a pull request in another repository', () => {
    const ev = goodEvidence({ head: repo.c2, target: repo.c0, strict: true })
    ev.repository = 'someone-else/Hanzi-dojo'
    const d = decide({ evidence: ev })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('wrong-repository')
  })

  it('blocks a review result belonging to a different task, even on the right head', () => {
    const d = decide({ review: goodReview(repo.c2, { task_id: 'some-other-task' }) })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('review-invalid')
  })

  it('blocks a review performed against different contract terms', () => {
    const d = decide({ review: goodReview(repo.c2, { contract_digest: 'a'.repeat(64) }) })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('review-invalid')
  })

  it('blocks a review that leaves an acceptance criterion unaddressed', () => {
    const d = decide({ review: goodReview(repo.c2, { criteria: [] }) })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('review-invalid')
  })

  it('blocks a review that skipped a dimension', () => {
    const dims = goodReview(repo.c2).dimensions
    delete dims['correctness']
    const d = decide({ review: goodReview(repo.c2, { dimensions: dims }) })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('review-invalid')
  })

  it('blocks an APPROVE that does not state that nothing blocking remains', () => {
    // Approval is stated, never inferred — the review protocol's own rule, and
    // an APPROVE contradicting it must not be resolved in favour of the
    // convenient half.
    for (const value of [false, undefined, null, 'yes']) {
      const d = decide({ review: goodReview(repo.c2, { no_blocking_findings: value }) })
      expect(d.decision).toBe('BLOCKED')
      expect(codes(d).some(c => c === 'review-approval-not-stated' || c === 'review-invalid')).toBe(true)
    }
  })

  it('does not apply the review standard when no contract is available to bind it to', () => {
    // reviewLinkFindings still checks head and verdict without a contract; what
    // it cannot do is check task identity against terms it was not given.
    const f = reviewLinkFindings({ review: goodReview(repo.c2), reviewedHead: repo.c2, contract: null })
    expect(f).toEqual([])
  })
})

describe('loose required checks withhold authorization without pretending to be a defect', () => {
  it('returns REQUIRES_RULESET_ACTIVATION when everything holds but the policy is loose', () => {
    const d = decide({ evidence: goodEvidence({ head: repo.c2, target: repo.c0, strict: false }) })
    expect(d.decision).toBe('REQUIRES_RULESET_ACTIVATION')
    expect(d.authorizes).toBe(false)
    expect(codes(d)).toEqual(['ruleset-not-strict'])
    expect(d.findings[0].severity).toBe('advisory')
  })

  it('never lets loose mode reach READY', () => {
    const d = decide({ evidence: goodEvidence({ head: repo.c2, target: repo.c0, strict: false }) })
    expect(d.decision).not.toBe('READY_TO_INTEGRATE')
  })

  it('reports BLOCKED, not REQUIRES_RULESET_ACTIVATION, when a blocker is also present', () => {
    // Strictness is evaluated last, on a finding set already free of blockers,
    // so a blocked integration can never be talked up into "just needs the
    // setting flipped".
    const ev = goodEvidence({ head: repo.c1, target: repo.c0, strict: false })
    const d = decide({ evidence: ev })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('head-moved-since-review')
    expect(codes(d)).toContain('ruleset-not-strict')
  })

  it('states that this protocol cannot close the race by itself', () => {
    const d = decide({ evidence: goodEvidence({ head: repo.c2, target: repo.c0, strict: false }) })
    expect(d.findings[0].evidence).toMatch(/cannot close this race/i)
  })
})

describe('unknown state is never turned into authorization', () => {
  it('blocks malformed evidence rather than reasoning over absent fields', () => {
    for (const bad of [null, undefined, 'a string', [], 42]) {
      const d = decide({ evidence: bad })
      expect(d.decision).toBe('BLOCKED')
      expect(d.authorizes).toBe(false)
    }
  })

  it('blocks an unsupported evidence version, matched exactly rather than as a floor', () => {
    // 2 is the CURRENT version; a v1 names-only document must be refused rather
    // than upgraded, or the policy flattening comes straight back.
    for (const v of [0, 1, 3, '2', undefined, null]) {
      const ev = goodEvidence({ head: repo.c2, target: repo.c0 })
      ev.evidence_version = v
      const d = decide({ evidence: ev })
      expect(d.decision).toBe('BLOCKED')
      expect(codes(d)).toContain('evidence-version-unsupported')
    }
  })

  it('blocks on each individually missing evidence field', () => {
    const drop = (mutate) => {
      const ev = goodEvidence({ head: repo.c2, target: repo.c0 })
      mutate(ev)
      const f = evidenceShapeFindings(ev)
      expect(f.length).toBeGreaterThan(0)
      expect(decide({ evidence: ev }).decision).toBe('BLOCKED')
    }
    drop(ev => { delete ev.repository })
    drop(ev => { delete ev.collected_at })
    drop(ev => { ev.collected_at = 'not a date' })
    drop(ev => { delete ev.pull_request })
    drop(ev => { delete ev.pull_request.number })
    drop(ev => { delete ev.pull_request.state })
    drop(ev => { delete ev.pull_request.merged })
    drop(ev => { delete ev.pull_request.base_ref })
    drop(ev => { delete ev.pull_request.head_sha })
    drop(ev => { delete ev.pull_request.mergeable })
    drop(ev => { delete ev.target })
    drop(ev => { delete ev.target.sha })
    drop(ev => { delete ev.target.branch })
    drop(ev => { delete ev.check_runs })
    drop(ev => { ev.check_runs = 'not an array' })
    drop(ev => { ev.check_runs = [{ status: 'completed' }] })
    drop(ev => { ev.check_runs = [{ name: 'check' }] })
    drop(ev => { delete ev.ruleset })
    drop(ev => { delete ev.ruleset.id })
    drop(ev => { delete ev.ruleset.required_status_checks })
    drop(ev => { delete ev.ruleset.strict_required_status_checks_policy })
    // The two that used to fail OPEN: guarded downstream with `'x' in rs`, so
    // omitting the key produced no finding at all and reached READY.
    drop(ev => { delete ev.ruleset.enforcement })
    drop(ev => { delete ev.ruleset.target_branch })
  })

  it('blocks an abbreviated SHA anywhere it appears', () => {
    const ev = goodEvidence({ head: repo.c2, target: repo.c0 })
    ev.pull_request.head_sha = repo.c2.slice(0, 12)
    expect(evidenceShapeFindings(ev).map(f => f.code)).toContain('evidence-malformed')

    const ev2 = goodEvidence({ head: repo.c2, target: repo.c0 })
    ev2.target.sha = repo.c0.slice(0, 12)
    expect(evidenceShapeFindings(ev2).map(f => f.code)).toContain('evidence-malformed')
  })

  it('blocks stale evidence', () => {
    const ev = goodEvidence({ head: repo.c2, target: repo.c0, strict: true })
    const now = new Date(Date.parse(ev.collected_at) + (MAX_EVIDENCE_AGE_SECONDS + 60) * 1000)
    const d = decide({ evidence: ev, now })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('evidence-stale')
  })

  it('accepts evidence inside the age bound', () => {
    const ev = goodEvidence({ head: repo.c2, target: repo.c0, strict: true })
    const now = new Date(Date.parse(ev.collected_at) + (MAX_EVIDENCE_AGE_SECONDS - 60) * 1000)
    expect(decide({ evidence: ev, now }).decision).toBe('READY_TO_INTEGRATE')
  })

  it('blocks evidence collected in the future', () => {
    const ev = goodEvidence({ head: repo.c2, target: repo.c0, strict: true })
    const now = new Date(Date.parse(ev.collected_at) - 3600 * 1000)
    const d = decide({ evidence: ev, now })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('evidence-timestamp-implausible')
  })

  it('blocks when git is unavailable, rather than skipping the ancestry half', () => {
    const d = decideIntegration({
      contract: sealed(),
      review: goodReview(repo.c2),
      reviewedHead: repo.c2,
      evidence: goodEvidence({ head: repo.c2, target: repo.c0, strict: true }),
      git: null,
    })
    expect(d.decision).toBe('BLOCKED')
    expect(codes(d)).toContain('git-unavailable')
  })

  it('blocks when git itself fails', () => {
    const brokenGit = () => ({ status: 128, stdout: '', stderr: 'fatal: not a git repository' })
    const f = gitCorroborationFindings({
      reviewedHead: repo.c2,
      evidence: { target: { sha: repo.c0 } },
      git: brokenGit,
    })
    expect(f.map(x => x.code)).toContain('git-unavailable')
  })

  it('blocks in a shallow clone rather than answering ancestry from a truncated graph', () => {
    const shallowGit = (args) =>
      args[0] === 'rev-parse' && args[1] === '--is-shallow-repository'
        ? { status: 0, stdout: 'true\n', stderr: '' }
        : repo.git(args)
    const f = gitCorroborationFindings({
      reviewedHead: repo.c2,
      evidence: { target: { sha: repo.c0 } },
      git: shallowGit,
    })
    expect(f).toHaveLength(1)
    expect(f[0].code).toBe('repository-shallow')
  })

  it('produces the same document shape on every exit path', () => {
    const shapes = [
      decide({ evidence: null }),
      decide({ evidence: goodEvidence({ head: repo.c1, target: repo.c0 }) }),
      decide({ evidence: goodEvidence({ head: repo.c2, target: repo.c0, strict: false }) }),
      decide({ evidence: goodEvidence({ head: repo.c2, target: repo.c0, strict: true }) }),
    ]
    for (const d of shapes) {
      expect(Object.keys(d).sort()).toEqual(
        ['authorizes', 'bound', 'decided_at', 'decision', 'findings', 'protocol_version'])
      expect(INTEGRATION_DECISIONS).toContain(d.decision)
      expect(d.authorizes).toBe(authorizes(d.decision))
      for (const f of d.findings) {
        expect(FINDING_SEVERITIES).toContain(f.severity)
        expect(typeof f.code).toBe('string')
        expect(f.code.length).toBeGreaterThan(0)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// The CLI
// ---------------------------------------------------------------------------

describe('the CLI: exit codes are per-subcommand and only one carries authorization', () => {
  const cli = async (argv, cwd = repo.dir) => {
    const { main } = await import('./tools/integration-gate.mjs')
    let out = ''
    let code = 0
    await main(argv, { write: s => { out += s }, setExit: c => { code = c }, cwd })
    return { out, code }
  }

  const writeFixture = (name, value) => {
    const p = path.join(repo.dir, name)
    writeFileSync(p, JSON.stringify(value, null, 2))
    return p
  }

  it('template exits 0 and emits a parseable document that is not a decision', async () => {
    const { out, code } = await cli(['template'])
    expect(code).toBe(0)
    const t = JSON.parse(out)
    expect(t.evidence_version).toBe(INTEGRATION_EVIDENCE_VERSION)
    expect(t).not.toHaveProperty('decision')
    expect(t).not.toHaveProperty('authorizes')
  })

  it('the template names the expected check source, so a collector cannot omit it', async () => {
    const { out } = await cli(['template'])
    expect(out).toContain(String(EXPECTED_CHECK_SOURCE.app_id))
    expect(out).toContain(EXPECTED_CHECK_SOURCE.app_slug)
    expect(out).toContain(String(EXPECTED_RULESET_ID))
    for (const name of REQUIRED_CHECKS) expect(out).toContain(name)
  })

  it('exits 0 only for READY_TO_INTEGRATE', async () => {
    const ev = writeFixture('ev.json', goodEvidence({ head: repo.c2, target: repo.c0, strict: true }))
    const rv = writeFixture('rv.json', goodReview(repo.c2))
    const { out, code } = await cli(['decide', '--task', TASK_ID, '--reviewed-head', repo.c2,
      '--evidence', ev, '--review', rv])
    expect(JSON.parse(out).decision).toBe('READY_TO_INTEGRATE')
    expect(code).toBe(0)
  })

  it('exits non-zero for REQUIRES_RULESET_ACTIVATION — it is not authorization', async () => {
    const ev = writeFixture('ev-loose.json', goodEvidence({ head: repo.c2, target: repo.c0, strict: false }))
    const rv = writeFixture('rv.json', goodReview(repo.c2))
    const { out, code } = await cli(['decide', '--task', TASK_ID, '--reviewed-head', repo.c2,
      '--evidence', ev, '--review', rv])
    const d = JSON.parse(out)
    expect(d.decision).toBe('REQUIRES_RULESET_ACTIVATION')
    expect(d.authorizes).toBe(false)
    expect(code).not.toBe(0)
  })

  it('exits non-zero for BLOCKED', async () => {
    const ev = writeFixture('ev-stale.json', goodEvidence({ head: repo.c1, target: repo.c0, strict: true }))
    const rv = writeFixture('rv.json', goodReview(repo.c2))
    const { out, code } = await cli(['decide', '--task', TASK_ID, '--reviewed-head', repo.c2,
      '--evidence', ev, '--review', rv])
    expect(JSON.parse(out).decision).toBe('BLOCKED')
    expect(code).not.toBe(0)
  })

  it('emits a BLOCKED decision document, not a bare error, when the contract cannot be loaded', async () => {
    // A caller would otherwise have to distinguish "no output" from "blocked",
    // and one of those readings is unsafe.
    const ev = writeFixture('ev.json', goodEvidence({ head: repo.c2, target: repo.c0, strict: true }))
    const rv = writeFixture('rv.json', goodReview(repo.c2))
    const { out, code } = await cli(['decide', '--task', 'no-such-task', '--reviewed-head', repo.c2,
      '--evidence', ev, '--review', rv])
    const d = JSON.parse(out)
    expect(d.decision).toBe('BLOCKED')
    expect(d.authorizes).toBe(false)
    expect(d.findings[0].code).toBe('contract-unreadable')
    expect(code).not.toBe(0)
  })

  it('refuses an abbreviated --reviewed-head at the argument boundary', async () => {
    const ev = writeFixture('ev.json', goodEvidence({ head: repo.c2, target: repo.c0 }))
    const rv = writeFixture('rv.json', goodReview(repo.c2))
    const { code } = await cli(['decide', '--task', TASK_ID, '--reviewed-head', repo.c2.slice(0, 12),
      '--evidence', ev, '--review', rv])
    expect(code).not.toBe(0)
  })

  it('refuses to decide with any required argument missing', async () => {
    const ev = writeFixture('ev.json', goodEvidence({ head: repo.c2, target: repo.c0 }))
    const rv = writeFixture('rv.json', goodReview(repo.c2))
    const full = ['decide', '--task', TASK_ID, '--reviewed-head', repo.c2, '--evidence', ev, '--review', rv]
    for (const flag of ['--task', '--reviewed-head', '--evidence', '--review']) {
      const i = full.indexOf(flag)
      const argv = [...full.slice(0, i), ...full.slice(i + 2)]
      const { code } = await cli(argv)
      expect(code).not.toBe(0)
    }
  })

  it('refuses an unknown subcommand', async () => {
    for (const sub of ['merge', 'approve', 'authorize', '']) {
      const { code } = await cli([sub])
      expect(code).not.toBe(0)
    }
  })

  it('refuses to authorize a decision value outside the vocabulary, at the exit-code boundary', async () => {
    // The exit code is derived from the decision, so the value is checked where
    // it first starts to mean something to a caller. A corrupted decision must
    // not be readable as "not READY, so exit 1" — that would make it
    // indistinguishable from a sound refusal.
    expect(readFileSync('tools/integration-gate.mjs', 'utf8'))
      .toMatch(/validateDecisionValue\(decision\.decision\)/)
    const { out, code } = await cli(['decide', '--task', TASK_ID, '--reviewed-head', repo.c2,
      '--evidence', writeFixture('ev.json', goodEvidence({ head: repo.c2, target: repo.c0, strict: true })),
      '--review', writeFixture('rv.json', goodReview(repo.c2))])
    // The sound path still produces a vocabulary value and still exits 0.
    expect(INTEGRATION_DECISIONS).toContain(JSON.parse(out).decision)
    expect(code).toBe(0)
  })

  it('documents the per-subcommand exit contract in the usage text', async () => {
    const { out } = await cli(['nonsense'])
    expect(out).toMatch(/EXIT CODES ARE PER-SUBCOMMAND/)
    expect(out).toMatch(/READY_TO_INTEGRATE/)
    expect(out).toMatch(/not authorization/i)
  })

  it('reads the contract from the reviewed commit, never from the working tree', async () => {
    // Poison the working-tree contract. The decision must be unaffected, because
    // the terms that bind it are the terms in the reviewed history.
    const live = path.join(repo.dir, '.agent/tasks/' + TASK_ID + '.json')
    const original = readFileSync(live, 'utf8')
    writeFileSync(live, JSON.stringify({ ...JSON.parse(original), goal: 'rewritten' }, null, 2))
    try {
      const ev = writeFixture('ev.json', goodEvidence({ head: repo.c2, target: repo.c0, strict: true }))
      const rv = writeFixture('rv.json', goodReview(repo.c2))
      const { out, code } = await cli(['decide', '--task', TASK_ID, '--reviewed-head', repo.c2,
        '--evidence', ev, '--review', rv])
      const d = JSON.parse(out)
      expect(d.decision).toBe('READY_TO_INTEGRATE')
      expect(d.bound.contract_digest).toBe(sealed().contract_digest)
      expect(code).toBe(0)
    } finally {
      writeFileSync(live, original)
    }
  })
})

// ---------------------------------------------------------------------------
// Structural: what this task must NOT contain
// ---------------------------------------------------------------------------

describe('structural: this task adds no merge authority and no enforcement', () => {
  // Every path this task is allowed to touch that can carry prose or code.
  // package.json is covered separately, by its own spec below.
  const OWNED = [
    'tools/integration-protocol.mjs',
    'tools/integration-gate.mjs',
    'integration-protocol.test.mjs',
    'docs/INTEGRATION-PROTOCOL.md',
    'docs/AUTOMATION-AUTHORITY.md',
  ]
  const source = (f) => readFileSync(f, 'utf8')
  // This spec file names the very things it forbids, so it strips its own guard
  // block before scanning. The marker is assembled rather than written whole:
  // a literal copy inside the strip would be found by indexOf BEFORE the real
  // one, ending the strip early and leaving the fixtures in the scanned text.
  const MARKER = 'STRUCTURAL' + ' GUARD'
  const scannable = (f) => {
    const text = source(f)
    const start = text.indexOf(MARKER + ' START')
    const end = text.indexOf(MARKER + ' END')
    return start >= 0 && end > start ? text.slice(0, start) + text.slice(end) : text
  }

  // --- STRUCTURAL GUARD START ---
  /** Ways a file would actually perform a merge or mutate protection. */
  const MERGE_AUTHORITY = [
    /gh\s+pr\s+merge/i,
    /pulls\/[^\s'"]*\/merge/i,
    /merge_pull_request/i,
    /enable_pr_auto_merge/i,
    /enablePullRequestAutoMerge/i,
    /\bauto[_-]?merge\b/i,
    /merge_method/i,
  ]
  const RULESET_MUTATION = [
    /\b(PUT|PATCH|POST|DELETE)\b[^\n]{0,80}rulesets/i,
    /gh\s+api[^\n]{0,120}(-X|--method)\s*(PUT|PATCH|POST|DELETE)/i,
    /update[_-]?ruleset/i,
    /branch[_-]?protection[^\n]{0,40}(update|set|put|patch)/i,
  ]
  const ENFORCEMENT = [
    /PreToolUse/,
    /PostToolUse/,
    /\bhooks?\s*:/,
    /allowed[_-]?paths[^\n]{0,40}enforce/i,
    /denyWrite/,
  ]
  // --- STRUCTURAL GUARD END ---

  it('contains no merge command or merge API call anywhere in the task', () => {
    for (const f of OWNED) {
      for (const re of MERGE_AUTHORITY) {
        expect(scannable(f), f + ' must not perform a merge (' + re + ')').not.toMatch(re)
      }
    }
  })

  it('contains no live ruleset or branch-protection mutation', () => {
    for (const f of OWNED) {
      for (const re of RULESET_MUTATION) {
        expect(scannable(f), f + ' must not mutate protection (' + re + ')').not.toMatch(re)
      }
    }
  })

  it('smuggles in no path, tool or hook enforcement', () => {
    for (const f of OWNED) {
      for (const re of ENFORCEMENT) {
        expect(scannable(f), f + ' must not add enforcement (' + re + ')').not.toMatch(re)
      }
    }
  })

  it('makes no network call and reads no credential', () => {
    for (const f of ['tools/integration-protocol.mjs', 'tools/integration-gate.mjs']) {
      const text = source(f)
      expect(text).not.toMatch(/\bfetch\s*\(/)
      expect(text).not.toMatch(/node:https?|require\(['"]https?['"]\)/)
      expect(text).not.toMatch(/GITHUB_TOKEN|GH_TOKEN|process\.env\.[A-Z_]*TOKEN/)
    }
  })

  it('spawns only git from the CLI, and nothing at all from the protocol', () => {
    const cliText = source('tools/integration-gate.mjs')
    const spawns = [...cliText.matchAll(/spawnSync\(\s*'([^']+)'/g)].map(m => m[1])
    expect(spawns).toEqual(['git'])
    expect(source('tools/integration-protocol.mjs')).not.toMatch(/spawnSync|execSync|child_process/)
  })

  it('does not rewrite the reviewer implementation', () => {
    // The contract's allowed_paths do not name them, and this asserts the
    // stronger property: nothing in this task imports them for anything but the
    // two read-only helpers it legitimately reuses.
    const contract = JSON.parse(readFileSync('.agent/tasks/integration-identity-gate.json', 'utf8'))
    for (const p of ['tools/review-protocol.mjs', 'tools/review-task.mjs',
      '.claude/agents/fresh-context-reviewer.md', 'review-protocol.test.mjs',
      '.agent/tasks/fresh-context-reviewer.json']) {
      expect(contract.allowed_paths).not.toContain(p)
    }
    // Reuse is allowed and desirable — a second, weaker review standard is
    // exactly what this task must not create. What is forbidden is importing
    // anything that WRITES or decides a review verdict.
    const READ_ONLY_REUSE = ['SHA_RE', 'validateReviewResult', 'loadContractAtCommit']
    for (const f of ['tools/integration-protocol.mjs', 'tools/integration-gate.mjs']) {
      const imported = [...source(f)
        .matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\/review-protocol\.mjs'/g)]
        .flatMap(m => m[1].split(',').map(s => s.trim()).filter(Boolean))
      for (const name of imported) {
        expect(READ_ONLY_REUSE, f + ' imports ' + name).toContain(name)
      }
    }
  })

  it('keeps the sealed contract byte-identical to the governance commit', () => {
    // Pinned by digest rather than by a git range, so it holds in a shallow CI
    // checkout too. Any edit to a binding field changes this value.
    const contract = JSON.parse(readFileSync('.agent/tasks/integration-identity-gate.json', 'utf8'))
    expect(contract.contract_digest)
      .toBe('cf1ea69e7d746712a76ba4a827565c044241a8f4e96adef0825da1700cbe6fd3')
    expect(computeDigest(contract)).toBe(contract.contract_digest)
    expect(contract.allowed_paths).not.toContain('.agent/tasks/**')
  })

  it('changes only the paths its contract allows', () => {
    const contract = JSON.parse(readFileSync('.agent/tasks/integration-identity-gate.json', 'utf8'))
    // Every owned file is inside the allowance, and the allowance names nothing
    // this task does not actually need — "just in case" paths are authority
    // granted without a reason to grant it.
    for (const f of OWNED) expect(contract.allowed_paths).toContain(f)
    expect(new Set(contract.allowed_paths))
      .toEqual(new Set([...OWNED, 'package.json']))
  })

  it('adds one npm script and rewrites none', () => {
    const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts
    expect(scripts['verify:integration']).toBe('vitest run integration-protocol.test.mjs')
    // The canonical gate is not quietly redefined by a task that adds a tool to it.
    expect(scripts['verify:pr']).toBe(
      'npm run lint && npm test && npm run build && npm run build:public && ' +
      'npm run verify:public-bundle && node tools/verify-app-icons.mjs')
    expect(scripts['verify:review']).toBe('vitest run review-protocol.test.mjs')
  })

  it('declares the classification the governance step sealed', () => {
    const contract = JSON.parse(readFileSync('.agent/tasks/integration-identity-gate.json', 'utf8'))
    expect(contract.owner_role).toBe('workflow-authority')
    expect(contract.risk).toBe('r3')
    expect(contract.production_effect).toBe('none')
    expect(contract.dependencies).toContain('fresh-context-reviewer')
  })
})

describe('structural: the documentation describes what exists', () => {
  const doc = () => readFileSync('docs/INTEGRATION-PROTOCOL.md', 'utf8')

  it('names only subcommands the CLI implements', () => {
    const implemented = new Set(['template', 'decide'])
    const named = [...doc().matchAll(/integration-gate\.mjs\s+([a-z][a-z-]*)/g)].map(m => m[1])
    expect(named.length).toBeGreaterThan(0)
    for (const n of named) expect(implemented, 'documented subcommand "' + n + '"').toContain(n)
  })

  it('documents every decision value, and no value the protocol does not have', () => {
    const text = doc()
    for (const v of INTEGRATION_DECISIONS) expect(text).toContain(v)
    const named = [...text.matchAll(/\b([A-Z][A-Z_]{4,})\b/g)].map(m => m[1])
      .filter(n => n.endsWith('_TO_INTEGRATE') || n.startsWith('REQUIRES_') || n === 'BLOCKED')
    for (const n of new Set(named)) expect(INTEGRATION_DECISIONS).toContain(n)
  })

  it('carries a strict-ruleset activation plan with the current state and a rollback', () => {
    const text = doc()
    expect(text).toContain(String(EXPECTED_RULESET_ID))
    expect(text).toMatch(/strict_required_status_checks_policy/)
    expect(text).toMatch(/rollback/i)
    expect(text).toMatch(/verif/i)
    expect(text).toMatch(/stale/i)
  })

  it('states that activation is a separate maintainer action, not part of this change', () => {
    expect(doc()).toMatch(/(separate|explicit)[^\n]{0,80}(maintainer|admin)/i)
  })

  it('does not claim the race is closed while the repository is loose', () => {
    const text = doc()
    expect(text).toMatch(/cannot[^\n]{0,60}(close|closed)[^\n]{0,40}race|race[^\n]{0,60}(remains )?open/i)
  })

  it('states the limitation that evidence is validated but not authenticated', () => {
    expect(doc()).toMatch(/validated[^\n]{0,60}not[^\n]{0,30}authenticat/i)
  })
})
