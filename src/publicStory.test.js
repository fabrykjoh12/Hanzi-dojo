import { describe, it, expect } from 'vitest'
import { buildVocabMap, assumedKnownCards, teaserLines, LEVEL_CHOICES, BEGINNER_WORD_CAP } from './publicStory'

const pool = [
  { id: 'a', word: '你', reading: 'nǐ', meaning: 'you', level: 1, sort_order: 1 },
  { id: 'b', word: '好', reading: 'hǎo', meaning: 'good', level: 1, sort_order: 60 },
  { id: 'c', word: '朋友', reading: 'péngyou', meaning: 'friend', level: 2, sort_order: 5 },
  { id: 'd', word: '经济', reading: 'jīngjì', meaning: 'economy', level: 3, sort_order: 5 },
]

describe('LEVEL_CHOICES', () => {
  it('offers three choices in order beginner→some→lots', () => {
    expect(LEVEL_CHOICES.map(c => c.key)).toEqual(['beginner', 'some', 'lots'])
    expect(LEVEL_CHOICES.every(c => typeof c.label === 'string' && c.label.length)).toBe(true)
  })
})

describe('buildVocabMap', () => {
  it('keys rows by word', () => {
    const m = buildVocabMap(pool)
    expect(m['你'].id).toBe('a')
    expect(Object.keys(m)).toHaveLength(4)
  })
  it('tolerates null', () => {
    expect(buildVocabMap(null)).toEqual({})
  })
})

describe('assumedKnownCards', () => {
  it('beginner: only level-1 words within the frequency cap', () => {
    const cards = assumedKnownCards(pool, 'beginner', 3)
    expect(Object.keys(cards)).toEqual(['a']) // 好 sort_order 60 > 50 excluded
    expect(cards['a']).toEqual({ state: 'review' })
    expect(BEGINNER_WORD_CAP).toBe(50)
  })
  it('some: all of level 1 regardless of frequency', () => {
    const cards = assumedKnownCards(pool, 'some', 3)
    expect(Object.keys(cards).sort()).toEqual(['a', 'b'])
  })
  it('lots: everything at or below the story level', () => {
    const cards = assumedKnownCards(pool, 'lots', 2)
    expect(Object.keys(cards).sort()).toEqual(['a', 'b', 'c']) // level 3 excluded
  })
  it('tolerates null pool', () => {
    expect(assumedKnownCards(null, 'lots', 3)).toEqual({})
  })
})

describe('teaserLines', () => {
  it('returns the first n non-empty lines', () => {
    expect(teaserLines('one\n\ntwo\nthree\nfour\nfive', 4)).toEqual(['one', 'two', 'three', 'four'])
  })
  it('defaults to 4 and tolerates empty', () => {
    expect(teaserLines('')).toEqual([])
    expect(teaserLines(null)).toEqual([])
  })
})
