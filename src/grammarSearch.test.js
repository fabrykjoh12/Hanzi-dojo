import { describe, it, expect } from 'vitest'
import { filterTopics, topicHaystack } from './grammarSearch'

const topics = [
  { id: 't1', title: 'Comparisons with 比', blurp: '', blurb: 'Say X is more than Y', pattern: 'A 比 B 高', points: [{ text: 'Use 比 (bǐ) between the two things.' }] },
  { id: 't2', title: 'Measure words', blurb: 'Counting nouns', pattern: 'number + 个 + noun', points: [{ text: 'Chinese needs a measure word.' }] },
  { id: 't3', title: '了 for completed actions', blurb: 'Finished things', pattern: 'verb + 了', points: [{ text: 'Add 了 (le) after the verb.' }] },
]

describe('topicHaystack', () => {
  it('gathers title, blurb, pattern, and point text', () => {
    const h = topicHaystack(topics[0])
    expect(h).toContain('Comparisons')
    expect(h).toContain('more than')
    expect(h).toContain('比')
    expect(h).toContain('bǐ')
  })
  it('is safe on junk', () => {
    expect(topicHaystack(null)).toBe('')
    expect(topicHaystack({})).toBe('')
  })
})

describe('filterTopics', () => {
  it('returns everything for a blank query', () => {
    expect(filterTopics(topics, '')).toHaveLength(3)
    expect(filterTopics(topics, '   ')).toHaveLength(3)
    expect(filterTopics(topics, undefined)).toHaveLength(3)
  })

  it('matches by title', () => {
    expect(filterTopics(topics, 'measure').map(t => t.id)).toEqual(['t2'])
  })

  it('matches by blurb', () => {
    expect(filterTopics(topics, 'finished').map(t => t.id)).toEqual(['t3'])
  })

  it('matches a Chinese character in the pattern/title', () => {
    expect(filterTopics(topics, '了').map(t => t.id)).toEqual(['t3'])
  })

  it('matches toneless pinyin against a tone-marked point ("bi" → bǐ)', () => {
    expect(filterTopics(topics, 'bi').map(t => t.id)).toEqual(['t1'])
  })

  it('returns [] when nothing matches', () => {
    expect(filterTopics(topics, 'zzzzz')).toEqual([])
  })

  it('tolerates a non-array input', () => {
    expect(filterTopics(null, 'x')).toEqual([])
  })
})
