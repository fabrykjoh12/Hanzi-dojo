import { describe, it, expect, vi } from 'vitest'

// xpService.js imports the Supabase client at module load; stub it so the pure
// computeAward helper can be tested in isolation (same pattern as streak.test).
vi.mock('./supabase', () => ({ supabase: {} }))

import { computeAward, MAX_FREEZES } from './xpService'

describe('computeAward', () => {
  it('adds XP without leveling when no boundary is crossed', () => {
    const res = computeAward(0, 10, 1)
    expect(res.newXp).toBe(10)
    expect(res.leveled).toBe(false)
    expect(res.freezes).toBe(1)
    expect(res.freezesEarned).toBe(0)
  })

  it('grants one streak freeze per level gained', () => {
    // Level 1 → 2 costs 250 XP.
    const res = computeAward(245, 10, 1)
    expect(res.newLevel).toBe(2)
    expect(res.leveled).toBe(true)
    expect(res.freezes).toBe(2)
    expect(res.freezesEarned).toBe(1)
  })

  it('caps freezes at MAX_FREEZES', () => {
    const res = computeAward(245, 10, MAX_FREEZES)
    expect(res.leveled).toBe(true)
    expect(res.freezes).toBe(MAX_FREEZES)
    expect(res.freezesEarned).toBe(0)
  })

  it('handles missing/negative inputs defensively', () => {
    const res = computeAward(undefined, 10, undefined)
    expect(res.newXp).toBe(10)
    expect(res.freezes).toBe(0)
    const res2 = computeAward(100, -5, 1)
    expect(res2.newXp).toBe(100)
  })
})
