import { describe, it, expect } from 'vitest'
import { wordStatus, todayWordsInStory } from './storyReading'

describe('wordStatus', () => {
  it('is not_started when there is no card', () => {
    expect(wordStatus('v1', {})).toBe('not_started')
  })
  it('is mastered when the card is easy', () => {
    expect(wordStatus('v1', { v1: { is_easy: true, state: 'review' } })).toBe('mastered')
  })
  it('is review when in the review state (and not easy)', () => {
    expect(wordStatus('v1', { v1: { is_easy: false, state: 'review' } })).toBe('review')
  })
  it('is learning for a started-but-not-review card', () => {
    expect(wordStatus('v1', { v1: { is_easy: false, state: 'learning' } })).toBe('learning')
    expect(wordStatus('v1', { v1: { state: 'relearning' } })).toBe('learning')
  })
})

describe('todayWordsInStory', () => {
  it('returns the story words that were studied today', () => {
    expect(todayWordsInStory(['今天', '我', '公园'], ['公园', '散步'])).toEqual(['公园'])
  })
  it('preserves story order and drops duplicates', () => {
    expect(todayWordsInStory(['我', '公园', '我'], ['我', '公园'])).toEqual(['我', '公园'])
  })
  it('is empty when there is no overlap', () => {
    expect(todayWordsInStory(['我', '你'], ['他'])).toEqual([])
  })
  it('is empty / safe for missing inputs', () => {
    expect(todayWordsInStory([], ['我'])).toEqual([])
    expect(todayWordsInStory(['我'], [])).toEqual([])
    expect(todayWordsInStory(undefined, undefined)).toEqual([])
  })
})
