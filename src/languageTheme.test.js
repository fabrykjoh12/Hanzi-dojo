import { describe, it, expect } from 'vitest'
import { languageTheme, languageList, availableLanguages, isCjk, langAttr, UI_LANG, DEFAULT_LANGUAGE } from './languageTheme'
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

describe('availableLanguages (account gating)', () => {
  it('offers only Chinese to regular accounts', () => {
    const langs = availableLanguages(false)
    expect(langs.map(l => l.key)).toEqual(['chinese'])
  })

  it('offers only Chinese to admin accounts too (Japanese/Russian paused)', () => {
    const langs = availableLanguages(true)
    expect(langs.map(l => l.key)).toEqual(['chinese'])
  })

  it('returns real config objects', () => {
    const langs = availableLanguages(true)
    expect(langs.every(l => typeof l.nativeName === 'string')).toBe(true)
    expect(langs[0].key).toBe('chinese')
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

describe('langAttr', () => {
  it('gives every language a real BCP-47 tag — a screen reader needs one per script', () => {
    expect(langAttr('chinese')).toBe('zh-Hans')
    expect(langAttr('japanese')).toBe('ja')
    expect(langAttr('russian')).toBe('ru')
  })

  it('never returns undefined for a supported language', () => {
    for (const l of languageList()) {
      expect(typeof langAttr(l.key)).toBe('string')
      expect(langAttr(l.key).length).toBeGreaterThan(0)
    }
  })

  it('falls back to the default language for an unknown key, like the rest of the theme', () => {
    expect(langAttr('klingon')).toBe(langAttr(DEFAULT_LANGUAGE))
    expect(langAttr(undefined)).toBe(langAttr(DEFAULT_LANGUAGE))
  })

  it('tags English UI text so a tagged subtree does not swallow it', () => {
    expect(UI_LANG).toBe('en')
  })
})
