#!/usr/bin/env node
// The integration gate CLI. Two jobs, and neither of them is merging.
//
//   template  Emit a blank integration-evidence document, with the collection
//             commands in comments beside the fields. Malformed evidence is a
//             fail-closed BLOCKED, so making the right shape easy to produce is
//             part of making the gate usable rather than a formality people
//             work around.
//   decide    Produce the integration decision: does this exact reviewed head,
//             against this exact target state, still hold together?
//
// THE EXIT-CODE CONTRACT IS PER-SUBCOMMAND. Stating one global rule for both
// would be false for one of them, and a false contract is worse than none.
//
//   template  0 = a template was emitted. Not a decision of any kind.
//   decide    0 = the decision is READY_TO_INTEGRATE, and nothing else.
//             REQUIRES_RULESET_ACTIVATION, BLOCKED, a bad argument, unreadable
//             evidence and an unforeseen exception all exit non-zero.
//
// REQUIRES_RULESET_ACTIVATION exits non-zero on purpose, even though nothing is
// wrong with the work. It is not authorization — the merge race is still open —
// and an exit code that let it pass for one would hand back exactly the
// reassurance this gate exists to withhold. The decision document carries the
// distinction for anyone who needs to act on it.
//
// WHAT THIS CLI CANNOT DO, BY CONSTRUCTION
//
// It makes no network call, holds no credential, and contains no merge or
// ruleset API path. It reads a JSON document and the local commit graph. The
// merge stays a human act bound to the exact reviewed head, and the ruleset
// change that closes the final race stays a separate maintainer action — both
// documented in docs/INTEGRATION-PROTOCOL.md.

import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import {
  INTEGRATION_EVIDENCE_VERSION,
  EXPECTED_CHECK_SOURCE,
  EXPECTED_RULESET_ID,
  EXPECTED_TARGET_BRANCH,
  REQUIRED_CHECKS,
  EXPECTED_RULESET_CHECKS,
  SHA_RE,
  decideIntegration,
  authorizes,
  validateDecisionValue,
} from './integration-protocol.mjs'
import { loadContractAtCommit } from './review-protocol.mjs'

const USAGE = `Usage:
  node tools/integration-gate.mjs template
  node tools/integration-gate.mjs decide --task <id> --reviewed-head <sha> \\
                                         --evidence <evidence.json> \\
                                         --review <review-result.json> \\
                                         [--target-ref <ref>]

  --reviewed-head is the EXACT head an independent fresh-context reviewer
  approved. It is supplied by the integrator, never read out of the evidence:
  evidence that named its own approved head could assert the approval it is
  meant to be checked against.

  --target-ref (e.g. refs/remotes/origin/main) is corroboration. Disagreement
  with the captured target blocks; agreement proves nothing about this instant,
  because a local ref is only as fresh as the last fetch.

  EXIT CODES ARE PER-SUBCOMMAND:
    template  0 = a template was emitted. Not a decision.
    decide    0 = READY_TO_INTEGRATE. Every other decision exits non-zero,
                  REQUIRES_RULESET_ACTIVATION included — it is not authorization.

  This command merges nothing and changes no repository setting.
`

function parseArgs(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) out[a.slice(2)] = argv[++i]
    else out._.push(a)
  }
  return out
}

/** A git runner bound to a directory. Injected into the protocol for testability. */
const gitIn = (cwd) => (args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' }
}

/**
 * The evidence template, with the collection commands attached to the fields
 * they fill. The `gh` invocations are documentation, not something this CLI
 * runs — it holds no token and reaches no network.
 */
const TEMPLATE = {
  _README: [
    'Integration evidence. Collect with a GitHub token that can read the repository,',
    'then run: node tools/integration-gate.mjs decide --task <id> --reviewed-head <sha>',
    '  --evidence <this file> --review <review-result.json> --target-ref refs/remotes/origin/main',
    'Every field is required. A missing or malformed field is BLOCKED, never assumed benign.',
  ],
  evidence_version: INTEGRATION_EVIDENCE_VERSION,
  _collected_at: 'ISO-8601, when the snapshot below was taken. Older than 15 minutes is refused.',
  collected_at: '',
  repository: 'fabrykjoh12/Hanzi-dojo',
  _pull_request: 'gh api repos/{owner}/{repo}/pulls/{number}',
  pull_request: {
    number: 0,
    state: 'open',
    merged: false,
    base_ref: EXPECTED_TARGET_BRANCH,
    head_sha: '',
    // Carry GitHub's null through rather than dropping the key: an unreported
    // mergeability is indistinguishable from an unknown one, and unknown blocks.
    mergeable: null,
    mergeable_state: '',
    merge_commit_sha: '',
  },
  _target: 'gh api repos/{owner}/{repo}/git/ref/heads/' + EXPECTED_TARGET_BRANCH,
  target: { branch: EXPECTED_TARGET_BRANCH, sha: '' },
  _check_runs: [
    'gh api repos/{owner}/{repo}/commits/{head_sha}/check-runs',
    'Include app.id and app.slug for every run: a check name is a string anyone',
    'with an installed App can post, and this repository already carries check',
    'runs from three different Apps. Expected source: ' +
      EXPECTED_CHECK_SOURCE.app_id + '/' + EXPECTED_CHECK_SOURCE.app_slug + '.',
    'Required: ' + REQUIRED_CHECKS.join(', '),
  ],
  check_runs: [
    { name: '', status: '', conclusion: '', head_sha: '', app: { id: 0, slug: '' } },
  ],
  _ruleset: [
    'gh api repos/{owner}/{repo}/rulesets/' + EXPECTED_RULESET_ID,
    'required_status_checks entries are {context, integration_id} — copy BOTH.',
    'integration_id binds the context to an integration; dropping it turns the',
    'merge-time fence into a name match that any installed App could satisfy.',
    'bypass_actors is REQUIRED and must be []. GitHub omits it when the caller',
    'lacks sufficient access — that is an unknown policy state, not an empty',
    'list, and it is BLOCKED. Do not substitute current_user_can_bypass: it',
    'answers "can THIS token bypass?", not "has the ruleset no bypass actors?".',
  ],
  ruleset: {
    id: EXPECTED_RULESET_ID,
    target_branch: EXPECTED_TARGET_BRANCH,
    enforcement: 'active',
    required_status_checks: EXPECTED_RULESET_CHECKS.map(c => ({ ...c })),
    strict_required_status_checks_policy: false,
    bypass_actors: [],
    current_user_can_bypass: 'never',
  },
}

async function readJson(file, what) {
  let raw
  try {
    raw = await readFile(file, 'utf8')
  } catch (err) {
    throw new Error('could not read ' + what + ' at ' + file + ': ' + err.message)
  }
  try {
    return JSON.parse(raw)
  } catch (err) {
    throw new Error(what + ' at ' + file + ' is not valid JSON: ' + err.message)
  }
}

async function cmdDecide(args, { cwd, write, setExit }) {
  const { task, evidence: evidenceFile, review: reviewFile } = args
  const reviewedHead = args['reviewed-head']
  const targetRef = args['target-ref'] || null

  if (!task || !reviewedHead || !evidenceFile || !reviewFile) {
    write(USAGE)
    setExit(1)
    return
  }
  if (!SHA_RE.test(String(reviewedHead))) {
    write('decide: --reviewed-head must be a full 40-character commit SHA, got ' +
      JSON.stringify(reviewedHead) + '\n')
    setExit(1)
    return
  }

  const git = gitIn(cwd)

  // The contract comes from the REVIEWED COMMIT, never from the working tree —
  // the same rule the review protocol applies, for the same reason: the terms
  // that bind a decision must be the terms that were in the history it is about.
  const { contract, error } = loadContractAtCommit({ taskId: task, commitSha: reviewedHead, git })
  if (error) {
    // A decision document, not a bare error. A caller that cannot parse this
    // path would otherwise have to distinguish "no output" from "blocked", and
    // one of those readings is unsafe.
    const doc = {
      protocol_version: 1,
      decision: 'BLOCKED',
      authorizes: false,
      decided_at: new Date().toISOString(),
      bound: { task_id: task, reviewed_head: reviewedHead },
      findings: [{
        severity: 'blocker',
        code: 'contract-unreadable',
        summary: 'The sealed contract could not be loaded at the reviewed head',
        evidence: error,
      }],
    }
    write(JSON.stringify(doc, null, 2) + '\n')
    setExit(1)
    return
  }

  const evidence = await readJson(evidenceFile, 'integration evidence')
  const review = await readJson(reviewFile, 'the review result')

  const decision = decideIntegration({ contract, review, reviewedHead, evidence, git, targetRef })

  // The exit code is derived from the decision value, so the value is checked
  // against the closed vocabulary at exactly the point where it starts to mean
  // something to a caller. A value outside the set cannot authorize, and it must
  // not be able to reach `authorizes()` and be quietly read as "not READY, so
  // exit 1" either — that would make a corrupted decision indistinguishable from
  // a sound refusal.
  const vocabulary = validateDecisionValue(decision.decision)
  if (vocabulary.length > 0) {
    decision.findings = [...vocabulary, ...(decision.findings || [])]
    decision.authorizes = false
    write(JSON.stringify(decision, null, 2) + '\n')
    setExit(1)
    return
  }

  write(JSON.stringify(decision, null, 2) + '\n')
  setExit(authorizes(decision.decision) ? 0 : 1)
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const write = io.write || (s => process.stdout.write(s))
  const setExit = io.setExit || (c => { process.exitCode = c })
  const cwd = io.cwd || process.cwd()
  const args = parseArgs(argv)
  const sub = args._[0]

  if (sub === 'template') {
    write(JSON.stringify(TEMPLATE, null, 2) + '\n')
    setExit(0)
    return
  }
  if (sub === 'decide') {
    await cmdDecide(args, { cwd, write, setExit })
    return
  }
  write(USAGE)
  setExit(1)
}

if (process.argv[1] && process.argv[1].endsWith('integration-gate.mjs')) {
  main().catch(err => {
    // An unforeseen exception is an unknown state, and unknown never authorizes.
    process.stderr.write(String((err && err.stack) || err) + '\n')
    process.exitCode = 1
  })
}
