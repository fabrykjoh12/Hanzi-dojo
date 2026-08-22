import { describe, it, expect } from 'vitest'
import { PACING, estimateDays, spreadDueDates, seedCardRows } from './priorKnowledge'
import { isMastered, isLearned, isPriorKnown } from './knowledgeState'
import { isCardDue } from './srs'

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

describe('seedCardRows — inert prior-knowledge rows', () => {
  const spread = spreadDueDates(['v1', 'v2'], 1, NOW)
  const rows = seedCardRows('user-1', spread, NOW, 'placement')

  it('creates one row per claimed word, carrying no scheduler state', () => {
    expect(rows).toHaveLength(2)
    rows.forEach(r => {
      expect(r.user_id).toBe('user-1')
      expect(r.state).toBe('new')
      expect(r.learned).toBe(false)
      expect(r.stability).toBeNull()
      expect(r.difficulty).toBeNull()
      expect(r.last_review).toBeNull()
      expect(r.reps).toBe(0)
      expect(r.lapses).toBe(0)
    })
    expect(rows.map(r => r.vocab_id)).toEqual(['v1', 'v2'])
  })

  // The regression this model exists to prevent. A claim used to be written as
  // state 'review' with stability exactly at the mastery threshold, so hundreds
  // of words became "mastered" on one tap.
  it('never fabricates mastery, review state or a review history', () => {
    rows.forEach(r => {
      expect(r.state).not.toBe('review')
      expect(r.stability).not.toBe(21)
      expect(isMastered(r)).toBe(false)
      expect(isLearned(r)).toBe(false)
      expect(isPriorKnown(r)).toBe(true)
    })
  })

  it('never marks a claimed card easy', () => {
    rows.forEach(r => expect(r.is_easy).toBe(false))
  })

  it('records provenance on every row and leaves verification open', () => {
    rows.forEach(r => {
      expect(r.prior_source).toBe('placement')
      expect(r.prior_known_at).toBe(new Date(NOW).toISOString())
      expect(r.verified_at).toBeNull()
    })
  })

  it('passes each source through to the row', () => {
    for (const source of ['paste', 'checklist', 'assumed_prerequisite']) {
      const [row] = seedCardRows('user-1', spreadDueDates(['v1'], 1, NOW), NOW, source)
      expect(row.prior_source).toBe(source)
    }
  })

  it('spreads the calibration-ready date without making the row due', () => {
    expect(dayOf(rows[0].due_at)).toBe('2026-07-23')
    expect(dayOf(rows[1].due_at)).toBe('2026-07-24')
    // due_at is inert here: a 'new' card is never reported as due.
    rows.forEach(r => expect(isCardDue(r, new Date(NOW + 40 * 86400000))).toBe(false))
  })

  it('defaults the source when a caller omits it', () => {
    const [row] = seedCardRows('user-1', spreadDueDates(['v1'], 1, NOW), NOW)
    expect(row.prior_source).toBe('placement')
  })

  it('returns nothing for an empty spread', () => {
    expect(seedCardRows('user-1', [], NOW)).toEqual([])
  })
})
