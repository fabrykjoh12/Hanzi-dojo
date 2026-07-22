import { describe, it, expect } from 'vitest'
import {
  nextLockedTier, CATEGORIES_CHINESE, CATEGORIES_JAPANESE, CATEGORIES_RUSSIAN,
  tiersFor, readingGateCount, learnedByLevel, storyLevels,
} from './storyTiers'

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

describe('tiersFor — the pinned Chinese contract (docs/PM-BOARD.md)', () => {
  const expected = {
    1: [[0, '1–100'], [100, '1–200'], [200, '1–300']],
    2: [[0, '1–66'], [80, '1–132'], [130, '1–198']],
    3: [[0, '1–170'], [110, '1–340'], [220, '1–500']],
    4: [[0, '1–170'], [110, '1–340'], [220, '1–500']],
    5: [[0, '1–170'], [110, '1–340'], [220, '1–500']],
    6: [[0, '1–170'], [110, '1–340'], [220, '1–500']],
  }

  for (const level of [1, 2, 3, 4, 5, 6]) {
    it('matches the pinned thresholds and word ranges at HSK ' + level, () => {
      const tiers = tiersFor('chinese', level)
      expect(tiers.map(t => [t.minWords, t.wordRange])).toEqual(expected[level])
      expect(tiers.map(t => t.tier)).toEqual([1, 2, 3])
    })
  }

  it('names the level in every tier description, never HSK 1 by default', () => {
    const three = tiersFor('chinese', 3)
    expect(three[0].description).toContain('170')
    for (const t of three) expect(t.description).toContain('HSK 3')
    // The old bug: HSK 2's copy claimed HSK 1's word counts.
    for (const t of tiersFor('chinese', 2)) {
      expect(t.description).toContain('HSK 2')
      expect(t.description).not.toContain('HSK 1')
    }
  })

  it('opens tier 1 at 0 learned words for every level', () => {
    for (const level of [1, 2, 3, 4, 5, 6, 7, 99]) {
      expect(tiersFor('chinese', level)[0].minWords).toBe(0)
    }
    for (const level of [1, 2, 3, 6]) {
      expect(tiersFor('japanese', level)[0].minWords).toBe(0)
      expect(tiersFor('russian', level)[0].minWords).toBe(0)
    }
  })

  // The monotonicity guardrail: levels 1 and 2 already have published stories,
  // so no learner may find a shelf newly locked. (Levels 3–6 are new gates over
  // content that doesn't exist yet, so the rule doesn't bind there.)
  it('never raises a threshold for a level that has stories today (HSK 1 and 2)', () => {
    const today = [0, 100, 200]
    for (const level of [1, 2]) {
      tiersFor('chinese', level).forEach((t, i) => {
        expect(t.minWords).toBeLessThanOrEqual(today[i])
      })
    }
  })
})

describe('tiersFor — fallback behaviour', () => {
  it('falls back to the language default for a level with no explicit entry', () => {
    const jp = tiersFor('japanese', 3)
    expect(jp.map(t => t.minWords)).toEqual(CATEGORIES_JAPANESE.map(t => t.minWords))
    const ru = tiersFor('russian', 2)
    expect(ru.map(t => t.minWords)).toEqual(CATEGORIES_RUSSIAN.map(t => t.minWords))
    // Chinese beyond the seeded band falls back to the Chinese default.
    expect(tiersFor('chinese', 9).map(t => t.minWords)).toEqual(CATEGORIES_CHINESE.map(t => t.minWords))
  })

  it('labels the level even when falling back', () => {
    expect(tiersFor('japanese', 3)[0].description).toContain('N4')
    expect(tiersFor('russian', 2)[0].description).toContain('A2')
  })

  it('keeps Russian’s open-ended top tier', () => {
    const ru = tiersFor('russian', 1)
    expect(ru[2].wordRange).toBe('all')
    expect(ru[2].description).toContain('A1')
  })

  it('falls back to Chinese for an unknown language, and to generic copy with no level', () => {
    expect(tiersFor('klingon', 1).map(t => t.minWords)).toEqual([0, 100, 200])
    expect(tiersFor('chinese', null).map(t => t.description)).toEqual(CATEGORIES_CHINESE.map(t => t.description))
  })

  it('returns the same (shared, never-mutated) instance for a repeated lookup', () => {
    expect(tiersFor('chinese', 3)).toBe(tiersFor('chinese', 3))
  })
})

describe('learnedByLevel', () => {
  const VOCAB = [
    { id: 'v1', level: 1 }, { id: 'v2', level: 1 }, { id: 'v3', level: 1 },
    { id: 'v4', level: 2 }, { id: 'v5', level: 2 },
    { id: 'v6', level: null },
  ]

  it('counts learned cards per level', () => {
    const cards = [
      { vocab_id: 'v1', learned: true }, { vocab_id: 'v2', state: 'review' },
      { vocab_id: 'v3', state: 'new' },
      { vocab_id: 'v4', state: 'relearning' },
    ]
    expect(learnedByLevel(VOCAB, cards)).toEqual({ 1: 2, 2: 1 })
  })

  it('ignores unlevelled (dictionary-sourced) words and unknown vocab ids', () => {
    const cards = [{ vocab_id: 'v6', learned: true }, { vocab_id: 'zzz', learned: true }]
    expect(learnedByLevel(VOCAB, cards)).toEqual({})
  })

  it('is defensive about missing input', () => {
    expect(learnedByLevel(null, null)).toEqual({})
  })
})

describe('readingGateCount', () => {
  const tiers = tiersFor('chinese', 1) // 0 / 100 / 200

  it('uses real progress at the current level', () => {
    expect(readingGateCount({ level: 2, currentLevel: 2, learnedAtLevel: 57, tiers })).toBe(57)
  })

  it('treats an already-passed level as complete, so its stories stay open', () => {
    // A learner placed straight into HSK 3 never studied HSK 1 — its stories
    // must not be re-locked behind a count they will never rebuild.
    expect(readingGateCount({ level: 1, currentLevel: 3, learnedAtLevel: 0, tiers }))
      .toBeGreaterThanOrEqual(200)
  })

  it('never reports less than the learner’s real progress', () => {
    expect(readingGateCount({ level: 1, currentLevel: 3, learnedAtLevel: 999, tiers })).toBe(999)
  })

  it('clamps a negative or missing count', () => {
    expect(readingGateCount({ level: 1, currentLevel: 1, learnedAtLevel: -5, tiers })).toBe(0)
    expect(readingGateCount({ level: 1, currentLevel: 1, tiers })).toBe(0)
  })
})

describe('storyLevels — cumulative selection', () => {
  const shelf = [
    { id: 'a', level: 1 }, { id: 'b', level: 1 },
    { id: 'c', level: 2 }, { id: 'd', level: 3 },
  ]

  it('puts the current level first, then the rest descending', () => {
    expect(storyLevels(shelf, 3)).toEqual([3, 2, 1])
  })

  it('drops levels above the current one (stale snapshot / replayed level)', () => {
    expect(storyLevels(shelf, 2)).toEqual([2, 1])
    expect(storyLevels(shelf, 1)).toEqual([1])
  })

  it('omits the current level when it has no stories of its own', () => {
    // Exactly the HSK 3–6 situation in production: vocabulary but no stories.
    expect(storyLevels([{ id: 'a', level: 1 }, { id: 'b', level: 2 }], 4)).toEqual([2, 1])
  })

  it('returns nothing when there are no stories anywhere', () => {
    expect(storyLevels([], 3)).toEqual([])
    expect(storyLevels(null, 3)).toEqual([])
  })

  it('treats a level-less row (old cached snapshot) as the current level', () => {
    expect(storyLevels([{ id: 'a' }], 2)).toEqual([2])
  })
})
