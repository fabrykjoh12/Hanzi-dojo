import { describe, it, expect } from 'vitest'
import { knownWordMap, wordStatus, readableSummary, MAP_BUCKETS } from './knownWordMap'

// Card shapes mirror the real columns wordStatus reads (learned + stability).
const mastered = { learned: true, stability: 30 }   // >= 21
const known = { learned: true, stability: 10 }       // learned, not mastered
const learning = { learned: false, stability: 3, state: 'learning' }

describe('wordStatus', () => {
  it('classifies each bucket', () => {
    expect(wordStatus(null)).toBe('new')
    expect(wordStatus(undefined)).toBe('new')
    expect(wordStatus(mastered)).toBe('mastered')
    expect(wordStatus(known)).toBe('known')
    expect(wordStatus(learning)).toBe('learning')
  })

  it('exposes the bucket order', () => {
    expect(MAP_BUCKETS).toEqual(['mastered', 'known', 'learning', 'new'])
  })
})

describe('knownWordMap', () => {
  const vocab = [
    { id: 'a', level: 1 }, { id: 'b', level: 1 }, { id: 'c', level: 1 },
    { id: 'd', level: 2 }, { id: 'e', level: 2 },
  ]
  const cardById = { a: mastered, b: known, c: learning, d: known }
  // 'e' has no card → new.

  it('buckets words per level and totals them', () => {
    const { levels, totals } = knownWordMap(vocab, cardById)
    expect(levels.map(l => l.level)).toEqual([1, 2])

    const l1 = levels[0]
    expect(l1).toMatchObject({ level: 1, total: 3, mastered: 1, known: 1, learning: 1, new: 0, readable: 2 })

    const l2 = levels[1]
    expect(l2).toMatchObject({ level: 2, total: 2, mastered: 0, known: 1, learning: 0, new: 1, readable: 1 })

    expect(totals).toMatchObject({ total: 5, mastered: 1, known: 2, learning: 1, new: 1, readable: 3 })
  })

  it('sorts levels ascending regardless of input order', () => {
    const out = knownWordMap([{ id: 'x', level: 3 }, { id: 'y', level: 1 }], {})
    expect(out.levels.map(l => l.level)).toEqual([1, 3])
  })

  it('skips malformed rows', () => {
    const out = knownWordMap([null, { id: 'z' }, { level: 1 }, { id: 'ok', level: 1 }], {})
    expect(out.totals.total).toBe(1)
    expect(out.levels).toHaveLength(1)
  })

  it('tolerates missing inputs', () => {
    expect(knownWordMap(null, null).totals.total).toBe(0)
    expect(knownWordMap(undefined).levels).toEqual([])
  })

  it('treats every word as new when there are no cards', () => {
    const out = knownWordMap(vocab, {})
    expect(out.totals.new).toBe(5)
    expect(out.totals.readable).toBe(0)
  })
})

describe('readableSummary', () => {
  it('summarizes readable-of-total', () => {
    const map = knownWordMap([{ id: 'a', level: 1 }, { id: 'b', level: 1 }], { a: known })
    expect(readableSummary(map)).toBe('You can read 1 of 2 words so far.')
  })

  it('gives a gentle empty state', () => {
    expect(readableSummary(knownWordMap([], {}))).toMatch(/fills in as you learn/i)
    expect(readableSummary(null)).toMatch(/fills in as you learn/i)
  })
})
