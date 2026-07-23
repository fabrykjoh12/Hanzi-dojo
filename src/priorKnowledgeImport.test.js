import { describe, it, expect } from 'vitest'
import { matchPastedText } from './priorKnowledgeImport'

const ZH = {
  '你好': { id: 'v-nihao', word: '你好', level: 1, sort_order: 1 },
  '谢谢': { id: 'v-xiexie', word: '谢谢', level: 1, sort_order: 2 },
  '中国': { id: 'v-zhongguo', word: '中国', level: 2, sort_order: 3 },
}

describe('matchPastedText — Chinese', () => {
  it('finds words in a bare column', () => {
    const out = matchPastedText('你好\n谢谢\n', ZH, 'chinese')
    expect(out.matchedIds).toEqual(['v-nihao', 'v-xiexie'])
    expect(out.matchedCount).toBe(2)
  })

  it('ignores structure — an Anki CSV row works the same', () => {
    const csv = '你好,"nǐ hǎo","hello, hi"\n中国,"Zhōngguó","China"'
    const out = matchPastedText(csv, ZH, 'chinese')
    expect(out.matchedIds).toEqual(['v-nihao', 'v-zhongguo'])
  })

  it('collapses duplicates, keeping first-seen order', () => {
    const out = matchPastedText('谢谢\n你好\n谢谢', ZH, 'chinese')
    expect(out.matchedIds).toEqual(['v-xiexie', 'v-nihao'])
    expect(out.matchedCount).toBe(2)
  })

  it('counts lines that contributed nothing', () => {
    const out = matchPastedText('你好\n# my deck\n\nzzz', ZH, 'chinese')
    expect(out.matchedIds).toEqual(['v-nihao'])
    expect(out.unmatchedLines).toBe(2)
  })

  it('returns empty for blank input', () => {
    expect(matchPastedText('', ZH, 'chinese')).toEqual({
      matchedIds: [], matchedCount: 0, unmatchedLines: 0,
    })
    expect(matchPastedText('   \n\n', ZH, 'chinese').matchedCount).toBe(0)
  })
})

describe('matchPastedText — Japanese', () => {
  const JA = {
    '食べます': { id: 'v-taberu', word: '食べます', reading: 'たべます', level: 1 },
    'こうえん': { id: 'v-kouen', word: 'こうえん', reading: 'こうえん', level: 1 },
  }

  it('resolves a conjugated form to its stored entry', () => {
    const out = matchPastedText('食べた', JA, 'japanese')
    expect(out.matchedIds).toEqual(['v-taberu'])
  })

  it('matches a kana word stored in kana', () => {
    const out = matchPastedText('こうえん', JA, 'japanese')
    expect(out.matchedIds).toEqual(['v-kouen'])
  })
})
