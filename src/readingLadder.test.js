import { describe, it, expect } from 'vitest'
import { readingLadder, nextRung } from './readingLadder'

const CATS = [
  { tier: 1, minWords: 0, label: 'First Steps' },
  { tier: 2, minWords: 100, label: 'Growing' },
  { tier: 3, minWords: 200, label: 'Fluent' },
]

describe('readingLadder', () => {
  it('marks the first rung current for a brand-new learner', () => {
    const l = readingLadder(0, CATS)
    expect(l.map(r => r.unlocked)).toEqual([true, false, false])
    expect(l.find(r => r.isCurrent).tier).toBe(1)
    expect(l[1].wordsToUnlock).toBe(100)
    expect(l[2].wordsToUnlock).toBe(200)
  })

  it('advances the current rung as words are learned', () => {
    const l = readingLadder(120, CATS)
    expect(l.map(r => r.unlocked)).toEqual([true, true, false])
    expect(l.find(r => r.isCurrent).tier).toBe(2)
    expect(l[2].wordsToUnlock).toBe(80)
  })

  it('unlocks every rung at the top', () => {
    const l = readingLadder(500, CATS)
    expect(l.every(r => r.unlocked)).toBe(true)
    expect(l.find(r => r.isCurrent).tier).toBe(3)
  })

  it('sorts rungs by minWords regardless of input order', () => {
    const shuffled = [CATS[2], CATS[0], CATS[1]]
    expect(readingLadder(0, shuffled).map(r => r.tier)).toEqual([1, 2, 3])
  })
})

describe('nextRung', () => {
  it('points at the next locked rung and the gap', () => {
    expect(nextRung(0, CATS)).toEqual({ label: 'Growing', wordsToGo: 100 })
    expect(nextRung(120, CATS)).toEqual({ label: 'Fluent', wordsToGo: 80 })
  })
  it('is null once the top is reached', () => {
    expect(nextRung(200, CATS)).toBe(null)
  })
})
