import { describe, it, expect } from 'vitest'
import { fetchPaged, fetchPagedSafe, PAGE } from './supabasePaging'

// A fake Supabase builder: `range(from, to)` resolves to that slice of `rows`.
// Each call to the thunk must produce a fresh builder, mirroring the real client
// (a Supabase query builder is single-use).
function fakeTable(rows, { failAfter = Infinity } = {}) {
  let calls = 0
  return () => ({
    range: async (from, to) => {
      calls += 1
      if (calls > failAfter) return { data: null, error: { message: 'boom' } }
      return { data: rows.slice(from, to + 1), error: null }
    },
  })
}

describe('fetchPaged', () => {
  it('returns everything past the 1000-row cap', async () => {
    const rows = Array.from({ length: 2370 }, (_, i) => ({ id: i }))
    const out = await fetchPaged(fakeTable(rows))
    expect(out).toHaveLength(2370)
    expect(out[0].id).toBe(0)
    expect(out[2369].id).toBe(2369)
  })

  it('stops on a short page without an extra request', async () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ id: i }))
    const out = await fetchPaged(fakeTable(rows))
    expect(out).toHaveLength(12)
  })

  it('handles an exact multiple of the page size', async () => {
    // The boundary case: a full final page looks like "there may be more", so
    // the loop must make one more request and get an empty page back.
    const rows = Array.from({ length: PAGE * 2 }, (_, i) => ({ id: i }))
    const out = await fetchPaged(fakeTable(rows))
    expect(out).toHaveLength(PAGE * 2)
  })

  it('returns an empty list for an empty table', async () => {
    expect(await fetchPaged(fakeTable([]))).toEqual([])
  })

  it('throws rather than returning a truncated list', async () => {
    const rows = Array.from({ length: 3000 }, (_, i) => ({ id: i }))
    await expect(fetchPaged(fakeTable(rows, { failAfter: 1 }))).rejects.toThrow('boom')
  })
})

describe('fetchPagedSafe', () => {
  it('yields what it can instead of throwing', async () => {
    const rows = Array.from({ length: 3000 }, (_, i) => ({ id: i }))
    expect(await fetchPagedSafe(fakeTable(rows, { failAfter: 1 }))).toEqual([])
  })

  it('behaves like fetchPaged when nothing fails', async () => {
    const rows = Array.from({ length: 1500 }, (_, i) => ({ id: i }))
    expect(await fetchPagedSafe(fakeTable(rows))).toHaveLength(1500)
  })
})
