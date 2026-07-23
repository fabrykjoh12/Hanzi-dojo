import { describe, it, expect } from 'vitest'
import { isStuck, STUCK_LAPSES, charBreakdown, shouldOfferCoach, SESSION_AGAIN_LIMIT } from './stuckWord'

describe('isStuck', () => {
  it('is false below the threshold', () => {
    expect(isStuck({ lapses: STUCK_LAPSES - 1 })).toBe(false)
    expect(isStuck({ lapses: 0 })).toBe(false)
    expect(isStuck({})).toBe(false)
  })
  it('is true at or above the threshold', () => {
    expect(isStuck({ lapses: STUCK_LAPSES })).toBe(true)
    expect(isStuck({ lapses: STUCK_LAPSES + 3 })).toBe(true)
  })
  it('is false for a missing card', () => {
    expect(isStuck(null)).toBe(false)
    expect(isStuck(undefined)).toBe(false)
  })
})

describe('shouldOfferCoach', () => {
  it('offers when the card is historically stuck, regardless of session count', () => {
    expect(shouldOfferCoach({ lapses: STUCK_LAPSES }, 0)).toBe(true)
  })
  it('offers when Again was pressed enough times this session, even at 0 lapses', () => {
    expect(shouldOfferCoach({ lapses: 0 }, SESSION_AGAIN_LIMIT)).toBe(true)
    expect(shouldOfferCoach({ lapses: 0 }, SESSION_AGAIN_LIMIT + 2)).toBe(true)
  })
  it('does not offer for a fresh card with few session Agains', () => {
    expect(shouldOfferCoach({ lapses: 0 }, 0)).toBe(false)
    expect(shouldOfferCoach({ lapses: 0 }, SESSION_AGAIN_LIMIT - 1)).toBe(false)
  })
})

describe('charBreakdown', () => {
  it('pairs each character with its pinyin syllable and tone', () => {
    expect(charBreakdown('你好', 'nǐ hǎo')).toEqual([
      { char: '你', pinyin: 'nǐ', tone: 3 },
      { char: '好', pinyin: 'hǎo', tone: 3 },
    ])
  })
  it('handles a single character', () => {
    expect(charBreakdown('我', 'wǒ')).toEqual([{ char: '我', pinyin: 'wǒ', tone: 3 }])
  })
  it('falls back to empty pinyin / neutral tone when syllables run short', () => {
    expect(charBreakdown('北京市', 'běi jīng')).toEqual([
      { char: '北', pinyin: 'běi', tone: 3 },
      { char: '京', pinyin: 'jīng', tone: 1 },
      { char: '市', pinyin: '', tone: 5 },
    ])
  })
  it('returns an empty array for an empty word', () => {
    expect(charBreakdown('', 'x')).toEqual([])
    expect(charBreakdown(undefined, undefined)).toEqual([])
  })
})
