import { describe, it, expect } from 'vitest'
import {
  wordKnownStatus, findStoryVocab, storyReadability, pickRecapStory,
} from './storyMatch'

// A tiny Chinese-ish fixture. vocabMap keys are words; each has an id.
const vocab = {
  '今天': { id: 'a', word: '今天' },
  '我': { id: 'b', word: '我' },
  '朋友': { id: 'c', word: '朋友' },
  '公园': { id: 'd', word: '公园' },
  '散步': { id: 'e', word: '散步' },
}
const CATS = [
  { tier: 1, minWords: 0, label: 'First Steps' },
  { tier: 2, minWords: 100, label: 'Growing' },
]

describe('wordKnownStatus', () => {
  it('is new with no card', () => {
    expect(wordKnownStatus(undefined)).toBe('new')
    expect(wordKnownStatus(null)).toBe('new')
  })
  it('is known when easy (mastered) or in review', () => {
    expect(wordKnownStatus({ is_easy: true })).toBe('known')
    expect(wordKnownStatus({ state: 'review' })).toBe('known')
  })
  it('is learning for a started-but-not-review card', () => {
    expect(wordKnownStatus({ state: 'learning' })).toBe('learning')
  })
})

describe('findStoryVocab', () => {
  it('greedily finds the longest vocab words present', () => {
    const found = findStoryVocab('今天我和朋友去公园散步。', vocab)
    expect([...found].sort()).toEqual(['今天', '公园', '我', '散步', '朋友'].sort())
  })
  it('returns distinct words only', () => {
    const found = findStoryVocab('我我我', vocab)
    expect([...found]).toEqual(['我'])
  })
  it('excludes single-character particles', () => {
    const withParticle = { ...vocab, '我': { id: 'b', word: '我' } }
    const found = findStoryVocab('我', withParticle, new Set(['我']))
    expect(found.size).toBe(0)
  })
  it('is empty for empty/nullish content', () => {
    expect(findStoryVocab('', vocab).size).toBe(0)
    expect(findStoryVocab(undefined, vocab).size).toBe(0)
  })
})

describe('storyReadability', () => {
  const content = '今天我和朋友去公园散步。'
  it('computes known percentage over the story vocab', () => {
    // 3 of 5 words known (今天, 我, 朋友); 公园 learning; 散步 new.
    const cards = {
      a: { state: 'review' },
      b: { is_easy: true },
      c: { state: 'review' },
      d: { state: 'learning' },
    }
    const r = storyReadability(content, vocab, cards)
    expect(r.total).toBe(5)
    expect(r.known).toBe(3)
    expect(r.learning).toBe(1)
    expect(r.new).toBe(1)
    expect(r.knownPct).toBe(60)
  })
  it('is 0% known when the user has no cards', () => {
    const r = storyReadability(content, vocab, {})
    expect(r.knownPct).toBe(0)
    expect(r.total).toBe(5)
  })
})

describe('pickRecapStory', () => {
  const stories = [
    { id: 's1', tier: 1, title: 'In the Park', content: '今天我和朋友去公园散步。' },
    { id: 's2', tier: 1, title: 'At Home', content: '我今天在家。' },
    { id: 's3', tier: 2, title: 'Faraway', content: '朋友公园散步。' },
  ]

  it('prefers an unlocked story containing the most of today’s words', () => {
    const rec = pickRecapStory({
      stories, vocabMap: vocab, userCards: {},
      sessionWords: ['公园', '散步'], readIds: new Set(),
      learnedCount: 0, categories: CATS,
    })
    // s3 is tier 2 (locked at learnedCount 0); among tier-1, s1 has both words.
    expect(rec.story.id).toBe('s1')
    expect(rec.sessionWordsInStory.sort()).toEqual(['公园', '散步'])
  })

  it('reports the known percentage of the chosen story', () => {
    const cards = { a: { state: 'review' }, b: { is_easy: true } }
    const rec = pickRecapStory({
      stories, vocabMap: vocab, userCards: cards,
      sessionWords: [], readIds: new Set(), learnedCount: 0, categories: CATS,
    })
    expect(rec.story).toBeTruthy()
    expect(typeof rec.knownPct).toBe('number')
  })

  it('deprioritizes already-read stories', () => {
    const rec = pickRecapStory({
      stories, vocabMap: vocab, userCards: {},
      sessionWords: ['我'], readIds: new Set(['s1']),
      learnedCount: 0, categories: CATS,
    })
    // Both s1 and s2 contain 我, but s1 is read → s2 wins.
    expect(rec.story.id).toBe('s2')
    expect(rec.isRead).toBe(false)
  })

  it('never recommends a story from a locked tier', () => {
    const onlyLocked = [{ id: 'x', tier: 2, title: 'Locked', content: '朋友' }]
    const rec = pickRecapStory({
      stories: onlyLocked, vocabMap: vocab, userCards: {},
      sessionWords: [], readIds: new Set(), learnedCount: 0, categories: CATS,
    })
    expect(rec.story).toBeNull()
    expect(rec.wordsToUnlock).toBe(100)
    expect(rec.nextTierLabel).toBe('Growing')
  })

  it('gives a fallback nudge with no stories at all', () => {
    const rec = pickRecapStory({
      stories: [], vocabMap: vocab, userCards: {},
      sessionWords: [], readIds: new Set(), learnedCount: 0, categories: CATS,
    })
    expect(rec.story).toBeNull()
    expect(rec.wordsToUnlock).toBeNull()
  })
})
