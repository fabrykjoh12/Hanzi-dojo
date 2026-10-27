import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

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

import { markWordDue, shouldNudge } from './practiceSignal'
import { isPriorKnown, NOT_AN_UNVERIFIED_CLAIM, PRIOR_KNOWLEDGE_COLUMNS } from './knowledgeState'

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
    // resurface the word for review (a claim is never due); it makes the claim
    // calibration-ELIGIBLE months before the spread intended and defeats its
    // pacing. Not "jumps the queue" — calibration.js picks by frequencyRank,
    // and due_at only feeds isCalibrationReady.
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

  it('says nothing about a row it was not given', () => {
    expect(shouldNudge(null)).toBe(false)
    expect(shouldNudge(undefined)).toBe(false)
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
      // NOT PostgREST's NULL semantics: SQL's `reps >= 1` does not match a
      // NULL reps, and this reads it as 0 >= 1, which happens to give the same
      // answer for every shape below. It models the filter's INTENT well enough
      // to catch drift between the string and the predicate, which is this
      // spec's job; it is not a database.
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

describe('the callers that decide before they tell the learner anything', () => {
  const src = (name) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8')

  it('Writing.jsx fetches the columns shouldNudge reads', () => {
    // The defect this exists for. Writing's card query selected
    // `vocab_id, is_easy, state, review_count`, so prior_known_at and reps were
    // undefined on every row, isPriorKnown was always false, shouldNudge was
    // always true, and the guard below it could never fire.
    //
    // The consequence was not merely a dead branch: setAddedToDue(true) ran for
    // a claim, the button showed its green "Added to due list" confirmation,
    // and the server-side .or() filter made the UPDATE affect zero rows —
    // which PostgREST answers with success. The learner was told the word was
    // added and it was not.
    // Anchored to the cards SELECT, not to the file: the spread appearing
    // anywhere else in Writing.jsx would satisfy an unanchored match.
    const code = src('./Writing.jsx')
    const select = code.slice(code.indexOf(".from('cards')"))
    expect(select.slice(0, 400), 'the cards SELECT no longer carries the prior-knowledge columns')
      .toMatch(/\.select\(\[[^\]]*\.\.\.PRIOR_KNOWLEDGE_COLUMNS/)
  })

  it('PRIOR_KNOWLEDGE_COLUMNS is exactly what isPriorKnown needs — no more, no less', () => {
    // An earlier version of this asserted that the list contains its own
    // elements, which is a tautology dressed as a coverage check: deleting
    // 'reps' from knowledgeState left the whole suite green while Writing's
    // select silently stopped fetching it, at which point hasGenuineObservation
    // reads undefined, and shouldNudge returns FALSE for a verified claim —
    // refusing "Add to due list" for a word the learner has since studied.
    //
    // So it is asserted as the two properties that actually define the list.
    // Same shape as src/migration/reviewLogContract.js's column assertion,
    // which exists because that was the only way its missing-column bug could
    // have been caught.
    const rows = [unknown, claim, verifiedClaim, studied]

    // SUFFICIENT: a row carrying ONLY these columns classifies the same way the
    // whole row does. Drop a column from the list and this fails — picking just
    // { prior_known_at } out of a verified claim reads as an unverified one.
    for (const row of rows) {
      const picked = {}
      for (const col of PRIOR_KNOWLEDGE_COLUMNS) picked[col] = row[col]
      expect(isPriorKnown(picked), 'the list is not enough to classify ' + JSON.stringify(row))
        .toBe(isPriorKnown(row))
    }

    // NECESSARY: every column earns its place — removing it from a fetched row
    // changes the answer for at least one shape. A column nobody reads would
    // widen every caller's SELECT for nothing, and the next reader would not
    // know which ones mattered.
    for (const col of PRIOR_KNOWLEDGE_COLUMNS) {
      const changed = rows.some((row) => {
        const without = { ...row }
        delete without[col]
        return isPriorKnown(without) !== isPriorKnown(row)
      })
      expect(changed, col + ' is in the list but no caller needs it').toBe(true)
    }
  })

  it('Writing.jsx still refuses before it confirms', () => {
    const code = src('./Writing.jsx')
    const guard = code.indexOf('if (!shouldNudge(')
    const confirm = code.indexOf('setAddedToDue(true)')
    expect(guard, 'the claim guard is gone').toBeGreaterThan(-1)
    expect(confirm, 'the confirmation is gone').toBeGreaterThan(-1)
    expect(guard, 'the button confirms before it checks').toBeLessThan(confirm)
  })

  it('Writing.jsx keeps the server-side filter as well as the local check', () => {
    // Belt and braces: cardsByVocab is a snapshot taken when the screen loaded.
    expect(src('./Writing.jsx')).toMatch(/\.or\(NOT_AN_UNVERIFIED_CLAIM\)/)
  })

  it('every practice drill goes through markWordDue rather than its own update', () => {
    // The exclusion is server-side, so a drill that wrote its own UPDATE would
    // bypass it entirely. Five call sites today.
    const drills = ['./Listen.jsx', './FillBlank.jsx', './Tones.jsx', './SentenceBuilder.jsx', './Speaking.jsx']
    for (const f of drills) {
      const code = src(f)
      expect(code, f + ' does not use markWordDue').toMatch(/markWordDue\(/)
      expect(code, f + ' writes to cards directly').not.toMatch(/from\('cards'\)[\s\S]{0,80}\.update\(/)
    }
  })
})
