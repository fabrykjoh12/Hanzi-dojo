import { describe, it, expect } from 'vitest'
import { daysToWords } from './onboardingGoal'

describe('daysToWords', () => {
  it('divides target by daily pace, rounding up', () => {
    expect(daysToWords(5, 100)).toBe(20)
    expect(daysToWords(10, 100)).toBe(10)
    expect(daysToWords(15, 100)).toBe(7)
  })
  it('never returns less than 1', () => {
    expect(daysToWords(200, 100)).toBe(1)
    expect(daysToWords(0, 100)).toBe(1)
  })
})
