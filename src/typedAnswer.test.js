import { describe, it, expect, vi } from 'vitest'

// typedAnswer.js pulls in testLogic → the Supabase client at module load;
// stub it so the pure matcher can be tested in isolation (same as
// testLogic.test.js).
vi.mock('./supabase', () => ({ supabase: {} }))

import { checkTypedAnswer } from './typedAnswer'

// Chinese card: 海 hǎi (reading stored tone-marked, reading_plain numeric).
const zh = { word: '海', reading: 'hǎi', reading_plain: 'hai3' }
// Japanese card: 食べる / たべる.
const ja = { word: '食べる', reading: 'たべる' }

describe('checkTypedAnswer — general', () => {
  it('matches the exact character/word', () => {
    expect(checkTypedAnswer('海', zh, false)).toBe(true)
    expect(checkTypedAnswer('食べる', ja, true)).toBe(true)
  })
  it('trims surrounding whitespace', () => {
    expect(checkTypedAnswer('   hǎi   ', zh, false)).toBe(true)
  })
  it('is case-insensitive on the reading', () => {
    expect(checkTypedAnswer('HAI', zh, false)).toBe(true)
  })
  it('returns false for a wrong answer', () => {
    expect(checkTypedAnswer('shan', zh, false)).toBe(false)
    expect(checkTypedAnswer('neko', ja, true)).toBe(false)
  })
  it('returns false for empty / whitespace-only input', () => {
    expect(checkTypedAnswer('', zh, false)).toBe(false)
    expect(checkTypedAnswer('   ', zh, false)).toBe(false)
    expect(checkTypedAnswer(null, zh, false)).toBe(false)
    expect(checkTypedAnswer(undefined, ja, true)).toBe(false)
  })
  it('does not crash on missing vocab fields', () => {
    expect(checkTypedAnswer('anything', {}, false)).toBe(false)
    expect(checkTypedAnswer('anything', {}, true)).toBe(false)
    expect(checkTypedAnswer('', {}, false)).toBe(false)
  })
})

describe('checkTypedAnswer — Chinese pinyin', () => {
  it('accepts pinyin with tone marks', () => {
    expect(checkTypedAnswer('hǎi', zh, false)).toBe(true)
  })
  it('accepts pinyin without tones (tone-insensitive)', () => {
    expect(checkTypedAnswer('hai', zh, false)).toBe(true)
  })
  it('accepts numeric tone notation', () => {
    expect(checkTypedAnswer('hai3', zh, false)).toBe(true)
  })
  it('accepts a wrong tone (tone-insensitive matching)', () => {
    expect(checkTypedAnswer('hài', zh, false)).toBe(true)
    expect(checkTypedAnswer('hai4', zh, false)).toBe(true)
  })
  it('matches against reading_plain when reading is absent', () => {
    expect(checkTypedAnswer('hai', { reading_plain: 'hai3' }, false)).toBe(true)
  })
  it('treats ü / v the same and ignores apostrophes', () => {
    const nv = { word: '女', reading: 'nǚ', reading_plain: 'nv3' }
    expect(checkTypedAnswer('nu', nv, false)).toBe(true)
    expect(checkTypedAnswer('nv', nv, false)).toBe(true)
  })
})

// The Japanese track was removed (see CLAUDE.md — Chinese-only) along with
// the wanakana dependency that did romaji↔kana conversion. isJapanese is
// never true in the live app anymore; what's left is exact-form matching
// only (still exercised via general/decorated-form cases above, which use
// kana input directly). Kept as a minimal defensive check that a romaji
// guess no longer silently "passes" through some other path.
describe('checkTypedAnswer — isJapanese branch (unreachable in the live app)', () => {
  it('accepts the exact kana reading, not a romaji guess', () => {
    expect(checkTypedAnswer('たべる', ja, true)).toBe(true)
    expect(checkTypedAnswer('taberu', ja, true)).toBe(false)
  })
})
