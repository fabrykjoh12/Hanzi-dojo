import { describe, it, expect } from 'vitest'
import { SENTENCE_BANK, getSentenceBank } from './sentenceBank'

describe('getSentenceBank', () => {
  it('returns the level list, and [] for an unknown level', () => {
    expect(getSentenceBank('chinese', 'hsk_3', 1).length).toBeGreaterThan(10)
    expect(getSentenceBank('japanese', 'jlpt', 1).length).toBeGreaterThan(10)
    expect(getSentenceBank('klingon', 'x', 9)).toEqual([])
  })
})

describe('SENTENCE_BANK data', () => {
  it('every entry has non-empty text + English', () => {
    for (const list of Object.values(SENTENCE_BANK)) {
      expect(Array.isArray(list)).toBe(true)
      list.forEach(s => {
        expect(typeof s.text).toBe('string')
        expect(s.text.trim().length).toBeGreaterThan(0)
        expect(typeof s.en).toBe('string')
        expect(s.en.trim().length).toBeGreaterThan(0)
      })
    }
  })

  it('has no duplicate sentences within a level', () => {
    for (const list of Object.values(SENTENCE_BANK)) {
      const texts = list.map(s => s.text)
      expect(new Set(texts).size).toBe(texts.length)
    }
  })
})
