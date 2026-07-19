import { describe, it, expect } from 'vitest'
import { toneOf, splitHanziWithTones, TONE_CLASS } from './toneColor'

describe('toneOf', () => {
  it('reads the tone off a marked syllable', () => {
    expect(toneOf('zhōng')).toBe(1)
    expect(toneOf('wén')).toBe(2)
    expect(toneOf('nǐ')).toBe(3)
    expect(toneOf('guì')).toBe(4)
    expect(toneOf('you')).toBe(5) // no mark = neutral
  })
})

describe('splitHanziWithTones', () => {
  it('aligns each character with its syllable tone', () => {
    expect(splitHanziWithTones('中文', 'zhōng wén')).toEqual([
      { char: '中', tone: 1 },
      { char: '文', tone: 2 },
    ])
  })
  it('falls back to neutral when counts mismatch', () => {
    expect(splitHanziWithTones('你好呀', 'nǐ hǎo')).toEqual([
      { char: '你', tone: 3 },
      { char: '好', tone: 3 },
      { char: '呀', tone: 5 },
    ])
  })
})

describe('TONE_CLASS', () => {
  it('maps tones to class names', () => {
    expect(TONE_CLASS[1]).toBe('tone-1')
    expect(TONE_CLASS[5]).toBe('tone-5')
  })
})
