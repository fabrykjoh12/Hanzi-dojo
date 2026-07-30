import { describe, it, expect } from 'vitest'
import {
  scoreStories, storyLength, comfortBand, searchStories, sortEntries,
  shelfLevels, defaultShelfLevel, shelfSummary, SORT_OPTIONS, DEFAULT_SORT,
} from './storyLibrary'
import { calculateStoryReadability } from './storyReading'

const vocabMap = {
  今天: { id: 'v1', word: '今天', level: 1 },
  天气: { id: 'v2', word: '天气', level: 1 },
  很: { id: 'v3', word: '很', level: 1 },
  好: { id: 'v4', word: '好', level: 1 },
}
// v1/v2 are review cards (known), v3 is learning, v4 has no card (new).
const cards = {
  v1: { vocab_id: 'v1', state: 'review' },
  v2: { vocab_id: 'v2', state: 'review' },
  v3: { vocab_id: 'v3', state: 'learning' },
}

const story = (over) => ({
  id: 'x', level: 1, tier: 1, story_number: 1, title: 't', content: '今天天气很好。', ...over,
})

describe('scoreStories', () => {
  it('matches the canonical per-story readability exactly', () => {
    const s = story()
    const one = calculateStoryReadability({ content: s.content, vocabMap, cards, language: 'chinese' })
    const scores = scoreStories({ stories: [s], vocabMap, cards, language: 'chinese' })
    expect(scores.get('x').knownPct).toBe(one.knownPct)
    expect(scores.get('x').totalUnique).toBe(one.totalUnique)
    expect(scores.get('x').newCount).toBe(one.newCount)
  })

  it('skips rows with no content instead of scoring them 0%', () => {
    const scores = scoreStories({
      stories: [story(), story({ id: 'preview', content: null })],
      vocabMap, cards, language: 'chinese',
    })
    expect(scores.has('x')).toBe(true)
    expect(scores.has('preview')).toBe(false)
  })

  it('is safe on empty input', () => {
    expect(scoreStories().size).toBe(0)
    expect(scoreStories({ stories: [null], vocabMap }).size).toBe(0)
  })
})

describe('storyLength', () => {
  it('counts characters of text, not newlines', () => {
    expect(storyLength({ content: 'abc\ndef' })).toBe(6)
    expect(storyLength({})).toBe(0)
    expect(storyLength(null)).toBe(0)
  })
})

describe('comfortBand', () => {
  it('bands a known %', () => {
    expect(comfortBand(100).key).toBe('comfortable')
    expect(comfortBand(95).key).toBe('comfortable')
    expect(comfortBand(94).key).toBe('steady')
    expect(comfortBand(85).key).toBe('steady')
    expect(comfortBand(84).key).toBe('stretch')
    expect(comfortBand(70).key).toBe('stretch')
    expect(comfortBand(69).key).toBe('hard')
  })
  it('has an honest unknown state', () => {
    expect(comfortBand(null).key).toBe('unknown')
    expect(comfortBand(undefined).key).toBe('unknown')
  })
})

describe('searchStories', () => {
  const list = [
    { id: 'a', title: '面条儿', english_summary: 'A cold bowl of noodles' },
    { id: 'b', title: '下雪了', english_summary: 'Snow falls on the village' },
    { id: 'c', title: '老朋友', content: '今天我看朋友。' },
  ]
  it('returns everything for an empty query', () => {
    expect(searchStories(list, '').map(s => s.id)).toEqual(['a', 'b', 'c'])
    expect(searchStories(list, '   ').map(s => s.id)).toEqual(['a', 'b', 'c'])
  })
  it('matches the English summary case-insensitively', () => {
    expect(searchStories(list, 'NOODLE').map(s => s.id)).toEqual(['a'])
  })
  it('matches the Chinese title and the story text', () => {
    expect(searchStories(list, '下雪').map(s => s.id)).toEqual(['b'])
    expect(searchStories(list, '朋友').map(s => s.id)).toEqual(['c'])
  })
  it('returns a copy, never the input array', () => {
    expect(searchStories(list, '')).not.toBe(list)
    expect(searchStories(null, 'x')).toEqual([])
  })
})

describe('sortEntries', () => {
  const e = (id, over) => ({
    id, level: 1, tier: 1, storyNumber: 1, knownPct: 80, length: 100,
    read: false, inProgress: false, ...over,
  })

  it('"For you" leads with what you are part-way through, then unread', () => {
    const out = sortEntries([
      e('read', { read: true, knownPct: 100 }),
      e('unread', { knownPct: 90 }),
      e('series', { inProgress: true, knownPct: 60 }),
    ], 'match')
    expect(out.map(x => x.id)).toEqual(['series', 'unread', 'read'])
  })

  it('"For you" breaks ties on the most readable', () => {
    const out = sortEntries([e('low', { knownPct: 70 }), e('high', { knownPct: 99 })], 'match')
    expect(out.map(x => x.id)).toEqual(['high', 'low'])
  })

  it('sorts easiest and hardest by known %', () => {
    const list = [e('mid', { knownPct: 85 }), e('hard', { knownPct: 50 }), e('easy', { knownPct: 99 })]
    expect(sortEntries(list, 'easiest').map(x => x.id)).toEqual(['easy', 'mid', 'hard'])
    expect(sortEntries(list, 'hardest').map(x => x.id)).toEqual(['hard', 'mid', 'easy'])
  })

  it('an unscored entry never jumps the queue in "Easiest"', () => {
    const list = [e('unscored', { knownPct: null }), e('scored', { knownPct: 10 })]
    expect(sortEntries(list, 'easiest').map(x => x.id)).toEqual(['scored', 'unscored'])
    expect(sortEntries(list, 'hardest').map(x => x.id)).toEqual(['unscored', 'scored'])
  })

  it('sorts shortest first', () => {
    const out = sortEntries([e('long', { length: 900 }), e('short', { length: 40 })], 'shortest')
    expect(out.map(x => x.id)).toEqual(['short', 'long'])
  })

  it('"In order" is newest level first, then tier, then story number', () => {
    const out = sortEntries([
      e('l1t1n2', { level: 1, tier: 1, storyNumber: 2 }),
      e('l2t1n1', { level: 2, tier: 1, storyNumber: 1 }),
      e('l1t2n1', { level: 1, tier: 2, storyNumber: 1 }),
      e('l1t1n1', { level: 1, tier: 1, storyNumber: 1 }),
    ], 'order')
    expect(out.map(x => x.id)).toEqual(['l2t1n1', 'l1t1n1', 'l1t1n2', 'l1t2n1'])
  })

  it('ties are stable across sorts (shelf order breaks every tie)', () => {
    const list = [e('b', { storyNumber: 2 }), e('a', { storyNumber: 1 })]
    for (const opt of SORT_OPTIONS) {
      expect(sortEntries(list, opt.key).map(x => x.id)).toEqual(['a', 'b'])
    }
  })

  it('does not mutate its input and falls back to the default sort', () => {
    const list = [e('b', { knownPct: 10 }), e('a', { knownPct: 99 })]
    const out = sortEntries(list, 'nonsense')
    expect(list.map(x => x.id)).toEqual(['b', 'a'])
    expect(out.map(x => x.id)).toEqual(sortEntries(list, DEFAULT_SORT).map(x => x.id))
    expect(sortEntries(null, 'match')).toEqual([])
  })
})

describe('shelfLevels', () => {
  const levels = [1, 2, 3, 4, 5]
  const open = [
    { id: 'a', level: 1 }, { id: 'b', level: 1 }, { id: 'c', level: 2 },
  ]
  const ahead = [{ id: 'd', level: 4 }, { id: 'e', level: 4 }, { id: 'f', level: 5 }]

  it('lists levels that have stories, plus the level you are on', () => {
    const rail = shelfLevels({
      levels, stories: open, previewStories: ahead, currentLevel: 3, readIds: new Set(['a']),
    })
    expect(rail.map(r => r.level)).toEqual([1, 2, 3, 4, 5])
    expect(rail[0]).toEqual({ level: 1, count: 2, readCount: 1, locked: false })
    // Level 3 is the learner's own — kept even with nothing written for it yet.
    expect(rail[2]).toEqual({ level: 3, count: 0, readCount: 0, locked: false })
    // Levels above the current one are previews.
    expect(rail[3]).toEqual({ level: 4, count: 2, readCount: 0, locked: true })
  })

  it('drops empty levels that are not the learner’s own', () => {
    const rail = shelfLevels({ levels, stories: open, previewStories: [], currentLevel: 2 })
    expect(rail.map(r => r.level)).toEqual([1, 2])
  })

  it('treats a story with no level as belonging to the current level', () => {
    const rail = shelfLevels({ levels: [1, 2], stories: [{ id: 'x', level: null }], currentLevel: 2 })
    expect(rail.find(r => r.level === 2).count).toBe(1)
  })

  it('accepts a plain map for readIds and is safe on empty input', () => {
    const rail = shelfLevels({ levels: [1], stories: open, currentLevel: 1, readIds: { a: true, b: true } })
    expect(rail[0].readCount).toBe(2)
    expect(shelfLevels()).toEqual([])
  })
})

describe('defaultShelfLevel', () => {
  const rail = [
    { level: 1, count: 3, locked: false },
    { level: 2, count: 0, locked: false },
    { level: 3, count: 0, locked: false },
    { level: 4, count: 5, locked: true },
  ]
  it('opens on your own level when it has stories', () => {
    expect(defaultShelfLevel([{ level: 2, count: 4, locked: false }], 2)).toBe(2)
  })
  it('falls back to the highest level below you that does', () => {
    expect(defaultShelfLevel(rail, 3)).toBe(1)
  })
  it('never picks a locked level over your own empty one', () => {
    expect(defaultShelfLevel([{ level: 2, count: 0, locked: false }, { level: 3, count: 9, locked: true }], 2)).toBe(2)
  })
  it('is safe with an empty rail', () => {
    expect(defaultShelfLevel([], 5)).toBe(5)
    expect(defaultShelfLevel(null, 5)).toBe(5)
  })
})

describe('shelfSummary', () => {
  const stories = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const scores = new Map([['a', { knownPct: 100 }], ['b', { knownPct: 80 }]])
  it('counts what is on the shelf and averages only what is scored', () => {
    expect(shelfSummary(stories, new Set(['a']), scores)).toEqual({ total: 3, read: 1, avgKnownPct: 90 })
  })
  it('reports no average rather than 0% when nothing is scored', () => {
    expect(shelfSummary(stories, new Set(), new Map()).avgKnownPct).toBe(null)
  })
  it('is safe on empty input', () => {
    expect(shelfSummary(null, null, null)).toEqual({ total: 0, read: 0, avgKnownPct: null })
  })
})
