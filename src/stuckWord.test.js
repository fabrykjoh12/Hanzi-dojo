import { describe, it, expect } from 'vitest'
import {
  isStuck, STUCK_LAPSES, charBreakdown, shouldOfferCoach, SESSION_AGAIN_LIMIT,
  weakList, weakActionLabel, WEAK_LIST_MAX,
} from './stuckWord'

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

// Profile's "Needs attention" list. The panel used to render six full-width
// cards, each with its own border and its own pill, and take a third of the
// screen (P10-B5). The cap and the track scoping are what these pin.
describe('weakList', () => {
  const TRACK = { language: 'chinese', system: 'hsk', level: 2 }
  const row = (word, lapses, over = {}) => ({
    lapses,
    vocabulary: { word, language: 'chinese', system: 'hsk', level: 2, ...over },
  })

  it('lists the worst first', () => {
    const out = weakList([row('a', 3), row('b', 9), row('c', 5)], TRACK)
    expect(out.map(r => r.vocabulary.word)).toEqual(['b', 'c', 'a'])
  })

  it('caps the list at five, whatever arrives', () => {
    const rows = Array.from({ length: 12 }, (_, i) => row('w' + i, 4 + i))
    expect(weakList(rows, TRACK)).toHaveLength(WEAK_LIST_MAX)
    expect(WEAK_LIST_MAX).toBe(5)
  })

  it('never lists a word that has not actually slipped', () => {
    // The query asks for lapses >= STUCK_LAPSES, but a panel titled "keeps
    // slipping" must not depend on the query to be truthful.
    const out = weakList([row('fine', 0), row('fine2', STUCK_LAPSES - 1), row('bad', STUCK_LAPSES)], TRACK)
    expect(out.map(r => r.vocabulary.word)).toEqual(['bad'])
  })

  it('stays inside the current track and level', () => {
    const rows = [
      row('here', 5),
      row('other-level', 9, { level: 3 }),
      row('other-system', 9, { system: 'hsk_3' }),
      row('other-language', 9, { language: 'japanese' }),
    ]
    expect(weakList(rows, TRACK).map(r => r.vocabulary.word)).toEqual(['here'])
  })

  it('survives missing rows, missing vocabulary and no arguments', () => {
    expect(weakList(null, TRACK)).toEqual([])
    expect(weakList([null, { lapses: 9 }, undefined], TRACK)).toEqual([])
    expect(weakList()).toEqual([])
  })

  it('takes a caller-supplied cap', () => {
    const rows = [row('a', 9), row('b', 8), row('c', 7)]
    expect(weakList(rows, { ...TRACK, max: 2 })).toHaveLength(2)
    expect(weakList(rows, { ...TRACK, max: 0 })).toEqual([])
  })
})

describe('weakActionLabel', () => {
  it('says how many there really are when the list is capped', () => {
    expect(weakActionLabel(5, 9)).toBe('Review all 9 weak words')
  })

  it('says nothing about counts when nothing is hidden', () => {
    expect(weakActionLabel(3, 3)).toBe('Review these words')
    expect(weakActionLabel(5, 5)).toBe('Review these words')
    expect(weakActionLabel()).toBe('Review these words')
  })
})
