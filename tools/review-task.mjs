#!/usr/bin/env node
// The review CLI. Two jobs, deliberately split so neither can quietly do the
// other's:
//
//   brief   Emit the reviewer's brief for a sealed contract and a pair of refs.
//           Pure derivation — contract, refs, changed paths. Nothing an
//           implementer types reaches the reviewer through here.
//
//   decide  Take the reviewer's returned JSON and produce the final verdict,
//           re-applying the mechanical findings and the working-tree integrity
//           check. This is where a review becomes a decision, and where every
//           failure resolves to BLOCKED.
//
// Exit code is the machine-readable half: 0 only for APPROVE. Anything else —
// REQUEST_CHANGES, BLOCKED, a bad argument, an unreadable contract, an
// exception nobody predicted — exits non-zero. A caller that checks the exit
// code cannot accidentally read a failure as an approval.

import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import {
  buildReviewBrief,
  mechanicalFindings,
  reviewIntegrityFindings,
  decideVerdict,
  loadContractForReview,
} from './review-protocol.mjs'

const USAGE = `Usage:
  node tools/review-task.mjs brief  --task <id> --base <ref> --head <ref>
  node tools/review-task.mjs decide --task <id> --result <file.json> \\
                                    [--base <ref>] [--head <ref>] \\
                                    [--before <snapshot.json>] [--after <snapshot.json>]
  node tools/review-task.mjs snapshot

  brief     print the reviewer's brief (stdout)
  decide    print the final verdict; exits 0 only on APPROVE
  snapshot  print a {path: hash} map of tracked files, for the integrity check
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

/** Changed paths between two refs. A git failure is a tool failure, not "no changes". */
function changedPathsBetween(base, head) {
  const r = spawnSync('git', ['diff', '--name-only', base + '...' + head], { encoding: 'utf8' })
  if (r.status !== 0) {
    throw new Error('git diff ' + base + '...' + head + ' failed: ' + (r.stderr || '').trim())
  }
  return r.stdout.split('\n').map(s => s.trim()).filter(Boolean)
}

/**
 * A content hash per tracked file. Used either side of a review to prove the
 * reviewer changed nothing — the detective half of read-only, since a
 * preventive control you cannot observe is only a claim.
 */
function snapshotTrackedFiles() {
  const ls = spawnSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  if (ls.status !== 0) throw new Error('git ls-files failed: ' + (ls.stderr || '').trim())
  const files = ls.stdout.split('\0').filter(Boolean)
  if (files.length === 0) return {}
  // One process, not one per file. A snapshot taken either side of a review is
  // on the critical path; a few thousand git invocations would make the
  // integrity check expensive enough that someone would be tempted to skip it.
  const h = spawnSync('git', ['hash-object', '--stdin-paths'], {
    encoding: 'utf8', input: files.join('\n') + '\n', maxBuffer: 64 * 1024 * 1024,
  })
  if (h.status !== 0) throw new Error('git hash-object failed: ' + (h.stderr || '').trim())
  const hashes = h.stdout.split('\n').filter(Boolean)
  if (hashes.length !== files.length) {
    // A short read would silently drop files from the comparison, which is a
    // gap a reviewer could write into. Refuse the snapshot instead.
    throw new Error('hashed ' + hashes.length + ' of ' + files.length + ' tracked files')
  }
  const out = {}
  for (const [i, f] of files.entries()) out[f] = hashes[i]
  return out
}

const readJson = async (file, what) => {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch (err) {
    throw new Error('could not read ' + what + ' from ' + file + ': ' + err.message)
  }
}

async function main(argv = process.argv.slice(2)) {
  const cmd = argv[0]
  const args = parseArgs(argv.slice(1))

  if (cmd === 'snapshot') {
    process.stdout.write(JSON.stringify(snapshotTrackedFiles(), null, 2) + '\n')
    return 0
  }

  if (cmd === 'brief') {
    if (!args.task || !args.base || !args.head) { process.stderr.write(USAGE); return 2 }
    const { contract, error } = await loadContractForReview(args.task)
    if (error) { process.stderr.write('BLOCKED: ' + error + '\n'); return 1 }
    const changedPaths = changedPathsBetween(args.base, args.head)
    process.stdout.write(buildReviewBrief({
      contract, baseRef: args.base, headRef: args.head, changedPaths,
    }) + '\n')
    return 0
  }

  if (cmd === 'decide') {
    if (!args.task || !args.result) { process.stderr.write(USAGE); return 2 }
    const toolFailures = []

    // A missing or unreadable contract does not fall back to "review it anyway
    // and see". There is no standard to apply, so there is nothing to decide.
    const { contract, error } = await loadContractForReview(args.task)
    if (error) toolFailures.push(error)

    let result = null
    try {
      result = await readJson(args.result, 'review result')
    } catch (err) {
      toolFailures.push(err.message)
    }

    let mechanical = []
    if (contract && args.base && args.head) {
      try {
        mechanical = mechanicalFindings({ contract, changedPaths: changedPathsBetween(args.base, args.head) })
      } catch (err) {
        toolFailures.push(err.message)
      }
    } else if (contract) {
      // Without refs the path rules cannot be checked at all. Saying so is the
      // point: a decision that silently skipped them would look like a pass.
      toolFailures.push('no --base/--head given, so path compliance could not be checked')
    }

    let integrity = []
    if (args.before && args.after) {
      try {
        integrity = reviewIntegrityFindings(
          await readJson(args.before, 'before snapshot'),
          await readJson(args.after, 'after snapshot'),
        )
      } catch (err) {
        toolFailures.push(err.message)
      }
    }

    const decision = decideVerdict({ contract, result, mechanical, integrity, toolFailures })
    process.stdout.write(JSON.stringify(decision, null, 2) + '\n')
    process.stdout.write('\nVERDICT: ' + decision.verdict + '\n')
    for (const r of decision.reasons) process.stdout.write('  - ' + r + '\n')
    return decision.verdict === 'APPROVE' ? 0 : 1
  }

  process.stderr.write(USAGE)
  return 2
}

if (process.argv[1] && process.argv[1].endsWith('review-task.mjs')) {
  // Fail closed on anything unforeseen. An exception escaping to a non-zero
  // exit is correct; an exception swallowed into a 0 would read as approval.
  main().then(
    (code) => { process.exitCode = code },
    (err) => {
      process.stderr.write('VERDICT: BLOCKED\n  - unhandled failure: ' + (err && err.message) + '\n')
      process.exitCode = 1
    },
  )
}

export { snapshotTrackedFiles, changedPathsBetween, main }
