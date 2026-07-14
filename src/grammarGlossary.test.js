import { describe, it, expect } from 'vitest'
import { glossaryLookup } from './grammarGlossary'

describe('glossaryLookup', () => {
  it('explains Japanese particles and the copula', () => {
    expect(glossaryLookup('japanese', 'は').reading).toBe('wa')
    expect(glossaryLookup('japanese', 'です').gloss).toMatch(/Polite/)
    expect(glossaryLookup('japanese', 'から')).toBeTruthy()
  })

  it('trims surrounding punctuation before lookup', () => {
    expect(glossaryLookup('japanese', 'でも、')).toBeTruthy()
    expect(glossaryLookup('japanese', '「でも」')).toBeTruthy()
  })

  it('returns null for content words and unknown languages', () => {
    expect(glossaryLookup('japanese', '学校')).toBeNull()
    expect(glossaryLookup('chinese', '的')).toBeNull()
    expect(glossaryLookup('japanese', '')).toBeNull()
  })
})
