// Pure helpers for the developer page (/dev) — testable without the UI.
//
// The dev page is self-service testing: every action runs as the SIGNED-IN
// user through RLS, so it can only ever touch that account's own rows. Access
// is gated to the developer email allowlist below (override with a
// comma-separated VITE_DEV_EMAILS at build time).

import { normalizeEmail } from './utils'
import { creativeCardRow } from './creativeMode'

const DEFAULT_DEV_EMAILS = 'fabrykjoh@gmail.com'

export function devEmailList(raw) {
  const src = raw != null
    ? raw
    : (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_DEV_EMAILS) || DEFAULT_DEV_EMAILS
  return String(src).split(',').map(normalizeEmail).filter(Boolean)
}

export function isDevUser(email, raw) {
  if (!email) return false
  return devEmailList(raw).indexOf(normalizeEmail(email)) !== -1
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
