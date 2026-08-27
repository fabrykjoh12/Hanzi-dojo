import { describe, it, expect } from 'vitest'
import {
  CLASS, classifyCard, hasNewTransition, buildMigrationPlan, corroborateBatches, MIN_BULK_BATCH,
  actionableCards, actionableBreakdown, assertCorroborationSafe, CorroborationError,
} from './legacyClaimMigration'
import { replayCard } from './legacyClaimReplay'
import { buildManifest, checkBundleBinding } from './legacyClaimManifest'

// Regressions for the PROVENANCE classifier — the one that survives a legitimate
// grade landing on a fabricated seed.
//
// The old classifier keyed on mutable FSRS state: `state='review' AND reps=0`,
// or `stability=21 AND reps>=1`. Production proved that a single honest grade
// moves a seed out of BOTH, leaving it corrupted and permanently unreachable.
// A census found 158 rows that had already escaped that way.
//
// The rule here is history-based and monotonic: a genuine card's log chain
// begins with a `new ->` transition, and no later grade can erase that.

const EPOCH = '2026-07-02T10:59:25.501883Z'
const AFTER = '2026-07-28T22:29:28.804794Z'   // inside the complete-history era
const BEFORE = '2026-06-09T13:10:47.417172Z'  // older than any review_log

// The exact shape the old prior-knowledge writer inserted.
function seedRow(over = {}) {
  return {
    id: 'seed-1', user_id: 'u1', vocab_id: 'v1', created_at: AFTER,
    state: 'review', reps: 0, lapses: 0, stability: 21, difficulty: 5,
    elapsed_days: 0, scheduled_days: 7, interval_days: 0, learning_step: 0,
    learned: true, is_easy: false, last_review: AFTER, due_at: AFTER,
    prior_known_at: null, prior_source: null, verified_at: null,
    ...over,
  }
}

function log(over = {}) {
  return {
    id: 'l1', card_id: 'seed-1', grade: 2,
    previous_state: 'review', next_state: 'review',
    reviewed_at: '2026-08-25T16:54:56.402Z',
    ...over,
  }
}

const opts = { loggingEpoch: EPOCH }

describe('the provenance invariant', () => {
  it('a `new ->` transition anywhere marks the card genuine, permanently', () => {
    expect(hasNewTransition([log({ previous_state: 'review' })])).toBe(false)
    expect(hasNewTransition([
      log({ previous_state: 'new' }),
      log({ id: 'l2', previous_state: 'review' }),
    ])).toBe(true)
  })
})

describe('untouched fabricated seed → convert', () => {
  it('classifies as an untouched claim', () => {
    expect(classifyCard(seedRow(), [], opts)).toBe(CLASS.UNTOUCHED_CLAIM)
  })

  it('a row in a scheduler state that does NOT match the insert shape is ambiguous, not converted', () => {
    // Same provenance signals, different shape — we cannot prove it was the
    // fabricator that wrote it, so we refuse.
    expect(classifyCard(seedRow({ stability: 9.4, difficulty: 6.1 }), [], opts)).toBe(CLASS.AMBIGUOUS)
  })
})

describe('fabricated seed AFTER legitimate grades → replay (the escape case)', () => {
  it('one grade: still found, even though it left both old fingerprints', () => {
    // This is exactly what production did to 老师/同学/妈妈/房间/爱/先生:
    // reps 0 -> 1 and stability 21 -> 50.99 in one Hard grade.
    const escaped = seedRow({ reps: 1, stability: 50.9865, difficulty: 6.666 })
    expect(escaped.state === 'review' && escaped.reps === 0).toBe(false) // old convert fp: MISSED
    expect(escaped.stability === 21 && escaped.reps >= 1).toBe(false)    // old replay  fp: MISSED
    expect(classifyCard(escaped, [log({ grade: 1 })], opts)).toBe(CLASS.REVIEWED_SEED)
  })

  it('several grades and arbitrary current stability: still found', () => {
    const history = [
      log({ id: 'a', grade: 2, reviewed_at: '2026-08-01T09:00:00.000Z' }),
      log({ id: 'b', grade: 0, reviewed_at: '2026-08-09T09:00:00.000Z', previous_state: 'review', next_state: 'relearning' }),
      log({ id: 'c', grade: 3, reviewed_at: '2026-08-20T09:00:00.000Z', previous_state: 'relearning' }),
    ]
    const drifted = seedRow({ reps: 3, lapses: 1, stability: 137.42, difficulty: 8.9, state: 'review' })
    expect(classifyCard(drifted, history, opts)).toBe(CLASS.REVIEWED_SEED)
  })

  it('classification does not depend on current stability at all', () => {
    const history = [log({ grade: 1 })]
    for (const stability of [0.4, 21, 50.9865, 999]) {
      expect(classifyCard(seedRow({ reps: 1, stability }), history, opts)).toBe(CLASS.REVIEWED_SEED)
    }
  })
})

describe('genuine cards are never captured', () => {
  it('new -> learning card is ordinary', () => {
    const card = seedRow({ id: 'g1', state: 'learning', reps: 1, stability: 1.29, difficulty: 5.1 })
    expect(classifyCard(card, [log({ previous_state: 'new', next_state: 'learning' })], opts)).toBe(CLASS.GENUINE)
  })

  it('new -> review card that later reaches stability 21 is STILL ordinary', () => {
    // The old replay fingerprint would have grabbed this: reviewing at ~100%
    // retrievability leaves stability unchanged, so a genuine card can sit on 21.
    const card = seedRow({ id: 'g2', reps: 4, stability: 21, difficulty: 5 })
    const history = [
      log({ id: 'a', previous_state: 'new', next_state: 'review' }),
      log({ id: 'b', previous_state: 'review' }),
      log({ id: 'c', previous_state: 'review' }),
      log({ id: 'd', previous_state: 'review' }),
    ]
    expect(card.stability === 21 && card.reps >= 1).toBe(true) // old fp WOULD have matched
    expect(classifyCard(card, history, opts)).toBe(CLASS.GENUINE)
  })

  it('an unstarted card is untouched', () => {
    const card = seedRow({ id: 'u1', state: 'new', reps: 0, stability: 0, difficulty: 0, learned: false, last_review: null })
    expect(classifyCard(card, [], opts)).toBe(CLASS.UNSTARTED)
  })
})

describe('proven boundaries exclude what cannot be proven', () => {
  it('pre-review-log-era card is ambiguous, never legacy', () => {
    expect(classifyCard(seedRow({ created_at: BEFORE }), [], opts)).toBe(CLASS.PRE_LOGGING)
  })

  it('a card created exactly ON the epoch is still excluded', () => {
    expect(classifyCard(seedRow({ created_at: EPOCH }), [], opts)).toBe(CLASS.PRE_LOGGING)
  })

  it('without a logging epoch nothing is classified as legacy', () => {
    expect(classifyCard(seedRow(), [])).toBe(CLASS.AMBIGUOUS)
    expect(classifyCard(seedRow({ reps: 1 }), [log()])).toBe(CLASS.AMBIGUOUS)
  })

  it('imported card with reps > logs is excluded as foreign-written', () => {
    // Production's 2026-08-08 batch: 37 rows inserted WITH reps and real
    // historical last_review values, and zero logs. Real scheduling.
    const imported = seedRow({ id: 'i1', reps: 5, logs: 0, stability: 12.3, difficulty: 7.2, last_review: '2026-07-15T14:24:42.360Z' })
    expect(classifyCard(imported, [], opts)).toBe(CLASS.FOREIGN_WRITTEN)
  })

  it('the two old replay-fingerprint false positives are excluded', () => {
    // Imported rows that happen to sit at stability 21 with reps >= 1. The OLD
    // fingerprint matched them and would have replayed — destroying imported
    // scheduling. reps > logs excludes them.
    const falsePositive = seedRow({ id: 'fp', reps: 3, stability: 21, difficulty: 5 })
    expect(falsePositive.stability === 21 && falsePositive.reps >= 1).toBe(true)
    expect(classifyCard(falsePositive, [], opts)).toBe(CLASS.FOREIGN_WRITTEN)
  })

  it('reps and logs disagreeing in the other direction is ambiguous, not actionable', () => {
    const card = seedRow({ reps: 1 })
    expect(classifyCard(card, [log({ id: 'a' }), log({ id: 'b' })], opts)).toBe(CLASS.AMBIGUOUS)
  })
})

describe('a current B2 prior-known claim is never legacy', () => {
  it('an inert unverified claim is out of scope', () => {
    const claim = seedRow({
      id: 'c1', state: 'new', reps: 0, stability: null, difficulty: null,
      learned: false, last_review: null,
      prior_known_at: '2026-08-25T10:00:00.000Z', prior_source: 'placement', verified_at: null,
    })
    expect(classifyCard(claim, [], opts)).toBe(CLASS.CLAIM)
  })

  it('a verified claim is out of scope', () => {
    const verified = seedRow({
      id: 'c2', state: 'review', reps: 1,
      prior_known_at: '2026-08-25T10:00:00.000Z', prior_source: 'placement',
      verified_at: '2026-08-25T10:05:00.000Z',
    })
    expect(classifyCard(verified, [log({ grade: 3 })], opts)).toBe(CLASS.CLAIM)
  })

  it('a row this migration already converted is never re-converted', () => {
    const converted = seedRow({
      state: 'new', reps: 0, stability: null, difficulty: null, learned: false, last_review: null,
      prior_known_at: AFTER, prior_source: 'legacy_claim',
    })
    expect(classifyCard(converted, [], opts)).toBe(CLASS.CLAIM)
  })
})

describe('classification is invariant under a further legitimate grade', () => {
  it('a seed stays REVIEWED_SEED across censuses as grades accumulate', () => {
    // Census 1: untouched.
    const t0 = seedRow()
    expect(classifyCard(t0, [], opts)).toBe(CLASS.UNTOUCHED_CLAIM)

    // The learner grades it. Census 2 — the old classifier lost it here.
    const h1 = [log({ id: 'a', grade: 1, reviewed_at: '2026-08-25T16:54:56.402Z' })]
    const t1 = seedRow({ reps: 1, stability: 50.9865, difficulty: 6.666 })
    expect(classifyCard(t1, h1, opts)).toBe(CLASS.REVIEWED_SEED)

    // Grades again between two censuses. Census 3 — same answer.
    const h2 = [...h1, log({ id: 'b', grade: 2, reviewed_at: '2026-09-01T08:00:00.000Z' })]
    const t2 = seedRow({ reps: 2, stability: 88.1, difficulty: 6.2 })
    expect(classifyCard(t2, h2, opts)).toBe(CLASS.REVIEWED_SEED)

    // And again, into relearning — still the same class.
    const h3 = [...h2, log({ id: 'c', grade: 0, reviewed_at: '2026-09-10T08:00:00.000Z', next_state: 'relearning' })]
    const t3 = seedRow({ reps: 3, lapses: 1, state: 'relearning', stability: 2.1, difficulty: 8.4 })
    expect(classifyCard(t3, h3, opts)).toBe(CLASS.REVIEWED_SEED)
  })
})

describe('replay is determined by history, not by the current row', () => {
  it('two seeds with wildly different current state replay identically from the same history', () => {
    const history = [
      { grade: 2, reviewed_at: '2026-08-01T09:00:00.000Z' },
      { grade: 3, reviewed_at: '2026-08-12T09:00:00.000Z' },
    ]
    const a = replayCard(history)
    const b = replayCard(history)
    expect(a.updates).toEqual(b.updates)
    // Never inherits the fabricated 21.
    expect(a.updates.stability).not.toBe(21)
    expect(a.updates.reps).toBe(2)
  })

  it('does not manufacture an initial observation — reps equals the real grade count', () => {
    for (const n of [1, 2, 5]) {
      const history = Array.from({ length: n }, (_, i) => ({
        grade: 2, reviewed_at: new Date(Date.UTC(2026, 7, 1 + i * 3)).toISOString(),
      }))
      expect(replayCard(history).updates.reps).toBe(n)
    }
  })

  it('preserves every user grade, including a real lapse', () => {
    // Easy first, so the card is genuinely in `review` — FSRS only counts a
    // lapse when a REVIEW-state card is failed, not a learning-step miss.
    const history = [
      { grade: 3, reviewed_at: '2026-08-01T09:00:00.000Z' },
      { grade: 0, reviewed_at: '2026-08-10T09:00:00.000Z' },
      { grade: 2, reviewed_at: '2026-08-11T09:00:00.000Z' },
    ]
    const res = replayCard(history)
    expect(res.steps).toHaveLength(3)
    expect(res.steps.map(s => s.grade)).toEqual([3, 0, 2])
    expect(res.steps[0].state).toBe('review')
    expect(res.updates.lapses).toBeGreaterThanOrEqual(1)
  })
})

describe('plan-level behaviour', () => {
  const cards = [
    seedRow({ id: 's1' }),
    seedRow({ id: 's2' }),
    seedRow({ id: 'r1', reps: 1, stability: 50.9865 }),
    seedRow({ id: 'g1', reps: 1, stability: 3.2 }),
    seedRow({ id: 'p1', created_at: BEFORE }),
    seedRow({ id: 'f1', reps: 4 }),
  ]
  const logsByCardId = {
    r1: [log({ card_id: 'r1', grade: 1 })],
    g1: [log({ card_id: 'g1', previous_state: 'new' })],
  }
  const plan = buildMigrationPlan({ cards, logsByCardId, loggingEpoch: EPOCH })

  it('sorts every card into exactly one bucket', () => {
    const c = plan.counts
    expect(c.conversions + c.replays + c.ambiguous + c.genuine
      + c.unstarted + c.pre_logging + c.foreign_written + c.claims).toBe(cards.length)
  })

  it('produces the expected dispositions', () => {
    expect(plan.counts.conversions).toBe(2)
    expect(plan.counts.replays).toBe(1)
    expect(plan.counts.genuine).toBe(1)
    expect(plan.counts.pre_logging).toBe(1)
    expect(plan.counts.foreign_written).toBe(1)
  })

  it('records a human-readable reason on every actionable row', () => {
    for (const row of [...plan.conversions, ...plan.replays]) {
      expect(typeof row.reason).toBe('string')
      expect(row.reason.length).toBeGreaterThan(20)
    }
  })
})

describe('batch corroboration flags anything outside a demonstrated cohort', () => {
  it('a bulk cohort is demonstrated; a lone straggler is an outlier', () => {
    const classified = [
      ...Array.from({ length: MIN_BULK_BATCH + 2 }, (_, i) => ({
        id: 'b' + i, klass: CLASS.UNTOUCHED_CLAIM, created_at: AFTER,
      })),
      { id: 'lonely', klass: CLASS.REVIEWED_SEED, created_at: '2026-08-01T00:00:00.000Z' },
    ]
    const c = corroborateBatches(classified)
    expect(c.demonstrated).toHaveLength(1)
    expect(c.outliers).toHaveLength(1)
    expect(c.outlierCards).toBe(1)
  })

  it('excluded and genuine rows never appear in the corroboration', () => {
    const c = corroborateBatches([
      { id: 'x', klass: CLASS.GENUINE, created_at: AFTER },
      { id: 'y', klass: CLASS.FOREIGN_WRITTEN, created_at: AFTER },
      { id: 'z', klass: CLASS.PRE_LOGGING, created_at: BEFORE },
    ])
    expect(c.batches).toHaveLength(0)
  })
})

// ── SNAPSHOT COVERAGE ───────────────────────────────────────────────────────
//
// The pre-apply snapshot is the only sanctioned restore source. If it covers
// fewer rows than the manifest, a row can be modified that was never backed up
// — a silent hole in the rollback guarantee.
//
// This is not hypothetical. The snapshot originally carried its OWN predicate
// (`state='review' AND reps=0` OR `stability=21 AND reps>=1`). When the
// classifier moved to provenance the snapshot did not follow, so it would have
// omitted almost every reviewed seed — precisely the rows carrying real user
// grades, and so the ones most in need of a backup.
describe('snapshot coverage comes from the one shared classification', () => {
  const world = {
    cards: [
      seedRow({ id: 'untouched-1' }),
      seedRow({ id: 'untouched-2' }),
      // Escaped: mutated reps AND stability, invisible to both old fingerprints.
      seedRow({ id: 'escaped-1', reps: 1, stability: 50.9865, difficulty: 6.666 }),
      seedRow({ id: 'escaped-2', reps: 3, stability: 137.4, difficulty: 8.9 }),
      // Import that the OLD replay fingerprint matched: stability 21, reps >= 1.
      seedRow({ id: 'import-fp', reps: 3, stability: 21, difficulty: 5 }),
      seedRow({ id: 'import-other', reps: 5, stability: 12.3, difficulty: 7.2 }),
      seedRow({ id: 'genuine-1', reps: 2, stability: 44.2, difficulty: 5.1 }),
      seedRow({ id: 'prelog-1', created_at: BEFORE }),
      seedRow({
        id: 'b2claim-1', state: 'new', reps: 0, stability: null, difficulty: null,
        learned: false, last_review: null,
        prior_known_at: '2026-08-25T10:00:00.000Z', prior_source: 'placement',
      }),
    ],
    logsByCardId: {
      'escaped-1': [log({ grade: 1 })],
      'escaped-2': [
        log({ id: 'a', grade: 2, reviewed_at: '2026-08-01T09:00:00.000Z' }),
        log({ id: 'b', grade: 0, reviewed_at: '2026-08-09T09:00:00.000Z' }),
        log({ id: 'c', grade: 3, reviewed_at: '2026-08-20T09:00:00.000Z' }),
      ],
      'genuine-1': [
        log({ id: 'g1', previous_state: 'new', reviewed_at: '2026-08-01T09:00:00.000Z' }),
        log({ id: 'g2', previous_state: 'review', reviewed_at: '2026-08-20T09:00:00.000Z' }),
      ],
    },
    loggingEpoch: EPOCH,
  }
  const snapshotIds = actionableCards(world).map(c => c.id)

  it('includes an escaped reviewed seed whose stability and reps both moved', () => {
    // The bug: the old snapshot predicate matched neither of these.
    const oldPredicate = c => (c.state === 'review' && (c.reps || 0) === 0)
      || (c.stability === 21 && (c.reps || 0) >= 1)
    expect(oldPredicate(world.cards.find(c => c.id === 'escaped-1'))).toBe(false)
    expect(oldPredicate(world.cards.find(c => c.id === 'escaped-2'))).toBe(false)
    expect(snapshotIds).toContain('escaped-1')
    expect(snapshotIds).toContain('escaped-2')
  })

  it('includes untouched legacy seeds', () => {
    expect(snapshotIds).toContain('untouched-1')
    expect(snapshotIds).toContain('untouched-2')
  })

  it('excludes the imported old-fingerprint false positive', () => {
    // The old predicate WOULD have snapshotted (and the old manifest replayed)
    // this imported row. Provenance excludes it from both.
    expect(snapshotIds).not.toContain('import-fp')
    expect(snapshotIds).not.toContain('import-other')
  })

  it('excludes genuine, pre-logging and B2 claim rows', () => {
    expect(snapshotIds).not.toContain('genuine-1')
    expect(snapshotIds).not.toContain('prelog-1')
    expect(snapshotIds).not.toContain('b2claim-1')
  })

  it('snapshot rows EQUAL the manifest actionable rows over one frozen world', () => {
    const manifest = buildManifest({ ...world, replayFor: h => replayCard(h), generatedAt: 'frozen' })
    const manifestIds = manifest.entries.map(e => e.card_id).sort()
    expect(snapshotIds.slice().sort()).toEqual(manifestIds)
    // And nothing actionable is missing from either side.
    expect(manifestIds).toHaveLength(4)
  })

  it('the reported breakdown matches the rows actually captured', () => {
    const b = actionableBreakdown(world)
    expect(b.convert).toBe(2)
    expect(b.replay).toBe(2)
    expect(b.total).toBe(snapshotIds.length)
  })
})

// ── CORROBORATION IS A VETO, NOT A WARNING ──────────────────────────────────
//
// Gate 3 Prepare run 33014914945 printed "STOP and account for them before
// applying", listed hundreds of unexplained single-card cohorts, and still
// finished `success` — writing a manifest and uploading an Apply-compatible
// artifact. A warning that does not fail is a warning nobody is forced to obey.
describe('assertCorroborationSafe fails closed', () => {
  const cohort = (n, at) => Array.from({ length: n }, (_, i) => ({
    id: 'c' + at + i, klass: CLASS.UNTOUCHED_CLAIM, created_at: at,
  }))

  it('passes when every actionable row sits in a demonstrated cohort', () => {
    const plan = buildMigrationPlan({
      cards: Array.from({ length: MIN_BULK_BATCH + 5 }, (_, i) => seedRow({ id: 's' + i })),
      logsByCardId: {},
      loggingEpoch: EPOCH,
    })
    expect(plan.corroboration.outlierCards).toBe(0)
    expect(assertCorroborationSafe(plan)).toBe(true)
  })

  it('THROWS when even one actionable row is unexplained', () => {
    const classified = [
      ...cohort(MIN_BULK_BATCH + 2, AFTER),
      { id: 'stray', klass: CLASS.REVIEWED_SEED, created_at: '2026-08-02T00:00:00.000Z' },
    ]
    const plan = { corroboration: corroborateBatches(classified) }
    expect(plan.corroboration.outlierCards).toBe(1)
    expect(() => assertCorroborationSafe(plan)).toThrow(CorroborationError)
    expect(() => assertCorroborationSafe(plan)).toThrow(/outside any demonstrated bulk cohort/)
  })

  it('scales the refusal to the real incident shape', () => {
    // 30 accounts' worth of singleton cohorts, as run 33014914945 produced.
    const strays = Array.from({ length: 30 }, (_, i) => ({
      id: 'stray' + i, klass: CLASS.REVIEWED_SEED,
      created_at: new Date(Date.UTC(2026, 6, 1 + i)).toISOString(),
    }))
    const plan = { corroboration: corroborateBatches([...cohort(500, AFTER), ...strays]) }
    expect(plan.corroboration.outlierCards).toBe(30)
    expect(() => assertCorroborationSafe(plan)).toThrow(CorroborationError)
  })

  it('refuses a plan carrying no corroboration at all, rather than assuming safe', () => {
    expect(() => assertCorroborationSafe({})).toThrow(/carries none/)
    expect(() => assertCorroborationSafe(null)).toThrow(/carries none/)
  })

  it('the error carries the counts a reviewer needs, and no row identities', () => {
    const plan = { corroboration: corroborateBatches([
      ...cohort(MIN_BULK_BATCH + 1, AFTER),
      { id: 'secret-card-id', klass: CLASS.REVIEWED_SEED, created_at: '2026-08-03T00:00:00.000Z' },
    ]) }
    try {
      assertCorroborationSafe(plan)
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(CorroborationError)
      expect(err.message).not.toContain('secret-card-id')
      expect(err.corroboration.outlierCards).toBe(1)
    }
  })

  it('never changes a classification — it only vetoes the plan', () => {
    // Corroboration stays an independent check, not a classifier input.
    const card = seedRow({ id: 'lonely', created_at: '2026-08-07T00:00:00.000Z' })
    const plan = buildMigrationPlan({ cards: [card], logsByCardId: {}, loggingEpoch: EPOCH })
    expect(plan.counts.conversions).toBe(1)          // still classified
    expect(() => assertCorroborationSafe(plan)).toThrow()  // but vetoed
  })
})

// ── A MANIFEST FROM A SUPERSEDED PIN IS STRUCTURALLY UNUSABLE ───────────────
//
// Run 33014914945's bundle records migration_commit d0dcc51, the commit whose
// review-log query was broken. Once the pin moves past that commit, Apply's
// binding refuses it automatically — no one has to remember which run was
// poisoned.
describe('checkBundleBinding refuses a bundle from an older migration pin', () => {
  const POISONED = {
    kind: 'hanzi-dojo/gate3-prepare',
    migration_commit: 'd0dcc5171d048b603b8e9a5c05d1cebcef273870',
    prepare_run_id: '33014914945',
    manifest_sha256: 'b77e1432bcd2f02fc92a21b25a780baae36fef6c8c25fb380b1b5d5a6be7bd55',
  }
  const NEW_PIN = '1111111111111111111111111111111111111111'

  it('refuses run 33014914945 once the pin has moved on', () => {
    const res = checkBundleBinding({
      meta: POISONED,
      approvedSha: NEW_PIN,
      prepareRunId: POISONED.prepare_run_id,
      manifestSha256: POISONED.manifest_sha256,
    })
    expect(res.ok).toBe(false)
    expect(res.failures.join(' ')).toContain('migration_commit')
  })

  it('accepts only when all three agree', () => {
    const res = checkBundleBinding({
      meta: POISONED,
      approvedSha: POISONED.migration_commit,
      prepareRunId: POISONED.prepare_run_id,
      manifestSha256: POISONED.manifest_sha256,
    })
    expect(res.ok).toBe(true)
    expect(res.failures).toHaveLength(0)
  })

  it('catches a wrong run id and a wrong digest independently', () => {
    expect(checkBundleBinding({
      meta: POISONED, approvedSha: POISONED.migration_commit,
      prepareRunId: '99999999', manifestSha256: POISONED.manifest_sha256,
    }).failures.join(' ')).toContain('prepare_run_id')

    expect(checkBundleBinding({
      meta: POISONED, approvedSha: POISONED.migration_commit,
      prepareRunId: POISONED.prepare_run_id, manifestSha256: 'f'.repeat(64),
    }).failures.join(' ')).toContain('manifest_sha256')
  })

  it('reports every mismatch at once, not just the first', () => {
    const res = checkBundleBinding({
      meta: POISONED, approvedSha: NEW_PIN, prepareRunId: '1', manifestSha256: '0'.repeat(64),
    })
    expect(res.failures).toHaveLength(3)
  })

  it('refuses missing or unreadable metadata rather than passing', () => {
    expect(checkBundleBinding({ meta: null, approvedSha: NEW_PIN }).ok).toBe(false)
    expect(checkBundleBinding({}).ok).toBe(false)
  })
})
