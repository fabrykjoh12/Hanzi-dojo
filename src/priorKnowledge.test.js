import { describe, it, expect } from 'vitest'
import { PACING, estimateDays, spreadDueDates, seedCardRows } from './priorKnowledge'

const NOW = new Date('2026-07-23T09:00:00.000Z').getTime()
const dayOf = (iso) => iso.slice(0, 10)

describe('PACING', () => {
  it('offers relaxed, steady and fast', () => {
    expect(PACING.map(p => p.key)).toEqual(['relaxed', 'steady', 'fast'])
    expect(PACING.map(p => p.perDay)).toEqual([8, 15, 30])
    PACING.forEach(p => expect(typeof p.label).toBe('string'))
  })
})

describe('estimateDays', () => {
  it('rounds up a partial final day', () => {
    expect(estimateDays(498, 15)).toBe(34)
    expect(estimateDays(30, 15)).toBe(2)
    expect(estimateDays(1, 15)).toBe(1)
  })

  it('is 0 for an empty claim and guards a bad rate', () => {
    expect(estimateDays(0, 15)).toBe(0)
    expect(estimateDays(10, 0)).toBe(0)
  })
})

describe('spreadDueDates', () => {
  it('puts the first perDay ids on today', () => {
    const out = spreadDueDates(['a', 'b', 'c'], 2, NOW)
    expect(out.map(e => e.dayOffset)).toEqual([0, 0, 1])
    expect(dayOf(out[0].dueAt)).toBe('2026-07-23')
    expect(dayOf(out[2].dueAt)).toBe('2026-07-24')
  })

  it('preserves the caller ordering and does not sort', () => {
    const out = spreadDueDates(['z', 'a', 'm'], 1, NOW)
    expect(out.map(e => e.vocabId)).toEqual(['z', 'a', 'm'])
  })

  it('fills exact multiples without an empty trailing day', () => {
    const out = spreadDueDates(['a', 'b', 'c', 'd'], 2, NOW)
    expect(out.map(e => e.dayOffset)).toEqual([0, 0, 1, 1])
  })

  it('returns an empty array for no ids or a bad rate', () => {
    expect(spreadDueDates([], 8, NOW)).toEqual([])
    expect(spreadDueDates(null, 8, NOW)).toEqual([])
    expect(spreadDueDates(['a'], 0, NOW)).toEqual([])
  })
})

describe('seedCardRows', () => {
  const spread = spreadDueDates(['v1', 'v2'], 1, NOW)
  const rows = seedCardRows('user-1', spread, NOW)

  it('creates one review-state row per claimed word', () => {
    expect(rows).toHaveLength(2)
    rows.forEach(r => {
      expect(r.user_id).toBe('user-1')
      expect(r.state).toBe('review')
      expect(r.learned).toBe(true)
      expect(r.stability).toBe(21)
      expect(r.difficulty).toBe(5)
      expect(r.reps).toBe(0)
      expect(r.lapses).toBe(0)
    })
    expect(rows.map(r => r.vocab_id)).toEqual(['v1', 'v2'])
  })

  it('never marks a seeded card easy', () => {
    rows.forEach(r => expect(r.is_easy).toBe(false))
  })

  it('schedules each row to its own spread day', () => {
    expect(rows[0].scheduled_days).toBe(0)
    expect(rows[1].scheduled_days).toBe(1)
    expect(dayOf(rows[1].due_at)).toBe('2026-07-24')
    rows.forEach(r => expect(r.last_review).toBe(new Date(NOW).toISOString()))
  })

  it('returns nothing for an empty spread', () => {
    expect(seedCardRows('user-1', [], NOW)).toEqual([])
  })
})
