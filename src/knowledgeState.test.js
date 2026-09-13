import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import {
  KNOWLEDGE, MASTERY_STABILITY_DAYS, PRIOR_SOURCES, WRITTEN_PRIOR_SOURCES,
  hasGenuineObservation, hasPriorClaim,
  isPriorKnown, isVerified, isMastered, isLearned, isScheduledForLearning,
  countsForReading, countsForMastery, needsCalibration,
  knowledgeOf, countMastery, readingCoveragePct, priorKnownCardRow,
} from './knowledgeState'
import { isCardDue } from './srs'
import { dueLearningCards, dueReviewCards, weakCards } from './studyAvailability'

const NOW = Date.UTC(2026, 7, 22, 12, 0, 0)

// The row a claim is written as.
const claim = (source = 'placement') => priorKnownCardRow('u1', 'v1', source, NOW)

// A genuinely studied card, mid-review.
const studied = (over = {}) => ({
  user_id: 'u1', vocab_id: 'v2', state: 'review', learned: true, is_easy: false,
  stability: 12.3, difficulty: 5.4, reps: 4, lapses: 1,
  last_review: new Date(NOW - 5 * 86400000).toISOString(),
  due_at: new Date(NOW + 7 * 86400000).toISOString(),
  prior_known_at: null, prior_source: null, verified_at: null,
  ...over,
})

// The fabricated shape the old seed wrote — state 'review', mastery-grade
// stability, zero reps. Kept as a fixture because production still holds 594 of
// them and the predicates must refuse it on sight.
const fabricated = (over = {}) => ({
  user_id: 'u1', vocab_id: 'v3', state: 'review', learned: true, is_easy: false,
  stability: 21, difficulty: 5, reps: 0, lapses: 0,
  last_review: new Date(NOW).toISOString(),
  due_at: new Date(NOW).toISOString(),
  prior_known_at: null, prior_source: null, verified_at: null,
  ...over,
})

describe('priorKnownCardRow — the inert claim shape', () => {
  it('carries no scheduler state at all', () => {
    const row = claim()
    expect(row.state).toBe('new')
    expect(row.stability).toBeNull()
    expect(row.difficulty).toBeNull()
    expect(row.last_review).toBeNull()
    expect(row.reps).toBe(0)
    expect(row.lapses).toBe(0)
    expect(row.learned).toBe(false)
    expect(row.is_easy).toBe(false)
    expect(row.scheduled_days).toBe(0)
    expect(row.elapsed_days).toBe(0)
    expect(row.interval_days).toBe(0)
  })

  it('records provenance and leaves verification open', () => {
    const row = claim('paste')
    expect(row.prior_source).toBe('paste')
    expect(row.prior_known_at).toBe(new Date(NOW).toISOString())
    expect(row.verified_at).toBeNull()
  })

  it('only emits sources the database CHECK allows', () => {
    for (const source of PRIOR_SOURCES) {
      expect(PRIOR_SOURCES).toContain(priorKnownCardRow('u1', 'v1', source, NOW).prior_source)
    }
  })

  it('never writes ease_factor (dead SM-2 column, CLAUDE.md §10)', () => {
    expect(Object.keys(claim())).not.toContain('ease_factor')
  })
})

// The load-bearing proof: a claim must be invisible to every queue the app
// builds. These run the REAL predicates, not restatements of them.
describe('an inert claim enters no queue', () => {
  const now = new Date(NOW)
  // A genuinely due review sits alongside the claim, so these assertions prove
  // the claim is filtered out rather than the queue simply being empty.
  const dueToday = studied({ due_at: new Date(NOW).toISOString() })
  const deck = [claim(), dueToday]

  it('is never due, whatever due_at holds', () => {
    expect(isCardDue(claim(), now)).toBe(false)
    // Even back-dated a year, a 'new' card is not due.
    const backdated = { ...claim(), due_at: new Date(NOW - 365 * 86400000).toISOString() }
    expect(isCardDue(backdated, now)).toBe(false)
  })

  it('is excluded from the due-review queue', () => {
    expect(dueReviewCards(deck, now).map(c => c.vocab_id)).toEqual(['v2'])
  })

  it('is excluded from the learning queue', () => {
    expect(dueLearningCards(deck, now)).toEqual([])
  })

  it('is excluded from the weak-words drill', () => {
    expect(weakCards(deck)).toEqual([])
  })

  // newItems/newCount both filter on card-row EXISTENCE, so a claim suppresses
  // the word as a new card by simply being there. This mirrors that logic.
  it('suppresses the word from the new-card queue by existing', () => {
    const startedVocabIds = new Set(deck.map(c => c.vocab_id))
    const levelVocab = [{ id: 'v1' }, { id: 'v2' }, { id: 'v4' }]
    const offered = levelVocab.filter(v => !startedVocabIds.has(v.id))
    expect(offered.map(v => v.id)).toEqual(['v4'])
  })
})

describe('the four knowledge states', () => {
  it('classifies each shape', () => {
    expect(knowledgeOf(null)).toBe(KNOWLEDGE.UNKNOWN)
    expect(knowledgeOf(undefined)).toBe(KNOWLEDGE.UNKNOWN)
    expect(knowledgeOf(claim())).toBe(KNOWLEDGE.PRIOR_KNOWN)
    expect(knowledgeOf(studied({ stability: 3 }))).toBe(KNOWLEDGE.VERIFIED)
    expect(knowledgeOf(studied({ stability: 40 }))).toBe(KNOWLEDGE.MASTERED)
  })

  it('treats a brand-new unclaimed card as unknown, not prior-known', () => {
    const fresh = { state: 'new', reps: 0, stability: null, prior_known_at: null }
    expect(knowledgeOf(fresh)).toBe(KNOWLEDGE.UNKNOWN)
    expect(isPriorKnown(fresh)).toBe(false)
  })
})

describe('a claim never counts as taught', () => {
  it('is not learned and not mastered', () => {
    expect(isLearned(claim())).toBe(false)
    expect(isMastered(claim())).toBe(false)
    expect(countsForMastery(claim())).toBe(false)
  })

  it('is not in the scheduler at all', () => {
    expect(isScheduledForLearning(claim())).toBe(false)
    expect(isVerified(claim())).toBe(false)
    expect(hasGenuineObservation(claim())).toBe(false)
  })

  it('DOES count as known for reading', () => {
    expect(countsForReading(claim())).toBe(true)
    expect(needsCalibration(claim())).toBe(true)
  })
})

// Production still holds 594 rows in the old fabricated shape. Until the data
// migration converts them, the predicates alone must already refuse to read
// mastery out of them.
describe('the legacy fabricated shape is refused on sight', () => {
  it('stability 21 with zero reps is NOT mastered', () => {
    expect(fabricated().stability).toBe(MASTERY_STABILITY_DAYS)
    expect(isMastered(fabricated())).toBe(false)
    expect(countsForMastery(fabricated())).toBe(false)
  })

  it('learned=true with zero reps is NOT learned', () => {
    expect(fabricated().learned).toBe(true)
    expect(isLearned(fabricated())).toBe(false)
  })

  it('becomes genuinely mastered only once a real review lands', () => {
    // Same stability, but now with an actual graded review behind it.
    expect(isMastered(fabricated({ reps: 1 }))).toBe(true)
  })
})

describe('genuine cards are unaffected', () => {
  it('a reviewed card is learned, verified and scheduled', () => {
    expect(isLearned(studied())).toBe(true)
    expect(isVerified(studied())).toBe(true)
    expect(isScheduledForLearning(studied())).toBe(true)
    expect(countsForReading(studied())).toBe(true)
  })

  it('mastery still turns on the stability threshold', () => {
    expect(isMastered(studied({ stability: MASTERY_STABILITY_DAYS - 0.1 }))).toBe(false)
    expect(isMastered(studied({ stability: MASTERY_STABILITY_DAYS }))).toBe(true)
  })

  it('a card in learning state is verified but not yet learned', () => {
    const learning = studied({ state: 'learning', learned: false, stability: 2.3, reps: 1 })
    expect(isVerified(learning)).toBe(true)
    expect(isLearned(learning)).toBe(false)
    expect(countsForReading(learning)).toBe(false)
  })

  it('a relearning card stays learned', () => {
    expect(isLearned(studied({ state: 'relearning', learned: false }))).toBe(true)
  })

  it('a card verified after a claim keeps its provenance and counts fully', () => {
    const verifiedClaim = {
      ...claim(),
      state: 'review', reps: 1, stability: 8.3, difficulty: 4.9,
      last_review: new Date(NOW).toISOString(), learned: true,
      verified_at: new Date(NOW).toISOString(),
    }
    expect(hasPriorClaim(verifiedClaim)).toBe(true)   // provenance survives
    expect(isPriorKnown(verifiedClaim)).toBe(false)   // but it is no longer a claim
    expect(isVerified(verifiedClaim)).toBe(true)
    expect(isLearned(verifiedClaim)).toBe(true)
    expect(knowledgeOf(verifiedClaim)).toBe(KNOWLEDGE.VERIFIED)
  })
})

describe('countMastery', () => {
  it('separates taught from claimed', () => {
    const cards = [
      claim(), claim('paste'), claim('checklist'),
      studied({ stability: 40 }),
      studied({ stability: 3 }),
      fabricated(),
    ]
    const out = countMastery(cards, 10)
    expect(out.masteredCount).toBe(1)      // only the genuinely stable one
    expect(out.learnedCount).toBe(2)       // the two real review cards
    expect(out.priorKnownCount).toBe(3)    // reported, never conflated
    expect(out.masteredPct).toBeCloseTo(0.1)
  })

  it('a level claimed end to end yields zero mastery', () => {
    const claims = Array.from({ length: 453 }, (_, i) => priorKnownCardRow('u1', 'v' + i, 'checklist', NOW))
    const out = countMastery(claims, 453)
    expect(out.masteredCount).toBe(0)
    expect(out.learnedCount).toBe(0)
    expect(out.masteredPct).toBe(0)
    expect(out.priorKnownCount).toBe(453)
  })

  it('handles an empty deck', () => {
    expect(countMastery([], 0).masteredPct).toBe(0)
    expect(countMastery(null, 5).masteredCount).toBe(0)
  })
})

describe('readingCoveragePct — the fast-path aggregate', () => {
  it('counts claims and genuine reading knowledge together', () => {
    const cards = [claim(), claim('paste'), studied({ stability: 40 }), studied({ state: 'learning', learned: false, reps: 1 })]
    // 2 claims + 1 mastered count; the learning card does not.
    expect(readingCoveragePct(cards, 10)).toBeCloseTo(0.3)
  })

  it('is zero with no words', () => {
    expect(readingCoveragePct([], 0)).toBe(0)
  })
})

describe('PRIOR_SOURCES', () => {
  // FAB-30 finding 7. The array reads as "the sources a claim can have", and a
  // reader takes that to mean the values a live row can carry. It does not:
  // 'assumed_prerequisite' is written by nothing, and 'legacy_claim' is written
  // once, by a historical migration.
  it('matches the database constraint it documents', () => {
    // Read out of the migration rather than restated here. A hardcoded literal
    // fails only when someone edits PRIOR_SOURCES, which is the direction that
    // does not matter — the array exists to mirror the constraint, so the drift
    // worth catching is the constraint's.
    // The LAST migration that defines it, not one named here: a later
    // migration redefining cards_prior_source_check would otherwise leave this
    // spec green while PRIOR_SOURCES drifted from the live constraint.
    const dir = 'supabase/migrations'
    let check = null
    for (const name of readdirSync(dir).filter(n => n.endsWith('.sql')).sort()) {
      // Case-insensitive: SQL keywords are, and a migration written ADD
      // CONSTRAINT would otherwise be invisible here — leaving this spec green
      // against a definition two years old while the live constraint moved.
      const found = /add\s+constraint\s+cards_prior_source_check[\s\S]*?\)\s*\)/i.exec(readFileSync(dir + '/' + name, 'utf8'))
      if (found) check = found
    }
    expect(check, 'no migration declares cards_prior_source_check any more').not.toBeNull()
    const fromSql = [...check[0].matchAll(/'([a-z_]+)'/g)].map(m => m[1])
    expect(fromSql.length, 'the parse must find something').toBeGreaterThan(1)
    expect([...PRIOR_SOURCES].sort()).toEqual([...fromSql].sort())
  })

  it('separates what the constraint permits from what any code writes', () => {
    // Derived from the call sites, not restated. Asserting the literal against
    // the literal is a tautology that passes whatever the code does — and the
    // mutation that matters is exactly the one it could not see: a path that
    // starts writing 'legacy_claim' or 'assumed_prerequisite'.
    const written = new Set()
    for (const file of ['src/Onboarding.jsx', 'src/KnownWords.jsx', 'src/priorKnowledgeSeed.js']) {
      const code = readFileSync(file, 'utf8').split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
      for (const m of code.matchAll(/source:\s*(?:[^,\n]*\?\s*)?'([a-z_]+)'(?:\s*:\s*'([a-z_]+)')?/g)) {
        if (m[1]) written.add(m[1])
        if (m[2]) written.add(m[2])
      }
    }
    expect(written.size, 'no prior_source literal found at any call site').toBeGreaterThan(0)
    expect([...WRITTEN_PRIOR_SOURCES].sort()).toEqual([...written].sort())

    for (const source of WRITTEN_PRIOR_SOURCES) {
      expect(PRIOR_SOURCES, source + ' must be permitted by the constraint too').toContain(source)
    }
    // The two the subset deliberately excludes, and why each is excluded.
    expect(WRITTEN_PRIOR_SOURCES, 'reserved, never built').not.toContain('assumed_prerequisite')
    expect(WRITTEN_PRIOR_SOURCES, 'historical: one migration, not a live path').not.toContain('legacy_claim')
  })
})
