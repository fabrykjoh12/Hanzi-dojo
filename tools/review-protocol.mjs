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

/** A full 40-hex commit id. Abbreviations are ambiguous and are not accepted. */
export const SHA_RE = /^[0-9a-f]{40}$/

export const SNAPSHOT_VERSION = 2

/**
 * WHO TOOK THE SNAPSHOT.
 *
 *   external  taken by the review driver, in a worktree the driver created and
 *             owns, from outside the reviewer's context.
 *   self      taken from inside the reviewer's own context.
 *
 * Only `external` can support an APPROVE. A snapshot the reviewer takes of
 * itself is self-attestation: a reviewer that wanted to hide a write would take
 * the "after" snapshot before making it. That catches the careless case and
 * nothing else, so it must not be able to clear a merge.
 *
 * What the protocol verifies is WHERE the snapshot was taken and WHAT it
 * describes — same worktree root either side, matching the reviewed head. It
 * cannot verify WHO ran the command; that residual is stated in
 * docs/REVIEWER-PROTOCOL.md rather than papered over here.
 */
export const SNAPSHOT_OBSERVERS = ['external', 'self']

const snapshotShapeError = (snap, which) => {
  if (!snap || typeof snap !== 'object' || Array.isArray(snap)) return which + ' snapshot is not an object'
  if (snap.snapshot_version !== SNAPSHOT_VERSION) {
    return which + ' snapshot has unsupported snapshot_version ' + JSON.stringify(snap.snapshot_version) +
      '; this protocol understands version ' + SNAPSHOT_VERSION + ' only'
  }
  if (!SNAPSHOT_OBSERVERS.includes(snap.observer)) {
    return which + ' snapshot has no valid observer (got ' + JSON.stringify(snap.observer) + ')'
  }
  if (typeof snap.root !== 'string' || snap.root.trim() === '') return which + ' snapshot names no worktree root'
  if (!SHA_RE.test(String(snap.head || ''))) return which + ' snapshot records no full head SHA'
  if (!snap.entries || typeof snap.entries !== 'object' || Array.isArray(snap.entries)) {
    return which + ' snapshot has no entries map'
  }
  return null
}

/**
 * INTEGRITY: did the review change anything, and can we tell?
 *
 * Compares two worktree snapshots. Each entry is "<mode> <content-hash>" for a
 * tracked file, "untracked <mode> <hash>" for a non-ignored untracked one, and
 * "DELETED" for a tracked file missing from disk — so a content edit, a
 * deletion, a new untracked file and a mode change are all visible as a changed
 * or added or removed key.
 *
 * Every way of NOT knowing is a blocker: a missing snapshot, a malformed one, a
 * pair from two different worktrees, or a pair that does not describe the head
 * that was reviewed. Not knowing whether the reviewer wrote is the same as
 * knowing it did.
 */
export function reviewIntegrityFindings(before, after, { headSha = null } = {}) {
  const out = []
  const blocker = (summary, evidence) => out.push(finding('blocker', 'hidden-authority-expansion',
    summary, evidence, 'the reviewer must be read-only with respect to the implementation'))

  for (const [snap, which] of [[before, 'before'], [after, 'after']]) {
    const err = snapshotShapeError(snap, which)
    if (err) blocker('Could not establish whether the review modified the worktree', err)
  }
  if (out.length > 0) return out

  if (before.root !== after.root) {
    blocker('The integrity snapshots describe two different worktrees',
      'before: ' + before.root + ' / after: ' + after.root)
  }
  if (before.head !== after.head) {
    blocker('The worktree moved to a different commit during the review',
      'before head ' + before.head + ' / after head ' + after.head)
  }
  if (headSha && (before.head !== headSha || after.head !== headSha)) {
    blocker('The integrity snapshots do not describe the reviewed head',
      'reviewed ' + headSha + ', snapshots at ' + before.head + '/' + after.head)
  }
  if (before.observer !== 'external' || after.observer !== 'external') {
    // Not a shape error — a strength-of-evidence one, and it has to block
    // rather than warn, or the weak path silently becomes the normal one.
    blocker('The integrity evidence is self-attested, not independently observed',
      'observer: before=' + before.observer + ' after=' + after.observer +
      '; a snapshot the reviewer takes of itself cannot show a write it wanted to hide')
  }
  if (out.length > 0) return out

  const keys = new Set([...Object.keys(before.entries), ...Object.keys(after.entries)])
  for (const k of [...keys].sort()) {
    const b = before.entries[k]
    const a = after.entries[k]
    if (b === a) continue
    const what = b === undefined ? 'created' : a === undefined ? 'removed' : 'changed'
    blocker('The review ' + what + ' a file in the review worktree',
      k + ': ' + (b === undefined ? '(absent)' : b) + ' -> ' + (a === undefined ? '(absent)' : a))
  }
  return out
}

/**
 * IDENTITY: is this verdict about the exact commits that were reviewed?
 *
 * The failure this closes: a review of head A replayed as an approval for head
 * B. Non-empty ref strings do not prevent that — "main" and "feature" are names
 * whose meaning moves. So the brief resolves both refs to full commit SHAs, the
 * result carries those SHAs, and the decision independently resolves them again
 * and compares. A branch that moved between brief and decide produces a
 * mismatch rather than a silent retarget.
 */
export function identityFindings({ result, baseSha, headSha }) {
  const out = []
  const blocker = (summary, evidence) => out.push(finding('blocker', 'stale-assumptions',
    summary, evidence, 'a verdict binds to the exact commits it was produced against'))

  if (!SHA_RE.test(String(baseSha || '')) || !SHA_RE.test(String(headSha || ''))) {
    blocker('The decision could not resolve the reviewed commits',
      'base=' + JSON.stringify(baseSha) + ' head=' + JSON.stringify(headSha))
    return out
  }
  for (const [field, expected] of [['base_sha', baseSha], ['head_sha', headSha]]) {
    const got = result && result[field]
    if (!SHA_RE.test(String(got || ''))) {
      blocker('The review result carries no full ' + field,
        field + '=' + JSON.stringify(got))
    } else if (got !== expected) {
      blocker('The review was performed against a different commit',
        'reviewed ' + field + ' ' + got + ', deciding against ' + expected)
    }
  }
  return out
}

export const VERIFICATION_EVIDENCE_VERSION = 1

/**
 * AUTHORITATIVE VERIFICATION — executed by the driver, not by the reviewer.
 *
 * The reviewer has no shell. That is what makes its read-only posture a fact
 * about the platform rather than a promise, and it means the contract's
 * verification commands have to be run by something else. The driver runs them,
 * in its own worktree at the exact reviewed commit, and the record it produces
 * is the ONLY record that counts.
 *
 * Why a reviewer's own account cannot count, even as a fallback: it would assert
 * something nobody checked, and — worse — it would let a reviewer satisfy a
 * required command simply by naming it.
 *
 * Every required command must have EXACTLY ONE authoritative record. Exactly
 * one, not at least one: "at least" lets a duplicate of an easy command stand in
 * for a missing hard one while the count still looks right.
 */
export function verificationEvidenceFindings({ contract, evidence, headSha }) {
  const out = []
  const blocker = (summary, ev) => out.push(finding('blocker', 'tests-and-verification', summary, ev, 'verification'))
  const major = (summary, ev) => out.push(finding('major', 'tests-and-verification', summary, ev, 'verification'))

  const required = Array.isArray(contract?.verification) ? contract.verification : []

  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    blocker('No authoritative verification evidence',
      'the driver produced no verification record for this review')
    return out
  }
  if (evidence.verification_version !== VERIFICATION_EVIDENCE_VERSION) {
    blocker('Unsupported verification evidence version',
      JSON.stringify(evidence.verification_version) + '; this protocol understands version ' +
      VERIFICATION_EVIDENCE_VERSION + ' only')
    return out
  }
  // Bound to the commit. Evidence from another head is evidence about other code.
  if (!SHA_RE.test(String(evidence.head_sha || '')) || evidence.head_sha !== headSha) {
    blocker('Verification evidence is not bound to the reviewed commit',
      'evidence head ' + JSON.stringify(evidence.head_sha) + ', reviewing ' + JSON.stringify(headSha))
    return out
  }
  const runs = evidence.runs
  if (!Array.isArray(runs)) {
    blocker('Verification evidence carries no runs list', typeof runs)
    return out
  }
  if (required.length > 0 && runs.length === 0) {
    blocker('The contract requires verification and none was executed',
      required.length + ' required command(s), 0 executed')
    return out
  }

  const byCommand = new Map()
  for (const r of runs) {
    if (!r || typeof r !== 'object' || !isNonEmptyString(r.command)) {
      blocker('A verification record has no command', JSON.stringify(r))
      continue
    }
    byCommand.set(r.command, (byCommand.get(r.command) || []).concat([r]))
  }

  for (const cmd of required) {
    const got = byCommand.get(cmd) || []
    if (got.length === 0) {
      blocker('A required verification command was not executed',
        'contract.verification requires ' + JSON.stringify(cmd) + ' and no record names it')
      continue
    }
    if (got.length > 1) {
      blocker('A required verification command has more than one record',
        JSON.stringify(cmd) + ' appears ' + got.length + ' times; exactly one authoritative record is required')
      continue
    }
    const r = got[0]
    if (r.executed !== true) {
      blocker('A required verification command did not execute',
        JSON.stringify(cmd) + ': executed=' + JSON.stringify(r.executed) +
        (isNonEmptyString(r.evidence) ? ' - ' + r.evidence : ''))
      continue
    }
    if (!Number.isInteger(r.exit_code)) {
      blocker('A required verification command records no integer exit code',
        JSON.stringify(cmd) + ': exit_code=' + JSON.stringify(r.exit_code))
      continue
    }
    if (r.exit_code !== 0) {
      major('A required verification command failed',
        JSON.stringify(cmd) + ' exited ' + r.exit_code +
        (isNonEmptyString(r.evidence) ? ': ' + r.evidence.slice(0, 200) : ''))
    }
    if (!isNonEmptyString(r.evidence)) {
      major('A required verification command produced no captured output',
        JSON.stringify(cmd) + ' - a verification nobody can read is a claim')
    }
  }

  // A record for something the contract never asked for is not a substitute for
  // one it did. Supplemental observation belongs in the reviewer's result.
  for (const cmd of byCommand.keys()) {
    if (!required.includes(cmd)) {
      blocker('The verification record contains a command the contract does not require',
        JSON.stringify(cmd) + ' is not in contract.verification; an easier command cannot stand in for a required one')
    }
  }

  return out
}

/**
 * Load the contract as it exists AT A COMMIT, not as it exists on disk.
 *
 * The review standard has to come from the reviewed history. Reading the working
 * tree meant a locally re-sealed contract - validly sealed, so every digest
 * check passed - could silently become the standard for a review of an older
 * head. A contract that relaxes its own acceptance criteria and widens its own
 * allowed_paths is exactly the edit someone would make, and it would never have
 * appeared in the reviewed diff.
 *
 * `git` is injected so this is testable against real throwaway repositories.
 */
export function loadContractAtCommit({ taskId, commitSha, git }) {
  const file = TASKS_DIR + '/' + taskId + '.json'
  const fail = (error) => ({ contract: null, error })

  if (!SHA_RE.test(String(commitSha || ''))) {
    return fail('cannot load a contract at ' + JSON.stringify(commitSha) + ' - not a full commit SHA')
  }
  const show = git(['show', commitSha + ':' + file])
  if (show.status !== 0) {
    return fail(file + ' does not exist at ' + commitSha.slice(0, 12) + ' - there is no contract in the reviewed history')
  }
  let contract
  try {
    contract = JSON.parse(show.stdout)
  } catch (err) {
    return fail(file + ' at ' + commitSha.slice(0, 12) + ' is not valid JSON (' + err.message + ')')
  }
  const violations = findContractViolations(contract, { fileName: taskId + '.json' })
  if (violations.length > 0) {
    return fail(file + ' at ' + commitSha.slice(0, 12) + ' is not valid: ' + violations.join('; '))
  }
  if (contract.contract_digest !== computeDigest(contract)) {
    return fail(file + ' at ' + commitSha.slice(0, 12) + ' is not sealed against its own terms')
  }
  return { contract, error: null }
}

/**
 * THE GOVERNANCE BOUNDARY — derived from history, never chosen by the caller.
 *
 * Governance-first is only worth something if the review base is the governance
 * commit. If the caller picks `--base`, they can pick a base AFTER an
 * inconvenient commit and the review never sees it: contract -> unauthorised
 * change -> tidy-up, reviewed from the tidy-up, approves clean. The scope fence
 * would be enforced against a diff chosen to fit inside it.
 *
 * So the base is computed. The boundary is the most recent commit reachable
 * from the reviewed head that touched this contract, and four things must hold:
 *
 *   1. it exists and is an ancestor of the reviewed head
 *   2. it changed ONLY the contract file — a governance act, not work with a
 *      contract edit folded into it
 *   3. the contract blob at the reviewed head is byte-identical to the blob at
 *      the boundary — the terms did not move under the implementation
 *   4. the implementation diff is exactly boundary..head
 *
 * Nothing is stored in the contract to make this work. A contract cannot name
 * the commit that will contain it, and a field that tried would be a lie or a
 * second seal to maintain; history already knows the answer.
 *
 * Anything ambiguous is BLOCKED. `git` is injected so the specs can run this
 * against real throwaway repositories rather than a mock of git's opinions.
 */
export function resolveGovernanceBoundary({ taskId, headSha, git }) {
  const contractPath = TASKS_DIR + '/' + taskId + '.json'
  const fail = (error) => ({ boundarySha: null, contractPath, error })

  if (!SHA_RE.test(String(headSha || ''))) {
    return fail('reviewed head is not a full commit SHA: ' + JSON.stringify(headSha))
  }

  // A shallow clone cannot answer this question. History is truncated, so the
  // "last commit that touched the contract" is whatever the graft boundary
  // happens to be — in a depth-1 checkout that is a single root commit
  // containing the entire tree, which would present itself as a governance
  // commit that changed a thousand files. CI checks out shallow by default, so
  // this is the normal case there, not an exotic one.
  //
  // Refusing is the only sound answer: an unknowable boundary must not become a
  // guessed one. The caller fetches full history and asks again.
  const shallow = git(['rev-parse', '--is-shallow-repository'])
  if (shallow.status !== 0) return fail('could not determine whether the repository is shallow')
  if (shallow.stdout.trim() === 'true') {
    return fail('the repository is a shallow clone, so the governance boundary cannot be derived — ' +
      'fetch full history (git fetch --unshallow) and review again')
  }

  const log = git(['rev-list', '--max-count=2', headSha, '--', contractPath])
  if (log.status !== 0) return fail('could not search history for ' + contractPath + ': ' + log.stderr.trim())
  const commits = log.stdout.split('\n').map(x => x.trim()).filter(Boolean)
  if (commits.length === 0) {
    return fail('no commit reachable from ' + headSha.slice(0, 12) + ' establishes ' + contractPath +
      ' — there is no governance boundary to review from')
  }
  const boundarySha = commits[0]

  // The governance act must be exactly that. A commit that seals a contract and
  // also ships code has already blurred the line this boundary exists to draw.
  const touched = git(['show', '--name-only', '--format=', boundarySha])
  if (touched.status !== 0) return fail('could not inspect governance commit ' + boundarySha)
  const paths = touched.stdout.split('\n').map(x => x.trim()).filter(Boolean)
  if (paths.length !== 1 || paths[0] !== contractPath) {
    return fail('governance commit ' + boundarySha.slice(0, 12) + ' changed ' + paths.length +
      ' path(s) (' + paths.join(', ') + ') — a governance step must change only ' + contractPath)
  }

  // The terms must not have moved between the boundary and the head.
  //
  // Honest note on this one. Given how the boundary is chosen — the last commit
  // reachable from head that touched this path — the two blobs are equal BY
  // CONSTRUCTION, and no fixture can make the inequality fire. I tried: a merge
  // resolving the contract to one parent's version, and an evil merge rewriting
  // it to a third version. In both, rev-list correctly names the commit that
  // last changed the file, so head's blob is the boundary's blob.
  //
  // It is kept, and kept cheap, because it is an assertion about that reasoning
  // rather than a branch expected to run: it holds only while the boundary is
  // derived this exact way. Anyone who changes the derivation — --full-history,
  // a follow, a different starting ref — gets a clear refusal instead of a
  // silently wrong review range. A structural spec pins that it is still here.
  //
  // The reachable half is the read itself: a contract DELETED at the head makes
  // rev-parse fail, and that is a real state a branch can be in.
  const atBoundary = git(['rev-parse', boundarySha + ':' + contractPath])
  const atHead = git(['rev-parse', headSha + ':' + contractPath])
  if (atBoundary.status !== 0 || atHead.status !== 0) {
    return fail('could not read ' + contractPath + ' at both ' + boundarySha.slice(0, 12) +
      ' and ' + headSha.slice(0, 12) + ' — the contract does not survive to the reviewed head')
  }
  if (atBoundary.stdout.trim() !== atHead.stdout.trim()) {
    return fail('the contract at the reviewed head is not the contract sealed at ' +
      boundarySha.slice(0, 12) + ' — the terms moved after the governance step')
  }

  const anc = git(['merge-base', '--is-ancestor', boundarySha, headSha])
  if (anc.status !== 0) {
    return fail('governance commit ' + boundarySha.slice(0, 12) + ' is not an ancestor of ' + headSha.slice(0, 12))
  }

  return { boundarySha, contractPath, error: null }
}

/**
 * A caller-supplied base is not an alternative to the derived one. Passing a
 * different base is not a preference, it is an attempt to change what gets
 * looked at, so it is reported rather than quietly honoured.
 */
export function governanceBaseFindings({ derivedBase, requestedBase }) {
  if (!requestedBase || requestedBase === derivedBase) return []
  return [finding('blocker', 'hidden-authority-expansion',
    'The review base was overridden instead of derived from the governance commit',
    'derived ' + String(derivedBase).slice(0, 12) + ', requested ' + String(requestedBase).slice(0, 12),
    'the implementation diff must begin at the governance boundary')]
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
export function buildReviewBrief({ contract, baseSha, headSha, changedPaths, diffText = '', verificationEvidence = null }) {
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
  lines.push('base: ' + baseSha + '   (the governance commit that sealed the contract)')
  lines.push('head: ' + headSha)
  lines.push('')
  lines.push('Both are full commit SHAs, not branch names. Your verdict binds to')
  lines.push('exactly these two commits: a branch that moves afterwards does not')
  lines.push('inherit it. The base is DERIVED from the governance commit, not')
  lines.push('chosen — so no implementation commit can be hidden before it.')
  lines.push('')
  lines.push('The diff itself is below. You have no shell to fetch it with, and')
  lines.push('that is deliberate — see "What you may and may not do".')
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
  lines.push('You have Read, Grep and Glob. No shell, no editing tools. You')
  lines.push('CANNOT change anything, which is what makes your read-only posture')
  lines.push('a fact about the platform rather than a promise about your')
  lines.push('behaviour. The working tree you are reading is checked out at the')
  lines.push('exact commit under review.')
  lines.push('')
  lines.push('If a finding tempts you to fix it, report it — fixing it would')
  lines.push('destroy the independence that makes your verdict worth anything,')
  lines.push('and here you could not do it anyway.')
  lines.push('')
  lines.push('Do NOT return a verification_run field. Verification was executed')
  lines.push('for you, bound to the reviewed commit, and that record is')
  lines.push('authoritative; a second account of it from you could only disagree')
  lines.push('with the one that was actually run.')
  lines.push('')
  lines.push('## Verification, executed for you at ' + headSha.slice(0, 12))
  lines.push('')
  if (!verificationEvidence || !Array.isArray(verificationEvidence.runs)) {
    lines.push('NONE SUPPLIED. That is itself a reason this cannot be approved —')
    lines.push('say so.')
  } else if (verificationEvidence.runs.length === 0) {
    lines.push('The contract required no verification commands.')
  } else {
    lines.push('Run in a separate worktree at that commit, so its build and test')
    lines.push('output never touched the tree you are reading.')
    lines.push('')
    for (const r of verificationEvidence.runs) {
      lines.push('$ ' + r.command)
      lines.push('  executed: ' + JSON.stringify(r.executed) + '   exit: ' + JSON.stringify(r.exit_code))
      for (const line of String(r.evidence || '(no output captured)').split('\n')) {
        lines.push('  | ' + line)
      }
      lines.push('')
    }
    lines.push('Judge this as evidence. If the output does not support what the')
    lines.push('change claims, that is a finding.')
  }
  lines.push('')
  lines.push('## The diff — ' + baseSha.slice(0, 12) + '...' + headSha.slice(0, 12))
  lines.push('')
  lines.push('Derived mechanically from the governance commit to the reviewed')
  lines.push('head. Nothing summarises it and nothing selected it.')
  lines.push('')
  lines.push('```diff')
  lines.push(diffText === '' ? '(empty diff)' : diffText.replace(/\n$/, ''))
  lines.push('```')
  lines.push('')
  lines.push('## Return exactly this JSON')
  lines.push('')
  lines.push('```json')
  lines.push(JSON.stringify(resultTemplate(contract, baseSha, headSha), null, 2))
  lines.push('```')
  lines.push('')
  lines.push('verdict is one of: ' + VERDICTS.join(', '))
  lines.push('severity is one of: ' + SEVERITIES.join(', '))
  lines.push('')
  lines.push('APPROVE requires no_blocking_findings true, every criterion met,')
  lines.push('no blocker or major finding, and every verification run recorded')
  lines.push('with its real exit code and output. Record a failing run honestly:')
  lines.push('a non-zero exit cannot approve, and hiding it is the one thing here')
  lines.push('that would make your verdict worse than useless.')
  lines.push('')
  lines.push('If a verification command could not be executed at all, set')
  lines.push('executed false — that is different from it running and failing, and')
  lines.push('the protocol treats them differently.')
  lines.push('')
  lines.push('If anything stopped you from completing the review — a command you')
  lines.push('could not run, a file you could not read — return BLOCKED.')
  lines.push('Silence is never approval.')

  return lines.join('\n')
}

/** The shape the reviewer fills in. Emitted into the brief so it cannot drift. */
function resultTemplate(contract, baseSha, headSha) {
  const dims = {}
  for (const d of REVIEW_DIMENSIONS) dims[d] = { inspected: true, note: '<what you checked and what you saw>' }
  return {
    protocol_version: PROTOCOL_VERSION,
    task_id: contract.id,
    contract_digest: contract.contract_digest,
    base_sha: baseSha,
    head_sha: headSha,
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
  if (!isNonEmptyString(result.task_id)) out.push(at + 'task_id must be a non-empty string')
  // Full SHAs, not ref names. "main" and "feature" are labels whose meaning
  // moves; a verdict that binds to a label can be replayed onto a head it never
  // saw. Identity has to be immutable or it is not identity.
  for (const f of ['base_sha', 'head_sha']) {
    if (!SHA_RE.test(String(result[f] || ''))) {
      out.push(at + f + ' must be a full 40-character commit SHA (got ' +
        JSON.stringify(result[f]) + ') — a verdict binds to commits, not to branch names')
    }
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

  // Verification is the driver's, bound to the reviewed commit. A reviewer that
  // supplies its own record is offering a second, weaker account that nobody
  // ran — and the danger is not that it disagrees, but that it could satisfy a
  // required command by naming it.
  if (result.verification_run !== undefined) {
    out.push(at + 'verification_run is not a reviewer field — verification is executed by the ' +
      'driver against the reviewed commit and is authoritative. Put supplemental observations ' +
      'in a dimension note or a finding.')
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
  identity = [],
  governance = [],
  verification = [],
  toolFailures = [],
  integrityEvidenceProvided = true,
} = {}) {
  const protocolErrors = validateReviewResult(result, { contract })
  const reasons = []

  // Integrity evidence is not optional for an approval. Without it the claim
  // "the reviewer changed nothing" rests on the reviewer having been asked not
  // to — and a control nobody observed is only a promise. A review that ran
  // without snapshots is a review whose read-only-ness is unknown, and unknown
  // is BLOCKED like every other way of not knowing here.
  const missingIntegrity = !integrityEvidenceProvided

  // A tool that did not run is not a tool that found nothing.
  for (const t of toolFailures) {
    reasons.push('tool failure: ' + (isNonEmptyString(t) ? t : JSON.stringify(t)))
  }
  for (const e of protocolErrors) reasons.push('protocol: ' + e)

  if (missingIntegrity) {
    reasons.push('no integrity evidence: the review ran without before/after worktree ' +
      'snapshots, so whether it modified anything is unknown')
  }

  const reviewerFindings = Array.isArray(result?.findings) ? result.findings : []
  const all = [
    ...mechanical, ...integrity, ...identity, ...governance,
    ...verification, ...reviewerFindings,
  ]
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

  // Named unconditionally. A verdict that blocks for one reason while silently
  // holding three others sends the author back for a second round.
  for (const f of majors) reasons.push('major: ' + f.summary)
  for (const c of unmet) reasons.push('criterion ' + c.status + ': ' + c.criterion)
  if (result && result.no_blocking_findings !== true) {
    reasons.push('approval was not stated — no_blocking_findings is not true')
  }

  let verdict
  if (toolFailures.length > 0 || protocolErrors.length > 0 || blockers.length > 0 ||
      contradicts || missingIntegrity) {
    verdict = 'BLOCKED'
  } else if (majors.length > 0 || unmet.length > 0 || result.no_blocking_findings !== true) {
    verdict = 'REQUEST_CHANGES'
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
    integrity_evidence: integrityEvidenceProvided ? 'provided' : 'missing',
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
