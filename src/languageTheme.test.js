import { describe, it, expect } from 'vitest'
import { languageTheme, languageList, isCjk, DEFAULT_LANGUAGE } from './languageTheme'
import { getLevelLabel, getSystemLabel, getLevels } from './utils'

describe('languageTheme', () => {
  it('returns the requested language config', () => {
    expect(languageTheme('russian').nativeName).toBe('Русский')
    expect(languageTheme('russian').system).toBe('russian')
    expect(languageTheme('japanese').nativeName).toBe('日本語')
  })

  it('falls back to the default for unknown languages', () => {
    expect(languageTheme('klingon').key).toBe(DEFAULT_LANGUAGE)
    expect(languageTheme(undefined).key).toBe(DEFAULT_LANGUAGE)
  })

  it('exposes the required theme shape for every language', () => {
    for (const t of languageList()) {
      expect(typeof t.accentHex).toBe('string')
      expect(typeof t.accentVar).toBe('string')
      expect(typeof t.font).toBe('string')
      expect(typeof t.nativeName).toBe('string')
      expect(typeof t.backgroundKey).toBe('string')
    }
  })

  it('marks CJK vs alphabetic scripts', () => {
    expect(isCjk('chinese')).toBe(true)
    expect(isCjk('japanese')).toBe(true)
    expect(isCjk('russian')).toBe(false)
  })
})

describe('russian level system (CEFR)', () => {
  it('labels levels A1–C2', () => {
    expect(getLevelLabel('russian', 'russian', 1)).toBe('A1')
    expect(getLevelLabel('russian', 'russian', 2)).toBe('A2')
    expect(getLevelLabel('russian', 'russian', 6)).toBe('C2')
  })

  it('labels the system as CEFR', () => {
    expect(getSystemLabel('russian')).toBe('CEFR')
  })

  it('has six levels', () => {
    expect(getLevels('russian', 'russian')).toEqual([1, 2, 3, 4, 5, 6])
  })
})
