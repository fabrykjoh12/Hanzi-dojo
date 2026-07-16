import { describe, it, expect } from 'vitest'
import { nextLockedTier, CATEGORIES_CHINESE } from './storyTiers'

// Every tier has a story, so unlocking is purely about the learned-word count.
const ALL_TIERS = new Set([1, 2, 3])

describe('nextLockedTier', () => {
  it('points at the earliest still-locked tier that has stories', () => {
    // 40 learned words: tier 2 (100) is the next locked one that has stories.
    const next = nextLockedTier(CATEGORIES_CHINESE, 40, ALL_TIERS)
    expect(next.tier).toBe(2)
    expect(next.label).toBe('Growing')
    expect(next.remaining).toBe(60)
  })

  it('advances to the next tier once the earlier one is unlocked', () => {
    // 150 learned: tier 2 (100) is unlocked, so aim at tier 3 (200).
    const next = nextLockedTier(CATEGORIES_CHINESE, 150, ALL_TIERS)
    expect(next.tier).toBe(3)
    expect(next.remaining).toBe(50)
  })

  it('returns null when every tier with stories is already unlocked', () => {
    expect(nextLockedTier(CATEGORIES_CHINESE, 300, ALL_TIERS)).toBeNull()
    expect(nextLockedTier(CATEGORIES_CHINESE, 999, ALL_TIERS)).toBeNull()
  })

  it('skips a locked tier that has no stories yet, nudging toward one that does', () => {
    // Only tier 3 has stories seeded; at 40 words both 2 and 3 are locked, but
    // tier 2 leads nowhere — aim straight at the tier the learner can actually read.
    const next = nextLockedTier(CATEGORIES_CHINESE, 40, new Set([1, 3]))
    expect(next.tier).toBe(3)
    expect(next.remaining).toBe(160)
  })

  it('returns null when no locked tier has stories', () => {
    // Learner is between tier 1 and 2, but only tier 1 (already unlocked) has stories.
    expect(nextLockedTier(CATEGORIES_CHINESE, 40, new Set([1]))).toBeNull()
  })

  it('never reports a non-positive remaining, and clamps a negative learned count', () => {
    const next = nextLockedTier(CATEGORIES_CHINESE, -10, ALL_TIERS)
    // First locked tier past 0 words is tier 2 (100); remaining stays positive.
    expect(next.tier).toBe(2)
    expect(next.remaining).toBeGreaterThan(0)
  })

  it('accepts a plain array of tier numbers, not just a Set', () => {
    const next = nextLockedTier(CATEGORIES_CHINESE, 40, [1, 2, 3])
    expect(next.tier).toBe(2)
  })

  it('is defensive about bad input', () => {
    expect(nextLockedTier(null, 40, ALL_TIERS)).toBeNull()
    expect(nextLockedTier(CATEGORIES_CHINESE, 40, null)).toBeNull()
  })
})
