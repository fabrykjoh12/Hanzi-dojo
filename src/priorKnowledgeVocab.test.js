import { describe, it, expect } from 'vitest'
import { fakeSupabase, hskVocabRows } from './fakePostgrest'
import { fetchEarlierVocabIds } from './priorKnowledgeVocab'

const ARGS = { language: 'chinese', system: 'hsk_3', level: 6 }

describe('fetchEarlierVocabIds — the placement claim sees every earlier word', () => {
  it('an HSK 6 placement claims all 3,374 earlier words, not the first 1000', async () => {
    const db = fakeSupabase({ vocabulary: hskVocabRows([1, 2, 3, 4, 5, 6]) })
    const ids = await fetchEarlierVocabIds(db, ARGS)
    // 300 + 197 + 453 + 929 + 1495 — every word below level 6.
    expect(ids).toHaveLength(3374)
    expect(new Set(ids).size).toBe(3374)
  })

  it('keeps frequency order across page boundaries (level, then sort_order)', async () => {
    const db = fakeSupabase({ vocabulary: hskVocabRows([1, 2, 3, 4, 5, 6]) })
    const ids = await fetchEarlierVocabIds(db, ARGS)
    // The fixture ids encode (level, sort_order), so the expected order is
    // simply the sorted window — first word of HSK 1 first, last of HSK 5 last.
    expect(ids[0]).toBe('v1-0000')
    expect(ids[ids.length - 1]).toBe('v5-1494')
    const sorted = [...ids].sort()
    expect(ids).toEqual(sorted)
  })

  it('excludes the placed level itself, unleveled and inactive words', async () => {
    const vocabulary = [
      ...hskVocabRows([1, 2]),
      { id: 'v-null', word: 'x', level: null, language: 'chinese', system: 'hsk_3', is_active: true },
      { id: 'v-inactive', word: 'y', level: 1, language: 'chinese', system: 'hsk_3', is_active: false },
    ]
    const db = fakeSupabase({ vocabulary })
    const ids = await fetchEarlierVocabIds(db, { ...ARGS, level: 2 })
    expect(ids).toHaveLength(300) // HSK 1 only
    expect(ids).not.toContain('v-null')
    expect(ids).not.toContain('v-inactive')
  })

  it('claims nothing below level 1', async () => {
    const db = fakeSupabase({ vocabulary: hskVocabRows([1, 2]) })
    expect(await fetchEarlierVocabIds(db, { ...ARGS, level: 1 })).toEqual([])
  })
})
