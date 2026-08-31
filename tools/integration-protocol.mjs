// THE INTEGRATION PROTOCOL — the deterministic half of integration authorization.
//
// The question this answers is NOT "did this pass review?". That one is already
// answered, by tools/review-protocol.mjs, and its answer is deliberately narrow:
// this exact implementation passed its task review. The question here is the
// integrator's, asked later, about state the review never looked at:
//
//   IS THIS EXACT REVIEWED IMPLEMENTATION STILL THE THING THAT WOULD BE MERGED,
//   AND IS THE TARGET IT WOULD BE MERGED INTO STILL THE ONE IT WAS REVIEWED
//   AGAINST?
//
// The gap is real and was observed, not imagined. During PR #229 the exact
// independently reviewed head was one commit behind live `main` while every
// required check stayed green. Ruleset 21654011 requires check, playwright and
// native-gate but carries strict_required_status_checks_policy false, and
// GitHub's loose semantics let a topic branch merge without being up to date
// with its base. So REVIEWED CODE was not THE CODE PLUS BASE STATE THAT WOULD
// MERGE, and nothing in the pipeline noticed.
//
// WHAT THIS FILE IS, AND IS NOT
//
// It is a decision function over evidence plus git. It merges nothing, mutates
// no GitHub setting, holds no credential and makes no network call. Producing a
// decision is the entire deliverable; the merge remains a human act, and the
// ruleset change that closes the final race remains a separate, explicit,
// maintainer-performed settings action.
//
// TWO SOURCES, ON PURPOSE
//
//   EVIDENCE   A snapshot of GitHub state — PR, checks, ruleset — collected by
//              whoever holds API access. It is VALIDATED, not authenticated;
//              the protocol knows what shape a sound observation has and
//              refuses everything else.
//
//   GIT        What the local repository can establish without anyone's word:
//              that these SHAs are real commits, and above all whether the head
//              actually CONTAINS the target. Ancestry is the stale-main
//              question, and git answers it directly rather than believing a
//              field in a JSON file.
//
// Where the two disagree, the disagreement blocks. Where they agree, that is
// corroboration and not proof — a snapshot cannot make GitHub stand still, which
// is exactly why the strict ruleset policy is the other half of this design and
// why this protocol will not say READY while the repository stays loose.
//
// The load-bearing rule, inherited from the review protocol and for the same
// reason: COULD NOT ESTABLISH IS NEVER AUTHORIZED. A missing field, an
// unparseable document, an unknown mergeability, an unreadable ruleset, a
// shallow clone — every one of them resolves to BLOCKED.

import { SHA_RE, validateReviewResult } from './review-protocol.mjs'

export { SHA_RE }

/**
 * THE DECISION VOCABULARY. Closed, three values, and only ONE of them
 * authorizes anything.
 *
 *   READY_TO_INTEGRATE           Every identity holds, every required check
 *                                passed from the expected source, the head
 *                                contains the target, and the repository's own
 *                                merge-time enforcement will not let the base
 *                                move underneath this decision. The integrator
 *                                may proceed. Still not an instruction to merge.
 *
 *   REQUIRES_RULESET_ACTIVATION  Everything this protocol can establish holds,
 *                                but the repository is in loose
 *                                required-status-check mode, so nothing stops
 *                                `main` advancing between this decision and the
 *                                merge. The remaining work is a settings change,
 *                                not a code problem — and it is NOT
 *                                authorization. Saying READY here would be
 *                                claiming a race is closed that is open.
 *
 *   BLOCKED                      Something failed, or could not be established.
 *                                Nobody should be reasoning about merging yet.
 *
 * A value outside this set is rejected rather than interpreted.
 */
export const INTEGRATION_DECISIONS = [
  'READY_TO_INTEGRATE',
  'REQUIRES_RULESET_ACTIVATION',
  'BLOCKED',
]

/**
 * The decisions that authorize progression to merge. Exactly one, and it is a
 * derived list rather than a boolean scattered across call sites — so "does this
 * decision authorize?" has one answer in one place, and widening it is a visible
 * edit to this line.
 */
export const AUTHORIZING_DECISIONS = ['READY_TO_INTEGRATE']

/** Does this decision authorize progression to merge? Never inferred. */
export function authorizes(decision) {
  return AUTHORIZING_DECISIONS.includes(decision)
}

export const PROTOCOL_VERSION = 1
export const INTEGRATION_EVIDENCE_VERSION = 1

/**
 * The required check set, and it is EXACT rather than a minimum.
 *
 * A subset would be the obvious bug — merging with playwright unaccounted for.
 * A superset is the subtler one: if the ruleset requires something this list
 * does not know about, the protocol would report a green integration while a
 * check it never looked at was failing, and the reported set would not describe
 * what actually gates the merge.
 */
export const REQUIRED_CHECKS = ['check', 'playwright', 'native-gate']

/**
 * The expected producer of those checks.
 *
 * Name matching alone is not identity. This repository already carries check
 * runs from three different Apps — GitHub Actions, a dead Cloudflare Workers
 * hookup, and Vercel — so "a check called `check` succeeded" is a statement
 * about a string, and any App installed on the repository can post a check run
 * with any name it likes. 15368 is GitHub Actions' App id; the slug is carried
 * alongside it because an id with no human-readable partner is unreviewable in a
 * decision document.
 */
export const EXPECTED_CHECK_SOURCE = { app_id: 15368, app_slug: 'github-actions' }

/**
 * The ruleset this protocol reasons about, pinned by id.
 *
 * Pinning looks over-specific until you consider what a mismatch means: the
 * protection being described is not the protection this design was reasoned
 * about. A different ruleset may require different checks, carry a different
 * bypass list, or target a different branch. Reporting on it as though it were
 * this one would be describing the wrong fence.
 */
export const EXPECTED_RULESET_ID = 21654011
export const EXPECTED_TARGET_BRANCH = 'main'

/**
 * The repository this protocol reasons about.
 *
 * Pinned for the same reason as the ruleset id, and it was an inconsistency to
 * validate `repository` as a string and then never compare it: every other
 * identity here is checked against a constant, and evidence describing a pull
 * request somewhere else was caught only incidentally, by the ruleset id and
 * the local commit graph happening to disagree too.
 */
export const EXPECTED_REPOSITORY = 'fabrykjoh12/Hanzi-dojo'

/** Check-run states that are a completed, successful result and nothing else. */
const SUCCESSFUL_CONCLUSION = 'success'
const COMPLETED_STATUS = 'completed'

/**
 * How old a GitHub snapshot may be and still describe "now".
 *
 * There is no correct value, only an honest one. GitHub state can change one
 * second after collection, so no bound makes the evidence current — the bound
 * exists to reject evidence that is obviously describing a different world.
 * Fifteen minutes is long enough to collect evidence, read it and decide, and
 * short enough that yesterday's snapshot cannot authorize today's merge.
 */
export const MAX_EVIDENCE_AGE_SECONDS = 900

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v)
const isNonEmptyString = (v) => typeof v === 'string' && v.trim() !== ''

/**
 * A finding. `code` is the machine-readable half — the thing an orchestrator or
 * a test matches on — and it is what makes "prove this specific case blocks"
 * checkable rather than a search for a phrase in prose.
 */
const finding = (severity, code, summary, evidence) => ({ severity, code, summary, evidence })
const blocker = (code, summary, evidence) => finding('blocker', code, summary, evidence)
const advisory = (code, summary, evidence) => finding('advisory', code, summary, evidence)

export const FINDING_SEVERITIES = ['blocker', 'advisory']

// ---------------------------------------------------------------------------
// Evidence shape
// ---------------------------------------------------------------------------

/**
 * Validate the SHAPE of an evidence document before any of it is believed.
 *
 * Shape first, in its own pass, because a half-read document is the dangerous
 * one: reasoning over `evidence.pull_request.head_sha` when `pull_request` is
 * undefined throws, and a throw inside a decision function is an unknown state
 * that must not be allowed to become a caught-and-shrugged one. Everything
 * below this line may assume the shape is sound.
 *
 * Returns an array of blocker findings; empty means the document is well-formed.
 * Well-formed is NOT correct — it says the fields exist and have the right
 * types, nothing about whether they describe reality.
 */
export function evidenceShapeFindings(evidence) {
  const out = []
  const need = (cond, code, summary, ev) => { if (!cond) out.push(blocker(code, summary, ev)) }

  if (!isPlainObject(evidence)) {
    return [blocker('evidence-malformed', 'Integration evidence is not a JSON object',
      'got ' + (Array.isArray(evidence) ? 'an array' : typeof evidence))]
  }

  if (evidence.evidence_version !== INTEGRATION_EVIDENCE_VERSION) {
    // Matched exactly, never as a floor — the same reasoning the role-model
    // loader uses. A v2 document written for a reader that does not exist yet
    // would be interpreted by v1 rules, and whatever v2 added to narrow the
    // decision would be silently ignored rather than enforced.
    out.push(blocker('evidence-version-unsupported',
      'Unsupported integration evidence version',
      'expected ' + INTEGRATION_EVIDENCE_VERSION + ', got ' + JSON.stringify(evidence.evidence_version)))
    return out
  }

  need(isNonEmptyString(evidence.repository), 'evidence-malformed',
    'repository is missing or not a string', JSON.stringify(evidence.repository))
  need(isNonEmptyString(evidence.collected_at) && Number.isFinite(Date.parse(evidence.collected_at)),
    'evidence-malformed', 'collected_at is missing or not an ISO-8601 timestamp',
    JSON.stringify(evidence.collected_at))

  const pr = evidence.pull_request
  if (!isPlainObject(pr)) {
    out.push(blocker('evidence-malformed', 'pull_request is missing or not an object',
      JSON.stringify(pr)))
  } else {
    need(Number.isInteger(pr.number) && pr.number > 0, 'evidence-malformed',
      'pull_request.number is missing or not a positive integer', JSON.stringify(pr.number))
    need(isNonEmptyString(pr.state), 'evidence-malformed',
      'pull_request.state is missing or not a string', JSON.stringify(pr.state))
    need(typeof pr.merged === 'boolean', 'evidence-malformed',
      'pull_request.merged is missing or not a boolean', JSON.stringify(pr.merged))
    need(isNonEmptyString(pr.base_ref), 'evidence-malformed',
      'pull_request.base_ref is missing or not a string', JSON.stringify(pr.base_ref))
    need(SHA_RE.test(String(pr.head_sha || '')), 'evidence-malformed',
      'pull_request.head_sha is not a full 40-character commit SHA', JSON.stringify(pr.head_sha))
    // `mergeable` is GitHub's own three-state field: true, false, or null while
    // it is still computing the test merge. null is UNKNOWN, and unknown is the
    // case this whole protocol exists to refuse — so the key must be present and
    // its null must be carried through rather than dropped by the collector.
    need('mergeable' in pr, 'evidence-malformed',
      'pull_request.mergeable is absent — an unreported mergeability is indistinguishable from an unknown one',
      'expected true, false or null')
  }

  const target = evidence.target
  if (!isPlainObject(target)) {
    out.push(blocker('evidence-malformed', 'target is missing or not an object', JSON.stringify(target)))
  } else {
    need(isNonEmptyString(target.branch), 'evidence-malformed',
      'target.branch is missing or not a string', JSON.stringify(target.branch))
    need(SHA_RE.test(String(target.sha || '')), 'evidence-malformed',
      'target.sha is not a full 40-character commit SHA', JSON.stringify(target.sha))
  }

  if (!Array.isArray(evidence.check_runs)) {
    out.push(blocker('evidence-malformed', 'check_runs is missing or not an array',
      JSON.stringify(evidence.check_runs)))
  } else {
    for (const [i, run] of evidence.check_runs.entries()) {
      const at = 'check_runs[' + i + ']'
      if (!isPlainObject(run)) {
        out.push(blocker('evidence-malformed', at + ' is not an object', JSON.stringify(run)))
        continue
      }
      need(isNonEmptyString(run.name), 'evidence-malformed',
        at + '.name is missing or not a string', JSON.stringify(run.name))
      need(isPlainObject(run.app), 'evidence-malformed',
        at + '.app is missing — a check run with no recorded source cannot be attributed',
        JSON.stringify(run.app))
    }
  }

  const ruleset = evidence.ruleset
  if (!isPlainObject(ruleset)) {
    out.push(blocker('ruleset-unreadable', 'ruleset is missing or not an object — the merge-time enforcement state could not be established',
      JSON.stringify(ruleset)))
  } else {
    need(Number.isInteger(ruleset.id), 'ruleset-unreadable',
      'ruleset.id is missing or not an integer', JSON.stringify(ruleset.id))
    // enforcement and target_branch are REQUIRED, not optional-if-present.
    //
    // They were guarded downstream with `'enforcement' in rs`, which read as
    // defensive and was the opposite: an evidence document that simply omitted
    // the key produced no finding at all and reached READY_TO_INTEGRATE. A
    // missing field authorized. Every other unknown in this protocol blocks, and
    // the tool's own template already promised as much — "Every field is
    // required. A missing or malformed field is BLOCKED, never assumed benign."
    need(isNonEmptyString(ruleset.enforcement), 'ruleset-unreadable',
      'ruleset.enforcement is missing or not a string — an unreported enforcement mode ' +
      'cannot be assumed active', JSON.stringify(ruleset.enforcement))
    need(isNonEmptyString(ruleset.target_branch), 'ruleset-unreadable',
      'ruleset.target_branch is missing or not a string — a ruleset whose target is unknown ' +
      'cannot be shown to protect the branch being merged into',
      JSON.stringify(ruleset.target_branch))
    need(Array.isArray(ruleset.required_status_checks), 'ruleset-unreadable',
      'ruleset.required_status_checks is missing or not an array',
      JSON.stringify(ruleset.required_status_checks))
    need(typeof ruleset.strict_required_status_checks_policy === 'boolean', 'ruleset-unreadable',
      'ruleset.strict_required_status_checks_policy is missing or not a boolean — ' +
      'an unknown strictness cannot be assumed strict',
      JSON.stringify(ruleset.strict_required_status_checks_policy))
  }

  return out
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * THE HEAD IDENTITY RULE, and the reason this protocol exists.
 *
 * The reviewed head is an EXPLICIT INPUT supplied by the integrator, never read
 * out of the evidence. That direction matters: evidence that supplied its own
 * notion of what was approved could assert the approval it is supposed to be
 * checked against.
 *
 * Equality is byte equality on the full SHA. Not "the same diff", not
 * "equivalent changes", not "only a metadata commit on top". A different SHA is
 * different code until something has looked at it, and nothing has.
 */
export function headIdentityFindings({ reviewedHead, evidence }) {
  const out = []
  if (!SHA_RE.test(String(reviewedHead || ''))) {
    return [blocker('reviewed-head-invalid',
      'The reviewed head is not a full 40-character commit SHA',
      JSON.stringify(reviewedHead) + ' — an abbreviated or absent head is not an identity')]
  }
  const current = evidence?.pull_request?.head_sha
  if (current !== reviewedHead) {
    out.push(blocker('head-moved-since-review',
      'The pull request head is not the reviewed head — this exact implementation is not what would be merged',
      'reviewed ' + String(reviewedHead).slice(0, 12) + ', current ' + String(current).slice(0, 12) +
      '. A changed head requires deterministic verification and a brand-new fresh-context review; ' +
      'no prior approval carries forward to it.'))
  }
  return out
}

/**
 * The pull request must still be the thing it was when it was reviewed: present,
 * open, unmerged, and aimed at the branch this decision reasons about.
 *
 * `expectedTargetBranch` is a parameter rather than a constant read directly, so
 * a task that legitimately targets something else states that explicitly instead
 * of the protocol quietly accepting whatever the evidence says.
 */
export function pullRequestFindings({ evidence, expectedTargetBranch = EXPECTED_TARGET_BRANCH, expectedRepository = EXPECTED_REPOSITORY }) {
  const out = []
  const pr = evidence?.pull_request
  if (!isPlainObject(pr)) return out

  if (evidence.repository !== expectedRepository) {
    out.push(blocker('wrong-repository',
      'The evidence describes a pull request in a different repository',
      'expected ' + expectedRepository + ', got ' + JSON.stringify(evidence.repository)))
  }

  if (pr.state !== 'open') {
    out.push(blocker('pull-request-not-open',
      'The pull request is not open', 'state ' + JSON.stringify(pr.state)))
  }
  if (pr.merged === true) {
    out.push(blocker('pull-request-already-merged',
      'The pull request is already merged — there is nothing left to authorize',
      'merged true'))
  }
  if (pr.base_ref !== expectedTargetBranch) {
    out.push(blocker('wrong-target-branch',
      'The pull request targets a different branch than this decision reasons about',
      'expected ' + expectedTargetBranch + ', got ' + JSON.stringify(pr.base_ref)))
  }
  if (evidence.target?.branch !== expectedTargetBranch) {
    out.push(blocker('wrong-target-branch',
      'The captured target branch is not the branch this decision reasons about',
      'expected ' + expectedTargetBranch + ', got ' + JSON.stringify(evidence.target?.branch)))
  }
  // mergeable === null is GitHub still computing. Not "probably fine".
  if (pr.mergeable === null || pr.mergeable === undefined) {
    out.push(blocker('mergeability-unknown',
      'GitHub has not established whether this pull request is mergeable',
      'mergeable ' + JSON.stringify(pr.mergeable) + ' — ask again once the test merge is computed'))
  } else if (pr.mergeable === false) {
    out.push(blocker('not-mergeable',
      'GitHub reports the pull request is not mergeable',
      'mergeable false' + (pr.mergeable_state ? ', state ' + pr.mergeable_state : '')))
  }
  return out
}

/**
 * THE REVIEW LINK — necessary, and deliberately not sufficient.
 *
 * A reviewer verdict is an INPUT here, never an authorization. APPROVE on its
 * own establishes nothing about the head still being current, the target having
 * held still, or any check having run; every one of those is checked separately
 * and each can block on its own. That is the whole reviewer/integrator
 * separation, expressed as code rather than as a sentence in a document.
 *
 * The freshness rule is the sharp edge: a result approving H1 cannot authorize
 * H2. When a branch is rebased or updated to pick up a moved target, the head
 * changes, and the approval that existed was of a different commit.
 */
export function reviewLinkFindings({ review, reviewedHead, contract = null }) {
  const out = []
  if (!isPlainObject(review)) {
    return [blocker('review-missing',
      'No review result was supplied — integration cannot be authorized without one',
      'expected a review result document from the fresh-context reviewer protocol')]
  }

  // ONE review standard, not a second weaker one.
  //
  // Checking only the head and the verdict here would have been a subset of the
  // review protocol's own rules, and subsets drift: a result belonging to a
  // different task, or performed against different contract terms, satisfied
  // the head-and-verdict pair as long as it named the same commit. So the
  // authoritative validator is reused, which also brings task_id,
  // contract_digest, every dimension and every criterion into scope.
  if (contract) {
    for (const violation of validateReviewResult(review, { contract })) {
      out.push(blocker('review-invalid',
        'The review result does not satisfy the review protocol', violation))
    }
  }

  if (!SHA_RE.test(String(review.head_sha || ''))) {
    out.push(blocker('review-malformed',
      'The review result does not name a full commit SHA as the head it reviewed',
      JSON.stringify(review.head_sha)))
  } else if (review.head_sha !== reviewedHead) {
    out.push(blocker('review-head-mismatch',
      'The review result approves a different head than the one being integrated',
      'reviewed ' + String(review.head_sha).slice(0, 12) + ', integrating ' +
      String(reviewedHead).slice(0, 12) + ' — the earlier approval is stale and does not carry forward'))
  }
  if (review.verdict !== 'APPROVE') {
    out.push(blocker('review-not-approved',
      'The review result does not carry an APPROVE verdict',
      'verdict ' + JSON.stringify(review.verdict)))
  } else if (review.no_blocking_findings !== true) {
    // The review protocol's own rule: approval is stated, never inferred. An
    // APPROVE that does not also state it has nothing blocking is internally
    // contradictory, and the contradiction must not be resolved in favour of
    // the more convenient half.
    out.push(blocker('review-approval-not-stated',
      'The review result approves without stating that nothing blocking remains',
      'no_blocking_findings ' + JSON.stringify(review.no_blocking_findings)))
  }
  return out
}

// ---------------------------------------------------------------------------
// Required checks
// ---------------------------------------------------------------------------

/**
 * Every required check must be present exactly once, complete, successful, from
 * the expected App, and reported against the reviewed head.
 *
 * The head binding on each run is the one that is easy to leave out and costly
 * to omit: a green `check` from three commits ago is a true statement about a
 * commit nobody is merging.
 *
 * Checks OUTSIDE the required set are deliberately ignored, including failing
 * ones. The ruleset defines what gates a merge; this repository carries a
 * permanently red Cloudflare `Workers Builds` check that is not fixable from
 * here, and letting it block would make the protocol wrong about what the
 * repository actually requires.
 */
export function requiredCheckFindings({ evidence, reviewedHead, required = REQUIRED_CHECKS, source = EXPECTED_CHECK_SOURCE }) {
  const out = []
  const runs = Array.isArray(evidence?.check_runs) ? evidence.check_runs : []

  for (const name of required) {
    const matches = runs.filter(r => isPlainObject(r) && r.name === name)

    if (matches.length === 0) {
      out.push(blocker('required-check-absent',
        'Required check "' + name + '" has no check run', 'expected one, found none'))
      continue
    }
    if (matches.length > 1) {
      // Ambiguity is its own failure, not a search problem. Picking the newest,
      // or the passing one, would let anyone who can post a check run decide
      // which result is read.
      out.push(blocker('required-check-ambiguous',
        'Required check "' + name + '" matches more than one check run',
        matches.length + ' runs: ' + matches.map(m =>
          'app ' + JSON.stringify(m.app?.id) + '/' + JSON.stringify(m.conclusion)).join(', ')))
      continue
    }

    const run = matches[0]

    if (run.app?.id !== source.app_id || run.app?.slug !== source.app_slug) {
      out.push(blocker('required-check-wrong-source',
        'Required check "' + name + '" was not produced by the expected App',
        'expected ' + source.app_id + '/' + source.app_slug + ', got ' +
        JSON.stringify(run.app?.id) + '/' + JSON.stringify(run.app?.slug) +
        ' — a same-named check from another source is a different check'))
      continue
    }
    if (run.status !== COMPLETED_STATUS) {
      out.push(blocker('required-check-incomplete',
        'Required check "' + name + '" has not completed',
        'status ' + JSON.stringify(run.status) + ' — pending is not passing'))
      continue
    }
    if (run.conclusion !== SUCCESSFUL_CONCLUSION) {
      // One code for every non-success conclusion: failure, cancelled,
      // timed_out, action_required, neutral, skipped, stale, null. Enumerating
      // them would invite treating some as acceptable, and none of them is.
      out.push(blocker('required-check-not-successful',
        'Required check "' + name + '" did not succeed',
        'conclusion ' + JSON.stringify(run.conclusion)))
      continue
    }
    if (run.head_sha !== reviewedHead) {
      out.push(blocker('required-check-wrong-head',
        'Required check "' + name + '" was reported against a different commit',
        'check head ' + String(run.head_sha).slice(0, 12) + ', reviewed head ' +
        String(reviewedHead).slice(0, 12) + ' — a green check on another commit proves nothing here'))
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Ruleset
// ---------------------------------------------------------------------------

/**
 * What the repository will actually enforce at merge time.
 *
 * The strict policy is the only part of this design that can close the final
 * race, and it lives in GitHub settings rather than in this repository. So the
 * protocol reads it, reports it, and refuses to describe the race as closed
 * while it is off — but it never changes it. Activation is a separate,
 * deliberate maintainer action, documented in docs/INTEGRATION-PROTOCOL.md.
 *
 * The strictness finding is `advisory` rather than `blocker` because it is not a
 * defect in the change under integration: everything about the work can be
 * sound while the repository's enforcement is still loose. It carries its own
 * decision value instead, and that value does not authorize.
 */
export function rulesetFindings({ evidence, expectedRulesetId = EXPECTED_RULESET_ID, required = REQUIRED_CHECKS, expectedTargetBranch = EXPECTED_TARGET_BRANCH }) {
  const out = []
  const rs = evidence?.ruleset
  if (!isPlainObject(rs)) return out

  if (rs.id !== expectedRulesetId) {
    out.push(blocker('ruleset-identity-mismatch',
      'The evidence describes a different ruleset than this protocol reasons about',
      'expected ' + expectedRulesetId + ', got ' + JSON.stringify(rs.id)))
  }
  // Unconditional. Presence is guaranteed by the shape pass above, so a
  // `'enforcement' in rs` guard here could only ever weaken the rule.
  if (rs.enforcement !== 'active') {
    out.push(blocker('ruleset-not-active',
      'The ruleset is not actively enforced',
      'enforcement ' + JSON.stringify(rs.enforcement)))
  }
  if (rs.target_branch !== expectedTargetBranch) {
    out.push(blocker('ruleset-wrong-target',
      'The ruleset protects a different branch than the one being merged into',
      'expected ' + expectedTargetBranch + ', got ' + JSON.stringify(rs.target_branch)))
  }

  if (Array.isArray(rs.required_status_checks)) {
    const actual = [...rs.required_status_checks].sort()
    const expected = [...required].sort()
    if (actual.length !== expected.length || actual.some((n, i) => n !== expected[i])) {
      // Both directions are failures. Missing means something believed to gate
      // the merge does not; extra means the merge is gated by something this
      // protocol never examined and would report nothing about.
      out.push(blocker('ruleset-required-checks-mismatch',
        'The ruleset does not require exactly the checks this protocol validates',
        'ruleset requires [' + actual.join(', ') + '], protocol validates [' + expected.join(', ') + ']'))
    }
  }

  if (rs.strict_required_status_checks_policy === false) {
    out.push(advisory('ruleset-not-strict',
      'The repository uses loose required status checks, so nothing prevents the target advancing between this decision and the merge',
      'ruleset ' + JSON.stringify(rs.id) + ' strict_required_status_checks_policy false — ' +
      'a repository-side preflight cannot close this race; see docs/INTEGRATION-PROTOCOL.md'))
  }
  return out
}

// ---------------------------------------------------------------------------
// Git corroboration
// ---------------------------------------------------------------------------

/**
 * WHAT GIT CAN ESTABLISH WITHOUT ANYONE'S WORD.
 *
 * This is the half of the protocol that does not depend on the evidence being
 * honest, and the ancestry check is the reason it earns its place: whether the
 * head CONTAINS the target is the stale-main question itself, and git answers it
 * from the commit graph rather than from a field someone typed.
 *
 * The corroboration read is weaker and is described as exactly what it is. The
 * local remote-tracking ref is only as fresh as the last fetch, so agreement
 * proves nothing about this instant — but DISAGREEMENT is decisive, because it
 * means the target demonstrably moved since the evidence was collected. Caught
 * cheaply, and never mistaken for proof of freshness.
 *
 * `git` is injected so the specs can run this against real throwaway
 * repositories instead of a mock of git's opinions.
 */
export function gitCorroborationFindings({ reviewedHead, evidence, git, targetRef = null }) {
  const out = []
  const targetSha = evidence?.target?.sha

  const shallow = git(['rev-parse', '--is-shallow-repository'])
  if (shallow.status !== 0) {
    return [blocker('git-unavailable',
      'Could not determine whether the repository is shallow — git state is unreadable',
      (shallow.stderr || '').trim())]
  }
  if (shallow.stdout.trim() === 'true') {
    // The same refusal the review protocol makes, for the same reason: a
    // truncated graph answers ancestry questions confidently and wrongly.
    return [blocker('repository-shallow',
      'The repository is a shallow clone, so ancestry cannot be established',
      'fetch full history (git fetch --unshallow) and decide again')]
  }

  const exists = (sha, what) => {
    const r = git(['rev-parse', '--verify', '--end-of-options', sha + '^{commit}'])
    if (r.status !== 0 || r.stdout.trim() !== sha) {
      out.push(blocker('commit-unresolvable',
        'The ' + what + ' does not resolve to a commit in this repository',
        String(sha).slice(0, 12) + ' — the decision would be about a commit nobody here has'))
      return false
    }
    return true
  }

  const headOk = SHA_RE.test(String(reviewedHead || '')) && exists(reviewedHead, 'reviewed head')
  const targetOk = SHA_RE.test(String(targetSha || '')) && exists(targetSha, 'captured target')

  if (headOk && targetOk) {
    // THE STALE-MAIN CHECK. If the target is not an ancestor of the head, the
    // head does not contain the target: `main` carries commits this reviewed
    // implementation was never tested against, and the merge would combine two
    // states no review and no check run has ever seen together.
    const anc = git(['merge-base', '--is-ancestor', targetSha, reviewedHead])
    if (anc.status !== 0) {
      out.push(blocker('target-advanced-beyond-head',
        'The reviewed head does not contain the captured target — the base moved after the review',
        'target ' + String(targetSha).slice(0, 12) + ' is not an ancestor of head ' +
        String(reviewedHead).slice(0, 12) + '. Updating the branch changes the head, which makes ' +
        'the existing review stale and requires a brand-new fresh-context review of the new head.'))
    }
  }

  if (targetOk && targetRef) {
    const observed = git(['rev-parse', '--verify', '--end-of-options', targetRef + '^{commit}'])
    if (observed.status !== 0) {
      out.push(blocker('target-ref-unresolvable',
        'The target branch ref could not be resolved locally',
        targetRef + ' — the captured target cannot be corroborated'))
    } else if (observed.stdout.trim() !== targetSha) {
      out.push(blocker('target-moved-since-evidence',
        'The target branch has moved since the integration evidence was collected',
        targetRef + ' is ' + observed.stdout.trim().slice(0, 12) + ', evidence captured ' +
        String(targetSha).slice(0, 12) + ' — the evidence describes a target that no longer exists'))
    }
  }

  return out
}

/**
 * Evidence describing a world old enough to be a different one.
 *
 * Deliberately not a freshness guarantee — see MAX_EVIDENCE_AGE_SECONDS. It
 * rejects the obviously stale; it cannot manufacture currency.
 */
export function evidenceAgeFindings({ evidence, now, maxAgeSeconds = MAX_EVIDENCE_AGE_SECONDS }) {
  const collected = Date.parse(evidence?.collected_at)
  if (!Number.isFinite(collected)) return []
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now)
  if (!Number.isFinite(nowMs)) {
    return [blocker('decision-time-unknown',
      'The decision time could not be established, so evidence age cannot be judged',
      JSON.stringify(now))]
  }
  const ageSeconds = (nowMs - collected) / 1000
  if (ageSeconds > maxAgeSeconds) {
    return [blocker('evidence-stale',
      'The integration evidence is too old to describe the current state',
      Math.round(ageSeconds) + 's old, limit ' + maxAgeSeconds + 's — collect it again and decide again')]
  }
  if (ageSeconds < -60) {
    // Clock skew in the wrong direction. Evidence collected in the future is
    // not evidence; something is misconfigured and guessing which is not this
    // protocol's job.
    return [blocker('evidence-timestamp-implausible',
      'The integration evidence claims to have been collected in the future',
      'collected_at ' + JSON.stringify(evidence.collected_at) + ', now ' + new Date(nowMs).toISOString())]
  }
  return []
}

// ---------------------------------------------------------------------------
// The decision
// ---------------------------------------------------------------------------

/**
 * THE DECISION. Every check above, then one rule for combining them.
 *
 *   any blocker                       -> BLOCKED
 *   otherwise, loose required checks  -> REQUIRES_RULESET_ACTIVATION
 *   otherwise                         -> READY_TO_INTEGRATE
 *
 * The ordering is not cosmetic. Strictness is evaluated LAST, on a set of
 * findings already known to be free of blockers, so activating the ruleset can
 * never be read as fixing a defect in the work — and a blocked integration
 * cannot be talked up into "just needs the setting flipped".
 *
 * `bound` is the machine-readable record of exactly what this decision was about.
 * It exists because a decision that does not carry its identities is unauditable
 * afterwards: "we checked and it was fine" names no commit, no ruleset and no
 * check run.
 */
export function decideIntegration({
  contract,
  review,
  reviewedHead,
  evidence,
  git,
  now = new Date(),
  targetRef = null,
  expectedTargetBranch = EXPECTED_TARGET_BRANCH,
}) {
  const findings = []

  // Shape first, and stop there if it fails. Reasoning about the contents of a
  // malformed document produces findings about fields that do not exist.
  const shape = evidenceShapeFindings(evidence)
  if (shape.length > 0) {
    return buildDecision({ decision: 'BLOCKED', findings: shape, contract, review, reviewedHead, evidence, now })
  }

  findings.push(...headIdentityFindings({ reviewedHead, evidence }))
  findings.push(...pullRequestFindings({ evidence, expectedTargetBranch }))
  findings.push(...reviewLinkFindings({ review, reviewedHead, contract }))
  findings.push(...requiredCheckFindings({ evidence, reviewedHead }))
  findings.push(...rulesetFindings({ evidence, expectedTargetBranch }))
  findings.push(...evidenceAgeFindings({ evidence, now }))

  if (typeof git === 'function') {
    findings.push(...gitCorroborationFindings({ reviewedHead, evidence, git, targetRef }))
  } else {
    findings.push(blocker('git-unavailable',
      'No git accessor was supplied, so nothing could be corroborated against the commit graph',
      'the ancestry half of this protocol did not run'))
  }

  const hasBlocker = findings.some(f => f.severity === 'blocker')
  const notStrict = findings.some(f => f.code === 'ruleset-not-strict')

  const decision = hasBlocker
    ? 'BLOCKED'
    : (notStrict ? 'REQUIRES_RULESET_ACTIVATION' : 'READY_TO_INTEGRATE')

  return buildDecision({ decision, findings, contract, review, reviewedHead, evidence, now })
}

/**
 * The decision document. Deliberately assembled in one place so every exit from
 * `decideIntegration` produces the same shape — a short-circuit that returned a
 * thinner object would be a second, undocumented format.
 */
function buildDecision({ decision, findings, contract, review, reviewedHead, evidence, now }) {
  const pr = isPlainObject(evidence) ? evidence.pull_request : null
  const rs = isPlainObject(evidence) ? evidence.ruleset : null
  const runs = Array.isArray(evidence?.check_runs) ? evidence.check_runs : []
  const named = (n) => runs.filter(r => isPlainObject(r) && r.name === n)

  return {
    protocol_version: PROTOCOL_VERSION,
    decision,
    // Never inferred by a reader from the decision string. One function decides
    // what authorizes, and this is its answer written down.
    authorizes: authorizes(decision),
    decided_at: (now instanceof Date ? now : new Date(now)).toISOString(),
    bound: {
      task_id: contract?.id ?? null,
      contract_digest: contract?.contract_digest ?? null,
      repository: evidence?.repository ?? null,
      pull_request_number: pr?.number ?? null,
      pull_request_state: pr?.state ?? null,
      reviewed_head: reviewedHead ?? null,
      current_head: pr?.head_sha ?? null,
      merge_identity: pr?.merge_commit_sha ?? null,
      target_branch: evidence?.target?.branch ?? null,
      target_sha: evidence?.target?.sha ?? null,
      review: {
        verdict: review?.verdict ?? null,
        head_sha: review?.head_sha ?? null,
        protocol_version: review?.protocol_version ?? null,
      },
      required_checks: REQUIRED_CHECKS.map(name => {
        const m = named(name)
        const run = m.length === 1 ? m[0] : null
        return {
          name,
          matched_runs: m.length,
          status: run?.status ?? null,
          conclusion: run?.conclusion ?? null,
          app_id: run?.app?.id ?? null,
          app_slug: run?.app?.slug ?? null,
          head_sha: run?.head_sha ?? null,
        }
      }),
      expected_check_source: { ...EXPECTED_CHECK_SOURCE },
      ruleset: {
        id: rs?.id ?? null,
        enforcement: rs?.enforcement ?? null,
        target_branch: rs?.target_branch ?? null,
        required_status_checks: Array.isArray(rs?.required_status_checks) ? [...rs.required_status_checks] : null,
        strict_required_status_checks_policy:
          typeof rs?.strict_required_status_checks_policy === 'boolean'
            ? rs.strict_required_status_checks_policy
            : null,
      },
      evidence_version: evidence?.evidence_version ?? null,
      evidence_collected_at: evidence?.collected_at ?? null,
    },
    findings,
  }
}

/**
 * Reject a decision value that is not in the closed vocabulary.
 *
 * Used where a decision arrives from outside — a stored document, another tool —
 * rather than from `decideIntegration` directly. An unrecognised value is not
 * neutral: read loosely it becomes "not BLOCKED", which is the failure this
 * whole protocol is built to refuse.
 */
export function validateDecisionValue(decision) {
  if (!INTEGRATION_DECISIONS.includes(decision)) {
    return [blocker('decision-vocabulary-unknown',
      'The decision value is outside the closed vocabulary',
      JSON.stringify(decision) + ' — expected one of ' + INTEGRATION_DECISIONS.join(', '))]
  }
  return []
}
