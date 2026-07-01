import { describe, it, expect } from 'vitest'
import { fluencyScore, fluencyRank } from './fluency'

describe('fluencyScore', () => {
  it('weights mastered words above merely learned ones', () => {
    expect(fluencyScore({ lifetimeMastered: 10, lifetimeLearned: 10 })).toBe(50) // 10*5
    expect(fluencyScore({ lifetimeMastered: 0, lifetimeLearned: 5 })).toBe(10)   // 5*2
    expect(fluencyScore({ lifetimeMastered: 4, lifetimeLearned: 10 })).toBe(4 * 5 + 6 * 2)
  })

  it('never counts mastered beyond learned as negative partial', () => {
    // Defensive: mastered should never exceed learned, but if it does, partial is clamped to 0.
    expect(fluencyScore({ lifetimeMastered: 10, lifetimeLearned: 3 })).toBe(50)
  })

  it('defaults missing fields to 0', () => {
    expect(fluencyScore({})).toBe(0)
  })
})

describe('fluencyRank', () => {
  it('names the rank for a score and points to the next', () => {
    expect(fluencyRank(0).name).toBe('Getting started')
    expect(fluencyRank(0).next.name).toBe('Beginner')
    expect(fluencyRank(500).name).toBe('Intermediate')
    expect(fluencyRank(500).next.name).toBe('Advanced')
  })

  it('computes progress toward the next rank', () => {
    // 500 is 100 into the 400→800 Intermediate band → 25%.
    expect(fluencyRank(500).pct).toBe(25)
  })

  it('caps out at the top rank with no next', () => {
    const top = fluencyRank(5000)
    expect(top.name).toBe('Fluent')
    expect(top.next).toBeNull()
    expect(top.pct).toBe(100)
  })
})
