#!/usr/bin/env node
// THE REVIEW PROTOCOL — the deterministic half of fresh-context review.
//
// The question this answers is not "does this look okay?". It is: given an
// immutable task contract and a diff, what can be established WITHOUT judgment,
// and what shape must a reviewer's answer take before it is allowed to mean
// "merge this"?
//
// Two halves, deliberately separated:
//
//   MECHANICAL      Computable from (contract, changed paths) alone. A path
//                   outside allowed_paths is not an opinion. These findings are
//                   produced here, handed to the reviewer as evidence it did
//                   not gather itself, and re-applied to its result — so a
//                   reviewer that overlooks one, or talks past it, still cannot
//                   approve.
//
//   JUDGMENT        Whether an acceptance criterion is actually met, whether
//                   the diff regresses something, whether the risk level is
//                   honest. No function decides these. What this file does is
//                   force the answer to have a shape: every criterion addressed
//                   individually, every finding carrying evidence, and approval
//                   stated rather than inferred from silence.
//
// The load-bearing rule throughout: SILENCE IS NEVER APPROVAL. A missing field,
// an unparseable result, a failed tool, an unaddressed criterion — each of them
// resolves to BLOCKED. The only route to APPROVE is an explicit, complete,
// internally consistent statement that nothing merge-blocking remains.
//
// This file enforces the protocol. It does not enforce the reviewer: nothing
// here can stop an agent editing a file. That boundary is the subagent's tool
// allow-list and worktree isolation, and its limits are documented precisely in
// docs/REVIEWER-PROTOCOL.md rather than overstated here.

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  TASKS_DIR,
  RISK_LEVELS,
  PRODUCTION_EFFECTS,
  ALWAYS_FORBIDDEN,
  computeDigest,
  covers,
  normalisePath,
  findContractViolations,
} from './verify-task-contracts.mjs'

/**
 * THE VERDICT VOCABULARY. Closed, three values, and the three mean genuinely
 * different things — a two-value approve/reject would collapse the two ways a
 * review can fail, which are not the same conversation:
 *
 *   APPROVE           The review completed and nothing merge-blocking remains.
 *                     Requires an explicit statement to that effect. Never
 *                     inferred from an empty findings list.
 *   REQUEST_CHANGES   The review completed. There is specific, evidenced work
 *                     to do, and the author can do it.
 *   BLOCKED           The review could not be completed soundly, or the change
 *                     violates a structural invariant that is not a matter of
 *                     judgment. Nobody should be reasoning about the diff's
 *                     merits yet.
 *
 * Everything unknown lands on BLOCKED. That is the whole safety property.
 */
export const VERDICTS = ['APPROVE', 'REQUEST_CHANGES', 'BLOCKED']

/**
 * Severities, ordered. blocker forces BLOCKED; major forces at least
 * REQUEST_CHANGES; minor and info are reportable without stopping a merge.
 * A reviewer cannot approve past a blocker or a major by asserting it did.
 */
export const SEVERITIES = ['blocker', 'major', 'minor', 'info']
export const BLOCKING_SEVERITIES = ['blocker', 'major']

/**
 * The dimensions a review must explicitly inspect. Not a suggested checklist:
 * a result that omits one cannot approve, because "I didn't look" and "I looked
 * and it was fine" are indistinguishable in a free-text review, and the first
 * is the one that ships bugs.
 */
export const REVIEW_DIMENSIONS = [
  'path-compliance',
  'forbidden-paths',
  'acceptance-criteria',
  'non-goals',
  'stop-conditions',
  'owner-role',
  'risk-classification',
  'production-effect',
  'correctness',
  'tests-and-verification',
  'security-privacy',
  'hidden-authority-expansion',
  'stale-assumptions',
]

/** How a single acceptance criterion may be answered. */
export const CRITERION_STATUSES = ['met', 'unmet', 'unverifiable']

export const PROTOCOL_VERSION = 1

/**
 * PATHS THAT IMPLY A RISK FLOOR.
 *
 * Deliberately a floor, not a classifier. It cannot tell you a change is r1 —
 * only that it cannot honestly be BELOW r3, because it touches something the
 * control-plane model already names at that level. Under-classification is the
 * direction that costs something: an r1 label on a scheduler change buys a
 * lighter review than the work deserves. Over-classification costs nothing but
 * time, so it is not flagged.
 *
 * Each entry cites the r3 clause it comes from, so this stays derived from the
 * risk model rather than becoming a second opinion about it.
 */
export const RISK_FLOOR_PATHS = [
  { path: 'supabase/migrations/**', floor: 'r3', because: 'migration code' },
  { path: 'src/srs.js', floor: 'r3', because: 'FSRS/scheduler core' },
  { path: 'src/knowledgeState.js', floor: 'r3', because: 'FSRS/scheduler core' },
  { path: 'src/mastery.js', floor: 'r3', because: 'FSRS/scheduler core' },
  { path: '.github/workflows/**', floor: 'r3', because: 'CI/workflow authority' },
  { path: '.agent/**', floor: 'r3', because: 'CI/workflow authority (the task control plane)' },
  { path: 'tools/verify-task-contracts.mjs', floor: 'r3', because: 'CI/workflow authority (the contract validator)' },
  { path: 'tools/review-protocol.mjs', floor: 'r3', because: 'CI/workflow authority (the review protocol)' },
  { path: '.claude/agents/**', floor: 'r3', because: 'CI/workflow authority (agent definitions)' },
  { path: 'src/TrustPages.jsx', floor: 'r3', because: 'privacy/security surface' },
  { path: 'android/**', floor: 'r3', because: 'native/release configuration' },
  { path: 'ios/**', floor: 'r3', because: 'native/release configuration' },
  { path: 'capacitor.config.json', floor: 'r3', because: 'native/release configuration' },
]

/**
 * PATHS THAT IMPLY A PRODUCTION-EFFECT FLOOR.
 *
 * Only one rule, and only because it is genuinely mechanical: merging
 * learner-facing code to main deploys it. A task that changes src/ and declares
 * "none" has under-declared what merging does.
 *
 * Note what is NOT here. supabase/migrations/** does not imply "database" —
 * writing migration code causes no production effect until someone applies it,
 * and treating the path as the effect is exactly the contradiction the
 * production_effect model was rewritten to remove. Applying is a task property,
 * not a path property, so no function can read it off the diff.
 */
export const EFFECT_FLOOR_PATHS = [
  { path: 'src/**', floor: 'deploy-on-merge', because: 'learner-facing code deploys on merge to main' },
  { path: 'public/**', floor: 'deploy-on-merge', because: 'learner-facing assets deploy on merge to main' },
  { path: 'index.html', floor: 'deploy-on-merge', because: 'the app shell deploys on merge to main' },
]

/**
 * Rank for the "at least this much" comparison. The three write-side effects
 * are not really comparable with each other — a store release is not "more"
 * than a database mutation — so they share a rank. That is sound only because
 * the floors above never demand one of them; if a future floor did, this would
 * need to become a real lattice rather than a line.
 */
const EFFECT_RANK = {
  none: 0,
  'read-only': 1,
  'deploy-on-merge': 2,
  database: 3,
  'store-release': 3,
  'external-service': 3,
}

const isNonEmptyString = (v) => typeof v === 'string' && v.trim() !== ''

/** A finding, in the one shape everything downstream understands. */
const finding = (severity, dimension, summary, evidence, violates = null) => ({
  severity,
  dimension,
  summary,
  evidence,
  ...(violates === null ? {} : { violates }),
})

/**
 * MECHANICAL FINDINGS — everything establishable from the contract and the list
 * of changed paths, with no judgment and no file contents.
 *
 * Returned rather than thrown, so the caller can hand them to the reviewer as
 * evidence AND re-apply them to the reviewer's result. A reviewer that never
 * mentions a path violation still cannot approve past one.
 */
export function mechanicalFindings({ contract, changedPaths }) {
  const out = []

  if (!contract || typeof contract !== 'object') {
    return [finding('blocker', 'path-compliance',
      'No contract to review against',
      'mechanicalFindings received no contract object',
      'a review without a contract has no standard to apply')]
  }
  if (!Array.isArray(changedPaths)) {
    return [finding('blocker', 'path-compliance',
      'No diff to review',
      'mechanicalFindings received no changed-path list',
      'a review without a diff has nothing to inspect')]
  }

  const allowed = Array.isArray(contract.allowed_paths) ? contract.allowed_paths : []
  const forbidden = Array.isArray(contract.forbidden_paths) ? contract.forbidden_paths : []
  const contractFile = TASKS_DIR + '/' + contract.id + '.json'

  for (const raw of changedPaths) {
    const p = normalisePath(String(raw))

    // The contract under review, edited by the work it governs. This is the
    // escalation the floor exists to prevent, caught here as well because the
    // floor only refuses it in allowed_paths — it cannot see a diff.
    if (p === contractFile) {
      out.push(finding('blocker', 'hidden-authority-expansion',
        'The diff modifies the contract it is being reviewed against',
        'changed path: ' + p,
        'a task may not edit or re-seal its own contract'))
      continue
    }

    for (const floorPath of ALWAYS_FORBIDDEN) {
      if (covers(floorPath, p) || p === floorPath) {
        out.push(finding('blocker', 'hidden-authority-expansion',
          'The diff touches an always-forbidden path',
          'changed path: ' + p + ' falls under ' + floorPath,
          'ALWAYS_FORBIDDEN: no task may modify ' + floorPath))
      }
    }

    if (forbidden.some(f => f === p || covers(f, p))) {
      out.push(finding('blocker', 'forbidden-paths',
        'The diff touches a path this contract forbids',
        'changed path: ' + p,
        'forbidden_paths'))
      continue
    }

    if (!allowed.some(a => a === p || covers(a, p))) {
      out.push(finding('blocker', 'path-compliance',
        'The diff changes a path outside allowed_paths',
        'changed path: ' + p + ' matches none of: ' + allowed.join(', '),
        'allowed_paths'))
    }
  }

  // Risk floor. Reported against the declared level, which the contract
  // validator has already constrained to r0-r4.
  const declaredRisk = RISK_LEVELS.indexOf(contract.risk)
  for (const rule of RISK_FLOOR_PATHS) {
    const hit = changedPaths.map(p => normalisePath(String(p)))
      .filter(p => p === rule.path || covers(rule.path, p))
    if (hit.length === 0) continue
    const floorIndex = RISK_LEVELS.indexOf(rule.floor)
    if (declaredRisk >= 0 && declaredRisk < floorIndex) {
      out.push(finding('major', 'risk-classification',
        'Declared risk ' + contract.risk + ' is below the floor this diff implies',
        hit.join(', ') + ' is ' + rule.because + ', which the risk model places at ' +
          rule.floor + '; when several levels apply, take the highest',
        'risk'))
    }
  }

  // Production-effect floor.
  const declaredEffect = EFFECT_RANK[contract.production_effect]
  for (const rule of EFFECT_FLOOR_PATHS) {
    const hit = changedPaths.map(p => normalisePath(String(p)))
      .filter(p => p === rule.path || covers(rule.path, p))
    if (hit.length === 0) continue
    const floorRank = EFFECT_RANK[rule.floor]
    if (declaredEffect !== undefined && declaredEffect < floorRank) {
      out.push(finding('major', 'production-effect',
        'Declared production_effect "' + contract.production_effect +
          '" is below what this diff causes',
        hit.join(', ') + ' — ' + rule.because + ', so the maximum effect is at least ' + rule.floor,
        'production_effect'))
    }
  }

  return out
}

/**
 * INTEGRITY: did the review itself change anything?
 *
 * The reviewer is read-only with respect to the implementation. That is
 * enforced first by its tool allow-list and worktree isolation — but a
 * preventive control you cannot observe is a claim, so this is the detective
 * half. Snapshots are {path: contentHash} maps taken before and after.
 *
 * Any difference is a blocker: a reviewer that edited the work is no longer
 * reviewing it, and its verdict describes something nobody else has.
 */
export function reviewIntegrityFindings(before, after) {
  const out = []
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object') {
    return [finding('blocker', 'hidden-authority-expansion',
      'Could not establish whether the review modified the working tree',
      'a before/after snapshot was missing',
      'the reviewer must be read-only with respect to the implementation')]
  }
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const k of [...keys].sort()) {
    if (before[k] === after[k]) continue
    const what = !(k in before) ? 'created' : !(k in after) ? 'deleted' : 'modified'
    out.push(finding('blocker', 'hidden-authority-expansion',
      'The review ' + what + ' a file',
      k + ' changed during the review',
      'the reviewer may not edit implementation files, fix findings, or re-seal a contract'))
  }
  return out
}

/**
 * THE BRIEF. Everything the reviewer is given, derived entirely from the sealed
 * contract, the refs, and the diff.
 *
 * Deliberately takes no free-text parameter. The implementer does not get to
 * add a sentence of framing, a summary of what it built, or a note about which
 * parts are "just cleanup" — those are exactly the inputs that turn an
 * independent review into a confirmation. A summary substituting for the diff
 * is the failure mode; here there is nowhere to put one.
 *
 * Pure: same inputs, same string. That is what makes it reviewable in a test
 * rather than a matter of trusting whoever spawned the agent.
 */
export function buildReviewBrief({ contract, baseRef, headRef, changedPaths }) {
  const mech = mechanicalFindings({ contract, changedPaths })
  const lines = []

  lines.push('# Independent review: ' + contract.id)
  lines.push('')
  lines.push('You are reviewing an implementation against its sealed contract.')
  lines.push('You did not write it and have not seen the reasoning behind it.')
  lines.push('')
  lines.push('YOUR JOB IS TO FIND CONCRETE REASONS THIS SHOULD NOT MERGE.')
  lines.push('Adversarial, but evidence-based: every finding cites something you')
  lines.push('read or ran. A suspicion you cannot evidence is not a finding, and')
  lines.push('"looks fine" is not a review.')
  lines.push('')
  lines.push('Read the diff yourself. Nothing in this brief describes what the')
  lines.push('implementation does, on purpose — a summary is the author\'s account')
  lines.push('of their own work, and it is not evidence.')
  lines.push('')
  lines.push('## Refs')
  lines.push('')
  lines.push('base: ' + baseRef)
  lines.push('head: ' + headRef)
  lines.push('')
  lines.push('Get the diff with: git diff ' + baseRef + '...' + headRef)
  lines.push('')
  lines.push('## Changed paths (' + changedPaths.length + ')')
  lines.push('')
  for (const p of changedPaths) lines.push('- ' + p)
  lines.push('')
  lines.push('## The sealed contract')
  lines.push('')
  lines.push('```json')
  lines.push(JSON.stringify(contract, null, 2))
  lines.push('```')
  lines.push('')
  lines.push('## Mechanical findings already established')
  lines.push('')
  if (mech.length === 0) {
    lines.push('None. This means the path rules hold and the declared risk and')
    lines.push('production_effect clear their floors. It says nothing about')
    lines.push('whether the work is correct or complete — that is your half.')
  } else {
    lines.push('These were computed from the contract and the diff. They stand')
    lines.push('whatever you conclude; you cannot approve past them.')
    lines.push('')
    for (const f of mech) {
      lines.push('- [' + f.severity + '] ' + f.dimension + ': ' + f.summary)
      lines.push('  evidence: ' + f.evidence)
      if (f.violates) lines.push('  violates: ' + f.violates)
    }
  }
  lines.push('')
  lines.push('## Inspect every one of these')
  lines.push('')
  lines.push('A dimension you do not report on is treated as not inspected, and')
  lines.push('an uninspected dimension cannot approve.')
  lines.push('')
  for (const d of REVIEW_DIMENSIONS) lines.push('- ' + d)
  lines.push('')
  lines.push('## Acceptance criteria — answer each one separately')
  lines.push('')
  for (const [i, c] of (contract.acceptance_criteria || []).entries()) {
    lines.push(i + 1 + '. ' + c)
  }
  lines.push('')
  lines.push('For each: met, unmet, or unverifiable, with the evidence that')
  lines.push('settles it. "Unverifiable" is an honest answer and does not')
  lines.push('approve; guessing "met" is the failure this exists to prevent.')
  lines.push('')
  lines.push('## What you may and may not do')
  lines.push('')
  lines.push('MAY: read any file, read history, run the contract\'s verification')
  lines.push('commands and any read-only command, and challenge any claim.')
  lines.push('')
  lines.push('MUST NOT: edit implementation files, fix anything you find, change')
  lines.push('acceptance criteria, widen allowed_paths, re-seal the contract,')
  lines.push('merge, or touch production. If a finding tempts you to fix it,')
  lines.push('report it — fixing it destroys the independence that makes your')
  lines.push('verdict worth anything.')
  lines.push('')
  lines.push('## Return exactly this JSON')
  lines.push('')
  lines.push('```json')
  lines.push(JSON.stringify(resultTemplate(contract, baseRef, headRef), null, 2))
  lines.push('```')
  lines.push('')
  lines.push('verdict is one of: ' + VERDICTS.join(', '))
  lines.push('severity is one of: ' + SEVERITIES.join(', '))
  lines.push('')
  lines.push('APPROVE requires no_blocking_findings true, every criterion met,')
  lines.push('and no blocker or major finding. If anything stopped you from')
  lines.push('completing the review — a command you could not run, a file you')
  lines.push('could not read — return BLOCKED. Silence is never approval.')

  return lines.join('\n')
}

/** The shape the reviewer fills in. Emitted into the brief so it cannot drift. */
function resultTemplate(contract, baseRef, headRef) {
  const dims = {}
  for (const d of REVIEW_DIMENSIONS) dims[d] = { inspected: true, note: '<what you checked and what you saw>' }
  return {
    protocol_version: PROTOCOL_VERSION,
    task_id: contract.id,
    contract_digest: contract.contract_digest,
    base_ref: baseRef,
    head_ref: headRef,
    verdict: '<' + VERDICTS.join('|') + '>',
    dimensions: dims,
    criteria: (contract.acceptance_criteria || []).map(c => ({
      criterion: c,
      status: '<' + CRITERION_STATUSES.join('|') + '>',
      evidence: '<what settles it>',
    })),
    findings: [{
      severity: '<' + SEVERITIES.join('|') + '>',
      dimension: '<one of the dimensions above>',
      summary: '<one sentence>',
      evidence: '<file:line, command output, or diff hunk>',
      violates: '<the contract criterion or invariant, if one applies>',
    }],
    verification_run: [{ command: '<command>', exit_code: 0, evidence: '<what it printed>' }],
    no_blocking_findings: false,
  }
}

/**
 * PROTOCOL VALIDATION. Structural only — it never decides whether the review
 * was RIGHT, only whether it is the kind of statement that may mean "merge".
 *
 * Returns a list of protocol errors. A non-empty list means the result cannot
 * be trusted at all, which resolves to BLOCKED rather than to "probably fine".
 */
export function validateReviewResult(result, { contract } = {}) {
  const out = []
  const at = 'review result: '

  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return [at + 'is not a JSON object']
  }

  if (result.protocol_version !== PROTOCOL_VERSION) {
    out.push(at + 'unsupported protocol_version ' + JSON.stringify(result.protocol_version) +
      '; this validator understands version ' + PROTOCOL_VERSION + ' only')
  }
  if (!VERDICTS.includes(result.verdict)) {
    out.push(at + 'verdict must be one of ' + VERDICTS.join(', ') +
      ' (got ' + JSON.stringify(result.verdict) + ')')
  }
  if (typeof result.no_blocking_findings !== 'boolean') {
    out.push(at + 'no_blocking_findings must be a boolean — approval has to be stated, never inferred')
  }
  for (const f of ['task_id', 'base_ref', 'head_ref']) {
    if (!isNonEmptyString(result[f])) out.push(at + f + ' must be a non-empty string')
  }

  if (contract) {
    if (result.task_id !== contract.id) {
      out.push(at + 'task_id "' + result.task_id + '" is not the contract under review ("' + contract.id + '")')
    }
    // The digest ties the review to the exact terms it was performed against.
    // Without it a review of an older contract could be presented as a review
    // of the current one — the terms would have moved under the verdict.
    if (result.contract_digest !== contract.contract_digest) {
      out.push(at + 'contract_digest does not match the contract under review — ' +
        'this review was performed against different terms')
    }
  }

  // Dimensions: every one present and inspected.
  const dims = result.dimensions
  if (!dims || typeof dims !== 'object' || Array.isArray(dims)) {
    out.push(at + 'dimensions must be an object covering ' + REVIEW_DIMENSIONS.length + ' dimensions')
  } else {
    for (const d of REVIEW_DIMENSIONS) {
      const entry = dims[d]
      if (!entry || typeof entry !== 'object') {
        out.push(at + 'dimension "' + d + '" was not reported on')
        continue
      }
      if (entry.inspected !== true) out.push(at + 'dimension "' + d + '" is not marked inspected')
      if (!isNonEmptyString(entry.note)) out.push(at + 'dimension "' + d + '" has no note saying what was checked')
    }
    for (const k of Object.keys(dims)) {
      if (!REVIEW_DIMENSIONS.includes(k)) out.push(at + 'unknown dimension "' + k + '"')
    }
  }

  // Criteria: every acceptance criterion answered, individually.
  const criteria = result.criteria
  if (!Array.isArray(criteria)) {
    out.push(at + 'criteria must be an array with one entry per acceptance criterion')
  } else if (contract) {
    const expected = Array.isArray(contract.acceptance_criteria) ? contract.acceptance_criteria : []
    const answered = new Set()
    for (const [i, c] of criteria.entries()) {
      const where = at + 'criteria[' + i + '] '
      if (!c || typeof c !== 'object') { out.push(where + 'is not an object'); continue }
      if (!isNonEmptyString(c.criterion)) { out.push(where + 'has no criterion text'); continue }
      if (!expected.includes(c.criterion)) {
        out.push(where + 'answers something that is not an acceptance criterion of this contract')
        continue
      }
      if (answered.has(c.criterion)) out.push(where + 'answers the same criterion twice')
      answered.add(c.criterion)
      if (!CRITERION_STATUSES.includes(c.status)) {
        out.push(where + 'status must be one of ' + CRITERION_STATUSES.join(', ') +
          ' (got ' + JSON.stringify(c.status) + ')')
      }
      if (!isNonEmptyString(c.evidence)) out.push(where + 'has no evidence')
    }
    for (const c of expected) {
      if (!answered.has(c)) out.push(at + 'acceptance criterion left unaddressed: "' + c + '"')
    }
  }

  // Findings: shape only. Whether a finding is CORRECT is not a protocol matter.
  const findings = result.findings
  if (!Array.isArray(findings)) {
    out.push(at + 'findings must be an array (empty is allowed, and never means approval on its own)')
  } else {
    for (const [i, f] of findings.entries()) {
      const where = at + 'findings[' + i + '] '
      if (!f || typeof f !== 'object') { out.push(where + 'is not an object'); continue }
      if (!SEVERITIES.includes(f.severity)) {
        out.push(where + 'severity must be one of ' + SEVERITIES.join(', ') +
          ' (got ' + JSON.stringify(f.severity) + ')')
      }
      if (!REVIEW_DIMENSIONS.includes(f.dimension)) {
        out.push(where + 'dimension must be one of the review dimensions (got ' +
          JSON.stringify(f.dimension) + ')')
      }
      if (!isNonEmptyString(f.summary)) out.push(where + 'has no summary')
      if (!isNonEmptyString(f.evidence)) out.push(where + 'has no evidence — an unevidenced finding is an opinion')
    }
  }

  if (result.verification_run !== undefined) {
    if (!Array.isArray(result.verification_run)) {
      out.push(at + 'verification_run must be an array when present')
    } else {
      for (const [i, v] of result.verification_run.entries()) {
        const where = at + 'verification_run[' + i + '] '
        if (!v || typeof v !== 'object') { out.push(where + 'is not an object'); continue }
        if (!isNonEmptyString(v.command)) out.push(where + 'has no command')
        if (!Number.isInteger(v.exit_code)) out.push(where + 'has no integer exit_code')
      }
    }
  }

  return out
}

/**
 * THE DECISION. Combines what was computed, what the reviewer said, and what
 * happened to the working tree, into one verdict — and it is the mechanical
 * side that wins every disagreement.
 *
 * Fail-closed everywhere: a protocol error, a tool failure, a blocker finding,
 * an unmet criterion, or a claim of "nothing blocking" that contradicts the
 * findings all resolve away from APPROVE. The only path to APPROVE is every
 * check agreeing.
 */
export function decideVerdict({
  contract,
  result,
  mechanical = [],
  integrity = [],
  toolFailures = [],
} = {}) {
  const protocolErrors = validateReviewResult(result, { contract })
  const reasons = []

  // A tool that did not run is not a tool that found nothing.
  for (const t of toolFailures) {
    reasons.push('tool failure: ' + (isNonEmptyString(t) ? t : JSON.stringify(t)))
  }
  for (const e of protocolErrors) reasons.push('protocol: ' + e)

  const reviewerFindings = Array.isArray(result?.findings) ? result.findings : []
  const all = [...mechanical, ...integrity, ...reviewerFindings]
  const blockers = all.filter(f => f && f.severity === 'blocker')
  const majors = all.filter(f => f && f.severity === 'major')

  for (const f of blockers) reasons.push('blocker: ' + (f.summary || 'unnamed blocking finding'))

  // A stated "nothing blocking" that the findings contradict is worse than an
  // honest REQUEST_CHANGES: it is a false claim in the record.
  const contradicts = result?.no_blocking_findings === true && (blockers.length > 0 || majors.length > 0)
  if (contradicts) {
    reasons.push('protocol: no_blocking_findings is true, but ' +
      (blockers.length + majors.length) + ' blocking finding(s) are present')
  }

  const unmet = Array.isArray(result?.criteria)
    ? result.criteria.filter(c => c && c.status !== 'met')
    : []

  let verdict
  if (toolFailures.length > 0 || protocolErrors.length > 0 || blockers.length > 0 || contradicts) {
    verdict = 'BLOCKED'
  } else if (majors.length > 0 || unmet.length > 0 || result.no_blocking_findings !== true) {
    verdict = 'REQUEST_CHANGES'
    for (const f of majors) reasons.push('major: ' + f.summary)
    for (const c of unmet) reasons.push('criterion ' + c.status + ': ' + c.criterion)
    if (result.no_blocking_findings !== true) {
      reasons.push('approval was not stated — no_blocking_findings is not true')
    }
  } else {
    verdict = 'APPROVE'
  }

  // A reviewer may be more cautious than the machinery, never less. If it said
  // BLOCKED or REQUEST_CHANGES, that stands even when every check passed — it
  // saw something these functions cannot.
  const stated = VERDICTS.includes(result?.verdict) ? result.verdict : null
  if (stated && VERDICTS.indexOf(stated) > VERDICTS.indexOf(verdict)) {
    reasons.push('the reviewer returned ' + stated + ', which is more cautious than the computed verdict')
    verdict = stated
  }

  return {
    verdict,
    reasons,
    findings: all,
    protocol_errors: protocolErrors,
    counts: { blocker: blockers.length, major: majors.length, unmet_criteria: unmet.length },
  }
}

/** Read and re-verify a sealed contract, or explain why it cannot be reviewed. */
export async function loadContractForReview(taskId, { dir = TASKS_DIR } = {}) {
  const file = path.join(dir, taskId + '.json')
  let raw
  try {
    raw = await readFile(file, 'utf8')
  } catch (err) {
    return { contract: null, error: 'cannot read contract ' + file + ' (' + err.code + ')' }
  }
  let contract
  try {
    contract = JSON.parse(raw)
  } catch (err) {
    return { contract: null, error: 'contract ' + file + ' is not valid JSON (' + err.message + ')' }
  }
  // An unsealed or stale contract is not a reviewable standard: the terms could
  // have moved after the work was judged against them.
  const violations = findContractViolations(contract, { fileName: taskId + '.json' })
  if (violations.length > 0) {
    return { contract: null, error: 'contract ' + file + ' is not valid: ' + violations.join('; ') }
  }
  if (contract.contract_digest !== computeDigest(contract)) {
    return { contract: null, error: 'contract ' + file + ' is not sealed against its own terms' }
  }
  return { contract, error: null }
}

/** Kept exported so the CLI and the specs agree on the vocabulary. */
export const PRODUCTION_EFFECT_VALUES = PRODUCTION_EFFECTS
