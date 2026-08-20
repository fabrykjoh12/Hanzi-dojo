import { describe, it, expect } from 'vitest'
import {
  analyzeStory,
  calibrateCorpus,
  proposeDefaults,
  contentSimilarity,
  trigramCounts,
  percentile,
  cjkLength,
} from './storyCorpusCalibration.mjs'
import { calculateStoryReadability } from './src/storyReading.js'

// A tiny two-level pool. Level assignments are what the out-of-level and
// unknown measurements hang on.
const VOCAB = [
  { word: '我', level: 1, sort_order: 1 },
  { word: '你', level: 1, sort_order: 2 },
  { word: '喜欢', level: 1, sort_order: 3 },
  { word: '吃', level: 1, sort_order: 4 },
  { word: '苹果', level: 1, sort_order: 5 },
  { word: '妈妈', level: 1, sort_order: 6 },
  { word: '学校', level: 1, sort_order: 7 },
  { word: '公园', level: 3, sort_order: 1 },
  { word: '锻炼', level: 3, sort_order: 2 },
]
const vocabMap = Object.fromEntries(VOCAB.map(v => [v.word, v]))

describe('cjkLength / percentile', () => {
  it('counts only CJK characters', () => {
    expect(cjkLength('我abc，你！')).toBe(2)
    expect(cjkLength('hello')).toBe(0)
  })
  it('interpolates percentiles', () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5)
    expect(percentile([5], 0.9)).toBe(5)
    expect(percentile([], 0.5)).toBe(0)
  })
})

describe('analyzeStory', () => {
  const story = {
    title: 'T', level: 1, presentation: 'paced',
    content: '我喜欢吃苹果。\n妈妈：你喜欢吃苹果吗？\n我去公园锻炼。',
  }

  it('vocabulary counts come from the canonical engine', () => {
    const a = analyzeStory(story, vocabMap)
    const { counts } = calculateStoryReadability({ content: story.content, vocabMap, cards: {}, language: 'chinese' })
    expect(a.distinctVocab).toBe([...counts.keys()].length)
    expect(a.occurrencesTotal).toBe([...counts.values()].reduce((x, y) => x + y, 0))
  })

  it('separates same-level, out-of-level and unknown', () => {
    const a = analyzeStory(story, vocabMap)
    // 公园 and 锻炼 are level 3 in a level-1 story
    expect(a.outOfLevelDistinct).toBe(2)
    expect(a.outOfLevelCharShare).toBeGreaterThan(0)
    // 去 is not in the pool at all → part of an unknown run (the canonical
    // engine may keep the segmenter's 我去 as one atomic span — that grouping
    // is the reader's, and the calibration inherits it on purpose)
    expect(a.unknownRuns.some(r => r.includes('去'))).toBe(true)
    expect(a.unknownCharShare).toBeGreaterThan(0)
    // same-level payload: the distinct level-1 words present
    expect(a.sameLevelDistinct).toBeGreaterThanOrEqual(5)
  })

  it('speaker labels are not counted as text', () => {
    const withSpeaker = analyzeStory({ level: 1, content: '妈妈：我喜欢你。' }, vocabMap)
    const without = analyzeStory({ level: 1, content: '我喜欢你。' }, vocabMap)
    expect(withSpeaker.cjkChars).toBe(without.cjkChars)
  })

  it('flags repeated lines', () => {
    const a = analyzeStory({
      level: 1, content: '我喜欢吃苹果。\n你喜欢学校。\n我喜欢吃苹果。',
    }, vocabMap)
    expect(a.repeatedLines).toBe(1)
  })
})

describe('contentSimilarity', () => {
  it('identical content scores 1', () => {
    const s = contentSimilarity('我喜欢吃苹果，妈妈也喜欢。', '我喜欢吃苹果，妈妈也喜欢。')
    expect(s.jaccard).toBe(1)
    expect(s.containment).toBe(1)
  })
  it('unrelated content scores near 0', () => {
    const s = contentSimilarity('我喜欢吃苹果，妈妈也喜欢。', '学校的公园很大，你去锻炼吗。')
    expect(s.jaccard).toBeLessThan(0.15)
  })
  it('a story contained in a longer one has high containment', () => {
    const shortStory = '我喜欢吃苹果，你也喜欢吃苹果。'
    const longStory = shortStory + '妈妈去学校，你去公园锻炼，大家都很高兴。'
    const s = contentSimilarity(shortStory, longStory)
    expect(s.containment).toBe(1)
    expect(s.jaccard).toBeLessThan(1)
  })
  it('trigrams ignore punctuation and speaker labels', () => {
    const a = trigramCounts('妈妈：我喜欢你！')
    const b = trigramCounts('我喜欢你')
    expect([...a.keys()].sort()).toEqual([...b.keys()].sort())
  })
})

describe('calibrateCorpus / proposeDefaults', () => {
  const stories = [
    { title: 'a', level: 1, presentation: 'paced', content: '我喜欢吃苹果。\n妈妈喜欢学校。\n你喜欢公园。' },
    { title: 'b', level: 1, presentation: 'paced', content: '你喜欢吃苹果。\n我喜欢妈妈。\n学校很大。' },
    { title: 'c', level: 1, presentation: 'scene', content: '🌧️ 我喜欢苹果。' },
    { title: 'd', level: 3, presentation: 'paced', content: '我去公园锻炼。\n你也去公园锻炼。' },
  ]

  it('excludes scene/manhua from distributions but counts them', () => {
    const c = calibrateCorpus({ stories, vocab: VOCAB })
    const l1 = c.byLevel.find(l => l.level === 1)
    expect(l1.stories).toBe(3)
    expect(l1.calibratedOn).toBe(2)
    expect(l1.excluded).toBe(1)
  })

  it('proposes per-level defaults with sane bounds', () => {
    const c = calibrateCorpus({ stories, vocab: VOCAB })
    const d = proposeDefaults(c)
    expect(d.nearDuplicate.fail.jaccard).toBeGreaterThan(d.nearDuplicate.warn.jaccard)
    expect(Object.keys(d.byLevel).length).toBeGreaterThan(0)
    for (const level of Object.keys(d.byLevel)) {
      const def = d.byLevel[level]
      expect(def.provisional).toBe(true)
      expect(def.targetsPerStory).toBeGreaterThanOrEqual(4)
      expect(def.targetsPerStory).toBeLessThanOrEqual(12)
      expect(def.occurrences.min).toBe(2)
      expect(def.occurrences.max).toBeGreaterThanOrEqual(def.occurrences.min)
      expect(def.lines[0]).toBeLessThan(def.lines[1])
    }
  })

  it('similarity distribution reports pairs and top matches', () => {
    const c = calibrateCorpus({ stories, vocab: VOCAB })
    expect(c.similarity.pairs).toBeGreaterThan(0)
    expect(c.similarity.max).toBeGreaterThanOrEqual(c.similarity.p50)
  })
})
