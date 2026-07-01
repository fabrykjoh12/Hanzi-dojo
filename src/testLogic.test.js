import { describe, it, expect, vi } from 'vitest'

// testLogic.js imports the Supabase client at module load; stub it so the pure
// helpers can be tested in isolation.
vi.mock('./supabase', () => ({ supabase: {} }))

import { normalizePinyin, checkAnswer } from './testLogic'

describe('normalizePinyin', () => {
  it('strips tone marks, spaces and case', () => {
    expect(normalizePinyin('Nǐ Hǎo')).toBe('nihao')
    expect(normalizePinyin('lǜ')).toBe('lu')
    expect(normalizePinyin('zhōng guó')).toBe('zhongguo')
  })
  it('folds the v/ü spelling', () => {
    expect(normalizePinyin('nv')).toBe('nu')
    expect(normalizePinyin('nü')).toBe('nu')
  })
  it('handles empty input', () => {
    expect(normalizePinyin('')).toBe('')
    expect(normalizePinyin(null)).toBe('')
  })
})

describe('checkAnswer', () => {
  const vocab = { word: '好', reading: 'hǎo', reading_plain: 'hao' }

  it('accepts the exact character', () => {
    expect(checkAnswer('好', vocab)).toBe(true)
  })
  it('accepts tone-insensitive pinyin (plain or with marks)', () => {
    expect(checkAnswer('hao', vocab)).toBe(true)
    expect(checkAnswer('hǎo', vocab)).toBe(true)
    expect(checkAnswer(' HAO ', vocab)).toBe(true)
  })
  it('rejects a wrong answer and empty input', () => {
    expect(checkAnswer('bad', vocab)).toBe(false)
    expect(checkAnswer('', vocab)).toBe(false)
  })
})
