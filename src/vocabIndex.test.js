import { describe, it, expect } from 'vitest'
import { buildVocabIndex, searchVocabIndex } from './vocabIndex'
import { foldIncludes } from './searchFold'

const VOCAB = [
  { id: 'v1', word: '今天', reading: 'jīntiān', meaning: 'today' },
  { id: 'v2', word: '天气', reading: 'tiānqì', meaning: 'weather' },
  { id: 'v3', word: '朋友', reading: 'péngyou', meaning: 'friend' },
  { id: 'v4', word: 'друг', reading: '', meaning: 'friend' },
]

const ids = rows => rows.map(r => r.id)

describe('buildVocabIndex', () => {
  it('keeps the row and folds its searchable fields once', () => {
    const index = buildVocabIndex(VOCAB)
    expect(index).toHaveLength(4)
    expect(index[1].row).toBe(VOCAB[1])
    expect(index[1].hay).toContain('tianqi')   // tone marks already folded away
  })

  it('tolerates junk input and skips empty rows', () => {
    expect(buildVocabIndex(null)).toEqual([])
    expect(buildVocabIndex([null, undefined])).toEqual([])
    expect(buildVocabIndex([{ id: 'x' }])[0].hay).toBe('')
  })
})

describe('searchVocabIndex', () => {
  const index = buildVocabIndex(VOCAB)

  it('an empty or whitespace query returns everything, in order', () => {
    expect(ids(searchVocabIndex(index, ''))).toEqual(['v1', 'v2', 'v3', 'v4'])
    expect(ids(searchVocabIndex(index, '   '))).toEqual(['v1', 'v2', 'v3', 'v4'])
    expect(ids(searchVocabIndex(index, null))).toEqual(['v1', 'v2', 'v3', 'v4'])
  })

  it('matches the word, the reading or the meaning', () => {
    expect(ids(searchVocabIndex(index, '天气'))).toEqual(['v2'])
    expect(ids(searchVocabIndex(index, 'tiānqì'))).toEqual(['v2'])
    expect(ids(searchVocabIndex(index, 'friend'))).toEqual(['v3', 'v4'])
  })

  it('matches toneless pinyin and ignores case and surrounding space', () => {
    expect(ids(searchVocabIndex(index, 'tianqi'))).toEqual(['v2'])
    expect(ids(searchVocabIndex(index, '  TIANQI '))).toEqual(['v2'])
  })

  it('never matches across two fields — a reading cannot run into a meaning', () => {
    // 'péngyou' + 'friend' are adjacent in the stored haystack; joining them
    // must not become a hit, or results would appear that no field contains.
    expect(searchVocabIndex(index, 'pengyoufriend')).toEqual([])
  })

  it('agrees with the per-field foldIncludes it replaced', () => {
    for (const q of ['tianqi', 'friend', '天', 'JIN', 'zzz', 'друг']) {
      const expected = VOCAB.filter(v =>
        foldIncludes(v.word, q) || foldIncludes(v.reading, q) || foldIncludes(v.meaning, q))
      expect(ids(searchVocabIndex(index, q))).toEqual(ids(expected))
    }
  })

  it('tolerates a junk index', () => {
    expect(searchVocabIndex(null, 'x')).toEqual([])
    expect(searchVocabIndex(undefined, '')).toEqual([])
  })
})
