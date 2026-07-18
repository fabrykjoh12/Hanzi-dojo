import { describe, it, expect } from 'vitest'
import {
  buildBands, pickAssessmentQuestions, estimateKnownFrontier,
  estimateReadingPercent, levelLabelForFrontier, startingLevelForFrontier,
} from './assessment'

const vocab = []
let so = 0
for (const level of [1, 2]) {
  for (let i = 0; i < 20; i++) {
    vocab.push({ id: `${level}-${i}`, word: `词${level}${i}`, reading: `r${i}`,
      meaning: `mean ${level} ${i}`, level, sort_order: so++ })
  }
}

describe('buildBands', () => {
  it('splits each level into two frequency tiers, ordered easy→hard', () => {
    const bands = buildBands(vocab)
    expect(bands.length).toBe(4)
    expect(bands[0].level).toBe(1)
    expect(bands[bands.length - 1].level).toBe(2)
    expect(bands.reduce((n, b) => n + b.vocab.length, 0)).toBe(40)
  })
})

describe('pickAssessmentQuestions', () => {
  it('produces 4-option MCQs across bands with a correct answer present', () => {
    const qs = pickAssessmentQuestions(vocab, { perBand: 3 })
    expect(qs.length).toBe(12)
    for (const q of qs) {
      expect(q.options.length).toBe(4)
      expect(q.options).toContain(q.correct)
      expect(q.bandKey).toBeTruthy()
    }
  })
})

describe('estimateKnownFrontier', () => {
  it('advances the frontier through bands answered correctly', () => {
    const bands = buildBands(vocab)
    const answers = bands.flatMap(b => [0, 1, 2].map(() => ({ bandKey: b.key, correct: true })))
    const { frontierIndex, knownVocabIds } = estimateKnownFrontier(answers, bands)
    expect(frontierIndex).toBe(bands.length - 1)
    expect(knownVocabIds.size).toBe(40)
  })

  it('stops at the last reliably-answered band (one lucky high guess ignored)', () => {
    const bands = buildBands(vocab)
    const answers = [
      ...[0, 1, 2].map(() => ({ bandKey: bands[0].key, correct: true })),
      ...[0, 1, 2].map((i) => ({ bandKey: bands[1].key, correct: i === 0 })), // 1/3
      ...[0, 1, 2].map((i) => ({ bandKey: bands[3].key, correct: i === 0 })), // lucky
    ]
    const { frontierIndex } = estimateKnownFrontier(answers, bands)
    expect(frontierIndex).toBe(0)
  })

  it('returns frontier -1 and empty set when band 0 is failed', () => {
    const bands = buildBands(vocab)
    const answers = [0, 1, 2].map(() => ({ bandKey: bands[0].key, correct: false }))
    const { frontierIndex, knownVocabIds } = estimateKnownFrontier(answers, bands)
    expect(frontierIndex).toBe(-1)
    expect(knownVocabIds.size).toBe(0)
  })
})

describe('estimateReadingPercent', () => {
  it('is 0 with no known words and stays within 0–100', () => {
    const corpus = ['我今天喝了一杯茶。']
    const none = estimateReadingPercent(new Set(), vocab, corpus, 'chinese')
    const all = estimateReadingPercent(new Set(vocab.map(v => v.id)), vocab, corpus, 'chinese')
    expect(none).toBe(0)
    expect(all).toBeGreaterThanOrEqual(none)
    expect(all).toBeLessThanOrEqual(100)
  })

  it('rises as more of the corpus vocab becomes known', () => {
    const corpus = ['我喝茶']
    const v = [
      { id: 'a', word: '我', reading: 'wo', meaning: 'I', level: 1, sort_order: 0 },
      { id: 'b', word: '喝', reading: 'he', meaning: 'drink', level: 1, sort_order: 1 },
      { id: 'c', word: '茶', reading: 'cha', meaning: 'tea', level: 1, sort_order: 2 },
    ]
    const some = estimateReadingPercent(new Set(['a']), v, corpus, 'chinese')
    const more = estimateReadingPercent(new Set(['a', 'b', 'c']), v, corpus, 'chinese')
    expect(more).toBeGreaterThan(some)
    expect(more).toBe(100)
  })
})

describe('labels', () => {
  it('maps frontier to a human label and a starting level', () => {
    const bands = buildBands(vocab)
    expect(levelLabelForFrontier(-1, bands)).toMatch(/starting/i)
    expect(levelLabelForFrontier(bands.length - 1, bands)).toMatch(/HSK 2/i)
    expect(startingLevelForFrontier(-1, bands)).toBe(1)
    expect(startingLevelForFrontier(bands.length - 1, bands)).toBe(2)
  })
})
