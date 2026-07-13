import { describe, it, expect } from 'vitest'
import { isFirstRunSession, firstRunNewTarget, FIRST_RUN_NEW_CARDS } from './firstRun'

describe('isFirstRunSession', () => {
  it('is true for a brand-new account (zero cards) on a review session', () => {
    expect(isFirstRunSession({ mode: 'review', accountCardCount: 0 })).toBe(true)
    expect(isFirstRunSession({ accountCardCount: 0 })).toBe(true)   // mode defaults to review
  })
  it('is false when the account already has cards (returning user / track switch)', () => {
    expect(isFirstRunSession({ mode: 'review', accountCardCount: 1 })).toBe(false)
    expect(isFirstRunSession({ mode: 'review', accountCardCount: 300 })).toBe(false)
  })
  it('is never a first run in weak mode, even with zero cards', () => {
    expect(isFirstRunSession({ mode: 'weak', accountCardCount: 0 })).toBe(false)
  })
  it('is false / safe when the count is unknown', () => {
    expect(isFirstRunSession({ mode: 'review' })).toBe(false)          // undefined ≠ 0
    expect(isFirstRunSession({ mode: 'review', accountCardCount: undefined })).toBe(false)
    expect(isFirstRunSession()).toBe(false)
  })
})

describe('firstRunNewTarget', () => {
  it('caps a first run at FIRST_RUN_NEW_CARDS regardless of the daily goal', () => {
    expect(firstRunNewTarget(true, 15)).toBe(FIRST_RUN_NEW_CARDS)
    expect(firstRunNewTarget(true, 10)).toBe(FIRST_RUN_NEW_CARDS)
    expect(FIRST_RUN_NEW_CARDS).toBe(5)
  })
  it('never exceeds what is actually remaining (short vocabulary fails safe)', () => {
    expect(firstRunNewTarget(true, 3)).toBe(3)
    expect(firstRunNewTarget(true, 0)).toBe(0)
  })
  it('returns the normal remaining goal for a returning user', () => {
    expect(firstRunNewTarget(false, 15)).toBe(15)
    expect(firstRunNewTarget(false, 8)).toBe(8)
  })
  it('clamps negatives / missing input to 0', () => {
    expect(firstRunNewTarget(false, -4)).toBe(0)
    expect(firstRunNewTarget(true, undefined)).toBe(0)
  })
})
