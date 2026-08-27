import { describe, it, expect } from 'vitest'
import fs from 'node:fs'

// The --redact public-output contract.
//
// Gate 3 Prepare runs in a PUBLIC repository, so its job log is readable by
// anyone on the internet. Run 33014914945 published, in that log:
//
//   * a per-account breakdown (account#1 … account#30) showing how many rows
//     each individual learner has and how they cluster
//   * a per-card replay preview with stability, difficulty and reps
//   * hundreds of exact per-cohort created_at timestamps, each describing when
//     a specific learner's rows were written
//
// None of it named a UUID, so the leak guard passed it — correctly, it guards
// identifiers. But pseudonymised row-level activity metadata is still
// per-person data, and aggregate counts are all a reviewer actually needs.
//
// These tests assert on the SOURCE of the redacted paths rather than a live
// run, because the script needs production credentials. They are paired with
// the leak-guard tests (identifiers) and the workflow guards (plumbing); this
// file covers the third thing: what redacted output is permitted to describe.

const SCRIPT = fs.readFileSync('migrate-legacy-claims.mjs', 'utf8')

// Everything that is printed unconditionally, i.e. reachable in --redact mode.
// Anything inside `if (!REDACT) { … }` is runner-local diagnostics and is
// deliberately excluded from this analysis.
function redactReachableSource(src) {
  const out = []
  const lines = src.split('\n')
  let depth = 0
  let inLocalBlock = false
  let blockDepth = 0
  for (const line of lines) {
    if (!inLocalBlock && /if \(!REDACT\) \{/.test(line)) {
      inLocalBlock = true
      blockDepth = depth
      depth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length
      continue
    }
    depth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length
    if (inLocalBlock) {
      if (depth <= blockDepth) inLocalBlock = false
      continue
    }
    out.push(line)
  }
  return out.join('\n')
}

const REDACT_REACHABLE = redactReachableSource(SCRIPT)

// Only console.log/error string content, so a comment mentioning "account#"
// cannot fail the test.
function printedStrings(src) {
  return [...src.matchAll(/console\.(?:log|error)\(([\s\S]*?)\)\n/g)].map(m => m[1]).join('\n')
}

const PRINTED = printedStrings(REDACT_REACHABLE)

describe('redacted output carries no pseudonymised row identities', () => {
  it('never prints account#N', () => {
    expect(PRINTED).not.toContain('account#')
    // And the helper that produced them is gone entirely.
    expect(SCRIPT).not.toContain("label('account'")
  })

  it('never prints card#N', () => {
    expect(PRINTED).not.toContain('card#')
    expect(SCRIPT).not.toContain("label('card'")
  })

  it('has no per-account breakdown loop reachable under redact', () => {
    expect(REDACT_REACHABLE).not.toContain('byUser')
  })

  it('has no replay preview reachable under redact', () => {
    expect(REDACT_REACHABLE).not.toContain('REPLAY PREVIEW')
    // describeReplay is imported at module scope; what matters is that no
    // reachable console call invokes it.
    expect(PRINTED).not.toContain('describeReplay')
  })

  it('does not print per-row ambiguous reasons under redact', () => {
    // The COUNT is fine; the per-card reason list is row-level.
    expect(REDACT_REACHABLE).not.toMatch(/for \(const a of plan\.ambiguous\)/)
  })
})

describe('cohort timestamps are positional under redact', () => {
  it('cohorts print through cohortRef, never a raw created_at', () => {
    expect(REDACT_REACHABLE).toContain('cohortRef(')
    expect(SCRIPT).toContain("REDACT ? 'cohort#' + (i + 1) : String(createdAt)")
  })

  it('the outlier list no longer prints per-cohort created_at values', () => {
    // The incident log contained hundreds of lines like
    //   2026-07-20T21:47:25.959Z  untouched 0  reviewed 1
    // each naming when one learner's row was written.
    expect(REDACT_REACHABLE).not.toMatch(/for \(const b of plan\.corroboration\.outliers\)/)
  })
})

describe('what redacted output IS allowed to say', () => {
  const allowed = [
    'CLASSIFICATION',
    'convert_legacy_claim',
    'replay_reviewed_seed',
    'partition total',
    'actionable entries',
    'AFFECTED ACCOUNTS',        // the COUNT only
    'demonstrated cohorts',
    'outlier cohorts',
    'unexplained rows',
  ]
  it('still reports the aggregates a reviewer needs to approve', () => {
    for (const phrase of allowed) expect(REDACT_REACHABLE).toContain(phrase)
  })

  it('reports affected accounts as a single number', () => {
    expect(REDACT_REACHABLE).toContain('new Set(manifest.entries.map(e => e.user_id)).size')
  })
})

describe('the apply path is aggregate-only under redact too', () => {
  it('stale rows are summarised by status, not listed', () => {
    expect(SCRIPT).toContain('per-row drift detail is runner-local only')
    expect(PRINTED).not.toContain('s2.id')
  })

  it('failures are counted, not itemised', () => {
    expect(SCRIPT).toContain('failure(s); details are runner-local only')
  })
})

describe('the corroboration veto message is itself safe to publish', () => {
  it('prints counts, never the offending rows', () => {
    const halt = SCRIPT.slice(SCRIPT.indexOf('function haltIfUncorroborated'))
      .slice(0, SCRIPT.slice(SCRIPT.indexOf('function haltIfUncorroborated')).indexOf('\n}\n'))
    expect(halt).toContain('unexplained rows')
    expect(halt).toContain('outlier cohorts')
    expect(halt).not.toContain('.outliers)')     // no iteration over rows
    expect(halt).not.toContain('created_at')
  })
})
