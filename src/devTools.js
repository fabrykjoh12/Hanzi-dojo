// Pure helpers for the developer page (/dev) — testable without the UI.
//
// The dev page is self-service testing: every action runs as the SIGNED-IN
// user through RLS, so it can only ever touch that account's own rows.
//
// Access is gated on `profile.is_admin` — the same server-backed flag that
// gates /hq and /dashboard. It replaced a hardcoded email allowlist, which had
// two problems: the default literal was a personal address that Vite inlined
// into the public store bundle, and an email string is not access control at
// all, only a convention. `is_admin` is set in the database and cannot be
// self-assigned (guard_is_admin_flag trigger), so it is the honest gate.

import { creativeCardRow } from './creativeMode'

export function isDevAllowed(profile) {
  return !!(profile && profile.is_admin)
}

// A card row that counts as fully MASTERED everywhere. Delegates to Creative
// mode's builder, which writes a genuine FSRS stability past the 21-day gate
// and — per the standing rules — never sets `is_easy: true` (§7.3, the grading
// flow's alone) and never writes `ease_factor` (§10, dead SM-2 column). The
// old local row here violated both.
export function masteredCardRow(userId, vocabId, now = new Date()) {
  return creativeCardRow(userId, vocabId, { mode: 'mastered', now })
}

// A card row freshly in the learning phase — due now, nothing mastered.
export function learningCardRow(userId, vocabId, now = new Date()) {
  return {
    user_id: userId, vocab_id: vocabId,
    state: 'learning', is_easy: false, learned: false,
    interval_days: 0, learning_step: 0,
    due_at: now.toISOString(), stability: 0,
  }
}

// PostgREST caps payload sizes; batch big upserts/deletes.
export function chunk(items, size = 200) {
  const out = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
