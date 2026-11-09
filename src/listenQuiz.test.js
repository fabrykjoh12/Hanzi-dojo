import { describe, it, expect } from 'vitest'
import {
  buildListenQuestions, playableWords, LISTEN_MIN_PLAYABLE, LISTEN_QUESTION_COUNT,
} from './listenQuiz'

// Identity shuffle: the order is the fixture's, so every assertion is exact.
const keep = (list) => list.slice()

// A level shaped like HSK 4 after the 2026-09 repair: some words reachable
// through their stored file, one only through a generated clip, and the rest
// silent — their dead path was nulled, or they were never recorded.
const URLS = {
  stored1: 'https://x/audio/level_4/005_liaojie.mp3',
  stored2: 'https://x/audio/level_4/164_xingqu.mp3',
  stored3: 'https://x/audio/level_4/485_bingxiang.mp3',
  generated: 'https://x/audio/tts/abc.mp3',
}
const word = (id) => ({ id, word: id, reading: id, meaning: id })
const LEVEL = [
  word('stored1'), word('silent1'), word('stored2'), word('silent2'),
  word('generated'), word('silent3'), word('stored3'),
]
const urlOf = (v) => URLS[v.id] || null

describe('playableWords', () => {
  it('keeps exactly the words that have something to play', () => {
    expect(playableWords(LEVEL, urlOf).map(v => v.id))
      .toEqual(['stored1', 'stored2', 'generated', 'stored3'])
  })

  it('counts a generated clip as playable with no stored path', () => {
    // New recordings land in tts_audio, not audio_path. A selector that read
    // audio_path itself would keep every future recording out of the quiz.
    expect(playableWords([word('generated')], urlOf)).toHaveLength(1)
  })

  it('treats an empty or missing pool as nothing to play', () => {
    expect(playableWords(null, urlOf)).toEqual([])
    expect(playableWords([], urlOf)).toEqual([])
  })
})

describe('buildListenQuestions', () => {
  it('never asks about a word it cannot play', () => {
    const qs = buildListenQuestions(LEVEL, urlOf, keep)
    expect(qs.map(q => q.correct.id)).toEqual(['stored1', 'stored2', 'generated', 'stored3'])
    for (const q of qs) expect(urlOf(q.correct), q.correct.id + ' is silent').toBeTruthy()
  })

  it('plays the URL the word was chosen for', () => {
    for (const q of buildListenQuestions(LEVEL, urlOf, keep)) {
      expect(q.audioUrl).toBe(URLS[q.correct.id])
    }
  })

  it('offers four distinct options including the answer, silent words allowed as distractors', () => {
    const [q] = buildListenQuestions(LEVEL, urlOf, keep)
    const ids = q.options.map(v => v.id)
    expect(ids).toHaveLength(4)
    expect(new Set(ids).size).toBe(4)
    expect(ids).toContain(q.correct.id)
    // keep() makes the distractors the first three other words, two of which
    // are silent: a distractor is read, never heard.
    expect(ids).toContain('silent1')
  })

  it('returns no quiz when fewer than four words are playable, so the screen can say why', () => {
    const thin = [word('stored1'), word('stored2'), word('generated'), word('silent1'), word('silent2')]
    expect(playableWords(thin, urlOf).length).toBe(LISTEN_MIN_PLAYABLE - 1)
    expect(buildListenQuestions(thin, urlOf, keep)).toEqual([])
  })

  it('returns no quiz for a level where nothing is playable at all', () => {
    const silent = [word('silent1'), word('silent2'), word('silent3'), word('silent4'), word('silent5')]
    expect(buildListenQuestions(silent, urlOf, keep)).toEqual([])
  })

  it('caps the quiz at the question count', () => {
    const many = Array.from({ length: 30 }, (_, i) => word('w' + i))
    const all = () => 'https://x/a.mp3'
    expect(buildListenQuestions(many, all, keep)).toHaveLength(LISTEN_QUESTION_COUNT)
    expect(buildListenQuestions(many, all, keep, { count: 5 })).toHaveLength(5)
  })
})
