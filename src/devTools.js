// Pure helpers for the developer page (/dev) — testable without the UI.
//
// The dev page is self-service testing: every action runs as the SIGNED-IN
// user through RLS, so it can only ever touch that account's own rows. Access
// is gated to the developer email allowlist below (override with a
// comma-separated VITE_DEV_EMAILS at build time).

import { normalizeEmail } from './utils'

const DEFAULT_DEV_EMAILS = 'fabrykjoh12@gmail.com'

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

// A card row that counts as fully MASTERED everywhere: state/learned drive
// "learned", is_easy drives the reader's mastered status, stability ≥ 21 days
// drives FSRS mastery (test unlock), and due_at 30 days out keeps the review
// queue quiet. Mirrors the /unlock skill's SQL plus the FSRS stability column.
export function masteredCardRow(userId, vocabId, now = new Date()) {
  const due = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  return {
    user_id: userId, vocab_id: vocabId,
    state: 'review', is_easy: true, learned: true,
    ease_factor: 2.5, interval_days: 30, learning_step: 0,
    due_at: due.toISOString(), stability: 30,
  }
}

// A card row freshly in the learning phase — due now, nothing mastered.
export function learningCardRow(userId, vocabId, now = new Date()) {
  return {
    user_id: userId, vocab_id: vocabId,
    state: 'learning', is_easy: false, learned: false,
    ease_factor: 2.5, interval_days: 0, learning_step: 0,
    due_at: now.toISOString(), stability: 0,
  }
}

// PostgREST caps payload sizes; batch big upserts/deletes.
export function chunk(items, size = 200) {
  const out = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
