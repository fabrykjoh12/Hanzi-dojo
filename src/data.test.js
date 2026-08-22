import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fakeSupabase, hskVocabRows } from './fakePostgrest'

// A chainable query-builder spy that records the filter calls and resolves to data.
function makeSupabase(rows = []) {
  const calls = []
  const builder = {}
  for (const m of ['select', 'eq', 'lte', 'or', 'order', 'range']) {
    builder[m] = vi.fn((...args) => { calls.push([m, ...args]); return builder })
  }
  builder.then = (resolve) => resolve({ data: rows, error: null })
  const supabase = { from: vi.fn(() => builder) }
  return { supabase, builder, calls }
}

// One card per vocabulary row — the deck of a learner who started every word.
function cardsFor(vocab, userId = 'u1') {
  return vocab.map((v, i) => ({
    id: 'card-' + String(i).padStart(4, '0'),
    user_id: userId,
    vocab_id: v.id,
    state: 'review',
  }))
}

vi.mock('./offline', () => ({ cacheGet: vi.fn(async () => null), cacheSet: vi.fn() }))

let getTrackCards
beforeEach(async () => { ({ getTrackCards } = await import('./data')) })

const track = { language: 'chinese', system: 'hsk_3' }

describe('getTrackCards includeUnleveled', () => {
  it('uses lte only when includeUnleveled is false (default)', async () => {
    const { supabase, calls } = makeSupabase()
    await getTrackCards('u1', track, { maxLevel: 3 }, supabase)
    expect(calls.some(c => c[0] === 'lte' && c[1] === 'vocabulary.level' && c[2] === 3)).toBe(true)
    expect(calls.some(c => c[0] === 'or')).toBe(false)
  })

  it('uses an OR (level<=max OR level IS NULL) when includeUnleveled is true', async () => {
    const { supabase, calls } = makeSupabase()
    await getTrackCards('u1', track, { maxLevel: 3, includeUnleveled: true }, supabase)
    const or = calls.find(c => c[0] === 'or')
    expect(or).toBeTruthy()
    expect(or[1]).toBe('level.lte.3,level.is.null')
    expect(or[2]).toEqual({ referencedTable: 'vocabulary' })
    expect(calls.some(c => c[0] === 'lte' && c[1] === 'vocabulary.level')).toBe(false)
  })
})

describe('getTrackCards — complete past the 1000-row PostgREST cap', () => {
  it('returns every card of an HSK1-6 deck (4,995 cards), not a 1000-row prefix', async () => {
    const vocabulary = hskVocabRows([1, 2, 3, 4, 5, 6])
    const cards = cardsFor(vocabulary)
    const db = fakeSupabase({ cards, vocabulary })
    const out = await getTrackCards('u1', track, {}, db)
    expect(out).toHaveLength(4995)
    // Complete AND duplicate-free across page boundaries.
    expect(new Set(out.map(c => c.vocab_id)).size).toBe(4995)
    // The join still rides along on every row.
    expect(out[0].vocabulary).toBeTruthy()
  })

  it('returns the full HSK1-4 cumulative window (1,879 cards) with maxLevel', async () => {
    const vocabulary = hskVocabRows([1, 2, 3, 4, 5, 6])
    const cards = cardsFor(vocabulary)
    const db = fakeSupabase({ cards, vocabulary })
    const out = await getTrackCards('u1', track, { maxLevel: 4 }, db)
    expect(out).toHaveLength(1879)
  })

  it('keeps unleveled cards across pages when includeUnleveled is set', async () => {
    const vocabulary = [
      ...hskVocabRows([1, 2, 3, 4]),
      { id: 'v-null-1', word: '词x', level: null, language: 'chinese', system: 'hsk_3', is_active: true },
    ]
    const cards = cardsFor(vocabulary)
    const db = fakeSupabase({ cards, vocabulary })
    const out = await getTrackCards('u1', track, { maxLevel: 4, includeUnleveled: true }, db)
    expect(out).toHaveLength(1880)
    expect(out.some(c => c.vocab_id === 'v-null-1')).toBe(true)
  })

  it('returns a complete single level past the cap (HSK 6: 1,621 cards)', async () => {
    const vocabulary = hskVocabRows([5, 6])
    const cards = cardsFor(vocabulary)
    const db = fakeSupabase({ cards, vocabulary })
    const out = await getTrackCards('u1', track, { level: 6 }, db)
    expect(out).toHaveLength(1621)
  })
})
