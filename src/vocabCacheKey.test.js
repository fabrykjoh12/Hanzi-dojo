import { describe, it, expect } from 'vitest'
import { vocabCacheKey } from './vocabCacheKey'

// The bug this file exists to make impossible: two hand-built key strings in
// two files, which never once matched. "Save this level for offline" wrote
// `vocab:chinese:hsk:2` and the study queue read `vocab:chinese:hsk:1-2`, so
// the offline review queue could not have worked — while the audio half of the
// same button did, which is why it looked fine.

const TRACK = { language: 'chinese', system: 'hsk' }

describe('vocabCacheKey', () => {
  it('is a RANGE, because the study queue is the cumulative deck', () => {
    // levelScope.studyFloorLevel gives [floor..current]; a single level could
    // never answer that, which is precisely what the writer used to store.
    expect(vocabCacheKey({ ...TRACK, floorLevel: 1, currentLevel: 2 }))
      .toBe('vocab:chinese:hsk:1-2')
  })

  it('gives the writer and the reader the same string for the same deck', () => {
    // The whole point: one function, so there is nothing left to disagree.
    const written = vocabCacheKey({ ...TRACK, floorLevel: 1, currentLevel: 3 })
    const read = vocabCacheKey({ language: 'chinese', system: 'hsk', floorLevel: 1, currentLevel: 3 })
    expect(written).toBe(read)
  })

  it('keeps a one-level deck distinct from a range that ends at it', () => {
    expect(vocabCacheKey({ ...TRACK, floorLevel: 2, currentLevel: 2 })).toBe('vocab:chinese:hsk:2-2')
    expect(vocabCacheKey({ ...TRACK, floorLevel: 1, currentLevel: 2 })).toBe('vocab:chinese:hsk:1-2')
    expect(vocabCacheKey({ ...TRACK, floorLevel: 2, currentLevel: 2 }))
      .not.toBe(vocabCacheKey({ ...TRACK, floorLevel: 1, currentLevel: 2 }))
  })

  it('carries the level identity, so HSK 2 never answers for HSK 5', () => {
    const two = vocabCacheKey({ ...TRACK, floorLevel: 1, currentLevel: 2 })
    const five = vocabCacheKey({ ...TRACK, floorLevel: 1, currentLevel: 5 })
    expect(two).not.toBe(five)
  })

  it('cannot collide across languages or systems', () => {
    const keys = new Set([
      vocabCacheKey({ language: 'chinese', system: 'hsk', floorLevel: 1, currentLevel: 2 }),
      vocabCacheKey({ language: 'chinese', system: 'hsk_3', floorLevel: 1, currentLevel: 2 }),
      vocabCacheKey({ language: 'japanese', system: 'hsk', floorLevel: 1, currentLevel: 2 }),
      vocabCacheKey({ language: 'japanese', system: 'jlpt', floorLevel: 1, currentLevel: 2 }),
    ])
    expect(keys.size).toBe(4)
  })

  it('never mints a key made of NaN when a bound is missing', () => {
    // A degenerate key would never collide and never hit — a cache that is
    // silently always empty, which is the same failure wearing a new hat.
    expect(vocabCacheKey({ ...TRACK, currentLevel: 3 })).toBe('vocab:chinese:hsk:3-3')
    expect(vocabCacheKey({ ...TRACK, floorLevel: 3 })).toBe('vocab:chinese:hsk:3-3')
    expect(vocabCacheKey({ ...TRACK, floorLevel: 1, currentLevel: 2 })).not.toContain('NaN')
  })
})
