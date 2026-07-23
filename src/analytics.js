// Analytics — a single, isolated service for understanding the LEARNING journey
// (where users drop out), not marketing. No third-party trackers, no heavy deps:
// events are appended to our own Supabase table (analytics_events), and queued
// through the existing offline outbox when offline.
//
// Design rules:
//   - Components never talk to Supabase or the queue directly. They call
//     track(EVENTS.x, props) with counts/enums only. This file owns everything.
//   - Every call is best-effort and NEVER throws or rejects unhandled. If
//     analytics fail, the learning experience continues untouched.
//   - Events carry timestamp, language, level, user id, session id, app version.
//     They must NOT carry personal text, story contents, typed answers, or email
//     — enforced by keeping props to numbers/booleans/short enums (sanitizeProps).

import { supabase } from './supabase'
import { isOnline } from './useOnline'
import { enqueueAnalytics } from './syncQueue'
import { BUILD_SHA } from './version'

// ── Event names (one place; components import these, never string literals) ───
export const EVENTS = {
  // Top-of-funnel (pre-auth)
  LANDING_VIEWED: 'landing_viewed',
  PRELOGIN_LANGUAGE_PICKED: 'prelogin_language_picked',
  PRELOGIN_REASON_PICKED: 'prelogin_reason_picked',
  PRELOGIN_SIGNUP_STARTED: 'prelogin_signup_started',
  TASTE_SHOWN: 'taste_shown',
  TASTE_WORD_REVEALED: 'taste_word_revealed',
  TASTE_COMPLETED: 'taste_completed',
  SIGNUP_STARTED: 'signup_started',
  SIGNUP_COMPLETED: 'signup_completed',
  // Public story links (pre-auth, anonymous funnel)
  PUBLIC_STORY_VIEWED: 'public_story_viewed',
  PUBLIC_STORY_LEVEL_PICKED: 'public_story_level_picked',
  PUBLIC_STORY_SIGNUP_CLICKED: 'public_story_signup_clicked',
  // Public reading assessment (pre-auth, anonymous funnel)
  ASSESSMENT_STARTED: 'assessment_started',
  ASSESSMENT_COMPLETED: 'assessment_completed',
  ASSESSMENT_SIGNUP_CLICKED: 'assessment_signup_clicked',
  // Activation
  ONBOARDING_STARTED: 'onboarding_started',
  ONBOARDING_COMPLETED: 'onboarding_completed',
  FIRST_MISSION_STARTED: 'first_mission_started',
  FIRST_MISSION_COMPLETED: 'first_mission_completed',
  FIRST_STORY_OPENED: 'first_story_opened',
  FIRST_STORY_COMPLETED: 'first_story_completed',
  PRIOR_KNOWLEDGE_CLAIMED: 'prior_knowledge_claimed',
  // Recurring learning loop (mode prop distinguishes daily / weak / review)
  STUDY_SESSION_STARTED: 'study_session_started',
  STUDY_SESSION_COMPLETED: 'study_session_completed',
  STORY_OPENED: 'story_opened',
  STORY_COMPLETED: 'story_completed',
  STORY_SHARED: 'story_shared',
  TEXT_ANALYZED: 'text_analyzed',
  // Signals
  ACHIEVEMENT_UNLOCKED: 'achievement_unlocked',
  LANGUAGE_SWITCHED: 'language_switched',
  // App session envelope
  SESSION_STARTED: 'session_started',
  SESSION_ENDED: 'session_ended',
}

// ── Context: who/where the user is, set by the app as it learns ──────────────
let ctx = { userId: null, language: null, level: null }

export function setAnalyticsContext(next) {
  if (next && typeof next === 'object') ctx = { ...ctx, ...next }
}

export function getAnalyticsContext() {
  return { ...ctx }
}

// ── Per app-load session id (client-generated; not an auth session) ──────────
let sessionId = null

function randomId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  } catch { /* fall through */ }
  // Non-crypto fallback — id only needs to be unique-enough to group a session.
  return 's-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
}

export function getSessionId() {
  if (!sessionId) sessionId = randomId()
  return sessionId
}

// ── One-shot guard (duplicate-session / duplicate-milestone prevention) ──────
const fired = new Set()

// Returns true the FIRST time called with a key, false afterwards. Used so
// "session started" and the first-mission milestones fire at most once.
export function markOnce(key) {
  if (fired.has(key)) return false
  fired.add(key)
  return true
}

// Test/reset hook — clears the once-guard and session id.
export function _resetForTests() {
  fired.clear()
  sessionId = null
  ctx = { userId: null, language: null, level: null }
}

// ── Props sanitizer: keep events non-personal by construction ────────────────
// Allows numbers and booleans as-is; strings only if short (enums/ids), so a
// typed answer or story sentence can never slip into an event. Drops anything
// else (objects, arrays, functions, over-long strings).
const MAX_STRING = 40
export function sanitizeProps(props) {
  const out = {}
  if (!props || typeof props !== 'object') return out
  for (const key of Object.keys(props)) {
    const v = props[key]
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = v
    else if (typeof v === 'boolean') out[key] = v
    else if (typeof v === 'string' && v.length > 0 && v.length <= MAX_STRING) out[key] = v
    // everything else is intentionally dropped
  }
  return out
}

// ── Build the event row (pure; exported for tests) ───────────────────────────
export function buildEvent({ name, props = {}, context = {}, sessionId: sid = null, appVersion = null, ts = null }) {
  return {
    name,
    session_id: sid || null,
    user_id: context.userId || null,
    language: context.language || null,
    level: (context.level === 0 || context.level) ? context.level : null,
    app_version: appVersion || null,
    props: sanitizeProps(props),
    created_at: ts || new Date().toISOString(),
  }
}

// ── Core: fire-and-forget an event. Never throws. ────────────────────────────
export function track(name, props = {}) {
  if (!name) return
  let event
  try {
    event = buildEvent({
      name,
      props,
      context: ctx,
      sessionId: getSessionId(),
      appVersion: BUILD_SHA,
    })
  } catch {
    return   // building the event failed — give up silently
  }

  try {
    if (isOnline()) {
      // Best-effort insert; swallow every outcome so nothing surfaces to the UI.
      const res = supabase.from('analytics_events').insert(event)
      if (res && typeof res.then === 'function') res.then(() => {}, () => {})
    } else {
      const q = enqueueAnalytics(event)
      if (q && typeof q.then === 'function') q.then(() => {}, () => {})
    }
  } catch { /* analytics must never break the app */ }
}

// Fire an event at most once per app-load (keyed by name + optional suffix).
export function trackOnce(name, props = {}, key = name) {
  if (markOnce(key)) track(name, props)
}

// ── App-session envelope (start once per app-load; end carries duration) ─────
let sessionStartMs = null
function nowMs() { try { return Date.now() } catch { return 0 } }

export function startSession() {
  if (markOnce('session')) {
    sessionStartMs = nowMs()
    track(EVENTS.SESSION_STARTED, {})
  }
}

export function endSession(props = {}) {
  // Not once-guarded — a tab can be hidden/shown repeatedly; each end carries
  // the duration so far, and dashboards take the last per session_id.
  const durationMs = sessionStartMs ? Math.max(0, nowMs() - sessionStartMs) : 0
  track(EVENTS.SESSION_ENDED, { duration_ms: durationMs, ...props })
}
