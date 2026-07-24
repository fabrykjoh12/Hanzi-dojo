import { describe, it, expect } from 'vitest'
import { numberedPinyinToMarks, parseCedictLine } from './cedict'
import { foldForSearch } from './searchFold'

describe('numberedPinyinToMarks', () => {
  it('places the tone mark by vowel priority', () => {
    expect(numberedPinyinToMarks('zhong1 wen2')).toBe('zhōng wén')
    expect(numberedPinyinToMarks('ni3 hao3')).toBe('nǐ hǎo')
    expect(numberedPinyinToMarks('lu:4')).toBe('lǜ')       // u: → ü
    expect(numberedPinyinToMarks('peng2 you5')).toBe('péng you') // 5 = neutral, no mark
    expect(numberedPinyinToMarks('xiu1')).toBe('xiū')      // iu → mark on u
    expect(numberedPinyinToMarks('gui4')).toBe('guì')      // ui → mark on i
  })

  // CC-CEDICT capitalises proper nouns; the capital must survive the tone mark,
  // including when the mark lands on the very first letter.
  it('keeps CC-CEDICT proper-noun capitals', () => {
    expect(numberedPinyinToMarks('Bei3 jing1')).toBe('Běi jīng')
    expect(numberedPinyinToMarks('An1 hui1')).toBe('Ān huī')      // mark on the capital
    expect(numberedPinyinToMarks('Ou1 zhou1')).toBe('Ōu zhōu')
    expect(numberedPinyinToMarks('E2 luo2 si1')).toBe('É luó sī')
    expect(numberedPinyinToMarks('Lu:3')).toBe('Lǚ')              // u: → ü, capital kept
    expect(numberedPinyinToMarks('A5')).toBe('A')                 // neutral tone, no mark
  })

  it('leaves ordinary lower-case readings alone', () => {
    expect(numberedPinyinToMarks('an1 quan2')).toBe('ān quán')
    expect(numberedPinyinToMarks('ou3 er3')).toBe('ǒu ěr')
  })
})

describe('parseCedictLine', () => {
  it('parses a standard entry', () => {
    const r = parseCedictLine('傳統 传统 [chuan2 tong3] /tradition/traditional/')
    expect(r).toEqual({
      traditional: '傳統',
      simplified: '传统',
      pinyin: 'chuán tǒng',
      pinyinPlain: 'chuan tong',
      definitions: ['tradition', 'traditional'],
    })
  })
  it('keeps the display capital on a proper noun but folds it away for search', () => {
    const r = parseCedictLine('安徽 安徽 [An1 hui1] /Anhui province/')
    expect(r.pinyin).toBe('Ān huī')       // display keeps CC-CEDICT's capital
    expect(r.pinyinPlain).toBe('an hui')  // search stays lower-case + toneless
    // A learner typing lower-case toneless pinyin still matches the search field.
    const bj = parseCedictLine('北京 北京 [Bei3 jing1] /Beijing/')
    expect(bj.pinyin).toBe('Běi jīng')
    expect(bj.pinyinPlain.replace(' ', '')).toContain(foldForSearch('beijing'))
    expect(bj.pinyinPlain.replace(' ', '')).toContain(foldForSearch('BěiJīng'))
  })
  it('returns null for comments and blanks', () => {
    expect(parseCedictLine('# CC-CEDICT')).toBeNull()
    expect(parseCedictLine('   ')).toBeNull()
  })
})
