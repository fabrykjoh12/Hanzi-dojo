import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mutable test state the supabase mock reads from.
const state = { rows: [], selectError: null, upsertError: null, updateError: null, lastUpsert: null, lastPatch: null }

function thenable(getResult) {
  const b = { eq: vi.fn(() => b), then: (res, rej) => Promise.resolve(getResult()).then(res, rej) }
  return b
}
const select = vi.fn(() => thenable(() => ({ data: state.rows, error: state.selectError })))
const update = vi.fn((patch) => { state.lastPatch = patch; return thenable(() => ({ error: state.updateError })) })
const upsert = vi.fn((row, opts) => { state.lastUpsert = { row, opts }; return Promise.resolve({ error: state.upsertError }) })
const from = vi.fn(() => ({ select, update, upsert }))

// Reference `from` lazily inside a wrapper — vi.mock is hoisted above the const
// declarations, so a direct `{ from }` would read it before initialization.
vi.mock('./supabase', () => ({ supabase: { from: (...a) => from(...a) } }))
vi.mock('./analytics', () => ({
  EVENTS: { GRAMMAR_ENROLLED: 'grammar_enrolled', GRAMMAR_REVIEWED: 'grammar_reviewed' },
  track: vi.fn(),
}))

import {
  enrollTopic, getDueGrammar, countDueGrammar, gradeGrammar, isGrammarRowDue,
} from './grammarReview'

const TRACK = { language: 'chinese', system: 'hsk_3' }
const NOW = new Date('2026-07-23T09:00:00.000Z')

beforeEach(() => {
  state.rows = []; state.selectError = null; state.upsertError = null; state.updateError = null
  state.lastUpsert = null; state.lastPatch = null
  select.mockClear(); update.mockClear(); upsert.mockClear(); from.mockClear()
})

describe('enrollTopic', () => {
  it('idempotently upserts a new row for the topic', async () => {
    await enrollTopic({ userId: 'u1', track: TRACK, topicId: 'shi-vs-adjectives', now: NOW.getTime() })
    expect(from).toHaveBeenCalledWith('grammar_reviews')
    const { row, opts } = state.lastUpsert
    expect(row).toMatchObject({
      user_id: 'u1', language: 'chinese', system: 'hsk_3', topic_id: 'shi-vs-adjectives', state: 'new',
    })
    expect(opts).toEqual({ onConflict: 'user_id,language,system,topic_id', ignoreDuplicates: true })
  })

  it('surfaces a write failure instead of silently succeeding', async () => {
    state.upsertError = { message: 'nope' }
    await expect(enrollTopic({ userId: 'u1', track: TRACK, topicId: 't', now: NOW.getTime() }))
      .rejects.toThrow('nope')
  })
})

describe('isGrammarRowDue', () => {
  it('treats a freshly-enrolled (new) row as due now', () => {
    expect(isGrammarRowDue({ state: 'new' }, NOW)).toBe(true)
  })
  it('treats a review row due today as due', () => {
    expect(isGrammarRowDue({ state: 'review', due_at: NOW.toISOString() }, NOW)).toBe(true)
  })
  it('treats a review row due in the future as not due', () => {
    const later = new Date('2026-07-30T09:00:00.000Z').toISOString()
    expect(isGrammarRowDue({ state: 'review', due_at: later }, NOW)).toBe(false)
  })
})

describe('getDueGrammar / countDueGrammar', () => {
  it('returns only the due rows', async () => {
    const future = new Date('2026-08-01T00:00:00.000Z').toISOString()
    state.rows = [
      { topic_id: 'a', state: 'new' },
      { topic_id: 'b', state: 'review', due_at: NOW.toISOString() },
      { topic_id: 'c', state: 'review', due_at: future },
    ]
    const due = await getDueGrammar({ userId: 'u1', track: TRACK, now: NOW })
    expect(due.map(r => r.topic_id)).toEqual(['a', 'b'])
  })

  it('counts due rows, and returns 0 on a query error', async () => {
    state.rows = [{ topic_id: 'a', state: 'new' }]
    expect(await countDueGrammar({ userId: 'u1', track: TRACK, now: NOW })).toBe(1)
    state.selectError = { message: 'boom' }
    expect(await countDueGrammar({ userId: 'u1', track: TRACK, now: NOW })).toBe(0)
  })
})

describe('gradeGrammar', () => {
  it('advances a new row and writes only the FSRS columns (no is_easy/learned/interval_days)', async () => {
    const row = { topic_id: 'shi-vs-adjectives', state: 'new' }
    await gradeGrammar({ userId: 'u1', track: TRACK, topicId: 'shi-vs-adjectives', row, correct: true })
    const patch = state.lastPatch
    expect(patch).toHaveProperty('state')
    expect(patch).toHaveProperty('due_at')
    expect(patch).toHaveProperty('stability')
    expect(patch).not.toHaveProperty('is_easy')
    expect(patch).not.toHaveProperty('learned')
    expect(patch).not.toHaveProperty('interval_days')
    // A correct first answer graduates the card out of 'new'.
    expect(patch.state).not.toBe('new')
  })

  it('a wrong answer lapses an existing review row (Again)', async () => {
    const row = {
      topic_id: 't', state: 'review', due_at: NOW.toISOString(),
      stability: 40, difficulty: 5, reps: 5, lapses: 0,
      last_review: '2026-06-01T00:00:00.000Z', scheduled_days: 30, elapsed_days: 30, learning_step: 0,
    }
    await gradeGrammar({ userId: 'u1', track: TRACK, topicId: 't', row, correct: false })
    // Again → relearning, and a lapse recorded.
    expect(state.lastPatch.lapses).toBeGreaterThanOrEqual(1)
  })

  it('surfaces a write failure', async () => {
    state.updateError = { message: 'fail' }
    await expect(gradeGrammar({
      userId: 'u1', track: TRACK, topicId: 't', row: { topic_id: 't', state: 'new' }, correct: true,
    })).rejects.toThrow('fail')
  })
})
