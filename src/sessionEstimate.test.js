import { describe, it, expect } from 'vitest'
import { sessionEstimateMinutes, sessionEstimateLabel, SECONDS_PER } from './sessionEstimate'

describe('sessionEstimateMinutes', () => {
  it('derives minutes from the actual queue composition', () => {
    // 10 new (400s) + 4 learning (60s) + 20 due (200s) = 660s ≈ 11 min
    expect(sessionEstimateMinutes({ newCount: 10, learnCount: 4, dueCount: 20 })).toBe(11)
  })

  it('never shows 0 minutes for a non-empty queue', () => {
    expect(sessionEstimateMinutes({ newCount: 0, learnCount: 0, dueCount: 1 })).toBe(1)
  })

  it('is 0 for an empty queue', () => {
    expect(sessionEstimateMinutes({})).toBe(0)
    expect(sessionEstimateMinutes({ newCount: 0, learnCount: 0, dueCount: 0 })).toBe(0)
  })

  it('ignores negative garbage', () => {
    expect(sessionEstimateMinutes({ newCount: -5, dueCount: 6 })).toBe(1)
  })

  it('weights new cards heaviest (they cost the most time)', () => {
    expect(SECONDS_PER.new).toBeGreaterThan(SECONDS_PER.learning)
    expect(SECONDS_PER.learning).toBeGreaterThan(SECONDS_PER.due)
  })
})

describe('sessionEstimateLabel', () => {
  it('formats as an approximation', () => {
    expect(sessionEstimateLabel({ dueCount: 30 })).toBe('~5 min')
  })
  it('is empty for an empty queue so the UI can hide it', () => {
    expect(sessionEstimateLabel({})).toBe('')
  })
})
