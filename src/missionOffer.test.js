import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the mission bank so bucketing is tested in isolation and we can control
// whether a mission is available. (Also avoids loading chatMissions' data.)
vi.mock('./chatMissions', () => ({ pickMission: vi.fn() }))

import { pickMission } from './chatMissions'
import { buildMissionOffer } from './missionOffer'

const MISSION = { id: 'order-food', scenario: { en: 'Order food' }, estimatedTime: 3 }
const VOCAB = [{ id: 'v1', word: '茶' }]

beforeEach(() => {
  pickMission.mockReset()
  pickMission.mockReturnValue(MISSION)
})

describe('buildMissionOffer — empty', () => {
  it('returns null with no session words (and never calls pickMission)', () => {
    expect(buildMissionOffer({ sessionVocab: [], vocab: VOCAB, language: 'chinese', level: 1 })).toBeNull()
    expect(buildMissionOffer({ language: 'chinese', level: 1 })).toBeNull()
    expect(pickMission).not.toHaveBeenCalled()
  })
})

describe('buildMissionOffer — bucketing', () => {
  it('puts plain graded words in the learned bucket', () => {
    const res = buildMissionOffer({
      sessionVocab: [{ word: '茶', weak: false, review: false }],
      vocab: VOCAB, language: 'chinese', level: 1,
    })
    expect(res.dayBuckets).toEqual({ learned: ['茶'], weak: [], review: [] })
  })

  it('puts Again-graded words in the weak bucket', () => {
    const res = buildMissionOffer({
      sessionVocab: [{ word: '难', weak: true, review: false }],
      vocab: VOCAB, language: 'chinese', level: 1,
    })
    expect(res.dayBuckets.weak).toEqual(['难'])
  })

  it('puts mature (review-state) words in the review bucket', () => {
    const res = buildMissionOffer({
      sessionVocab: [{ word: '水', weak: false, review: true }],
      vocab: VOCAB, language: 'chinese', level: 1,
    })
    expect(res.dayBuckets.review).toEqual(['水'])
  })

  it('buckets a mix of words into learned / weak / review', () => {
    const res = buildMissionOffer({
      sessionVocab: [
        { word: '茶', weak: false, review: false },
        { word: '难', weak: true, review: false },
        { word: '水', weak: false, review: true },
      ],
      vocab: VOCAB, language: 'chinese', level: 1,
    })
    expect(res.dayBuckets).toEqual({ learned: ['茶'], weak: ['难'], review: ['水'] })
  })
})

describe('buildMissionOffer — prioritization & dedup', () => {
  it('weak wins over review when a word is both', () => {
    const res = buildMissionOffer({
      sessionVocab: [{ word: '书', weak: true, review: true }],
      vocab: VOCAB, language: 'chinese', level: 1,
    })
    expect(res.dayBuckets.weak).toEqual(['书'])
    expect(res.dayBuckets.review).toEqual([])
  })

  it('dedupes repeated words, OR-ing their flags (any weak grade → weak)', () => {
    const res = buildMissionOffer({
      sessionVocab: [
        { word: '书', weak: false, review: false },
        { word: '书', weak: true, review: false },
      ],
      vocab: VOCAB, language: 'chinese', level: 1,
    })
    expect(res.dayBuckets.weak).toEqual(['书'])
    expect(res.dayBuckets.learned).toEqual([])
    // Deduped word count feeds pickMission's dayWords + seed; today's words are
    // always part of the known-words gate.
    expect(pickMission).toHaveBeenCalledWith({
      language: 'chinese', level: 1, dayWords: ['书'], knownWords: new Set(['书']), seed: 1,
    })
  })
})

describe('buildMissionOffer — kanji↔kana aliasing and the known-words gate', () => {
  const JVOCAB = [
    { id: 'v1', word: '学校', reading: 'がっこう' },
    { id: 'v2', word: '食べます', reading: 'たべます' },
  ]

  it('expands day words and known words with their kana readings', () => {
    buildMissionOffer({
      sessionVocab: [{ word: '学校', weak: false, review: false }],
      vocab: JVOCAB, knownWords: ['食べます'], language: 'japanese', level: 1,
    })
    const call = pickMission.mock.calls[0][0]
    expect(call.dayWords.sort()).toEqual(['がっこう', '学校'])
    expect(call.knownWords.has('たべます')).toBe(true)
    expect(call.knownWords.has('がっこう')).toBe(true)
  })

  it('buckets carry both spellings so kana chat text highlights', () => {
    const res = buildMissionOffer({
      sessionVocab: [{ word: '学校', weak: true, review: false }],
      vocab: JVOCAB, language: 'japanese', level: 1,
    })
    expect(res.dayBuckets.weak.sort()).toEqual(['がっこう', '学校'])
  })
})

describe('buildMissionOffer — output shape & passthrough', () => {
  it('returns { mission, dayBuckets, vocab } and passes vocab through', () => {
    const res = buildMissionOffer({
      sessionVocab: [{ word: '茶', weak: false, review: false }],
      vocab: VOCAB, language: 'chinese', level: 1,
    })
    expect(res).toEqual({
      mission: MISSION,
      dayBuckets: { learned: ['茶'], weak: [], review: [] },
      vocab: VOCAB,
    })
  })

  it('returns null when no mission matches (pickMission → null)', () => {
    pickMission.mockReturnValue(null)
    const res = buildMissionOffer({
      sessionVocab: [{ word: '茶', weak: false, review: false }],
      vocab: VOCAB, language: 'russian', level: 9,
    })
    expect(res).toBeNull()
  })
})

describe('buildMissionOffer — partial data safety', () => {
  it('does not crash on entries missing weak/review flags (treats as learned)', () => {
    const res = buildMissionOffer({
      sessionVocab: [{ word: '茶' }],
      vocab: VOCAB, language: 'chinese', level: 1,
    })
    expect(res.dayBuckets.learned).toEqual(['茶'])
  })

  it('does not crash when vocab is omitted', () => {
    const res = buildMissionOffer({
      sessionVocab: [{ word: '茶', weak: false, review: false }],
      language: 'chinese', level: 1,
    })
    expect(res.vocab).toEqual([])
  })
})
