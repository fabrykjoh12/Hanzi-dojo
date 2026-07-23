import { describe, it, expect, vi, beforeEach } from 'vitest'

const upsert = vi.fn(() => Promise.resolve({ error: null }))
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
  beforeEach(() => { upsert.mockClear(); supabase.from.mockClear(); track.mockClear() })

  it('writes review cards and reports how many', async () => {
    const out = await seedClaim({
      userId: 'u1', vocabIds: ['a', 'b'], perDay: 15, source: 'paste', now: NOW,
    })
    expect(out).toEqual({ inserted: 2, batches: 1 })
    expect(supabase.from).toHaveBeenCalledWith('cards')

    const [rows, options] = upsert.mock.calls[0]
    expect(rows).toHaveLength(2)
    expect(rows[0].state).toBe('review')
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
      source: 'checklist', count: 1, perDay: 8,
    })
  })

  it('does nothing at all for an empty claim', async () => {
    const out = await seedClaim({ userId: 'u1', vocabIds: [], perDay: 15, source: 'paste', now: NOW })
    expect(out).toEqual({ inserted: 0, batches: 0 })
    expect(upsert).not.toHaveBeenCalled()
    expect(track).not.toHaveBeenCalled()
  })

  it('surfaces a write failure instead of silently succeeding', async () => {
    upsert.mockResolvedValueOnce({ error: { message: 'nope' } })
    await expect(seedClaim({
      userId: 'u1', vocabIds: ['a'], perDay: 15, source: 'paste', now: NOW,
    })).rejects.toThrow('nope')
  })
})
