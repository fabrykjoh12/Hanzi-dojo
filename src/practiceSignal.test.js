import { describe, it, expect, vi, beforeEach } from 'vitest'

// A chainable PostgREST double that records the filters a call actually built.
const calls = vi.hoisted(() => ({ updates: [] }))
vi.mock('./supabase', () => {
  const builder = (rec) => ({
    eq: (k, v) => { rec.eq[k] = v; return builder(rec) },
    or: (expr) => { rec.or.push(expr); return builder(rec) },
    then: (res) => Promise.resolve({ data: null, error: null }).then(res),
  })
  return {
    supabase: {
      from: (table) => ({
        update: (vals) => {
          const rec = { table, vals, eq: {}, or: [] }
          calls.updates.push(rec)
          return builder(rec)
        },
      }),
    },
  }
})

import { markWordDue, shouldNudge, NOT_AN_UNVERIFIED_CLAIM } from './practiceSignal'
import { isPriorKnown } from './knowledgeState'

const SESSION = { user: { id: 'u1' } }

// The four card shapes that matter, by knowledgeState's own vocabulary.
const unknown = { vocab_id: 'v', prior_known_at: null, verified_at: null, reps: 0, state: 'new' }
const claim = { vocab_id: 'v', prior_known_at: '2026-08-01T00:00:00Z', verified_at: null, reps: 0, state: 'new' }
const verifiedClaim = { vocab_id: 'v', prior_known_at: '2026-08-01T00:00:00Z', verified_at: '2026-08-20T00:00:00Z', reps: 1, state: 'learning' }
const studied = { vocab_id: 'v', prior_known_at: null, verified_at: null, reps: 5, state: 'review' }

describe('a practice miss never disturbs an unverified claim', () => {
  beforeEach(() => { calls.updates.length = 0 })

  it('filters the update so a claim cannot be touched', () => {
    // The defect: without this filter, one wrong Listening answer set due_at =
    // now() on ANY row for the vocab id — including a claim, whose due_at holds
    // the calibration-ready date written by spreadDueDates. That does not
    // resurface the word for review (a claim is never due); it yanks it to the
    // front of the calibration queue and defeats the spread's pacing.
    markWordDue(SESSION, 'v1')
    expect(calls.updates).toHaveLength(1)
    const rec = calls.updates[0]
    expect(rec.table).toBe('cards')
    expect(rec.eq).toEqual({ user_id: 'u1', vocab_id: 'v1' })
    expect(rec.or, 'the claim exclusion is missing from the query').toEqual([NOT_AN_UNVERIFIED_CLAIM])
  })

  it('still writes the nudge itself', () => {
    // The fix must not turn markWordDue into a no-op for ordinary cards.
    markWordDue(SESSION, 'v1')
    expect(calls.updates[0].vals.is_easy).toBe(false)
    expect(typeof calls.updates[0].vals.due_at).toBe('string')
  })

  it('does nothing without a session or a vocab id', () => {
    markWordDue(null, 'v1')
    markWordDue(SESSION, null)
    expect(calls.updates).toHaveLength(0)
  })

  it('the predicate is exactly the negation of isPriorKnown', () => {
    for (const card of [unknown, claim, verifiedClaim, studied]) {
      expect(shouldNudge(card), JSON.stringify(card)).toBe(!isPriorKnown(card))
    }
    expect(shouldNudge(null)).toBe(false)
  })

  it('the SQL filter and the JS predicate agree, row by row', () => {
    // The drift guard, and the reason both exist. A PostgREST filter string and
    // a JS predicate are exactly the pair that silently diverges: change one,
    // and the query stops matching the rule the code believes it enforces.
    //
    // A tiny evaluator for the `.or()` grammar this filter uses — enough for
    // `col.is.null` and `col.gte.N`, which is all of it. If the filter grows a
    // form this cannot read, that is itself worth failing on.
    const evaluate = (expr, row) => expr.split(',').some((clause) => {
      const [col, op, val] = clause.split('.')
      if (op === 'is' && val === 'null') return row[col] === null || row[col] === undefined
      if (op === 'gte') return (row[col] || 0) >= Number(val)
      throw new Error('unsupported filter clause: ' + clause)
    })

    for (const card of [unknown, claim, verifiedClaim, studied]) {
      expect(evaluate(NOT_AN_UNVERIFIED_CLAIM, card), JSON.stringify(card))
        .toBe(shouldNudge(card))
    }
  })

  it('excludes the claim and nothing else', () => {
    // Stated as values rather than as a property, so the intent is legible: the
    // claim is the ONE shape that must be skipped.
    expect(shouldNudge(claim)).toBe(false)
    expect(shouldNudge(unknown)).toBe(true)
    expect(shouldNudge(verifiedClaim)).toBe(true)
    expect(shouldNudge(studied)).toBe(true)
  })
})
