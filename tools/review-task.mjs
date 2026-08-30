#!/usr/bin/env node
// The review CLI. Four jobs, split so none can quietly do another's:
//
//   prepare   Create a review worktree at the reviewed head, owned by the
//             DRIVER rather than by the reviewer, and snapshot it. This is what
//             makes the integrity evidence external rather than self-attested.
//   brief     Emit the reviewer's brief. Refs are resolved to full commit SHAs
//             and the base is DERIVED from the governance commit, never taken
//             from the caller.
//   snapshot  Snapshot a worktree, for the after-side of the integrity check.
//   decide    Produce the final verdict, independently re-resolving the
//             identities and re-deriving the base. Exits 0 only on APPROVE.
//
// Exit code is the machine-readable half: 0 only for APPROVE. Anything else —
// REQUEST_CHANGES, BLOCKED, a bad argument, an unreadable contract, an
// exception nobody predicted — exits non-zero. A caller that checks the exit
// code cannot accidentally read a failure as an approval.

import { readFile } from 'node:fs/promises'
import { lstatSync, readlinkSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'
import {
  SNAPSHOT_VERSION,
  SHA_RE,
  buildReviewBrief,
  mechanicalFindings,
  reviewIntegrityFindings,
  identityFindings,
  governanceBaseFindings,
  resolveGovernanceBoundary,
  decideVerdict,
  loadContractForReview,
} from './review-protocol.mjs'

const USAGE = `Usage:
  node tools/review-task.mjs prepare  --task <id> --head <ref> --worktree <dir>
  node tools/review-task.mjs brief    --task <id> --head <ref> [--worktree <dir>]
  node tools/review-task.mjs snapshot --worktree <dir> [--observer external|self]
  node tools/review-task.mjs decide   --task <id> --head <ref> --result <f.json> \\
                                      --before <snap.json> --after <snap.json>

  The base is DERIVED from the governance commit. There is no --base.
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
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' }
}

/**
 * Resolve a ref to a full commit SHA, or null.
 *
 * `^{commit}` matters: it refuses a tag object or a tree, so an identity can
 * only ever be a commit. Abbreviated SHAs are refused too — an abbreviation is
 * ambiguous by construction, and identity that can collide is not identity.
 */
function resolveSha(ref, cwd = process.cwd()) {
  const r = gitIn(cwd)(['rev-parse', '--verify', '--end-of-options', ref + '^{commit}'])
  if (r.status !== 0) return null
  const sha = r.stdout.trim()
  return SHA_RE.test(sha) ? sha : null
}

/**
 * A snapshot of one worktree's REVIEW-RELEVANT state.
 *
 * Not just tracked content. The four things a reviewer could do that must not
 * pass unseen:
 *
 *   content edit     tracked path's hash changes
 *   deletion         tracked path becomes DELETED
 *   new file         a non-ignored untracked path appears as a new key
 *   mode change      the mode prefix changes (an exec bit is a real change)
 *
 * Ignored paths are excluded on purpose: node_modules, dist and test output
 * churn constantly and would drown the signal, and a reviewer writing there
 * cannot affect the implementation under review.
 *
 * `observer` records where this was taken from. It is the honest half of the
 * control: `external` means the driver took it in a worktree the driver owns;
 * `self` means it came from inside the reviewer's own context, which cannot
 * show a write the reviewer wanted to hide.
 */
function snapshotWorktree(root, observer = 'external') {
  const git = gitIn(root)
  const top = git(['rev-parse', '--show-toplevel'])
  if (top.status !== 0) throw new Error(root + ' is not a git worktree: ' + top.stderr.trim())
  const resolvedRoot = top.stdout.trim()

  const head = git(['rev-parse', 'HEAD'])
  if (head.status !== 0) throw new Error('could not read HEAD in ' + resolvedRoot)

  const tracked = git(['ls-files', '-z'])
  if (tracked.status !== 0) throw new Error('git ls-files failed in ' + resolvedRoot)
  // --others --exclude-standard is exactly "untracked and not ignored".
  const untracked = git(['ls-files', '-z', '--others', '--exclude-standard'])
  if (untracked.status !== 0) throw new Error('git ls-files --others failed in ' + resolvedRoot)

  const trackedPaths = tracked.stdout.split('\0').filter(Boolean)
  const untrackedPaths = untracked.stdout.split('\0').filter(Boolean)
  const entries = {}

  const describe = (rel, prefix) => {
    const abs = path.join(resolvedRoot, rel)
    let st
    try {
      st = lstatSync(abs)
    } catch {
      return prefix + 'DELETED'
    }
    if (st.isSymbolicLink()) {
      // Hash the link target, not the file it points at — repointing a symlink
      // is a content change that following it would hide.
      return prefix + '120000 ' + createHash('sha1').update(readlinkSync(abs)).digest('hex')
    }
    const mode = (st.mode & 0o111) ? '100755' : '100644'
    const h = git(['hash-object', '--', rel])
    if (h.status !== 0) return prefix + mode + ' UNREADABLE'
    return prefix + mode + ' ' + h.stdout.trim()
  }

  // One batch call for the common case; per-file only where it is unavoidable.
  const readable = trackedPaths.filter(p => {
    try { return !lstatSync(path.join(resolvedRoot, p)).isSymbolicLink() } catch { return false }
  })
  const batch = readable.length === 0 ? null : git(['hash-object', '--stdin-paths'])
  let hashes = null
  if (batch !== null) {
    const run = spawnSync('git', ['hash-object', '--stdin-paths'], {
      cwd: resolvedRoot, encoding: 'utf8', input: readable.join('\n') + '\n', maxBuffer: 64 * 1024 * 1024,
    })
    if (run.status !== 0) throw new Error('git hash-object failed: ' + (run.stderr || '').trim())
    const lines = (run.stdout || '').split('\n').filter(Boolean)
    if (lines.length !== readable.length) {
      // A short read would silently drop files from the comparison — a gap a
      // reviewer could write into. Refuse the snapshot rather than narrow it.
      throw new Error('hashed ' + lines.length + ' of ' + readable.length + ' files')
    }
    hashes = new Map(readable.map((p, i) => [p, lines[i]]))
  }

  for (const rel of trackedPaths) {
    const abs = path.join(resolvedRoot, rel)
    let st = null
    try { st = lstatSync(abs) } catch { /* deleted */ }
    if (st === null) { entries[rel] = 'DELETED'; continue }
    if (st.isSymbolicLink() || hashes === null || !hashes.has(rel)) {
      entries[rel] = describe(rel, '')
      continue
    }
    entries[rel] = ((st.mode & 0o111) ? '100755' : '100644') + ' ' + hashes.get(rel)
  }
  for (const rel of untrackedPaths) entries[rel] = describe(rel, 'untracked ')

  return {
    snapshot_version: SNAPSHOT_VERSION,
    observer,
    root: resolvedRoot,
    head: head.stdout.trim(),
    entries,
  }
}

const readJson = async (file, what) => {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch (err) {
    throw new Error('could not read ' + what + ' from ' + file + ': ' + err.message)
  }
}

/** Everything both `brief` and `decide` must agree on, derived the same way twice. */
async function resolveReview(taskId, headRef) {
  const { contract, error } = await loadContractForReview(taskId)
  if (error) return { error }
  const headSha = resolveSha(headRef)
  if (!headSha) return { error: 'could not resolve --head ' + JSON.stringify(headRef) + ' to a commit' }
  const gov = resolveGovernanceBoundary({ taskId, headSha, git: gitIn(process.cwd()) })
  if (gov.error) return { error: gov.error }
  const diff = gitIn(process.cwd())(['diff', '--name-only', gov.boundarySha + '...' + headSha])
  if (diff.status !== 0) return { error: 'git diff failed: ' + diff.stderr.trim() }
  return {
    contract,
    headSha,
    baseSha: gov.boundarySha,
    changedPaths: diff.stdout.split('\n').map(x => x.trim()).filter(Boolean),
    error: null,
  }
}

async function main(argv = process.argv.slice(2)) {
  const cmd = argv[0]
  const args = parseArgs(argv.slice(1))

  if (cmd === 'snapshot') {
    if (!args.worktree) { process.stderr.write(USAGE); return 2 }
    const observer = args.observer === 'self' ? 'self' : 'external'
    process.stdout.write(JSON.stringify(snapshotWorktree(args.worktree, observer), null, 2) + '\n')
    return 0
  }

  if (cmd === 'prepare') {
    if (!args.task || !args.head || !args.worktree) { process.stderr.write(USAGE); return 2 }
    const r = await resolveReview(args.task, args.head)
    if (r.error) { process.stderr.write('BLOCKED: ' + r.error + '\n'); return 1 }
    // The DRIVER creates the worktree. That is the whole point: a worktree the
    // reviewer creates for itself cannot yield evidence about itself.
    const add = gitIn(process.cwd())(['worktree', 'add', '--detach', args.worktree, r.headSha])
    if (add.status !== 0) { process.stderr.write('BLOCKED: git worktree add failed: ' + add.stderr + '\n'); return 1 }
    process.stdout.write(JSON.stringify({
      task: args.task, base_sha: r.baseSha, head_sha: r.headSha, worktree: args.worktree,
      snapshot: snapshotWorktree(args.worktree, 'external'),
    }, null, 2) + '\n')
    return 0
  }

  if (cmd === 'brief') {
    if (!args.task || !args.head) { process.stderr.write(USAGE); return 2 }
    if (args.base) {
      // Not an option we quietly ignore. Asking for a different base is asking
      // to change what gets looked at.
      process.stderr.write('BLOCKED: --base is not accepted; the base is derived from the governance commit\n')
      return 1
    }
    const r = await resolveReview(args.task, args.head)
    if (r.error) { process.stderr.write('BLOCKED: ' + r.error + '\n'); return 1 }
    process.stdout.write(buildReviewBrief({
      contract: r.contract, baseSha: r.baseSha, headSha: r.headSha, changedPaths: r.changedPaths,
    }) + '\n')
    return 0
  }

  if (cmd === 'decide') {
    if (!args.task || !args.result) { process.stderr.write(USAGE); return 2 }
    const toolFailures = []
    let contract = null
    let baseSha = null
    let headSha = null
    let mechanical = []
    let governance = []

    if (!args.head) {
      toolFailures.push('no --head given, so there is no commit identity to decide against')
    } else {
      const r = await resolveReview(args.task, args.head)
      if (r.error) {
        toolFailures.push(r.error)
      } else {
        ({ contract, baseSha, headSha } = r)
        mechanical = mechanicalFindings({ contract, changedPaths: r.changedPaths })
        governance = governanceBaseFindings({ derivedBase: baseSha, requestedBase: args.base })
      }
    }

    let result = null
    try {
      result = await readJson(args.result, 'review result')
    } catch (err) {
      toolFailures.push(err.message)
    }

    const identity = identityFindings({ result, baseSha, headSha })

    // Integrity evidence is required for an approval, so its absence is not a
    // skipped optional step — it is the decision's own reason to refuse.
    const integrityEvidenceProvided = Boolean(args.before && args.after)
    let integrity = []
    if (integrityEvidenceProvided) {
      try {
        integrity = reviewIntegrityFindings(
          await readJson(args.before, 'before snapshot'),
          await readJson(args.after, 'after snapshot'),
          { headSha },
        )
      } catch (err) {
        toolFailures.push(err.message)
      }
    }

    const decision = decideVerdict({
      contract, result, mechanical, integrity, identity, governance,
      toolFailures, integrityEvidenceProvided,
    })
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

export { snapshotWorktree, resolveSha, gitIn, resolveReview, main }
