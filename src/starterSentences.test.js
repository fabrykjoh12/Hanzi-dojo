import { describe, it, expect } from 'vitest'
import data from '../data/starter-sentences.chinese.json'
import { sentenceForReason, charsToLearn, understandPct, audioSrcFor } from './starterSentences'
import { REASONS } from './prelogin'

describe('sentenceForReason', () => {
  it('returns a sentence for a known reason', () => {
    expect(sentenceForReason('travel').id).toBe('travel-1')
  })
  it('falls back to the default bucket for an unknown/empty reason', () => {
    expect(sentenceForReason('klingon').id).toBe('default-1')
    expect(sentenceForReason(null).id).toBe('default-1')
  })
  it('wraps the index modulo the bucket length', () => {
    expect(sentenceForReason('travel', 5).id).toBe('travel-1')
  })
})

describe('charsToLearn', () => {
  it('uses the learn list, in sentence order, max 3', () => {
    const got = charsToLearn(sentenceForReason('family')).map(w => w.hanzi)
    expect(got).toEqual(['我', '爱', '家'])
  })
  it('falls back to the shortest non-punct words when no learn list', () => {
    const s = { words: [
      { hanzi: '中文', pinyin: 'zhōngwén', gloss: 'Chinese' },
      { hanzi: '好', pinyin: 'hǎo', gloss: 'good' },
      { hanzi: '。', pinyin: '', gloss: '', punct: true },
    ] }
    expect(charsToLearn(s).map(w => w.hanzi)).toEqual(['好', '中文'])
  })
})

describe('understandPct', () => {
  it('is 0 with nothing revealed and 100 when every non-punct word is revealed', () => {
    const s = sentenceForReason('travel')          // 3 words + 1 punct
    expect(understandPct(s, [])).toBe(0)
    expect(understandPct(s, [0, 1, 2])).toBe(100)   // punctuation index 3 not needed
  })
  it('ignores punctuation indexes in the numerator', () => {
    const s = sentenceForReason('travel')
    expect(understandPct(s, [3])).toBe(0)
  })
})

describe('audioSrcFor', () => {
  it('builds a word clip path', () => {
    expect(audioSrcFor('travel-1', 2)).toBe('/starter-audio/travel-1-2.mp3')
  })
  it('builds a whole-sentence clip path', () => {
    expect(audioSrcFor('travel-1', null)).toBe('/starter-audio/travel-1.mp3')
  })
})

describe('dataset integrity', () => {
  it('has a bucket for every reason plus default', () => {
    for (const r of REASONS) expect(Array.isArray(data[r.key])).toBe(true)
    expect(Array.isArray(data.default)).toBe(true)
  })
  it('every sentence words concatenate back to its hanzi, with pinyin on real words', () => {
    for (const bucket of Object.values(data)) {
      for (const s of bucket) {
        expect(s.words.map(w => w.hanzi).join('')).toBe(s.hanzi)
        for (const w of s.words) if (!w.punct) expect(w.pinyin.length).toBeGreaterThan(0)
        if (s.learn) for (const h of s.learn) {
          expect(s.words.some(w => w.hanzi === h)).toBe(true)
        }
      }
    }
  })
})
