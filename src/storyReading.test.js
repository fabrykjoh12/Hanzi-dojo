import { describe, it, expect } from 'vitest'
import { wordStatus, todayWordsInStory, calculateStoryReadability, splitSpeaker, readingVisibleFor, isDueSoon, kanjiStem } from './storyReading'

// ── wordStatus ──────────────────────────────────────────────────────────────
describe('wordStatus', () => {
  it('is not_started when there is no card', () => {
    expect(wordStatus('v1', {})).toBe('not_started')
  })
  it('is mastered when the card is easy', () => {
    expect(wordStatus('v1', { v1: { is_easy: true, state: 'review' } })).toBe('mastered')
  })
  it('is review when in the review state (and not easy)', () => {
    expect(wordStatus('v1', { v1: { is_easy: false, state: 'review' } })).toBe('review')
  })
  it('is learning for a started-but-not-review card', () => {
    expect(wordStatus('v1', { v1: { is_easy: false, state: 'learning' } })).toBe('learning')
    expect(wordStatus('v1', { v1: { state: 'relearning' } })).toBe('learning')
  })
})

// ── todayWordsInStory ───────────────────────────────────────────────────────
describe('todayWordsInStory', () => {
  it('returns the story words that were studied today', () => {
    expect(todayWordsInStory(['今天', '我', '公园'], ['公园', '散步'])).toEqual(['公园'])
  })
  it('preserves story order and drops duplicates', () => {
    expect(todayWordsInStory(['我', '公园', '我'], ['我', '公园'])).toEqual(['我', '公园'])
  })
  it('is empty when there is no overlap / for missing inputs', () => {
    expect(todayWordsInStory(['我', '你'], ['他'])).toEqual([])
    expect(todayWordsInStory([], ['我'])).toEqual([])
    expect(todayWordsInStory(undefined, undefined)).toEqual([])
  })
})

// ── splitSpeaker ────────────────────────────────────────────────────────────
describe('splitSpeaker', () => {
  it('splits a full-width or ASCII label near the start', () => {
    expect(splitSpeaker('小明：你好')).toEqual({ speaker: '小明', text: '你好' })
    expect(splitSpeaker('Bob: hi')).toEqual({ speaker: 'Bob', text: 'hi' })
  })
  it('leaves plain narration untouched', () => {
    expect(splitSpeaker('今天天气很好')).toEqual({ speaker: null, text: '今天天气很好' })
  })
})

// ── calculateStoryReadability ───────────────────────────────────────────────
const zh = (word, id) => ({ id, word })
const VOCAB = {
  今天: zh('今天', 'a'), 我: zh('我', 'b'), 朋友: zh('朋友', 'c'),
  公园: zh('公园', 'd'), 散步: zh('散步', 'e'), 和: zh('和', 'f'), 去: zh('去', 'g'),
}

describe('calculateStoryReadability — general', () => {
  it('empty story → zero everything', () => {
    const r = calculateStoryReadability({ content: '', vocabMap: VOCAB, cards: {} })
    expect(r).toMatchObject({ totalUnique: 0, knownCount: 0, newCount: 0, knownPct: 0 })
    expect(r.storyWords).toEqual([])
    expect(r.newWords).toEqual([])
  })
  it('empty vocabulary → nothing matched', () => {
    const r = calculateStoryReadability({ content: '今天我去公园', vocabMap: {}, cards: {} })
    expect(r.totalUnique).toBe(0)
    expect(r.knownPct).toBe(0)
  })
  it('all words known (review or mastered) → 100%', () => {
    const r = calculateStoryReadability({
      content: '今天我', vocabMap: VOCAB, cards: { a: { state: 'review' }, b: { is_easy: true } },
    })
    expect(r).toMatchObject({ totalUnique: 2, knownCount: 2, knownPct: 100 })
  })
  it('no words known → 0%, all new', () => {
    const r = calculateStoryReadability({ content: '今天我', vocabMap: VOCAB, cards: {} })
    expect(r).toMatchObject({ totalUnique: 2, knownCount: 0, newCount: 2, knownPct: 0 })
    expect(r.newWords.map(v => v.word).sort()).toEqual(['今天', '我'])
  })
  it('repeated words count once', () => {
    const r = calculateStoryReadability({ content: '我我我', vocabMap: VOCAB, cards: {} })
    expect(r.totalUnique).toBe(1)
    expect(r.storyWords).toEqual(['我'])
  })
  it('counts total occurrences (with duplicates) per word', () => {
    const r = calculateStoryReadability({ content: '我我今天', vocabMap: VOCAB, cards: {} })
    expect(r.counts.get('我')).toBe(2)
    expect(r.counts.get('今天')).toBe(1)
    expect(r.counts.get('公园')).toBeUndefined()
  })
  it('ignores punctuation and whitespace', () => {
    const r = calculateStoryReadability({ content: '今天，我。\n和 去', vocabMap: VOCAB, cards: {} })
    expect(r.totalUnique).toBe(4)   // 今天 我 和 去
  })
  it('mixed known / learning / new', () => {
    const r = calculateStoryReadability({
      content: '今天我朋友', vocabMap: VOCAB,
      cards: { a: { state: 'review' }, c: { state: 'learning' } },  // b (我) has no card
    })
    expect(r).toMatchObject({ totalUnique: 3, knownCount: 1, learningCount: 1, newCount: 1, knownPct: 33 })
  })
})

describe('calculateStoryReadability — Chinese', () => {
  it('greedy longest match: a longer word wins over its shorter parts', () => {
    const V = { 公园: zh('公园', 'd'), 公: zh('公', 'h'), 园: zh('园', 'i') }
    const r = calculateStoryReadability({ content: '公园', vocabMap: V, cards: {} })
    expect(r.totalUnique).toBe(1)
    expect(r.storyWords).toEqual(['公园'])
  })
  it('punctuation without spaces still segments by vocab', () => {
    const r = calculateStoryReadability({ content: '今天，我和朋友。', vocabMap: VOCAB, cards: {} })
    expect(r.storyWords.sort()).toEqual(['今天', '和', '我', '朋友'].sort())
  })
  it('excludes proper names (characterNames) when language is chinese', () => {
    // 小明 is a curated name; 小 and 明 are (hypothetically) vocab.
    const V = { 小: zh('小', 'x'), 明: zh('明', 'y'), 我: zh('我', 'b') }
    const named = calculateStoryReadability({ content: '小明我', vocabMap: V, cards: {}, language: 'chinese' })
    expect(named.storyWords).toEqual(['我'])         // 小明 skipped as a name
    const noLang = calculateStoryReadability({ content: '小明我', vocabMap: V, cards: {} })
    expect(noLang.storyWords.sort()).toEqual(['小', '明', '我'].sort())   // no name handling
  })
  it('strips speaker labels — dialogue text only is counted', () => {
    const V = { 小: zh('小', 'x'), 明: zh('明', 'y'), 今天: zh('今天', 'a') }
    const r = calculateStoryReadability({ content: '小明：今天', vocabMap: V, cards: {} })
    expect(r.storyWords).toEqual(['今天'])   // the "小明：" label is not counted
  })
})

describe('calculateStoryReadability — Japanese', () => {
  const JV = { 猫: zh('猫', 'n'), は: zh('は', 'p'), 食べる: zh('食べる', 'v') }
  it('excludes single-kana particles when language is japanese', () => {
    const ja = calculateStoryReadability({ content: '猫は猫', vocabMap: JV, cards: {}, language: 'japanese' })
    expect(ja.storyWords).toEqual(['猫'])                  // は excluded, 猫 once
    const noLang = calculateStoryReadability({ content: '猫は猫', vocabMap: JV, cards: {} })
    expect(noLang.storyWords.sort()).toEqual(['は', '猫'].sort())   // no particle exclusion
  })
  it('counts multi-token kanji vocabulary as one word', () => {
    const r = calculateStoryReadability({ content: '食べる。', vocabMap: JV, cards: {}, language: 'japanese' })
    expect(r.storyWords).toEqual(['食べる'])
  })
})

// ── kanjiStem ────────────────────────────────────────────────────────────────
describe('kanjiStem', () => {
  it('drops trailing okurigana after the last kanji', () => {
    expect(kanjiStem('書く')).toBe('書')
    expect(kanjiStem('見せる')).toBe('見')
    expect(kanjiStem('終わる')).toBe('終')
  })
  it('keeps the whole word for all-kanji entries', () => {
    expect(kanjiStem('意見')).toBe('意見')
  })
  it('keeps internal kana up to the last kanji', () => {
    expect(kanjiStem('引っ越す')).toBe('引っ越')
  })
  it('is empty for kana-only words', () => {
    expect(kanjiStem('これ')).toBe('')
    expect(kanjiStem('やっぱり')).toBe('')
    expect(kanjiStem('')).toBe('')
  })
})

// ── Japanese conjugation-tolerant matching ───────────────────────────────────
describe('calculateStoryReadability — Japanese conjugation', () => {
  const v = (word, id, reading) => ({ id, word, reading })
  const JV2 = {
    書く: v('書く', 'w', 'かく'),
    見る: v('見る', 'm', 'みる'),
    見せる: v('見せる', 's', 'みせる'),
    意見: v('意見', 'o', 'いけん'),
  }

  it('matches a conjugated verb to its dictionary entry', () => {
    // 書いて (te-form) resolves to 書く via the kanji stem.
    const r = calculateStoryReadability({ content: '漫画を書いています。', vocabMap: JV2, cards: {}, language: 'japanese' })
    expect(r.storyWords).toContain('書く')
  })

  it('disambiguates homographs by okurigana (見せました → 見せる, not 見る)', () => {
    const r = calculateStoryReadability({ content: '意見を見せました。', vocabMap: JV2, cards: {}, language: 'japanese' })
    expect(r.storyWords).toContain('意見')
    expect(r.storyWords).toContain('見せる')
    expect(r.storyWords).not.toContain('見る')
  })

  it('does not stem-match across a kanji compound (見物 is not 見る)', () => {
    const r = calculateStoryReadability({ content: '見物', vocabMap: { 見る: JV2.見る }, cards: {}, language: 'japanese' })
    expect(r.storyWords).toEqual([])
  })

  it('matches an alternate spelling from a multi-form vocab entry', () => {
    const V = { 'やはり; やっぱり': v('やはり; やっぱり', 'y', 'やはり') }
    const r = calculateStoryReadability({ content: 'やっぱり', vocabMap: V, cards: {}, language: 'japanese' })
    expect(r.totalUnique).toBe(1)
  })
})

describe('calculateStoryReadability — Russian', () => {
  const RV = { кот: zh('кот', 'k'), дом: zh('дом', 'd') }
  it('counts whitespace-separated words, ignoring punctuation', () => {
    const r = calculateStoryReadability({ content: 'кот, дом.', vocabMap: RV, cards: {}, language: 'russian' })
    expect(r.storyWords.slice().sort()).toEqual(['дом', 'кот'].sort())
    expect(r.totalUnique).toBe(2)
  })
  it('is case-sensitive (no normalization / stemming — preserves current behavior)', () => {
    const r = calculateStoryReadability({ content: 'Кот', vocabMap: RV, cards: {}, language: 'russian' })
    expect(r.totalUnique).toBe(0)   // 'Кот' ≠ vocab 'кот'
  })
})

describe('calculateStoryReadability — status rules', () => {
  const cases = [
    ['not_started (no card)', {}, 0],
    ['learning', { a: { state: 'learning' } }, 0],
    ['review', { a: { state: 'review' } }, 100],
    ['mastered (is_easy)', { a: { is_easy: true } }, 100],
  ]
  cases.forEach(([label, cards, pct]) => {
    it('single word: ' + label + ' → ' + pct + '% known', () => {
      const r = calculateStoryReadability({ content: '今天', vocabMap: VOCAB, cards })
      expect(r.knownPct).toBe(pct)
    })
  })
})

// ── readingVisibleFor (furigana modes) ───────────────────────────────────────
describe('readingVisibleFor', () => {
  it('always → every status shows a reading', () => {
    for (const st of ['not_started', 'learning', 'review', 'mastered']) {
      expect(readingVisibleFor('always', st)).toBe(true)
    }
  })
  it('hidden → nothing shows a reading', () => {
    for (const st of ['not_started', 'learning', 'review', 'mastered']) {
      expect(readingVisibleFor('hidden', st)).toBe(false)
    }
  })
  it('learning → only still-learning words', () => {
    expect(readingVisibleFor('learning', 'learning')).toBe(true)
    expect(readingVisibleFor('learning', 'not_started')).toBe(false)
    expect(readingVisibleFor('learning', 'review')).toBe(false)
    expect(readingVisibleFor('learning', 'mastered')).toBe(false)
  })
  it('unknown → only not-yet-started words (and name-like, cardless tokens)', () => {
    expect(readingVisibleFor('unknown', 'not_started')).toBe(true)
    expect(readingVisibleFor('unknown', 'learning')).toBe(false)
    expect(readingVisibleFor('unknown', 'review')).toBe(false)
    expect(readingVisibleFor('unknown', 'mastered')).toBe(false)
  })
  it('an unknown mode string is treated as hidden', () => {
    expect(readingVisibleFor('nonsense', 'not_started')).toBe(false)
  })
})

// ── isDueSoon ────────────────────────────────────────────────────────────────
describe('isDueSoon', () => {
  const now = new Date('2026-07-13T12:00:00Z').getTime()
  it('false for missing / invalid dates', () => {
    expect(isDueSoon(null, now)).toBe(false)
    expect(isDueSoon(undefined, now)).toBe(false)
    expect(isDueSoon('not-a-date', now)).toBe(false)
  })
  it('true when due within the window (including overdue)', () => {
    expect(isDueSoon('2026-07-13T18:00:00Z', now)).toBe(true)   // 6h out
    expect(isDueSoon('2026-07-10T00:00:00Z', now)).toBe(true)   // overdue
  })
  it('false when due beyond the window', () => {
    expect(isDueSoon('2026-07-20T12:00:00Z', now)).toBe(false)  // a week out
  })
  it('honors a custom window', () => {
    const inTwoHours = '2026-07-13T14:00:00Z'
    expect(isDueSoon(inTwoHours, now, 60 * 60 * 1000)).toBe(false)      // 1h window
    expect(isDueSoon(inTwoHours, now, 3 * 60 * 60 * 1000)).toBe(true)   // 3h window
  })
})
