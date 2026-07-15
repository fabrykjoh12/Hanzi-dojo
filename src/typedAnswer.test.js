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

describe('checkTypedAnswer — Japanese kana/romaji', () => {
  it('accepts the kana reading directly', () => {
    expect(checkTypedAnswer('たべる', ja, true)).toBe(true)
  })
  it('accepts romaji converted through wanakana', () => {
    expect(checkTypedAnswer('taberu', ja, true)).toBe(true)
  })
  it('accepts romaji case-insensitively', () => {
    expect(checkTypedAnswer('TABERU', ja, true)).toBe(true)
  })
  it('rejects romaji that does not convert to the reading', () => {
    expect(checkTypedAnswer('taberuu', ja, true)).toBe(false)
  })
  it('handles a katakana-word card with a hiragana reading', () => {
    const neko = { word: 'ねこ', reading: 'ねこ' }
    expect(checkTypedAnswer('neko', neko, true)).toBe(true)
    expect(checkTypedAnswer('ねこ', neko, true)).toBe(true)
  })
})

// From user report: 何 (stored なん) rejected "nani"; 水 exists as two cards
// (すい and みず) and each rejected the other's reading.
describe('checkTypedAnswer — Japanese alternate readings', () => {
  it('accepts なに and なん for 何', () => {
    const nan = { word: '何', reading: 'なん' }
    expect(checkTypedAnswer('nan', nan, true)).toBe(true)
    expect(checkTypedAnswer('nani', nan, true)).toBe(true)
    expect(checkTypedAnswer('なに', nan, true)).toBe(true)
  })
  it('accepts mizu and sui for either 水 card', () => {
    expect(checkTypedAnswer('sui', { word: '水', reading: 'みず' }, true)).toBe(true)
    expect(checkTypedAnswer('mizu', { word: '水', reading: 'すい' }, true)).toBe(true)
  })
  it('accepts yon and shi for 四, kyuu and ku for 九', () => {
    const four = { word: '四', reading: 'し' }
    expect(checkTypedAnswer('yon', four, true)).toBe(true)
    expect(checkTypedAnswer('shi', four, true)).toBe(true)
    const nine = { word: '九', reading: 'きゅう' }
    expect(checkTypedAnswer('ku', nine, true)).toBe(true)
    expect(checkTypedAnswer('kyuu', nine, true)).toBe(true)
  })
  it('still rejects wrong answers for alt-reading words', () => {
    expect(checkTypedAnswer('nana', { word: '何', reading: 'なん' }, true)).toBe(false)
    expect(checkTypedAnswer('kawa', { word: '水', reading: 'みず' }, true)).toBe(false)
  })
})

// Stored N5 forms carry decorations the learner should not have to type.
describe('checkTypedAnswer — decorated stored forms', () => {
  it('accepts a phrase without its trailing 。', () => {
    const sumimasen = { word: 'すみません。', reading: 'すみません。' }
    expect(checkTypedAnswer('sumimasen', sumimasen, true)).toBe(true)
    expect(checkTypedAnswer('すみません', sumimasen, true)).toBe(true)
  })
  it('accepts ～-placeholder words without the ～', () => {
    const kono = { word: 'この～', reading: 'この～' }
    expect(checkTypedAnswer('kono', kono, true)).toBe(true)
    expect(checkTypedAnswer('この', kono, true)).toBe(true)
  })
  it('accepts parenthesized-optional forms with and without the option', () => {
    const ato = { word: '後(で)', reading: 'あと(で)' }
    expect(checkTypedAnswer('ato', ato, true)).toBe(true)
    expect(checkTypedAnswer('atode', ato, true)).toBe(true)
    expect(checkTypedAnswer('あとで', ato, true)).toBe(true)
    expect(checkTypedAnswer('後で', ato, true)).toBe(true)
  })
  it('ignores trailing punctuation in the typed input itself', () => {
    expect(checkTypedAnswer('たべる。', ja, true)).toBe(true)
  })
})
