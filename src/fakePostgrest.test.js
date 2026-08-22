import { describe, it, expect } from 'vitest'
import { fakeSupabase, hskVocabRows, HSK_LEVEL_SIZES } from './fakePostgrest'
import { fetchPaged } from './supabasePaging'

describe('fakeSupabase — the capped-PostgREST opponent', () => {
  it('silently truncates an unpaged select at maxRows, like production', async () => {
    const db = fakeSupabase({ vocabulary: hskVocabRows([1, 2, 3, 4]) })
    const { data } = await db.from('vocabulary').select('id').eq('language', 'chinese')
    // 300 + 197 + 453 + 929 = 1879 rows exist; only 1000 come back.
    expect(data).toHaveLength(1000)
  })

  it('serves .range() windows inside the cap and pages to completion', async () => {
    const rows = hskVocabRows([1, 2, 3, 4])
    const db = fakeSupabase({ vocabulary: rows })
    const out = await fetchPaged(() => db.from('vocabulary')
      .select('id').eq('language', 'chinese').order('id', { ascending: true }))
    expect(out).toHaveLength(1879)
    // No duplicates and no gaps across page boundaries.
    expect(new Set(out.map(r => r.id)).size).toBe(1879)
  })

  it('applies filters before the cap (the cap is on the response, not the table)', async () => {
    const db = fakeSupabase({ vocabulary: hskVocabRows([1, 2, 3, 4, 5, 6]) })
    const { data } = await db.from('vocabulary').select('id').eq('level', 2)
    expect(data).toHaveLength(HSK_LEVEL_SIZES[2])
  })

  it('joins an embedded !inner relation and filters on referenced columns', async () => {
    const vocabulary = [
      { id: 'v1', level: 1, language: 'chinese', system: 'hsk_3' },
      { id: 'v2', level: 5, language: 'chinese', system: 'hsk_3' },
      { id: 'v3', level: 1, language: 'japanese', system: 'jlpt' },
    ]
    const cards = [
      { id: 'c1', user_id: 'u1', vocab_id: 'v1' },
      { id: 'c2', user_id: 'u1', vocab_id: 'v2' },
      { id: 'c3', user_id: 'u1', vocab_id: 'v3' },
      { id: 'c4', user_id: 'u1', vocab_id: 'missing' },
    ]
    const db = fakeSupabase({ cards, vocabulary })
    const { data } = await db.from('cards')
      .select('*, vocabulary!inner(id, level)')
      .eq('user_id', 'u1')
      .eq('vocabulary.language', 'chinese')
      .lte('vocabulary.level', 3)
    expect(data.map(r => r.id)).toEqual(['c1'])
    expect(data[0].vocabulary.level).toBe(1)
  })

  it('understands the or(level.lte.N,level.is.null) filter data.js uses', async () => {
    const vocabulary = [
      { id: 'v1', level: 1, language: 'chinese' },
      { id: 'v2', level: 9, language: 'chinese' },
      { id: 'v3', level: null, language: 'chinese' },
    ]
    const cards = vocabulary.map((v, i) => ({ id: 'c' + i, user_id: 'u1', vocab_id: v.id }))
    const db = fakeSupabase({ cards, vocabulary })
    const { data } = await db.from('cards')
      .select('*, vocabulary!inner(id, level)')
      .eq('user_id', 'u1')
      .or('level.lte.3,level.is.null', { referencedTable: 'vocabulary' })
    expect(data.map(r => r.vocab_id).sort()).toEqual(['v1', 'v3'])
  })

  it('sorts on multiple keys and keeps pagination stable across requests', async () => {
    // Heavy ties on the first key — the unique tiebreak is what keeps pages
    // from overlapping.
    const rows = Array.from({ length: 2500 }, (_, i) => ({ id: 'r' + String(i).padStart(4, '0'), level: 1 }))
    const db = fakeSupabase({ vocabulary: rows })
    const out = await fetchPaged(() => db.from('vocabulary').select('id')
      .order('level', { ascending: true }).order('id', { ascending: true }))
    expect(out).toHaveLength(2500)
    expect(new Set(out.map(r => r.id)).size).toBe(2500)
  })

  it('supports head-count queries without returning rows', async () => {
    const db = fakeSupabase({ cards: Array.from({ length: 1500 }, (_, i) => ({ id: 'c' + i, user_id: 'u1' })) })
    const { data, count } = await db.from('cards')
      .select('id', { count: 'exact', head: true }).eq('user_id', 'u1')
    expect(data).toBeNull()
    expect(count).toBe(1500)
  })

  it('supports maybeSingle', async () => {
    const db = fakeSupabase({ level_unlocks: [{ user_id: 'u1', level: 3 }] })
    const { data } = await db.from('level_unlocks').select('level')
      .eq('user_id', 'u1').eq('level', 3).maybeSingle()
    expect(data).toEqual({ user_id: 'u1', level: 3 })
    const none = await db.from('level_unlocks').select('level')
      .eq('user_id', 'u1').eq('level', 9).maybeSingle()
    expect(none.data).toBeNull()
  })
})
