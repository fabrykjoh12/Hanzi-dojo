import { describe, it, expect } from 'vitest'
import { foldForSearch, foldIncludes } from './searchFold'

describe('foldForSearch', () => {
  it('strips pinyin tone marks and lower-cases', () => {
    expect(foldForSearch('tiānqì')).toBe('tianqi')
    expect(foldForSearch('Péngyou')).toBe('pengyou')
    expect(foldForSearch('nǐ hǎo')).toBe('ni hao')
  })

  it('leaves plain ascii untouched', () => {
    expect(foldForSearch('weather')).toBe('weather')
  })

  it('does NOT fold Japanese kana voiced marks (dakuten stays distinct base)', () => {
    // が decomposes to か + U+3099, which is outside the stripped range, so the
    // dakuten is preserved — が never collapses to か.
    expect(foldForSearch('が')).not.toBe(foldForSearch('か'))
  })

  it('handles null / undefined / empty', () => {
    expect(foldForSearch(null)).toBe('')
    expect(foldForSearch(undefined)).toBe('')
    expect(foldForSearch('')).toBe('')
  })
})

describe('foldIncludes', () => {
  it('matches toneless query against a tone-marked reading', () => {
    expect(foldIncludes('tiānqì', 'tianqi')).toBe(true)
    expect(foldIncludes('péngyou', 'peng')).toBe(true)
    expect(foldIncludes('hǎo', 'HAO')).toBe(true)
  })

  it('still matches when the query itself carries tone marks', () => {
    expect(foldIncludes('tiānqì', 'tiānqì')).toBe(true)
  })

  it('returns false for a genuine non-match', () => {
    expect(foldIncludes('tiānqì', 'pengyou')).toBe(false)
  })

  it('an empty query matches anything', () => {
    expect(foldIncludes('anything', '')).toBe(true)
    expect(foldIncludes('anything', null)).toBe(true)
  })
})
