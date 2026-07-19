import { describe, it, expect, vi, beforeEach } from 'vitest'

// A chainable query-builder spy that records the filter calls and resolves to data.
function makeSupabase(rows = []) {
  const calls = []
  const builder = {}
  for (const m of ['select', 'eq', 'lte', 'or']) {
    builder[m] = vi.fn((...args) => { calls.push([m, ...args]); return builder })
  }
  builder.then = (resolve) => resolve({ data: rows, error: null })
  const supabase = { from: vi.fn(() => builder) }
  return { supabase, builder, calls }
}

vi.mock('./offline', () => ({ cacheGet: vi.fn(async () => null), cacheSet: vi.fn() }))

let getTrackCards
beforeEach(async () => { ({ getTrackCards } = await import('./data')) })

const track = { language: 'chinese', system: 'hsk_3' }

describe('getTrackCards includeUnleveled', () => {
  it('uses lte only when includeUnleveled is false (default)', async () => {
    const { supabase, calls } = makeSupabase()
    await getTrackCards.__setSupabase?.(supabase) // if DI is used; otherwise see Step 3
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
