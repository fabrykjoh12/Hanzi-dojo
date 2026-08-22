// Rebuilding a seeded-then-reviewed card from the reviews that really happened.
//
// 51 production rows sit at stability exactly 21 with reps >= 1: seeded by the
// old prior-knowledge writer, then genuinely answered. Their difficulty moved
// (a real review touched them) but their stability never did, because a review
// at ~100% retrievability tells FSRS nothing. So they still read as MASTERED on
// the strength of one same-day answer — the exact bug, preserved in the two
// accounts most affected by it.
//
// Leaving them is not neutral. The honest repair is available: review_logs holds
// the actual grades and timestamps, so the card can be replayed from a
// legitimate empty card through the canonical scheduler. Every value that comes
// out is derived from something the learner really did — no invention in either
// direction.
//
// Kept apart from legacyClaimMigration.js because this half needs the scheduler,
// while classification is pure bookkeeping.
//
// ── WHAT THE REPLAY ASSUMES, AND CANNOT KNOW ────────────────────────────────
//
// FSRS intervals depend on `request_retention`, and the app lets a learner move
// that dial (srs.js RETENTION_PRESETS: 0.85 / 0.9 / 0.95). The replay therefore
// needs to know what retention was in force AT EACH HISTORICAL REVIEW.
//
// IT IS NOT RECORDED. `review_logs` stores id, user_id, card_id, vocab_id,
// grade, previous_state, next_state, previous_interval_days, next_interval_days,
// reviewed_at, client_op_id — and no retention. `profiles.target_retention`
// holds only the learner's CURRENT setting, with no history. So the retention
// that applied to a review in the past is unknowable from this database.
//
// The replay therefore uses srs.js's default (0.9) unless a caller passes
// `targetRetention`. This is an ASSUMPTION, not a reconstruction, and the
// resulting state is "what this history would produce at 0.9" rather than
// "exactly what happened".
//
// Two things make it the most honest repair available anyway:
//   * the alternative is leaving a stability of 21 that was never earned at all;
//   * measured on this database, every profile sits at the 0.9 default and not
//     one account has ever set a different value, so for the rows this migration
//     actually touches the assumption is almost certainly the fact.
//
// If the dial is ever used, and a future migration needs exact reconstruction,
// review_logs would have to start recording the retention in force. Worth doing
// if FSRS parameter tuning is ever revisited; not worth blocking this on.

import { schedule } from './srs.js'

// replayCard(history) → { updates, steps } | null
//
// `history` must be oldest-first and fully populated (legacyClaimMigration's
// orderedHistory + isReplayable guarantee both). Returns null rather than
// guessing when there is nothing to replay.
//
// Each step feeds the previous card state back into schedule(), with the clock
// moved to when that review actually happened — so intervals are computed
// against real elapsed time, exactly as they were on the day.
export function replayCard(history, { targetRetention, now = Date } = {}) {
  const steps = orderedOrNull(history)
  if (!steps) return null

  // The starting point is an honest empty card: state 'new', no id, so
  // srs.buildFsrsCard hands ts-fsrs a createEmptyCard(). Nothing is inherited
  // from the fabricated row.
  let card = { id: null, state: 'new' }
  const trace = []

  for (const entry of steps) {
    const at = new Date(entry.reviewed_at)
    const restore = freezeClockTo(at, now)
    try {
      const res = schedule(card, Number(entry.grade), targetRetention != null ? { targetRetention } : undefined)
      // id LAST: srs.buildFsrsCard restarts from createEmptyCard() whenever
      // a card has no id, so letting the spread reinstate the initial null
      // would silently replay every step as a first review.
      card = { ...card, ...res.updates, id: 'replay' }
      trace.push({
        at: at.toISOString(),
        grade: Number(entry.grade),
        state: res.updates.state,
        stability: res.updates.stability,
        reps: res.updates.reps,
        lapses: res.updates.lapses,
      })
    } finally {
      restore()
    }
  }

  // Only the FSRS-owned columns are written back. Identity, provenance and
  // created_at stay exactly as they are.
  const updates = {
    state: card.state,
    interval_days: card.interval_days,
    due_at: card.due_at,
    is_easy: card.is_easy,
    learned: card.learned,
    stability: card.stability,
    difficulty: card.difficulty,
    reps: card.reps,
    lapses: card.lapses,
    last_review: card.last_review,
    scheduled_days: card.scheduled_days,
    elapsed_days: card.elapsed_days,
    learning_step: card.learning_step,
    // It WAS a claim, and it HAS been verified — the first replayed review is
    // the observation that verified it.
    verified_at: trace.length ? trace[0].at : null,
  }
  return { updates, steps: trace }
}

function orderedOrNull(history) {
  const rows = (history || []).filter(l => l && l.grade != null && l.reviewed_at != null)
  if (rows.length === 0) return null
  return rows
}

// schedule() reads the wall clock (it grades "now"), so replaying a historical
// review means moving the clock to that moment. Restores it unconditionally.
function freezeClockTo(date, Clock) {
  const RealDate = Clock === Date ? Date : Clock
  const original = globalThis.Date
  const fixed = date.getTime()
  class FrozenDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(fixed)
      else super(...args)
    }
    static now() { return fixed }
  }
  globalThis.Date = FrozenDate
  return () => { globalThis.Date = original }
}

// A one-line, human-readable summary of what the replay changed — for the
// dry-run report, so a reviewer can see the fabricated value leave.
export function describeReplay(before, result) {
  if (!result) return 'not replayable'
  const from = 'S=' + fmt(before && before.stability) + ' D=' + fmt(before && before.difficulty) + ' reps=' + ((before && before.reps) || 0)
  const to = 'S=' + fmt(result.updates.stability) + ' D=' + fmt(result.updates.difficulty) + ' reps=' + result.updates.reps
  return from + '  ->  ' + to + '  (' + result.steps.length + ' real review' + (result.steps.length === 1 ? '' : 's') + ')'
}

function fmt(n) {
  if (n == null) return 'null'
  return Math.round(Number(n) * 100) / 100
}
