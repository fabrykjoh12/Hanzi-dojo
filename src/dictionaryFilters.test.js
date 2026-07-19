import { describe, it, expect } from 'vitest'
import { DICT_FILTERS, matchesDictFilter, filterVocab } from './dictionaryFilters'

describe('DICT_FILTERS', () => {
  it('leads with All and covers the key states', () => {
    expect(DICT_FILTERS[0]).toEqual({ key: 'all', label: 'All' })
    expect(DICT_FILTERS.map(f => f.key)).toEqual(['all', 'in_deck', 'learning', 'mastered', 'not_started'])
    expect(DICT_FILTERS.every(f => f.label)).toBe(true)
  })
})

describe('matchesDictFilter', () => {
  it('all matches every status', () => {
    for (const s of ['not_started', 'learning', 'mastered', 'review']) {
      expect(matchesDictFilter(s, 'all')).toBe(true)
    }
  })

  it('in_deck matches any card that exists (not not_started)', () => {
    expect(matchesDictFilter('not_started', 'in_deck')).toBe(false)
    expect(matchesDictFilter('learning', 'in_deck')).toBe(true)
    expect(matchesDictFilter('mastered', 'in_deck')).toBe(true)
    expect(matchesDictFilter('review', 'in_deck')).toBe(true)
  })

  it('exact-status filters match only their status', () => {
    expect(matchesDictFilter('learning', 'learning')).toBe(true)
    expect(matchesDictFilter('review', 'learning')).toBe(false)
    expect(matchesDictFilter('mastered', 'mastered')).toBe(true)
    expect(matchesDictFilter('learning', 'mastered')).toBe(false)
    expect(matchesDictFilter('not_started', 'not_started')).toBe(true)
    expect(matchesDictFilter('review', 'not_started')).toBe(false)
  })

  it('an unknown filter key matches everything (safe default)', () => {
    expect(matchesDictFilter('learning', 'nonsense')).toBe(true)
  })
})

describe('filterVocab', () => {
  const vocab = [
    { id: 1, s: 'not_started' },
    { id: 2, s: 'learning' },
    { id: 3, s: 'mastered' },
    { id: 4, s: 'review' },
  ]
  const statusFor = v => v.s

  it('all / falsy returns the full list', () => {
    expect(filterVocab(vocab, statusFor, 'all')).toHaveLength(4)
    expect(filterVocab(vocab, statusFor, undefined)).toHaveLength(4)
  })

  it('in_deck drops not_started', () => {
    expect(filterVocab(vocab, statusFor, 'in_deck').map(v => v.id)).toEqual([2, 3, 4])
  })

  it('exact filters keep only matches', () => {
    expect(filterVocab(vocab, statusFor, 'learning').map(v => v.id)).toEqual([2])
    expect(filterVocab(vocab, statusFor, 'mastered').map(v => v.id)).toEqual([3])
    expect(filterVocab(vocab, statusFor, 'not_started').map(v => v.id)).toEqual([1])
  })

  it('tolerates a non-array input', () => {
    expect(filterVocab(null, statusFor, 'learning')).toEqual([])
  })
})
