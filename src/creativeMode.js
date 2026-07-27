// Creative mode — the pure logic behind the admin sandbox on /dashboard.
//
// Creative mode lets the maintainer put THEIR OWN account into an arbitrary
// state — jump a level, learn or master N words, force reviews due, wipe the
// language — so the app can be exercised without hand-written SQL. It is the
// `/unlock` and `/reset` slash commands brought into the UI.
//
// This module is deliberately pure: no React, no Supabase. It decides which
// levels are offered, which vocabulary is picked, what card row each action
// produces, how the past review dates are spread, and what needs confirming.
// `CreativeMode.jsx` is the thin panel that runs the rows this returns, and it
// filters every write on the signed-in user's id (RLS does the rest), so no
// path here can touch another account.
//
// Two repo rules shape the card rows below and must stay true:
//   §7.3 `is_easy` is the SRS grading flow's alone — never set true here.
//   §10  `ease_factor` is a dead SM-2 column — never written.
// Mastery is gated on FSRS stability (mastery.js), so that is what these rows
// set: a genuine stability value, not a flag.

import { getLevels, getLevelLabel } from './utils'
import { MASTERY_STABILITY_DAYS } from './mastery'
import { endOfLocalDay } from './srs'

const DAY_MS = 24 * 60 * 60 * 1000

// ── Counts ──────────────────────────────────────────────────────────────────

// A single action never touches more rows than this. It is a guard rail, not a
// scheduling rule: an accidental extra zero should not rewrite the whole deck.
export const MAX_COUNT = 2000

// The one-tap amounts offered next to the free-text field.
export const PRESET_COUNTS = [10, 25, 50, 100, 300]

// Parse whatever is in the count field into a usable integer. Anything that
// isn't a positive number means "nothing to do" (0) rather than a guess.
export function parseCount(raw, max = MAX_COUNT) {
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n) || n < 1) return 0
  return Math.min(n, max)
}

// ── Levels ──────────────────────────────────────────────────────────────────

// The levels this track can jump to, read from the language's own level system
// (never a branch on the language key) and labelled through getLevelLabel.
export function levelOptions(language, system, currentLevel) {
  return getLevels(language, system).map(level => ({
    level,
    label: getLevelLabel(language, system, level),
    isCurrent: level === currentLevel,
  }))
}

// Is this a level the language actually has?
export function isValidLevel(language, system, level) {
  return getLevels(language, system).indexOf(level) !== -1
}

// `level_unlocks` is append-only (§7.5): a row at level L means "passed L's
// test", which is what puts you at L+1. So standing at `targetLevel` implies a
// row for every level BELOW it. This returns only the ones that are missing —
// jumping up appends, jumping back down removes nothing and rewrites nothing.
export function missingUnlockLevels(language, system, targetLevel, existingLevels) {
  const have = new Set(existingLevels || [])
  const out = []
  for (const level of getLevels(language, system)) {
    if (level >= targetLevel) break
    if (!have.has(level)) out.push(level)
  }
  return out
}

// The `level_unlocks` rows for those levels, scoped to one user.
export function unlockRows(userId, language, system, levels) {
  return (levels || []).map(level => ({
    user_id: userId, language, system, level,
  }))
}

// ── Which words get picked ──────────────────────────────────────────────────

// The order the study deck introduces vocabulary in: level, then frequency rank
// within the level. Ties fall back to id so the pick is stable across runs.
export function orderVocab(vocab) {
  return [...(vocab || [])].sort((a, b) => {
    const la = a.level == null ? Infinity : a.level
    const lb = b.level == null ? Infinity : b.level
    if (la !== lb) return la - lb
    const sa = a.sort_order == null ? 0 : a.sort_order
    const sb = b.sort_order == null ? 0 : b.sort_order
    if (sa !== sb) return sa - sb
    return String(a.id) < String(b.id) ? -1 : 1
  })
}

// The next N words the learner has not started yet — same order the app would
// have introduced them in, so "learn me 300 words" produces a plausible history
// rather than a random 300.
export function pickUnstartedVocabIds(vocab, startedVocabIds, n) {
  const started = new Set(startedVocabIds || [])
  const want = parseCount(n)
  const out = []
  for (const v of orderVocab(vocab)) {
    if (out.length >= want) break
    if (!v || v.id == null || started.has(v.id)) continue
    out.push(v.id)
  }
  return out
}

// ── The card rows each action writes ────────────────────────────────────────
//
// Both specs describe a card that has been reviewed on schedule for a while:
// state 'review', learned true, a real FSRS stability, a plausible rep count.
// The only difference is how far along it is.
//
//   learned  — stability well under the 21-day mastery gate. Counts as learned
//              (stories/tiers unlock), does NOT count as mastered.
//   mastered — stability comfortably past the gate, so the level test unlocks
//              and the mastery display has something to show.
export const CARD_SPECS = {
  learned: {
    key: 'learned',
    stability: 6,
    difficulty: 5.5,
    reps: 3,
    intervalDays: 6,
  },
  mastered: {
    key: 'mastered',
    // Sits above MASTERY_STABILITY_DAYS by a margin, so a small FSRS tweak to
    // the gate can't silently turn every seeded card back into "not mastered".
    stability: MASTERY_STABILITY_DAYS + 9,
    difficulty: 4.2,
    reps: 9,
    intervalDays: MASTERY_STABILITY_DAYS + 9,
  },
}

export function cardSpec(mode) {
  return CARD_SPECS[mode] || null
}

// How many whole days ago card #index was last reviewed. Round-robins across
// the interval, so N seeded cards land their due dates evenly over the coming
// `intervalDays` days instead of arriving as one wall of reviews tomorrow.
export function reviewDayOffset(index, intervalDays) {
  const span = Math.floor(intervalDays)
  if (!Number.isFinite(span) || span < 1) return 0
  const i = Number.isFinite(index) && index > 0 ? Math.floor(index) : 0
  return i % span
}

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS)
}

// One card row, in exactly the shape srs.js's schedule() produces — minus
// `is_easy: true` (never ours to set) and `ease_factor` (dead column).
export function creativeCardRow(userId, vocabId, options) {
  const opts = options || {}
  const spec = cardSpec(opts.mode)
  if (!spec) return null
  const now = opts.now || new Date()
  const back = reviewDayOffset(opts.index, spec.intervalDays)
  const lastReview = addDays(now, -back)
  const due = addDays(lastReview, spec.intervalDays)
  return {
    user_id: userId,
    vocab_id: vocabId,
    state: 'review',
    learned: true,
    is_easy: false,
    stability: spec.stability,
    difficulty: spec.difficulty,
    reps: spec.reps,
    lapses: 0,
    interval_days: spec.intervalDays,
    scheduled_days: spec.intervalDays,
    elapsed_days: spec.intervalDays,
    learning_step: 0,
    last_review: lastReview.toISOString(),
    due_at: due.toISOString(),
  }
}

// The full batch for one "learn N" / "master N" action.
export function creativeCardRows(userId, vocabIds, mode, now = new Date()) {
  if (!cardSpec(mode)) return []
  const rows = []
  ;(vocabIds || []).forEach((vocabId, index) => {
    const row = creativeCardRow(userId, vocabId, { mode, index, now })
    if (row) rows.push(row)
  })
  return rows
}

// ── Forcing reviews due ─────────────────────────────────────────────────────

function dueTime(card) {
  const t = new Date(card && card.due_at ? card.due_at : 0).getTime()
  return Number.isFinite(t) ? t : 0
}

// Cards that exist, have been started, and are NOT already available today —
// soonest-due first, so pulling reviews forward takes the ones nearest anyway.
// If nothing comes back the honest answer is "everything is already due", not
// a re-shuffle of the queue.
export function pickCardsToForceDue(cards, n, now = new Date()) {
  const cutoff = endOfLocalDay(now).getTime()
  const want = parseCount(n)
  return (cards || [])
    .filter(c => c && c.id != null && c.state !== 'new' && dueTime(c) > cutoff)
    .sort((a, b) => dueTime(a) - dueTime(b))
    .slice(0, want)
    .map(c => c.id)
}

// The update that makes a card available in this session. Only `due_at` moves —
// stability, difficulty and the rep history stay exactly as the learner earned
// them, so forcing a review never fakes progress.
export function forceDueUpdate(now = new Date()) {
  return { due_at: now.toISOString() }
}

// ── Confirmation ────────────────────────────────────────────────────────────

// Anything at or above this many rows is a mass change and gets a second tap.
export const CONFIRM_THRESHOLD = 100

// Which actions must be confirmed before they run: the reset (it deletes),
// forcing reviews due (it rewrites the schedule of cards that already exist),
// and any bulk action large enough to be annoying to undo.
export function needsConfirm(actionKey, count) {
  if (actionKey === 'reset') return true
  if (actionKey === 'due') return true
  return parseCount(count) >= CONFIRM_THRESHOLD
}

// Two-step arm/confirm state machine, driven by which action key is currently
// armed. Returns { run, armedKey }: `run` means go, `armedKey` is the panel's
// next armed state. Arming a different action always disarms the previous one,
// so a stray second tap can never fire the button you were not looking at.
export function armConfirm(actionKey, count, armedKey) {
  if (!needsConfirm(actionKey, count)) return { run: true, armedKey: null }
  if (armedKey === actionKey) return { run: true, armedKey: null }
  return { run: false, armedKey: actionKey }
}

// ── Wording ─────────────────────────────────────────────────────────────────

// Honest summary of what actually happened. The case worth spelling out is the
// shortfall — "learn 300" when only 40 unstarted words remain looks like a bug
// otherwise.
export function describeApplied(applied, requested, noun) {
  const a = applied || 0
  const r = requested || 0
  if (a === 0) return 'Nothing to do — no ' + noun + ' left in scope'
  if (a < r) return a + ' ' + noun + ' (only that many were in scope)'
  return a + ' ' + noun
}
