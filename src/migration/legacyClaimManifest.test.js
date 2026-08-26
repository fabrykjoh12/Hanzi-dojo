import { describe, it, expect } from 'vitest'
import {
  ACTION, ENTRY_STATUS, MANIFEST_VERSION,
  buildManifest, checkEntry, preconditionOf, matchesPrecondition,
  matchesExpectedPost, replayInputHash, casPredicate,
} from './legacyClaimManifest'
import { replayCard } from './legacyClaimReplay'

const CREATED = '2026-07-28T10:00:00.000Z'
// The oldest review_log in the database. Provenance can only be proven for
// cards born after it, so the classifier now requires it explicitly.
const EPOCH = '2026-07-01T00:00:00.000Z'
const replayFor = (history) => replayCard(history)

const seeded = (over = {}) => ({
  id: 'c-seed', user_id: 'u1', vocab_id: 'v1', created_at: CREATED,
  state: 'review', reps: 0, lapses: 0, stability: 21, difficulty: 5,
  learned: true, is_easy: false, elapsed_days: 0, scheduled_days: 0,
  last_review: CREATED, due_at: CREATED,
  prior_known_at: null, prior_source: null, verified_at: null,
  ...over,
})
const reviewedSeed = (over = {}) => seeded({ id: 'c-rev', reps: 1, difficulty: 6.666, ...over })
const genuine = (over = {}) => seeded({
  id: 'c-real', reps: 2, lapses: 1, stability: 44.2, difficulty: 5.1, elapsed_days: 30, ...over,
})
// A genuine card's history opens with a `new ->` transition — the permanent
// evidence the provenance classifier reads.
const genuineHistory = () => [
  { grade: 2, previous_state: 'new', reviewed_at: '2026-08-01T10:00:00.000Z' },
  { grade: 2, previous_state: 'review', reviewed_at: '2026-08-20T10:00:00.000Z' },
]
const log = (grade, day) => ({ grade, reviewed_at: '2026-08-' + String(day).padStart(2, '0') + 'T10:00:00.000Z' })

describe('buildManifest', () => {
  const cards = [seeded(), reviewedSeed(), genuine(), seeded({ id: 'AMBIG-1', stability: 9.4, difficulty: 6.1 })]
  const logsByCardId = { 'c-rev': [log(1, 1)], 'c-real': genuineHistory() }
  const m = buildManifest({ cards, logsByCardId, replayFor, generatedAt: '2026-08-22T18:00:00.000Z' , loggingEpoch: EPOCH })

  it('is versioned and stamped', () => {
    expect(m.version).toBe(MANIFEST_VERSION)
    expect(m.generated_at).toBe('2026-08-22T18:00:00.000Z')
    expect(m.source).toBe('production')
  })

  it('emits one entry per actionable row, and only actionable rows', () => {
    expect(m.entries).toHaveLength(2)
    expect(m.entries.map(e => e.card_id).sort()).toEqual(['c-rev', 'c-seed'])
    expect(m.counts.convert_legacy_claim).toBe(1)
    expect(m.counts.replay_reviewed_seed).toBe(1)
  })

  // The rule, asserted directly: no ambiguous row may become an entry.
  it('NEVER puts an ambiguous row in the manifest — only its count', () => {
    expect(m.entries.some(e => e.card_id === 'AMBIG-1')).toBe(false)
    expect(m.counts.excluded_ambiguous).toBe(1)
    // Nothing anywhere in the manifest carries the ambiguous row's identity —
    // the count is a number, never a row.
    expect(JSON.stringify(m)).not.toContain('AMBIG-1')
    expect(typeof m.counts.excluded_ambiguous).toBe('number')
  })

  it('never puts a genuine card in the manifest', () => {
    expect(m.entries.some(e => e.card_id === 'c-real')).toBe(false)
    expect(m.counts.untouched_genuine).toBe(1)
  })

  it('records the full precondition for a convert entry', () => {
    const e = m.entries.find(x => x.action === ACTION.CONVERT)
    expect(e.precondition).toEqual({
      state: 'review', reps: 0, lapses: 0, stability: 21, difficulty: 5,
      elapsed_days: 0, learned: true, is_easy: false,
      prior_known_at: null, verified_at: null, created_at: CREATED,
    })
    expect(e.review_log_count).toBe(0)
    expect(e.expected_post.prior_source).toBe('legacy_claim')
    expect(e.expected_post.state).toBe('new')
    expect(e.expected_post.stability).toBeNull()
  })

  it('records the replay input, readably and as a digest', () => {
    const e = m.entries.find(x => x.action === ACTION.REPLAY)
    expect(e.review_log_count).toBe(1)
    expect(e.review_log_input).toEqual([{ grade: 1, reviewed_at: '2026-08-01T10:00:00.000Z' }])
    expect(e.replay_input_hash).toMatch(/^1:[0-9a-f]{64}$/)   // SHA-256
    expect(e.expected_post.reps).toBe(1)
    expect(e.expected_post.verified_at).toBe('2026-08-01T10:00:00.000Z')
  })

  it('is deterministic — same input, byte-identical manifest', () => {
    const again = buildManifest({ cards, logsByCardId, replayFor, generatedAt: '2026-08-22T18:00:00.000Z' , loggingEpoch: EPOCH })
    expect(JSON.stringify(again)).toBe(JSON.stringify(m))
  })

  it('handles an empty database', () => {
    const empty = buildManifest({ cards: [], logsByCardId: {}, replayFor, generatedAt: 'x', loggingEpoch: EPOCH })
    expect(empty.entries).toEqual([])
    expect(empty.counts.actionable).toBe(0)
  })
})

describe('replayInputHash', () => {
  it('changes when a grade changes', () => {
    expect(replayInputHash([log(1, 1)])).not.toBe(replayInputHash([log(2, 1)]))
  })
  it('changes when a timestamp changes', () => {
    expect(replayInputHash([log(1, 1)])).not.toBe(replayInputHash([log(1, 2)]))
  })
  it('changes when a review is ADDED', () => {
    expect(replayInputHash([log(1, 1)])).not.toBe(replayInputHash([log(1, 1), log(2, 5)]))
  })
  it('is order-independent in input but order-dependent in meaning', () => {
    // The same two reviews in either input order hash the same, because the
    // replay always sorts them oldest-first — that IS the input it consumes.
    expect(replayInputHash([log(1, 1), log(2, 5)])).toBe(replayInputHash([log(2, 5), log(1, 1)]))
    // But two histories with the grades swapped between the dates differ.
    expect(replayInputHash([log(1, 1), log(2, 5)])).not.toBe(replayInputHash([log(2, 1), log(1, 5)]))
  })
  it('encodes the count as a prefix', () => {
    expect(replayInputHash([]).startsWith('0:')).toBe(true)
    expect(replayInputHash([log(1, 1), log(2, 5)]).startsWith('2:')).toBe(true)
  })

  it('is a full SHA-256, not a truncated or non-cryptographic digest', () => {
    expect(replayInputHash([log(1, 1)]).split(':')[1]).toHaveLength(64)
    // Pinned vector: the empty history is SHA-256 of the empty string.
    expect(replayInputHash([])).toBe(
      '0:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })
})

// The CAS predicate is what makes the UPDATE itself conditional. It must
// contain only columns that are exactly comparable between Postgres and JSON.
describe('casPredicate', () => {
  const cards = [seeded()]
  const m = buildManifest({ cards, logsByCardId: {}, replayFor, generatedAt: 'g', loggingEpoch: EPOCH })
  const cas = casPredicate(m.entries[0])

  it('matches on the exactly-representable columns', () => {
    expect(cas.eq).toEqual({
      state: 'review', reps: 0, lapses: 0, elapsed_days: 0, learned: true, is_easy: false,
    })
    expect(cas.isNull.sort()).toEqual(['prior_known_at', 'verified_at'])
    expect(cas.notNull).toEqual([])
  })

  // The measured reason: extra_float_digits = 0 means a `real` column does not
  // survive a JSON round-trip (`difficulty = 6.666::real` matches zero rows),
  // and every created_at carries microseconds an ISO-ms normalisation truncates.
  it('EXCLUDES the lossy columns, which would make the CAS fail spuriously', () => {
    for (const lossy of ['stability', 'difficulty', 'created_at', 'last_review']) {
      expect(Object.keys(cas.eq)).not.toContain(lossy)
      expect(cas.isNull).not.toContain(lossy)
      expect(cas.notNull).not.toContain(lossy)
    }
  })

  // reps is the canary: grade_card always increments it, in the same
  // transaction as the review log, so no concurrent grade can slip past.
  it('always includes reps and state', () => {
    expect(cas.eq).toHaveProperty('reps')
    expect(cas.eq).toHaveProperty('state')
  })

  it('a row already carrying claim metadata produces no entry at all', () => {
    const already = buildManifest({
      loggingEpoch: EPOCH,
      cards: [seeded({ id: 'x', prior_known_at: CREATED, prior_source: 'legacy_claim' })],
      logsByCardId: {}, replayFor, generatedAt: 'g',
    })
    // It is not an untouched legacy row, so it is never proposed for conversion.
    expect(already.entries).toHaveLength(0)
  })
})

// (The bundle boundary itself — no browser-reachable file may import this
// tree — is enforced by src/tts/serverOnly.test.js, which owns that rule for
// every server-only directory.)

describe('checkEntry — the staleness gate', () => {
  const cards = [seeded(), reviewedSeed()]
  const logsByCardId = { 'c-rev': [log(1, 1)] }
  const m = buildManifest({ cards, logsByCardId, replayFor, generatedAt: 'g' , loggingEpoch: EPOCH })
  const convertEntry = m.entries.find(e => e.action === ACTION.CONVERT)
  const replayEntry = m.entries.find(e => e.action === ACTION.REPLAY)

  it('passes a row that has not moved', () => {
    expect(checkEntry(convertEntry, seeded(), []).status).toBe(ENTRY_STATUS.OK)
    expect(checkEntry(replayEntry, reviewedSeed(), [log(1, 1)]).status).toBe(ENTRY_STATUS.OK)
  })

  // The scenario the review named: a row classified as an untouched claim gets
  // a real review before apply. It must NOT be converted with the old action.
  it('refuses a claim that has since been genuinely reviewed', () => {
    const reviewedSince = seeded({ reps: 1, state: 'review', difficulty: 6.666 })
    const out = checkEntry(convertEntry, reviewedSince, [log(2, 20)])
    expect(out.status).toBe(ENTRY_STATUS.STALE_ROW)
    expect(out.reason).toContain('reps: 0 -> 1')
  })

  it('refuses a row whose stability moved', () => {
    const out = checkEntry(convertEntry, seeded({ stability: 30 }), [])
    expect(out.status).toBe(ENTRY_STATUS.STALE_ROW)
    expect(out.reason).toContain('stability')
  })

  it('refuses a row that already became a claim by some other route', () => {
    const out = checkEntry(convertEntry, seeded({ prior_known_at: CREATED }), [])
    expect(out.status).toBe(ENTRY_STATUS.STALE_ROW)
  })

  it('refuses a replay whose review history gained a review', () => {
    const out = checkEntry(replayEntry, reviewedSeed(), [log(1, 1), log(2, 20)])
    expect(out.status).toBe(ENTRY_STATUS.STALE_REPLAY_INPUT)
    expect(out.reason).toContain('review history changed')
  })

  it('refuses a replay whose grade was rewritten', () => {
    expect(checkEntry(replayEntry, reviewedSeed(), [log(3, 1)]).status).toBe(ENTRY_STATUS.STALE_REPLAY_INPUT)
  })

  it('refuses a replay whose timestamp moved', () => {
    expect(checkEntry(replayEntry, reviewedSeed(), [log(1, 2)]).status).toBe(ENTRY_STATUS.STALE_REPLAY_INPUT)
  })

  it('reports a vanished row rather than inventing one', () => {
    expect(checkEntry(convertEntry, null, []).status).toBe(ENTRY_STATUS.MISSING)
  })

  // Resume semantics: an interrupted run must continue, not re-apply or panic.
  it('reports an already-converted row as ALREADY_APPLIED, not stale', () => {
    const converted = {
      ...seeded(),
      state: 'new', learned: false, is_easy: false, stability: null, difficulty: null,
      last_review: null, reps: 0, lapses: 0,
      prior_known_at: CREATED, prior_source: 'legacy_claim', verified_at: null,
    }
    expect(checkEntry(convertEntry, converted, []).status).toBe(ENTRY_STATUS.ALREADY_APPLIED)
  })

  it('reports an already-replayed row as ALREADY_APPLIED', () => {
    const result = replayCard([log(1, 1)])
    const replayed = {
      ...reviewedSeed(),
      ...result.updates,
      prior_known_at: CREATED, prior_source: 'legacy_claim',
    }
    expect(checkEntry(replayEntry, replayed, [log(1, 1)]).status).toBe(ENTRY_STATUS.ALREADY_APPLIED)
  })
})

describe('precondition helpers', () => {
  it('normalises timestamps and numbers so formatting drift is not staleness', () => {
    const a = preconditionOf(seeded({ created_at: '2026-07-28T10:00:00Z' }))
    const b = preconditionOf(seeded({ created_at: '2026-07-28T10:00:00.000+00:00' }))
    expect(a.created_at).toBe(b.created_at)
  })

  it('treats a missing numeric as 0 and a missing timestamp as null', () => {
    const p = preconditionOf({ state: 'new' })
    expect(p.reps).toBe(0)
    expect(p.stability).toBeNull()
    expect(p.verified_at).toBeNull()
  })

  it('matchesPrecondition is exact across every recorded field', () => {
    const p = preconditionOf(seeded())
    expect(matchesPrecondition(seeded(), p)).toBe(true)
    for (const drift of [{ reps: 1 }, { state: 'learning' }, { learned: false }, { is_easy: true }, { elapsed_days: 1 }, { difficulty: 4.9 }]) {
      expect(matchesPrecondition(seeded(drift), p)).toBe(false)
    }
  })

  it('matchesExpectedPost tolerates float round-trip on stability', () => {
    const expected = { state: 'review', reps: 1, stability: 8.2956 }
    expect(matchesExpectedPost({ state: 'review', reps: 1, stability: 8.2956 }, expected)).toBe(true)
    expect(matchesExpectedPost({ state: 'review', reps: 1, stability: 8.2957 }, expected)).toBe(true)
    expect(matchesExpectedPost({ state: 'review', reps: 1, stability: 9.5 }, expected)).toBe(false)
  })
})

describe('a production-shaped manifest', () => {
  const cards = [
    ...Array.from({ length: 594 }, (_, i) => seeded({ id: 's' + i, vocab_id: 'v' + i })),
    ...Array.from({ length: 51 }, (_, i) => reviewedSeed({ id: 'r' + i, vocab_id: 'w' + i })),
    seeded({ id: 'AMBIG-1', stability: 9.4, difficulty: 6.1 }),
    seeded({ id: 'AMBIG-2', stability: 3.3, difficulty: 4.6 }),
  ]
  const logsByCardId = {}
  for (let i = 0; i < 51; i += 1) logsByCardId['r' + i] = [log(1, 1)]
  const m = buildManifest({ cards, logsByCardId, replayFor, generatedAt: 'g' , loggingEpoch: EPOCH })

  it('matches the reviewed classification', () => {
    expect(m.counts.convert_legacy_claim).toBe(594)
    expect(m.counts.replay_reviewed_seed).toBe(51)
    expect(m.counts.excluded_ambiguous).toBe(2)
    expect(m.counts.actionable).toBe(645)
  })

  it('carries no ambiguous identity anywhere', () => {
    const json = JSON.stringify(m)
    expect(json).not.toContain('AMBIG-1')
    expect(json).not.toContain('AMBIG-2')
  })

  it('every entry names one card and one action', () => {
    const ids = m.entries.map(e => e.card_id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const e of m.entries) {
      expect([ACTION.CONVERT, ACTION.REPLAY]).toContain(e.action)
      expect(e.user_id).toBeTruthy()
      expect(e.precondition).toBeTruthy()
      expect(e.expected_post).toBeTruthy()
    }
  })
})
