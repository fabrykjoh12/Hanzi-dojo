import { describe, it, expect } from 'vitest'
import {
  publishedChineseStories,
  buildVocabIndex,
  analyzeStoryCoverage,
  classifyExposure,
  median,
  buildCoverageReport,
} from './storyCoverage.mjs'
import { calculateStoryReadability } from './src/storyReading.js'

// A small corpus exercising every matching rule the audit leans on. The
// expected numbers below were derived by running the CANONICAL engine
// (calculateStoryReadability) on these exact strings — if one starts failing,
// matching semantics changed, which this task explicitly must not do.
const VOCAB = [
  { id: 1, word: '好', level: 1 },
  { id: 2, word: '你好', level: 1 },
  { id: 3, word: '太', level: 1 },
  { id: 4, word: '老师', level: 1 },
  { id: 6, word: '山', level: 1 },
  { id: 8, word: '猫', level: 1 },
  { id: 5, word: '朋友', level: 2 },
  { id: 7, word: '医生', level: 5 },
  { id: 9, word: '字', level: 7 },
  // Production quirk: a few active rows carry NULL level (dictionary strays).
  { id: 10, word: '来了', level: null },
]

const STORIES = [
  // Repeated occurrence in one story: 你好 twice. 太 standalone.
  { id: 's1', title: 'One', level: 1, language: 'chinese', is_published: true, content: '你好！你好。\n太。' },
  // Speaker label stripped: the label 老师 is NOT an occurrence; narration 老师 is.
  { id: 's2', title: 'Two', level: 1, language: 'chinese', is_published: true, content: '老师：好。\n老师来了。\n朋友好。' },
  // Overlap: 你好 wins over 好. Atomic span: 太阳 contributes nothing to 太.
  { id: 's3', title: 'Three', level: 2, language: 'chinese', is_published: true, content: '你好。太阳出来了。' },
  // The level-mismatch case: HSK 1 word 山 exposed ONLY here, at level 5.
  { id: 's4', title: 'Four', level: 5, language: 'chinese', is_published: true, content: '这是山。\n医生来了。' },
]

const report = () => buildCoverageReport({ stories: STORIES, vocab: VOCAB })
const wordRow = (rep, word) => rep.words.find(w => w.word === word)

describe('publishedChineseStories', () => {
  it('keeps only published Chinese rows with content', () => {
    const rows = [
      ...STORIES,
      { id: 'h1', title: 'Held', level: 1, language: 'chinese', is_published: false, content: '猫。' },
      { id: 'j1', title: 'JP', level: 1, language: 'japanese', is_published: true, content: '猫。' },
      { id: 'e1', title: 'Empty', level: 1, language: 'chinese', is_published: true, content: '  ' },
    ]
    expect(publishedChineseStories(rows).map(s => s.id)).toEqual(['s1', 's2', 's3', 's4'])
  })

  it('an unpublished story never contributes exposure', () => {
    // 猫 appears only in the held row — after filtering it stays at zero.
    const rep = report()
    expect(wordRow(rep, '猫').all).toEqual({ stories: 0, occurrences: 0 })
    expect(wordRow(rep, '猫').classification).toBe('zero')
  })
})

describe('classification and helpers', () => {
  it('buckets unique-story exposure', () => {
    expect(classifyExposure(0)).toBe('zero')
    expect(classifyExposure(1)).toBe('single')
    expect(classifyExposure(2)).toBe('weak')
    expect(classifyExposure(4)).toBe('weak')
    expect(classifyExposure(5)).toBe('well')
  })

  it('median handles odd, even and empty', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([0, 0, 1, 1])).toBe(0.5)
    expect(median([])).toBe(0)
  })

  it('buildVocabIndex surfaces duplicate words', () => {
    const { vocabMap, duplicates } = buildVocabIndex([
      { id: 1, word: '好', level: 1 }, { id: 2, word: '好', level: 3 },
    ])
    expect(vocabMap['好'].id).toBe(1)
    expect(duplicates).toEqual(['好'])
  })
})

describe('per-word exposure', () => {
  it('zero exposure', () => {
    const w = wordRow(report(), '猫')
    expect(w.availableByLevel).toEqual({ stories: 0, occurrences: 0 })
    expect(w.levelDist).toEqual({})
    expect(w.stories).toEqual([])
  })

  it('one-story exposure', () => {
    const w = wordRow(report(), '老师')
    expect(w.all).toEqual({ stories: 1, occurrences: 1 })
    expect(w.classification).toBe('single')
  })

  it('repeated occurrence in one story: unique stories and raw occurrences diverge', () => {
    const w = wordRow(report(), '好')
    // '老师：好。' counts the dialogue's 好 (label stripped), '朋友好。' the second.
    expect(w.all).toEqual({ stories: 1, occurrences: 2 })
    expect(w.stories).toEqual([{ id: 's2', title: 'Two', level: 1, occurrences: 2 }])
  })

  it('same word across multiple stories', () => {
    const w = wordRow(report(), '你好')
    expect(w.all).toEqual({ stories: 2, occurrences: 3 })
    expect(w.levelDist).toEqual({ 1: 1, 2: 1 })
  })

  it('speaker labels are not occurrences', () => {
    // 老师 appears as a label AND in narration in s2 — only narration counts.
    expect(wordRow(report(), '老师').all.occurrences).toBe(1)
  })

  it('overlapping vocabulary: the longer word wins', () => {
    // s1/s3 contain 你好 three times; 好 never matches inside it.
    expect(wordRow(report(), '好').all.stories).toBe(1)
    expect(wordRow(report(), '你好').all.stories).toBe(2)
  })

  it('atomic span: 太阳 contributes nothing to 太', () => {
    const w = wordRow(report(), '太')
    // Only s1's standalone 太 counts; s3's 太阳 is one unknown word.
    expect(w.all).toEqual({ stories: 1, occurrences: 1 })
    expect(w.levelDist).toEqual({ 1: 1 })
  })
})

describe('level-relevant exposure', () => {
  it('an HSK 1 word seen only in an HSK 5 story has zero available-by-level exposure', () => {
    const w = wordRow(report(), '山')
    expect(w.all).toEqual({ stories: 1, occurrences: 1 })
    expect(w.availableByLevel).toEqual({ stories: 0, occurrences: 0 })
    expect(w.sameLevel).toEqual({ stories: 0, occurrences: 0 })
    expect(w.levelDist).toEqual({ 5: 1 })
    expect(w.classification).toBe('zero')   // headline classification is available-by-level
  })

  it('a higher-level word counts lower-level stories as available', () => {
    const w = wordRow(report(), '朋友')     // HSK 2 word appearing in a level-1 story
    expect(w.sameLevel).toEqual({ stories: 0, occurrences: 0 })
    expect(w.availableByLevel).toEqual({ stories: 1, occurrences: 1 })
  })

  it('same-level exposure is the strict slice', () => {
    const w = wordRow(report(), '医生')     // HSK 5 word in the level-5 story
    expect(w.sameLevel).toEqual({ stories: 1, occurrences: 1 })
    expect(w.availableByLevel).toEqual({ stories: 1, occurrences: 1 })
  })
})

describe('aggregates', () => {
  it('per-level summary counts, percentages, mean and median', () => {
    const rep = report()
    const l1 = rep.byVocabLevel.find(l => l.vocabLevel === 1)
    expect(l1.totalItems).toBe(6)
    expect(l1.storiesAtLevel).toBe(2)
    expect(l1.storiesAvailable).toBe(2)
    // available-by-level: 山 and 猫 at zero; 好/你好/太/老师 in exactly one story.
    expect(l1.availableByLevel).toMatchObject({ zero: 2, single: 4, weak: 0, well: 0 })
    expect(l1.availableByLevel.pctZero).toBe(33.3)
    expect(l1.availableByLevel.mean).toBe(0.67)
    expect(l1.availableByLevel.median).toBe(1)
    // corpus-wide diagnostics differ: 山 becomes single, 你好 becomes weak.
    expect(l1.all).toMatchObject({ zero: 1, single: 4, weak: 1, well: 0 })

    const l2 = rep.byVocabLevel.find(l => l.vocabLevel === 2)
    expect(l2.storiesAvailable).toBe(3)
    expect(l2.availableByLevel).toMatchObject({ zero: 0, single: 1 })
  })

  it('HSK 7–9 is reported as a separate band with no story corpus', () => {
    const rep = report()
    expect(rep.bands.hsk7to9.noStoryCorpus).toBe(true)
    expect(rep.bands.hsk7to9.totalItems).toBe(1)
    expect(rep.bands.hsk7to9.availableByLevel.pctZero).toBe(100)
    // ...and does not distort the primary band.
    expect(rep.bands.hsk1to6.totalItems).toBe(8)
    expect(rep.bands.hsk1to6.availableByLevel).toMatchObject({ zero: 2, single: 6 })
    expect(rep.bands.hsk1to6.availableByLevel.pctZero).toBe(25)
  })

  it('a NULL-level word is reported but excluded from level aggregates', () => {
    const rep = report()
    const w = wordRow(rep, '来了')
    // It still registers corpus-wide exposure (s2 and s4 both narrate 来了)...
    expect(w.all).toEqual({ stories: 2, occurrences: 2 })
    // ...but has no level to anchor the level-relative metrics.
    expect(w.availableByLevel).toEqual({ stories: 0, occurrences: 0 })
    expect(rep.corpus.unleveledWords).toEqual([{ id: 10, word: '来了' }])
    const totalInLevels = rep.byVocabLevel.reduce((s, l) => s + l.totalItems, 0)
    expect(totalInLevels).toBe(VOCAB.length - 1)
    expect(rep.bands.hsk1to6.totalItems + rep.bands.hsk7to9.totalItems).toBe(VOCAB.length - 1)
  })

  it('corpus metadata', () => {
    const rep = report()
    expect(rep.corpus.publishedStories).toBe(4)
    expect(rep.corpus.storiesPerLevel).toEqual({ 1: 2, 2: 1, 5: 1 })
    expect(rep.corpus.vocabItems).toBe(10)
    expect(rep.corpus.duplicateWords).toEqual([])
  })
})

describe('agreement with the canonical engine', () => {
  it('audit counts ARE calculateStoryReadability counts, including overlap and atomic spans', () => {
    const { vocabMap } = buildVocabIndex(VOCAB)
    for (const story of STORIES) {
      const audit = analyzeStoryCoverage(story, vocabMap)
      const canonical = calculateStoryReadability({
        content: story.content, vocabMap, cards: {}, language: 'chinese',
      })
      expect([...audit.entries()].sort()).toEqual([...canonical.counts.entries()].sort())
      expect([...audit.keys()].sort()).toEqual([...canonical.storyWords].sort())
    }
  })
})
