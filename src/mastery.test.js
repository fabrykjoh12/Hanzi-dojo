import { describe, it, expect } from 'vitest'
import { isLearned, isMastered, countMastery, MASTERY_STABILITY_DAYS } from './mastery'

// These predicates now require a genuine observation (reps >= 1) on top of the
// state/stability conditions they always had, so that a prior-knowledge claim
// can never satisfy them. Every fixture below therefore carries `reps` — which
// is also what a real card always looks like: ts-fsrs increments reps on every
// grade, and there is no route into review state without one.

describe('isLearned', () => {
  it('is true once a genuinely reviewed card has graduated', () => {
    expect(isLearned({ reps: 1, learned: true })).toBe(true)
    expect(isLearned({ reps: 1, state: 'review' })).toBe(true)
    expect(isLearned({ reps: 3, state: 'relearning' })).toBe(true)
  })

  it('is false for new/learning cards and missing cards', () => {
    expect(isLearned({ reps: 0, state: 'new' })).toBe(false)
    expect(isLearned({ reps: 1, state: 'learning' })).toBe(false)
    expect(isLearned(null)).toBe(false)
  })

  // The regression this whole model exists to prevent: the old prior-knowledge
  // seed wrote learned:true / state:'review' with zero reps, and that counted.
  it('is false for a graduated-looking card that was never actually reviewed', () => {
    expect(isLearned({ reps: 0, learned: true, state: 'review' })).toBe(false)
  })
})

describe('isMastered', () => {
  it('requires stability at or above the threshold, on a reviewed card', () => {
    expect(isMastered({ reps: 1, stability: MASTERY_STABILITY_DAYS })).toBe(true)
    expect(isMastered({ reps: 1, stability: MASTERY_STABILITY_DAYS + 5 })).toBe(true)
    expect(isMastered({ reps: 1, stability: MASTERY_STABILITY_DAYS - 0.1 })).toBe(false)
    expect(isMastered({ reps: 1, stability: 0 })).toBe(false)
    expect(isMastered({})).toBe(false)
    expect(isMastered(null)).toBe(false)
  })

  it('is false at any stability when nothing was ever graded', () => {
    expect(isMastered({ reps: 0, stability: MASTERY_STABILITY_DAYS })).toBe(false)
    expect(isMastered({ reps: 0, stability: 9999 })).toBe(false)
  })
})

describe('countMastery', () => {
  it('counts learned and mastered and computes the fraction', () => {
    const cards = [
      { reps: 6, learned: true, stability: 30 },   // learned + mastered
      { reps: 2, state: 'review', stability: 10 }, // learned, not mastered
      { reps: 0, state: 'new', stability: 0 },     // neither
    ]
    const r = countMastery(cards, 4)
    expect(r.learnedCount).toBe(2)
    expect(r.masteredCount).toBe(1)
    expect(r.total).toBe(4)
    expect(r.masteredPct).toBeCloseTo(0.25)
  })

  it('reports claimed words separately instead of counting them as taught', () => {
    const cards = [
      { reps: 6, learned: true, stability: 30 },
      { reps: 0, state: 'new', prior_known_at: '2026-08-22T12:00:00.000Z' },
      { reps: 0, state: 'new', prior_known_at: '2026-08-22T12:00:00.000Z' },
    ]
    const r = countMastery(cards, 4)
    expect(r.masteredCount).toBe(1)
    expect(r.learnedCount).toBe(1)
    expect(r.priorKnownCount).toBe(2)
  })

  it('guards against divide-by-zero', () => {
    expect(countMastery([], 0).masteredPct).toBe(0)
  })
})
