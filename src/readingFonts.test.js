import { describe, it, expect } from 'vitest'
import { languageTheme } from './languageTheme'
import {
  READER_PREFS_KEY,
  READING_FONT_SANS, READING_FONT_SERIF, READING_FONT_HANDWRITING, DEFAULT_READING_FONT,
  readingFontStack, readingFontOptions, normalizeReadingFont, readingFontHint,
  readingFontFromPrefs, readingFontPatch,
} from './readingFonts'

describe('readingFonts — the option list per language', () => {
  it('offers sans + serif everywhere, and Kai handwriting only for Chinese', () => {
    expect(readingFontOptions('chinese').map(o => o.value))
      .toEqual([READING_FONT_SANS, READING_FONT_SERIF, READING_FONT_HANDWRITING])
    expect(readingFontOptions('japanese').map(o => o.value))
      .toEqual([READING_FONT_SANS, READING_FONT_SERIF])
    expect(readingFontOptions('russian').map(o => o.value))
      .toEqual([READING_FONT_SANS, READING_FONT_SERIF])
  })

  it('never offers a dead button — every option resolves to a real stack', () => {
    for (const language of ['chinese', 'japanese', 'russian']) {
      for (const opt of readingFontOptions(language)) {
        expect(typeof opt.stack).toBe('string')
        expect(opt.stack.length).toBeGreaterThan(0)
        expect(opt.label).toBeTruthy()
        // The label is drawn in its own face, so each option carries its stack.
        expect(opt.stack).toBe(readingFontStack(language, opt.value))
      }
    }
  })

  it('falls back to the default language list for an unknown language', () => {
    expect(readingFontOptions('klingon').map(o => o.value))
      .toEqual(readingFontOptions('chinese').map(o => o.value))
  })

  it('gives CJK scripts a sample character and alphabetic scripts none', () => {
    expect(readingFontOptions('chinese')[0].sample).toBe('永')
    expect(readingFontOptions('japanese')[0].sample).toBe('永')
    expect(readingFontOptions('russian')[0].sample).toBe('')
  })
})

describe('readingFonts — stacks', () => {
  it('sans is the language’s own theme font, not a hardcoded family', () => {
    expect(readingFontStack('chinese', READING_FONT_SANS)).toBe(languageTheme('chinese').font)
    expect(readingFontStack('japanese', READING_FONT_SANS)).toBe(languageTheme('japanese').font)
    expect(readingFontStack('russian', READING_FONT_SANS)).toBe(languageTheme('russian').font)
  })

  it('serif is a per-script system stack ending in the generic keyword', () => {
    expect(readingFontStack('chinese', READING_FONT_SERIF)).toContain('Songti SC')
    expect(readingFontStack('japanese', READING_FONT_SERIF)).toContain('Hiragino Mincho ProN')
    expect(readingFontStack('russian', READING_FONT_SERIF)).toContain('Georgia')
    for (const language of ['chinese', 'japanese', 'russian']) {
      expect(readingFontStack(language, READING_FONT_SERIF).endsWith('serif')).toBe(true)
    }
  })

  it('handwriting is a Kai stack for Chinese', () => {
    const stack = readingFontStack('chinese', READING_FONT_HANDWRITING)
    expect(stack).toContain('Kaiti SC')
    expect(stack).toContain('KaiTi')
    expect(stack).toContain('STKaiti')
    expect(stack).toContain('BiauKai')
  })

  it('falls back to the theme font where a language has no such face', () => {
    // Japanese offers no handwriting option, so asking for one must still draw
    // real text rather than an empty family.
    expect(readingFontStack('japanese', READING_FONT_HANDWRITING)).toBe(languageTheme('japanese').font)
    expect(readingFontStack('chinese', 'nonsense')).toBe(languageTheme('chinese').font)
  })
})

describe('readingFonts — normalize', () => {
  it('keeps a value the language offers', () => {
    expect(normalizeReadingFont('chinese', READING_FONT_HANDWRITING)).toBe(READING_FONT_HANDWRITING)
    expect(normalizeReadingFont('japanese', READING_FONT_SERIF)).toBe(READING_FONT_SERIF)
  })

  it('drops a value the language does not offer', () => {
    expect(normalizeReadingFont('japanese', READING_FONT_HANDWRITING)).toBe(DEFAULT_READING_FONT)
    expect(normalizeReadingFont('russian', READING_FONT_HANDWRITING)).toBe(DEFAULT_READING_FONT)
  })

  it('survives junk, null and undefined', () => {
    expect(normalizeReadingFont('chinese', null)).toBe(DEFAULT_READING_FONT)
    expect(normalizeReadingFont('chinese', undefined)).toBe(DEFAULT_READING_FONT)
    expect(normalizeReadingFont('chinese', 42)).toBe(DEFAULT_READING_FONT)
    expect(normalizeReadingFont('chinese', 'Comic Sans')).toBe(DEFAULT_READING_FONT)
  })

  it('defaults to sans — the app’s existing look', () => {
    expect(DEFAULT_READING_FONT).toBe(READING_FONT_SANS)
  })
})

describe('readingFonts — hints', () => {
  it('describes the chosen option, and never the wrong one', () => {
    expect(readingFontHint('chinese', READING_FONT_HANDWRITING)).toContain('楷体')
    expect(readingFontHint('chinese', READING_FONT_SERIF)).not.toContain('楷体')
    // Japanese has no handwriting option, so it falls back to the sans hint.
    expect(readingFontHint('japanese', READING_FONT_HANDWRITING))
      .toBe(readingFontHint('japanese', READING_FONT_SANS))
  })
})

describe('readingFonts — prefs', () => {
  it('shares the one reader prefs record', () => {
    expect(READER_PREFS_KEY).toBe('reader:prefs')
  })

  it('reads an explicit stored choice', () => {
    expect(readingFontFromPrefs({ readingFont: 'handwriting' }, 'chinese')).toBe(READING_FONT_HANDWRITING)
    expect(readingFontFromPrefs({ readingFont: 'serif' }, 'russian')).toBe(READING_FONT_SERIF)
  })

  it('migrates the legacy serif:true flag rather than resetting anyone', () => {
    expect(readingFontFromPrefs({ serif: true }, 'chinese')).toBe(READING_FONT_SERIF)
    expect(readingFontFromPrefs({ serif: true }, 'japanese')).toBe(READING_FONT_SERIF)
    expect(readingFontFromPrefs({ serif: true, furiganaMode: 'always' }, 'russian')).toBe(READING_FONT_SERIF)
  })

  it('treats legacy serif:false as the sans default', () => {
    expect(readingFontFromPrefs({ serif: false }, 'chinese')).toBe(READING_FONT_SANS)
  })

  it('lets an explicit choice win over the legacy flag', () => {
    expect(readingFontFromPrefs({ serif: true, readingFont: 'sans' }, 'chinese')).toBe(READING_FONT_SANS)
    expect(readingFontFromPrefs({ serif: false, readingFont: 'handwriting' }, 'chinese')).toBe(READING_FONT_HANDWRITING)
  })

  it('normalizes a stored choice the language cannot offer', () => {
    expect(readingFontFromPrefs({ readingFont: 'handwriting' }, 'japanese')).toBe(DEFAULT_READING_FONT)
    expect(readingFontFromPrefs({ readingFont: 'wingdings' }, 'chinese')).toBe(DEFAULT_READING_FONT)
  })

  it('defaults when nothing is stored at all', () => {
    expect(readingFontFromPrefs(null, 'chinese')).toBe(DEFAULT_READING_FONT)
    expect(readingFontFromPrefs(undefined, 'chinese')).toBe(DEFAULT_READING_FONT)
    expect(readingFontFromPrefs({}, 'chinese')).toBe(DEFAULT_READING_FONT)
    expect(readingFontFromPrefs('nope', 'chinese')).toBe(DEFAULT_READING_FONT)
  })

  it('writes a patch that keeps the legacy flag in step', () => {
    expect(readingFontPatch('chinese', READING_FONT_SERIF)).toEqual({ readingFont: 'serif', serif: true })
    expect(readingFontPatch('chinese', READING_FONT_HANDWRITING)).toEqual({ readingFont: 'handwriting', serif: false })
    expect(readingFontPatch('chinese', READING_FONT_SANS)).toEqual({ readingFont: 'sans', serif: false })
  })

  it('patches only the font fields, so a merge cannot clobber other prefs', () => {
    expect(Object.keys(readingFontPatch('chinese', READING_FONT_SERIF)).sort()).toEqual(['readingFont', 'serif'])
  })

  it('round-trips: whatever the patch writes is what a reload reads back', () => {
    for (const language of ['chinese', 'japanese', 'russian']) {
      for (const opt of readingFontOptions(language)) {
        const stored = { furiganaMode: 'always', playbackRate: 0.8, ...readingFontPatch(language, opt.value) }
        expect(readingFontFromPrefs(stored, language)).toBe(opt.value)
      }
    }
  })
})
