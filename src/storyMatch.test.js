import { describe, it, expect } from 'vitest'
import { pickRecapStory } from './storyMatch'

// pickRecapStory now derives readability from the canonical
// calculateStoryReadability (storyReading.js). These fixtures use plain Chinese
// text (no names / particles / speaker labels), so the numbers are unchanged by
// the unification — the ranking behavior is what's asserted here.
const v = (word, id) => ({ id, word })
const vocab = {
  今天: v('今天', 'a'), 我: v('我', 'b'), 朋友: v('朋友', 'c'),
  公园: v('公园', 'd'), 散步: v('散步', 'e'), 和: v('和', 'f'),
  去: v('去', 'g'), 在: v('在', 'h'), 家: v('家', 'i'),
}
const CATS = [
  { tier: 1, minWords: 0, label: 'First Steps' },
  { tier: 2, minWords: 100, label: 'Growing' },
]
const stories = [
  { id: 's1', tier: 1, title: 'In the Park', content: '今天我和朋友去公园散步。' },
  { id: 's2', tier: 1, title: 'At Home', content: '我今天在家。' },
  { id: 's3', tier: 2, title: 'Faraway', content: '朋友公园散步。' },
]

describe('pickRecapStory', () => {
  it('prefers an unlocked story containing the most of today’s words', () => {
    const rec = pickRecapStory({
      stories, vocabMap: vocab, userCards: {},
      sessionWords: ['公园', '散步'], readIds: new Set(),
      learnedCount: 0, categories: CATS, language: 'chinese',
    })
    // s3 is tier 2 (locked at learnedCount 0); among tier-1, s1 has both words.
    expect(rec.story.id).toBe('s1')
    expect(rec.sessionWordsInStory.slice().sort()).toEqual(['公园', '散步'])
  })

  it('reports the known percentage of the chosen story', () => {
    const cards = { a: { state: 'review' }, b: { is_easy: true } }
    const rec = pickRecapStory({
      stories, vocabMap: vocab, userCards: cards,
      sessionWords: [], readIds: new Set(), learnedCount: 0, categories: CATS, language: 'chinese',
    })
    expect(rec.story).toBeTruthy()
    expect(typeof rec.knownPct).toBe('number')
    expect(rec.knownPct).toBeGreaterThan(0)
  })

  it('deprioritizes already-read stories', () => {
    const rec = pickRecapStory({
      stories, vocabMap: vocab, userCards: {},
      sessionWords: ['我'], readIds: new Set(['s1']),
      learnedCount: 0, categories: CATS, language: 'chinese',
    })
    // Both s1 and s2 contain 我, but s1 is read → s2 wins.
    expect(rec.story.id).toBe('s2')
    expect(rec.isRead).toBe(false)
  })

  it('never recommends a story from a locked tier', () => {
    const onlyLocked = [{ id: 'x', tier: 2, title: 'Locked', content: '朋友' }]
    const rec = pickRecapStory({
      stories: onlyLocked, vocabMap: vocab, userCards: {},
      sessionWords: [], readIds: new Set(), learnedCount: 0, categories: CATS, language: 'chinese',
    })
    expect(rec.story).toBeNull()
    expect(rec.wordsToUnlock).toBe(100)
    expect(rec.nextTierLabel).toBe('Growing')
  })

  it('gives a fallback nudge with no stories at all', () => {
    const rec = pickRecapStory({
      stories: [], vocabMap: vocab, userCards: {},
      sessionWords: [], readIds: new Set(), learnedCount: 0, categories: CATS, language: 'chinese',
    })
    expect(rec.story).toBeNull()
    expect(rec.wordsToUnlock).toBeNull()
  })

  it('works without an explicit language (defaults to no name/particle handling)', () => {
    const rec = pickRecapStory({
      stories, vocabMap: vocab, userCards: {},
      sessionWords: ['公园'], readIds: new Set(), learnedCount: 0, categories: CATS,
    })
    expect(rec.story.id).toBe('s1')
  })
})
