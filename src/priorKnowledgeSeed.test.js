import { describe, it, expect, vi, beforeEach } from 'vitest'

// The upsert is chained with .select(), which is what makes the returned count
// real: with ignoreDuplicates PostgREST returns only the rows it inserted. The
// double answers .select() with whatever the test set up, defaulting to "every
// row landed".
let nextInserted = null   // null = echo the whole chunk back
const select = vi.fn()
const upsert = vi.fn((rows) => ({
  select: (...args) => {
    select(...args)
    const data = nextInserted === null ? rows.map(r => ({ vocab_id: r.vocab_id })) : nextInserted
    return Promise.resolve({ data, error: null })
  },
}))
vi.mock('./supabase', () => ({
  supabase: { from: vi.fn(() => ({ upsert })) },
}))
vi.mock('./analytics', () => ({
  EVENTS: { PRIOR_KNOWLEDGE_CLAIMED: 'prior_knowledge_claimed' },
  track: vi.fn(),
}))

import { seedClaim, SEED_BATCH_SIZE } from './priorKnowledgeSeed'
import { supabase } from './supabase'
import { track, EVENTS } from './analytics'

const NOW = new Date('2026-07-23T09:00:00.000Z').getTime()

describe('seedClaim', () => {
  beforeEach(() => {
    upsert.mockClear(); select.mockClear(); supabase.from.mockClear(); track.mockClear()
    nextInserted = null
  })

  it('writes inert claim rows and reports how many', async () => {
    const out = await seedClaim({
      userId: 'u1', vocabIds: ['a', 'b'], perDay: 15, source: 'paste', now: NOW,
    })
    expect(out).toEqual({ inserted: 2, skipped: 0, batches: 1 })
    expect(supabase.from).toHaveBeenCalledWith('cards')

    const [rows, options] = upsert.mock.calls[0]
    expect(rows).toHaveLength(2)
    // Inert: no scheduler state, and the provenance the claim came from.
    expect(rows[0].state).toBe('new')
    expect(rows[0].stability).toBeNull()
    expect(rows[0].reps).toBe(0)
    expect(rows[0].prior_source).toBe('paste')
    expect(rows[0].prior_known_at).toBeTruthy()
    expect(rows[0].verified_at).toBeNull()
    expect(options).toEqual({ onConflict: 'user_id,vocab_id', ignoreDuplicates: true })
  })

  it('chunks a large claim', async () => {
    const ids = Array.from({ length: SEED_BATCH_SIZE + 1 }, (_, i) => 'v' + i)
    const out = await seedClaim({ userId: 'u1', vocabIds: ids, perDay: 15, source: 'placement', now: NOW })
    expect(out.batches).toBe(2)
    expect(upsert).toHaveBeenCalledTimes(2)
    expect(upsert.mock.calls[0][0]).toHaveLength(SEED_BATCH_SIZE)
    expect(upsert.mock.calls[1][0]).toHaveLength(1)
  })

  it('records the claim in analytics', async () => {
    await seedClaim({ userId: 'u1', vocabIds: ['a'], perDay: 8, source: 'checklist', now: NOW })
    expect(track).toHaveBeenCalledWith(EVENTS.PRIOR_KNOWLEDGE_CLAIMED, {
      source: 'checklist', count: 1, inserted: 1, perDay: 8,
    })
  })

  it('does nothing at all for an empty claim', async () => {
    const out = await seedClaim({ userId: 'u1', vocabIds: [], perDay: 15, source: 'paste', now: NOW })
    expect(out).toEqual({ inserted: 0, skipped: 0, batches: 0 })
    expect(upsert).not.toHaveBeenCalled()
    expect(track).not.toHaveBeenCalled()
  })

  it('reports what the database inserted, not what was sent', async () => {
    // FAB-30 finding 5. `inserted` was rows.length, and KnownWords prints it as
    // "Added N words to review". The screen excludes anything already carded
    // before it builds the claim, so the two normally agree — but that snapshot
    // is taken when the screen opens, so a second device, a second tab, or a
    // long-open screen makes the number overstate. Here two of three words were
    // already in the deck and the upsert skipped them.
    nextInserted = [{ vocab_id: 'b' }]
    const out = await seedClaim({
      userId: 'u1', vocabIds: ['a', 'b', 'c'], perDay: 15, source: 'paste', now: NOW,
    })
    expect(out).toEqual({ inserted: 1, skipped: 2, batches: 1 })
    // Without the .select() the database returns nothing and the count is a
    // guess; asserting the column keeps the payload to what is counted.
    expect(select).toHaveBeenCalledWith('vocab_id')
  })

  it('counts across every batch, not just the last one', async () => {
    const ids = Array.from({ length: SEED_BATCH_SIZE + 2 }, (_, i) => 'v' + i)
    const out = await seedClaim({ userId: 'u1', vocabIds: ids, perDay: 15, source: 'placement', now: NOW })
    expect(out.batches).toBe(2)
    expect(out.inserted).toBe(SEED_BATCH_SIZE + 2)
    expect(out.skipped).toBe(0)
  })

  it('surfaces a write failure instead of silently succeeding', async () => {
    upsert.mockImplementationOnce(() => ({
      select: () => Promise.resolve({ data: null, error: { message: 'nope' } }),
    }))
    await expect(seedClaim({
      userId: 'u1', vocabIds: ['a'], perDay: 15, source: 'paste', now: NOW,
    })).rejects.toThrow('nope')
  })
})
