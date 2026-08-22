import { describe, it, expect } from 'vitest'
import { fakeSupabase, hskVocabRows } from './fakePostgrest'
import { loadAllVocab, fetchCardedVocabIds } from './knownWordsData'

const TRACK = { language: 'chinese', system: 'hsk_3' }

describe('loadAllVocab — the full checklist past the 1000-row cap', () => {
  it('returns all 4,995 leveled words of the track', async () => {
    const db = fakeSupabase({ vocabulary: hskVocabRows([1, 2, 3, 4, 5, 6]) })
    const rows = await loadAllVocab(db, TRACK)
    expect(rows).toHaveLength(4995)
    expect(new Set(rows.map(v => v.id)).size).toBe(4995)
    // Frequency order: level ascending, sort_order within the level.
    expect(rows[0].id).toBe('v1-0000')
    expect(rows[rows.length - 1].id).toBe('v6-1620')
  })

  it('drops unleveled words (they are not claimable by level)', async () => {
    const vocabulary = [
      ...hskVocabRows([1]),
      { id: 'v-null', word: 'x', level: null, language: 'chinese', system: 'hsk_3', is_active: true },
    ]
    const rows = await loadAllVocab(fakeSupabase({ vocabulary }), TRACK)
    expect(rows).toHaveLength(300)
  })
})

describe('fetchCardedVocabIds — a big deck is never forgotten', () => {
  it('returns every carded vocab id past 1000 cards', async () => {
    const cards = Array.from({ length: 1500 }, (_, i) => ({
      id: 'c' + i,
      user_id: 'u1',
      vocab_id: 'v' + String(i).padStart(4, '0'),
    }))
    const ids = await fetchCardedVocabIds(fakeSupabase({ cards }))
    expect(ids.size).toBe(1500)
    expect(ids.has('v1499')).toBe(true)
  })
})
