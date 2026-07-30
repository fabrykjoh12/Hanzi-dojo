import { describe, it, expect } from 'vitest'
import { shelvesForTier, tierInfo, defaultTier, splitShelf } from './storyShelves'

// A tier table shaped like the real one (storyTiers): tier 1 is open from day
// one, tiers 2 and 3 gate on learned words at the story's OWN level.
const TIERS = [
  { tier: 1, minWords: 0, label: 'First Steps' },
  { tier: 2, minWords: 100, label: 'Growing' },
  { tier: 3, minWords: 200, label: 'Fluent' },
]
const tiersAt = () => TIERS

const story = (id, level, tier, over) => ({
  id, level, tier, story_number: 1, title: id, presentation: 'paced', ...over,
})

describe('shelvesForTier', () => {
  const stories = [
    story('a', 2, 1), story('b', 2, 1), story('c', 1, 3), story('d', 1, 1),
  ]
  // Level 1 is behind the learner, so it counts as complete (readingGateCount).
  const learnedAt = (lvl) => (lvl === 2 ? 40 : 999)

  it('lists the current level first, then the rest descending', () => {
    const shelves = shelvesForTier({ stories, tier: 1, currentLevel: 2, tiersAt, learnedAt })
    expect(shelves.map(s => s.level)).toEqual([2, 1])
  })

  it('gates each level on its own progress', () => {
    const shelves = shelvesForTier({ stories, tier: 3, currentLevel: 2, tiersAt, learnedAt })
    // Tier 3 is locked at HSK 2 (40 < 200) but open at HSK 1, which is behind.
    expect(shelves.find(s => s.level === 2).unlocked).toBe(false)
    expect(shelves.find(s => s.level === 1).unlocked).toBe(true)
  })

  it('keeps the current level as an empty shelf, drops other empty ones', () => {
    const shelves = shelvesForTier({ stories, tier: 3, currentLevel: 2, tiersAt, learnedAt })
    // Level 2 has no tier-3 story but is kept so the tab can state its gap;
    // no other level contributes an empty shelf.
    expect(shelves.map(s => s.level)).toEqual([2, 1])
    expect(shelves.find(s => s.level === 2).stories).toEqual([])
  })

  it('drops a tier the level’s table does not define', () => {
    const sparse = () => [{ tier: 1, minWords: 0 }]
    expect(shelvesForTier({ stories, tier: 3, currentLevel: 2, tiersAt: sparse, learnedAt })).toEqual([])
  })

  it('treats a story with no level as belonging to the current level', () => {
    const shelves = shelvesForTier({
      stories: [story('x', null, 1)], tier: 1, currentLevel: 2, tiersAt, learnedAt,
    })
    expect(shelves.map(s => s.level)).toEqual([2])
    expect(shelves[0].stories.map(s => s.id)).toEqual(['x'])
  })

  it('is safe on empty input', () => {
    expect(shelvesForTier({ stories: [], tier: 1, currentLevel: 1, tiersAt, learnedAt })).toEqual([])
    expect(shelvesForTier()).toEqual([])
  })
})

describe('tierInfo', () => {
  const shelf = (level, minWords, learned, count) => ({
    level, spec: { tier: 1, minWords }, learned,
    unlocked: learned >= minWords,
    stories: Array.from({ length: count }, (_, i) => story(level + '-' + i, level, 1)),
  })

  it('counts every readable story across levels', () => {
    const info = tierInfo([shelf(2, 0, 5, 3), shelf(1, 0, 999, 2)], 2)
    expect(info).toEqual({ locked: false, comingSoon: false, storyCount: 5 })
  })

  it('one open shelf is enough — a locked level above it never locks the tab', () => {
    expect(tierInfo([shelf(2, 100, 5, 4), shelf(1, 100, 999, 1)], 2).locked).toBe(false)
  })

  it('locks on the SMALLEST closable gap among shelves that have stories', () => {
    const info = tierInfo([shelf(2, 100, 5, 1), shelf(1, 100, 60, 2)], 2)
    expect(info.locked).toBe(true)
    expect(info.remaining).toBe(40)
  })

  it('ignores an empty shelf when choosing the gap to quote', () => {
    // Level 2 is 95 words away but has nothing written; level 1 has stories.
    const info = tierInfo([shelf(2, 100, 5, 0), shelf(1, 100, 60, 2)], 2)
    expect(info.remaining).toBe(40)
  })

  it('falls back to the current level’s own gate when nothing has stories', () => {
    const info = tierInfo([shelf(2, 100, 70, 0)], 2)
    expect(info).toEqual({ locked: true, remaining: 30, comingSoon: false, storyCount: 0 })
  })

  it('never quotes a gap below 1', () => {
    // A shelf whose gate is met but which the caller still marked locked.
    const odd = { level: 2, spec: { minWords: 100 }, learned: 100, unlocked: false, stories: [story('x', 2, 1)] }
    expect(tierInfo([odd], 2).remaining).toBe(1)
  })

  it('unlocked but empty is "coming soon", not a lock', () => {
    expect(tierInfo([shelf(2, 0, 5, 0)], 2)).toEqual({ locked: false, comingSoon: true, storyCount: 0 })
    expect(tierInfo([], 2).comingSoon).toBe(true)
  })
})

describe('defaultTier', () => {
  const open = { locked: false, comingSoon: false }
  const locked = { locked: true, comingSoon: false }
  const soon = { locked: false, comingSoon: true }

  it('opens the first tier with something readable', () => {
    const info = { 1: locked, 2: open, 3: open }
    expect(defaultTier(TIERS, t => info[t])).toBe(2)
  })
  it('skips a tier that is unlocked but empty', () => {
    const info = { 1: soon, 2: soon, 3: open }
    expect(defaultTier(TIERS, t => info[t])).toBe(3)
  })
  it('falls back to the first tier when nothing is readable', () => {
    expect(defaultTier(TIERS, () => locked)).toBe(1)
  })
  it('is safe with no tiers at all', () => {
    expect(defaultTier([], () => open)).toBe(1)
    expect(defaultTier(null, () => open)).toBe(1)
  })
})

describe('splitShelf', () => {
  it('separates a numbered multi-chapter run from single stories', () => {
    // Reading order matters: a chapter number of 1 opens a new arc, and an
    // UNNUMBERED title joins whatever arc is open — so a standalone story only
    // stands alone when nothing numbered precedes it.
    const { seriesArcs, looseStories, practice } = splitShelf([
      story('one', 1, 1, { title: '老朋友' }),
      story('s1', 1, 1, { title: '1. 下雪了' }),
      story('s2', 1, 1, { title: '2. 下雪了' }),
    ])
    expect(seriesArcs).toHaveLength(1)
    expect(seriesArcs[0].parts.map(p => p.id)).toEqual(['s1', 's2'])
    expect(looseStories.map(s => s.id)).toEqual(['one'])
    expect(practice).toEqual([])
  })

  it('a single numbered chapter is not a series', () => {
    const { seriesArcs, looseStories } = splitShelf([
      story('solo', 1, 1, { title: '第一话 · 我是新学生' }),
    ])
    expect(seriesArcs).toEqual([])
    expect(looseStories.map(s => s.id)).toEqual(['solo'])
  })

  it('pulls practice formats out of the narrative shelf', () => {
    const { seriesArcs, looseStories, practice } = splitShelf([
      story('read', 1, 1),
      story('chat', 1, 1, { presentation: 'chat' }),
      story('scene', 1, 1, { presentation: 'scene' }),
      story('reply', 1, 1, { interactions: { you: '小明' } }),
    ])
    expect(seriesArcs).toEqual([])
    expect(looseStories.map(s => s.id)).toEqual(['read'])
    expect(practice.map(s => s.id)).toEqual(['chat', 'scene', 'reply'])
  })

  it('keeps a manhua on the story shelf — it is narrative, not a drill', () => {
    const { looseStories, practice } = splitShelf([story('m', 1, 1, { presentation: 'manhua' })])
    expect(looseStories.map(s => s.id)).toEqual(['m'])
    expect(practice).toEqual([])
  })

  it('is safe on empty input', () => {
    expect(splitShelf([])).toEqual({ seriesArcs: [], looseStories: [], practice: [] })
    expect(splitShelf(null)).toEqual({ seriesArcs: [], looseStories: [], practice: [] })
  })
})
