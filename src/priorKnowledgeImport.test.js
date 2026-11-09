import { describe, it, expect } from 'vitest'
import { matchPastedText, UNMATCHED_SAMPLE_LIMIT } from './priorKnowledgeImport'

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

  it('hands back the lines it did not recognise, not only how many', () => {
    // FAB-30 finding 4. The count alone made a typo, a header row and a paste
    // in the wrong script look identical — and the script case is the common
    // one, because the vocabulary is simplified-only.
    const out = matchPastedText('你好\n# my deck\n\n  zzz  ', ZH, 'chinese')
    expect(out.unmatchedSamples).toEqual(['# my deck', 'zzz'])
  })

  it('trims a long line rather than putting a whole CSV row on screen', () => {
    const long = 'x'.repeat(200)
    const [sample] = matchPastedText(long, ZH, 'chinese').unmatchedSamples
    expect(sample).toHaveLength(61)        // 60 characters plus the ellipsis
    expect(sample.endsWith('…')).toBe(true)
  })

  it('cuts on a character, never through a surrogate pair', () => {
    // 𠀋 is a supplementary-plane hanzi: one code point, two UTF-16 units. A
    // slice by units at the boundary would leave a lone surrogate on screen.
    const long = '𠀋'.repeat(100)
    const [sample] = matchPastedText(long, ZH, 'chinese').unmatchedSamples
    expect(Array.from(sample)).toHaveLength(61)
    expect(sample.endsWith('…')).toBe(true)
    // No unpaired surrogate survived the cut.
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(sample)).toBe(false)
  })

  it('keeps the sample bounded however large the paste is', () => {
    // A 50,000-line paste must not put 50,000 strings into React state.
    const many = Array.from({ length: 500 }, (_, i) => 'nope' + i).join('\n')
    const out = matchPastedText(many, ZH, 'chinese')
    expect(out.unmatchedLines).toBe(500)
    expect(out.unmatchedSamples).toHaveLength(UNMATCHED_SAMPLE_LIMIT)
  })

  it('returns empty for blank input', () => {
    expect(matchPastedText('', ZH, 'chinese')).toEqual({
      matchedIds: [], matchedCount: 0, unmatchedLines: 0, unmatchedSamples: [],
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
