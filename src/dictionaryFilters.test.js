import { describe, it, expect } from 'vitest'
import { DICT_FILTERS, matchesDictFilter, filterVocab, dictionaryEmptyState, levelsInVocab, filterByLevel } from './dictionaryFilters'

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

describe('dictionaryEmptyState', () => {
  it('returns null when a search query is active', () => {
    expect(dictionaryEmptyState('mastered', true)).toBe(null)
    expect(dictionaryEmptyState('all', true)).toBe(null)
  })

  it('gives filter-specific encouragement when browsing', () => {
    expect(dictionaryEmptyState('mastered', false)).toMatch(/mastered/i)
    expect(dictionaryEmptyState('learning', false)).toMatch(/learning/i)
    expect(dictionaryEmptyState('in_deck', false)).toMatch(/deck/i)
    expect(dictionaryEmptyState('not_started', false)).toMatch(/started every/i)
  })

  it('falls back for all / unknown keys', () => {
    expect(dictionaryEmptyState('all', false)).toBe('No words here yet.')
    expect(dictionaryEmptyState('zzz', false)).toBe('No words here yet.')
  })
})

describe('levelsInVocab', () => {
  it('returns distinct levels ascending', () => {
    expect(levelsInVocab([{ level: 3 }, { level: 1 }, { level: 3 }, { level: 2 }])).toEqual([1, 2, 3])
  })
  it('ignores rows without a level and junk input', () => {
    expect(levelsInVocab([{ level: 2 }, {}, null, { level: 1 }])).toEqual([1, 2])
    expect(levelsInVocab(null)).toEqual([])
  })
})

describe('filterByLevel', () => {
  const vocab = [{ id: 'a', level: 1 }, { id: 'b', level: 2 }, { id: 'c', level: 2 }]
  it('keeps everything for all / nullish', () => {
    expect(filterByLevel(vocab, 'all')).toHaveLength(3)
    expect(filterByLevel(vocab, null)).toHaveLength(3)
    expect(filterByLevel(vocab, undefined)).toHaveLength(3)
  })
  it('keeps only the requested level', () => {
    expect(filterByLevel(vocab, 2).map(v => v.id)).toEqual(['b', 'c'])
    expect(filterByLevel(vocab, 1).map(v => v.id)).toEqual(['a'])
  })
  it('tolerates a non-array', () => {
    expect(filterByLevel(null, 1)).toEqual([])
  })
})
