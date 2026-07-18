import { describe, it, expect } from 'vitest'
import {
  isReturningFromBreak, gentleReviewTarget, gentleReturnMessage,
  RETURN_BREAK_DAYS, GENTLE_REVIEW_CAP,
} from './gentleReturn'

describe('isReturningFromBreak', () => {
  const today = '2026-07-15'
  it('is false without a prior study day (brand-new user)', () => {
    expect(isReturningFromBreak(null, { today })).toBe(false)
    expect(isReturningFromBreak({}, { today })).toBe(false)
    expect(isReturningFromBreak({ last_studied_on: null }, { today })).toBe(false)
  })
  it('is false for a normal rhythm (0–2 days away)', () => {
    expect(isReturningFromBreak({ last_studied_on: '2026-07-15' }, { today })).toBe(false)
    expect(isReturningFromBreak({ last_studied_on: '2026-07-14' }, { today })).toBe(false)
    expect(isReturningFromBreak({ last_studied_on: '2026-07-13' }, { today })).toBe(false)
  })
  it('is true at or beyond the break threshold', () => {
    expect(isReturningFromBreak({ last_studied_on: '2026-07-12' }, { today })).toBe(true)  // 3 days
    expect(isReturningFromBreak({ last_studied_on: '2026-06-20' }, { today })).toBe(true)  // weeks
  })
  it('honors a custom threshold', () => {
    expect(isReturningFromBreak({ last_studied_on: '2026-07-13' }, { today, threshold: 2 })).toBe(true)
    expect(isReturningFromBreak({ last_studied_on: '2026-07-13' }, { today, threshold: 5 })).toBe(false)
  })
  it('uses a default break threshold of 3 days', () => {
    expect(RETURN_BREAK_DAYS).toBe(3)
  })
})

describe('gentleReviewTarget', () => {
  it('returns the full backlog when not returning', () => {
    expect(gentleReviewTarget({ returning: false, dueReviewCount: 300 })).toBe(300)
  })
  it('caps the backlog when returning from a break', () => {
    expect(gentleReviewTarget({ returning: true, dueReviewCount: 300 })).toBe(GENTLE_REVIEW_CAP)
  })
  it('never exceeds what is actually due', () => {
    expect(gentleReviewTarget({ returning: true, dueReviewCount: 8 })).toBe(8)
    expect(gentleReviewTarget({ returning: false, dueReviewCount: 8 })).toBe(8)
  })
  it('honors a custom cap and guards bad input', () => {
    expect(gentleReviewTarget({ returning: true, dueReviewCount: 50, cap: 10 })).toBe(10)
    expect(gentleReviewTarget({ returning: true, dueReviewCount: -5 })).toBe(0)
    expect(gentleReviewTarget({ returning: true, dueReviewCount: 50, cap: -1 })).toBe(0)
  })
})

describe('gentleReturnMessage', () => {
  it('welcomes back with the capped count', () => {
    expect(gentleReturnMessage(20)).toMatch(/Welcome back/)
    expect(gentleReturnMessage(20)).toContain('20 words')
  })
  it('singularizes one word', () => {
    expect(gentleReturnMessage(1)).toContain('1 word ready')
  })
  it('handles the all-caught-up case', () => {
    expect(gentleReturnMessage(0)).toMatch(/all caught up/i)
  })
})
