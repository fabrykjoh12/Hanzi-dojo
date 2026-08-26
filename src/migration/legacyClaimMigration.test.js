import { describe, it, expect } from 'vitest'
import {
  CLASS, matchesSeedFingerprint, looksLikeInheritedStability, classifyCard,
  provenanceFor, conversionPatch, orderedHistory, isReplayable, buildMigrationPlan,
} from './legacyClaimMigration'
import { replayCard, describeReplay } from './legacyClaimReplay'
import { isPriorKnown, isMastered, isLearned, MASTERY_STABILITY_DAYS } from '../knowledgeState'

const CREATED = '2026-07-28T10:00:00.000Z'
// The oldest review_log in the database. Provenance can only be proven for
// cards born after it, so the classifier now requires it explicitly.
const EPOCH = '2026-07-01T00:00:00.000Z'

// The exact shape production holds 594 of.
const seeded = (over = {}) => ({
  id: 'c-seed', user_id: 'u1', vocab_id: 'v1', created_at: CREATED,
  state: 'review', reps: 0, lapses: 0, stability: 21, difficulty: 5,
  learned: true, is_easy: false, elapsed_days: 0, scheduled_days: 0,
  last_review: CREATED, due_at: CREATED,
  ...over,
})

// Seeded, then genuinely answered the same day: difficulty moved, stability
// did not (a review at ~100% retrievability tells FSRS nothing).
const reviewedSeed = (over = {}) => seeded({
  id: 'c-rev', reps: 1, difficulty: 6.666, ...over,
})

const genuine = (over = {}) => ({
  id: 'c-real', user_id: 'u1', vocab_id: 'v9', created_at: CREATED,
  state: 'review', reps: 2, lapses: 1, stability: 44.2, difficulty: 5.1,
  learned: true, is_easy: false, elapsed_days: 30, scheduled_days: 30,
  last_review: '2026-08-01T10:00:00.000Z', due_at: '2026-09-01T10:00:00.000Z',
  ...over,
})

const log = (grade, day, previous_state = 'review') => ({
  grade, previous_state,
  reviewed_at: '2026-08-' + String(day).padStart(2, '0') + 'T10:00:00.000Z',
})
// A genuine card's history ALWAYS opens with a `new ->` transition, and its
// reps match its log count. Both are what the provenance rule reads.
const genuineHistory = n => Array.from({ length: n }, (_, i) =>
  log(2, i + 1, i === 0 ? 'new' : 'review'))

describe('the seed fingerprint is the full shape, not a loose stability check', () => {
  it('matches the production shape exactly', () => {
    expect(matchesSeedFingerprint(seeded())).toBe(true)
  })

  // The collision the design flagged: FSRS columns were added with DEFAULT 0,
  // so a pre-FSRS review card reads reps 0 — but stability 0, never 21.
  it('does NOT match a pre-FSRS legacy card', () => {
    expect(matchesSeedFingerprint(seeded({ stability: 0, difficulty: 0, learned: true }))).toBe(false)
  })

  it('does NOT match once a real review has landed', () => {
    expect(matchesSeedFingerprint(reviewedSeed())).toBe(false)
  })

  it('does not match a genuine card, or junk', () => {
    expect(matchesSeedFingerprint(genuine())).toBe(false)
    expect(matchesSeedFingerprint(null)).toBe(false)
    expect(matchesSeedFingerprint({})).toBe(false)
  })

  it('rejects a near-miss on any single field', () => {
    expect(matchesSeedFingerprint(seeded({ difficulty: 4.9 }))).toBe(false)
    expect(matchesSeedFingerprint(seeded({ stability: 20.9 }))).toBe(false)
    expect(matchesSeedFingerprint(seeded({ state: 'learning' }))).toBe(false)
    expect(matchesSeedFingerprint(seeded({ is_easy: true }))).toBe(false)
    expect(matchesSeedFingerprint(seeded({ elapsed_days: 3 }))).toBe(false)
  })
})

describe('classifyCard', () => {
  it('an untouched claim with no history converts', () => {
    expect(classifyCard(seeded(), [], { loggingEpoch: EPOCH })).toBe(CLASS.UNTOUCHED_CLAIM)
    expect(classifyCard(seeded(), undefined, { loggingEpoch: EPOCH })).toBe(CLASS.UNTOUCHED_CLAIM)
  })

  it('a reviewed seed with history is replayed', () => {
    expect(classifyCard(reviewedSeed(), [log(2, 1)], { loggingEpoch: EPOCH })).toBe(CLASS.REVIEWED_SEED)
  })

  it('a reviewed seed with NO history is excluded, never guessed at', () => {
    // reps that no logged grade wrote: excluded as foreign-written rather than
    // guessed at. Conservative in the safe direction — we never rebuild it.
    expect(classifyCard(reviewedSeed(), [], { loggingEpoch: EPOCH })).toBe(CLASS.FOREIGN_WRITTEN)
  })

  it('the untouched fingerprint WITH history is a contradiction, so ambiguous', () => {
    expect(classifyCard(seeded(), [log(2, 1)], { loggingEpoch: EPOCH })).toBe(CLASS.AMBIGUOUS)
  })

  it('leaves genuine cards alone', () => {
    expect(classifyCard(genuine(), genuineHistory(2), { loggingEpoch: EPOCH })).toBe(CLASS.GENUINE)
    // Even with its stability sitting exactly on the mastery threshold — the
    // old fingerprint's false positive — a recorded `new ->` start wins.
    expect(classifyCard(genuine({ stability: 21 }), genuineHistory(2), { loggingEpoch: EPOCH })).toBe(CLASS.GENUINE)
    expect(looksLikeInheritedStability(genuine())).toBe(false)
  })
})

describe('conversionPatch strips every fabricated field', () => {
  const patch = conversionPatch(seeded())

  it('produces an inert claim', () => {
    const after = { ...seeded(), ...patch }
    expect(after.state).toBe('new')
    expect(after.stability).toBeNull()
    expect(after.difficulty).toBeNull()
    expect(after.last_review).toBeNull()
    expect(after.reps).toBe(0)
    expect(after.learned).toBe(false)
    expect(isPriorKnown(after)).toBe(true)
    expect(isMastered(after)).toBe(false)
    expect(isLearned(after)).toBe(false)
  })

  it('dates the claim to when the row was created', () => {
    expect(patch.prior_known_at).toBe(CREATED)
    expect(patch.verified_at).toBeNull()
  })

  it('is honest about not knowing the original source', () => {
    expect(patch.prior_source).toBe('legacy_claim')
    expect(provenanceFor(seeded(), { u1: 'placement' })).toBe('placement')
    expect(provenanceFor(seeded(), { other: 'paste' })).toBe('legacy_claim')
  })
})

describe('replay safety gates', () => {
  it('orders history oldest-first regardless of input order', () => {
    const out = orderedHistory([log(2, 9), log(0, 1), log(3, 5)])
    expect(out.map(l => l.reviewed_at.slice(8, 10))).toEqual(['01', '05', '09'])
  })

  it('drops entries missing a grade or a timestamp', () => {
    expect(orderedHistory([{ grade: 2 }, { reviewed_at: 'x' }, log(2, 1)])).toHaveLength(1)
  })

  it('refuses to replay an empty or malformed history', () => {
    expect(isReplayable([])).toBe(false)
    expect(isReplayable(null)).toBe(false)
    expect(isReplayable([{ grade: 9, reviewed_at: '2026-08-01T00:00:00Z' }])).toBe(false)
    expect(isReplayable([{ grade: 2, reviewed_at: 'not-a-date' }])).toBe(false)
  })

  it('accepts a well-formed history', () => {
    expect(isReplayable([log(0, 1), log(2, 3)])).toBe(true)
  })
})

describe('replayCard rebuilds honest state from real reviews', () => {
  it('produces FSRS state derived only from the real grades', () => {
    const out = replayCard([log(3, 1), log(2, 9)])
    expect(out).not.toBeNull()
    expect(out.updates.reps).toBe(2)              // exactly the reviews that happened
    expect(out.steps).toHaveLength(2)
    expect(out.updates.stability).not.toBe(MASTERY_STABILITY_DAYS) // the fabricated value is gone
    expect(out.updates.last_review).toBeTruthy()
  })

  it('a single same-day review does NOT come back as mastered', () => {
    // This is the whole point: today these 51 rows read as mastered on one
    // same-day answer, because they inherited stability 21.
    const before = reviewedSeed()
    expect(isMastered(before)).toBe(true)

    const out = replayCard([log(2, 1)])
    const after = { ...before, ...out.updates }
    expect(out.updates.reps).toBe(1)
    expect(isMastered(after)).toBe(false)
  })

  it('marks the card verified at its first real review', () => {
    const out = replayCard([log(2, 1), log(2, 20)])
    expect(out.updates.verified_at).toBe(log(2, 1).reviewed_at)
  })

  it('a failed review is preserved as a lapse, not smoothed away', () => {
    const passOnly = replayCard([log(3, 1), log(3, 20)])
    const withFail = replayCard([log(3, 1), log(0, 20)])
    expect(withFail.updates.lapses).toBeGreaterThan(passOnly.updates.lapses)
  })

  it('is deterministic — the same history always yields the same state', () => {
    const a = replayCard([log(3, 1), log(2, 9), log(2, 20)])
    const b = replayCard([log(3, 1), log(2, 9), log(2, 20)])
    expect(a.updates).toEqual(b.updates)
  })

  it('restores the clock even though it grades at historical times', () => {
    const before = Date.now()
    replayCard([log(2, 1)])
    expect(Date.now()).toBeGreaterThanOrEqual(before)
    expect(new Date().getFullYear()).toBeGreaterThanOrEqual(2026)
  })

  it('returns null rather than guessing when there is nothing to replay', () => {
    expect(replayCard([])).toBeNull()
    expect(replayCard(null)).toBeNull()
  })

  it('describes the change for the dry-run report', () => {
    const out = replayCard([log(2, 1)])
    const line = describeReplay(reviewedSeed(), out)
    expect(line).toContain('S=21')
    expect(line).toContain('->')
    expect(line).toContain('1 real review')
  })
})

describe('buildMigrationPlan over a production-shaped fixture', () => {
  // Mirrors the live census taken 2026-08-25 under the provenance classifier:
  // 588 untouched seeds, 207 reviewed seeds (158 of which the OLD fingerprints
  // had already lost), 37 foreign-written import rows, pre-logging strays, and
  // genuine cards that must not be touched.
  const cards = [
    ...Array.from({ length: 588 }, (_, i) => seeded({ id: 'seed-' + i, vocab_id: 'v' + i })),
    // Reviewed seeds, with current stability scattered anywhere a real grade
    // could have taken it — the classifier must not care.
    ...Array.from({ length: 207 }, (_, i) => seeded({
      id: 'rev-' + i, vocab_id: 'r' + i, reps: 1,
      stability: [21, 50.9865, 137.4, 2.1][i % 4], difficulty: 6.666,
    })),
    // Import/restore: reps written by something other than grading.
    ...Array.from({ length: 37 }, (_, i) => seeded({
      id: 'imp-' + i, vocab_id: 'i' + i, reps: 3, stability: 12.3 + i, difficulty: 7.2,
    })),
    // Born before review_logs existed — unprovable either way.
    ...Array.from({ length: 68 }, (_, i) => seeded({
      id: 'old-' + i, vocab_id: 'o' + i, created_at: '2026-06-09T13:10:47.417Z',
    })),
    // In a scheduler state, no history, but not the fabricated shape.
    seeded({ id: 'amb-1', stability: 9.4, difficulty: 6.1 }),
    seeded({ id: 'amb-2', stability: 3.3, difficulty: 4.6 }),
    ...Array.from({ length: 100 }, (_, i) => genuine({ id: 'real-' + i, vocab_id: 'g' + i })),
  ]
  const logsByCardId = {}
  for (let i = 0; i < 207; i += 1) logsByCardId['rev-' + i] = [log(1, 25)]
  for (let i = 0; i < 100; i += 1) logsByCardId['real-' + i] = genuineHistory(2)

  const plan = buildMigrationPlan({ cards, logsByCardId, loggingEpoch: EPOCH })

  it('classifies every row into exactly one class', () => {
    expect(plan.counts.conversions).toBe(588)
    expect(plan.counts.replays).toBe(207)
    expect(plan.counts.foreign_written).toBe(37)
    expect(plan.counts.pre_logging).toBe(68)
    expect(plan.counts.ambiguous).toBe(2)
    expect(plan.counts.genuine).toBe(100)
    const sum = plan.counts.conversions + plan.counts.replays + plan.counts.ambiguous
      + plan.counts.genuine + plan.counts.unstarted + plan.counts.pre_logging
      + plan.counts.foreign_written + plan.counts.claims
    expect(sum).toBe(plan.counts.total)
  })

  it('finds every reviewed seed regardless of where its stability drifted', () => {
    // The whole point: 3 of every 4 of these are invisible to `stability = 21`.
    const byOldFingerprint = cards.filter(c => c.stability === 21 && (c.reps || 0) >= 1).length
    expect(byOldFingerprint).toBeLessThan(plan.counts.replays)
    expect(plan.replays).toHaveLength(207)
  })

  it('never touches a genuine, imported or pre-logging card', () => {
    const touched = new Set([...plan.conversions, ...plan.replays].map(r => r.id))
    for (let i = 0; i < 100; i += 1) expect(touched.has('real-' + i)).toBe(false)
    for (let i = 0; i < 37; i += 1) expect(touched.has('imp-' + i)).toBe(false)
    for (let i = 0; i < 68; i += 1) expect(touched.has('old-' + i)).toBe(false)
  })

  it('reports why each ambiguous row could not be classified', () => {
    expect(plan.ambiguous).toHaveLength(2)
    plan.ambiguous.forEach(a => expect(a.reason).toBeTruthy())
  })

  it('corroborates the actionable rows against bulk creation cohorts', () => {
    // Every seed in this fixture shares one created_at, so it forms a single
    // demonstrated cohort with no unexplained stragglers.
    expect(plan.corroboration.demonstrated).toHaveLength(1)
    expect(plan.corroboration.outlierCards).toBe(0)
  })

  it('is idempotent: re-running over already-converted rows plans nothing', () => {
    const converted = plan.conversions.map(c => ({ ...seeded({ id: c.id }), ...c.patch }))
    const second = buildMigrationPlan({ cards: converted, logsByCardId: {}, loggingEpoch: EPOCH })
    expect(second.counts.conversions).toBe(0)
    expect(second.counts.replays).toBe(0)
    expect(second.counts.ambiguous).toBe(0)
    // Converted rows carry prior_known_at, so they are B2 claims now — out of
    // scope by construction, not merely "not selected".
    expect(second.counts.claims).toBe(588)
  })

  it('handles an empty database', () => {
    const empty = buildMigrationPlan({ cards: [], logsByCardId: {}, loggingEpoch: EPOCH })
    expect(empty.counts.total).toBe(0)
    expect(Object.values(empty.counts).every(v => v === 0)).toBe(true)
  })
})
