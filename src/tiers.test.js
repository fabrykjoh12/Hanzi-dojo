import { describe, it, expect } from 'vitest'
import { resolveTiers } from './tiers'

describe('resolveTiers', () => {
  it('returns nothing when no levels are seeded', () => {
    expect(resolveTiers([])).toEqual([])
    expect(resolveTiers(null)).toEqual([])
  })

  it('offers only Beginner when a single level is seeded', () => {
    expect(resolveTiers([1])).toEqual([{ key: 'beginner', level: 1, test: false }])
  })

  it('offers Beginner + Professional with two seeded levels (no test for Beginner)', () => {
    expect(resolveTiers([1, 2])).toEqual([
      { key: 'beginner', level: 1, test: false },
      { key: 'professional', level: 2, test: true },
    ])
  })

  it('fills in Intermediate with three seeded levels', () => {
    expect(resolveTiers([1, 2, 3])).toEqual([
      { key: 'beginner', level: 1, test: false },
      { key: 'intermediate', level: 2, test: true },
      { key: 'professional', level: 3, test: true },
    ])
  })

  it('picks a middle level for Intermediate across a wide range', () => {
    const tiers = resolveTiers([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(tiers[0]).toEqual({ key: 'beginner', level: 1, test: false })
    expect(tiers[tiers.length - 1]).toEqual({ key: 'professional', level: 9, test: true })
    const inter = tiers.find(t => t.key === 'intermediate')
    expect(inter.level).toBeGreaterThan(1)
    expect(inter.level).toBeLessThan(9)
  })

  it('sorts and dedupes unordered input via the lowest/highest', () => {
    expect(resolveTiers([3, 1])).toEqual([
      { key: 'beginner', level: 1, test: false },
      { key: 'professional', level: 3, test: true },
    ])
  })
})
