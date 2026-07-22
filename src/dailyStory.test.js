import { describe, it, expect } from 'vitest'
import { unlockedStories, pickDailyStory } from './dailyStory'

const CATS = [{ tier: 1, minWords: 0 }, { tier: 2, minWords: 20 }, { tier: 3, minWords: 50 }]
const STORIES = [
  { id: 'a', tier: 1 }, { id: 'b', tier: 1 },
  { id: 'c', tier: 2 }, { id: 'd', tier: 3 },
]

describe('unlockedStories', () => {
  it('includes only tiers whose minWords the learner has reached', () => {
    expect(unlockedStories(STORIES, CATS, 0).map(s => s.id)).toEqual(['a', 'b'])
    expect(unlockedStories(STORIES, CATS, 20).map(s => s.id)).toEqual(['a', 'b', 'c'])
    expect(unlockedStories(STORIES, CATS, 50).map(s => s.id)).toEqual(['a', 'b', 'c', 'd'])
  })
  it('excludes stories in unknown tiers', () => {
    expect(unlockedStories([{ id: 'x', tier: 9 }], CATS, 999)).toEqual([])
  })
})

describe('pickDailyStory', () => {
  it('returns null when nothing is unlocked', () => {
    expect(pickDailyStory({ stories: STORIES, categories: CATS, learnedCount: -1, readIds: [], dateStr: '2026-07-19' })).toBe(null)
    expect(pickDailyStory({ stories: [], categories: CATS, learnedCount: 100, readIds: [], dateStr: '2026-07-19' })).toBe(null)
  })

  it('is deterministic for a given day', () => {
    const args = { stories: STORIES, categories: CATS, learnedCount: 50, readIds: [], dateStr: '2026-07-19' }
    const a = pickDailyStory(args)
    const b = pickDailyStory({ ...args })
    expect(a).toEqual(b)
    expect(a).not.toBeNull()
  })

  it('can pick a different story on a different day', () => {
    const base = { stories: STORIES, categories: CATS, learnedCount: 50, readIds: [] }
    const days = ['2026-07-19', '2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23']
    const picks = new Set(days.map(d => pickDailyStory({ ...base, dateStr: d }).id))
    expect(picks.size).toBeGreaterThan(1)
  })

  it('prefers unread stories', () => {
    // Only 'a' is unread among the unlocked set → it must be the pick every day.
    const args = { stories: STORIES, categories: CATS, learnedCount: 50, readIds: ['b', 'c', 'd'] }
    for (const d of ['2026-07-19', '2026-07-20', '2026-07-25']) {
      expect(pickDailyStory({ ...args, dateStr: d }).id).toBe('a')
    }
  })

  it('falls back to a re-read once everything is read', () => {
    const args = { stories: STORIES, categories: CATS, learnedCount: 50, readIds: ['a', 'b', 'c', 'd'], dateStr: '2026-07-19' }
    expect(pickDailyStory(args)).not.toBeNull()
  })

  it('accepts readIds as a Set', () => {
    const args = { stories: STORIES, categories: CATS, learnedCount: 50, readIds: new Set(['b', 'c', 'd']), dateStr: '2026-07-19' }
    expect(pickDailyStory(args).id).toBe('a')
  })
})

// The shelf is cumulative: stories come from every level the learner has
// reached, and each is gated by ITS OWN level's tiers and progress.
describe('per-level gating on a cumulative shelf', () => {
  const MIXED = [
    { id: 'l1t1', level: 1, tier: 1 },
    { id: 'l1t3', level: 1, tier: 3 },
    { id: 'l2t1', level: 2, tier: 1 },
    { id: 'l2t3', level: 2, tier: 3 },
  ]
  // Level 1 is fully unlocked (already passed); level 2 is where they are now.
  const tiersFor = () => [{ tier: 1, minWords: 0 }, { tier: 3, minWords: 200 }]
  const learnedFor = (level) => (level === 1 ? 999 : 10)

  it('unlocks a lower level’s top tier while the current level’s stays locked', () => {
    const open = unlockedStories(MIXED, null, 0, { tiersFor, learnedFor })
    expect(open.map(s => s.id)).toEqual(['l1t1', 'l1t3', 'l2t1'])
  })

  it('the daily pick can come from a level below the current one', () => {
    const picks = new Set(['2026-07-19', '2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23']
      .map(d => pickDailyStory({ stories: MIXED, readIds: [], dateStr: d, tiersFor, learnedFor }).id))
    expect([...picks].every(id => id !== 'l2t3')).toBe(true)
    expect(picks.size).toBeGreaterThan(1)
  })

  it('still honours the flat categories/learnedCount pair when no resolver is given', () => {
    expect(unlockedStories(MIXED, CATS, 0).map(s => s.id)).toEqual(['l1t1', 'l2t1'])
  })
})
