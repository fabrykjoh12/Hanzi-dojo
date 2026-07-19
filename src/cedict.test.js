import { describe, it, expect } from 'vitest'
import { numberedPinyinToMarks, parseCedictLine } from './cedict'

describe('numberedPinyinToMarks', () => {
  it('places the tone mark by vowel priority', () => {
    expect(numberedPinyinToMarks('zhong1 wen2')).toBe('zhōng wén')
    expect(numberedPinyinToMarks('ni3 hao3')).toBe('nǐ hǎo')
    expect(numberedPinyinToMarks('lu:4')).toBe('lǜ')       // u: → ü
    expect(numberedPinyinToMarks('peng2 you5')).toBe('péng you') // 5 = neutral, no mark
    expect(numberedPinyinToMarks('xiu1')).toBe('xiū')      // iu → mark on u
    expect(numberedPinyinToMarks('gui4')).toBe('guì')      // ui → mark on i
  })
})

describe('parseCedictLine', () => {
  it('parses a standard entry', () => {
    const r = parseCedictLine('傳統 管理 [chuan2 tong3] /tradition/traditional/')
    expect(r).toEqual({
      traditional: '傳統',
      simplified: '管理',
      pinyin: 'chuán tǒng',
      pinyinPlain: 'chuan tong',
      definitions: ['tradition', 'traditional'],
    })
  })
  it('returns null for comments and blanks', () => {
    expect(parseCedictLine('# CC-CEDICT')).toBeNull()
    expect(parseCedictLine('   ')).toBeNull()
  })
})
