import { describe, it, expect } from 'vitest'
import { isLearned, isMastered, countMastery, MASTERY_STABILITY_DAYS } from './mastery'

describe('isLearned', () => {
  it('is true once a card has graduated (learned flag or review state)', () => {
    expect(isLearned({ learned: true })).toBe(true)
    expect(isLearned({ state: 'review' })).toBe(true)
    expect(isLearned({ state: 'relearning' })).toBe(true)
  })
  it('is false for new/learning cards and missing cards', () => {
    expect(isLearned({ state: 'new' })).toBe(false)
    expect(isLearned({ state: 'learning' })).toBe(false)
    expect(isLearned(null)).toBe(false)
  })
})

describe('isMastered', () => {
  it('requires stability at or above the threshold', () => {
    expect(isMastered({ stability: MASTERY_STABILITY_DAYS })).toBe(true)
    expect(isMastered({ stability: MASTERY_STABILITY_DAYS + 5 })).toBe(true)
    expect(isMastered({ stability: MASTERY_STABILITY_DAYS - 0.1 })).toBe(false)
    expect(isMastered({ stability: 0 })).toBe(false)
    expect(isMastered({})).toBe(false)
    expect(isMastered(null)).toBe(false)
  })
})

describe('countMastery', () => {
  it('counts learned and mastered and computes the fraction', () => {
    const cards = [
      { learned: true, stability: 30 }, // learned + mastered
      { state: 'review', stability: 10 }, // learned, not mastered
      { state: 'new', stability: 0 },    // neither
    ]
    const r = countMastery(cards, 4)
    expect(r.learnedCount).toBe(2)
    expect(r.masteredCount).toBe(1)
    expect(r.total).toBe(4)
    expect(r.masteredPct).toBeCloseTo(0.25)
  })
  it('guards against divide-by-zero', () => {
    expect(countMastery([], 0).masteredPct).toBe(0)
  })
})
