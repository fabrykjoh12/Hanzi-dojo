// First-run guided tour — the calm coach-mark walkthrough a new learner gets
// on their first visit to Home and to the Stories shelf. All the behaviour
// lives here (pure, tested); TourOverlay.jsx only draws it.
//
// Design stance (per the product philosophy): observational copy, no hype, no
// gamified wizard. The tour points at what is already on screen and then gets
// out of the way. It runs once per screen, per device, and "Skip tour" is
// always one tap away.
//
// Seen state is device-local, in the IndexedDB prefs store (offline.js), under
// ONE key. That is honest: the tour teaches this device's screen, and a prefs
// row costs the learner nothing if the device is wiped — worst case the tour
// plays once more.
//
// Who gets a tour: accounts younger than TOUR_NEW_ACCOUNT_DAYS. An account
// that has used the app for months doesn't need the app explained mid-routine
// — surprising established learners with an overlay after an update would be
// its own dark pattern. Settings has a "Replay the app tour" row that clears
// the seen state AND sets a replay flag, which bypasses the age gate — an
// explicit request beats the heuristic.

import { prefsGet, prefsMerge } from './offline'

export const TOUR_SEEN_KEY = 'tour:seen'

// An account older than this is "established" — no unsolicited tour.
export const TOUR_NEW_ACCOUNT_DAYS = 14

// Step definitions, keyed by screen. `anchor` is a data-tour attribute value in
// the live DOM; a step whose anchor is not rendered is skipped silently.
// `placement` is a hint for the coach-mark card ('below' | 'above' | 'auto').
export const TOURS = {
  home: [
    {
      id: 'home-queue',
      anchor: 'home-queue',
      title: 'Start here each day',
      body: 'This is today’s session — new words plus the reviews that are due. Tap the panel to begin.',
      placement: 'below',
    },
    {
      id: 'home-then-read',
      anchor: 'home-then-read',
      title: 'Then read',
      body: 'Reading is the other half of the method. Today’s story is matched to the words you actually know — the “% readable” is real, and it grows as you learn.',
      placement: 'below',
    },
    {
      id: 'home-nav',
      anchor: 'nav',
      title: 'Everything else',
      body: 'Home, Stories, Cards, Practice and your Profile. Cards first, then a story — that’s the whole daily loop.',
      placement: 'auto',
    },
  ],
  stories: [
    {
      id: 'stories-hero',
      anchor: 'stories-hero',
      title: 'Today’s story reward',
      body: 'Finish a flashcard session and the next chapter of your story unlocks. That’s the loop: study, read, want to know what happens.',
      placement: 'below',
    },
    {
      id: 'stories-shelf',
      anchor: 'stories-shelf',
      title: 'Your library',
      body: 'Tap a cover to open a series and pick a chapter. Chapter one is always free — start anything that looks good.',
      placement: 'auto',
    },
    {
      id: 'stories-ahead',
      anchor: 'stories-ahead',
      title: 'The road ahead',
      body: 'Locked stories say exactly what opens them — a few more learned words, or the next level test.',
      placement: 'auto',
    },
  ],
}

// ── Seen state ───────────────────────────────────────────────────────────────
// Shape: { home?: 'completed'|'skipped', stories?: …, replay?: true }
// A screen key that is missing (or null, after a replay reset) means "not seen".

export function normalizeSeen(saved) {
  return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}
}

export function isTourSeen(seen, screen) {
  const s = normalizeSeen(seen)
  return s[screen] === 'completed' || s[screen] === 'skipped'
}

// The prefs patch that records a finished tour. `outcome` is what actually
// happened ('completed' | 'skipped') — both end the tour for good.
export function seenPatch(screen, outcome) {
  return { [screen]: outcome === 'skipped' ? 'skipped' : 'completed' }
}

// The prefs patch for Settings' "Replay the app tour": clears both screens and
// raises the replay flag so the age gate steps aside for this explicit request.
export function replayPatch() {
  return { home: null, stories: null, replay: true }
}

// ── Trigger ──────────────────────────────────────────────────────────────────

// Fractional days since the account was created; null when unknowable.
export function accountAgeDays(createdAt, now = Date.now()) {
  if (!createdAt) return null
  const t = typeof createdAt === 'number' ? createdAt : Date.parse(createdAt)
  if (Number.isNaN(t)) return null
  return (now - t) / 86400000
}

// The one decision: does this screen's tour run right now?
// `suppressed` is for callers that know a guided flow (onboarding, first
// mission) currently owns the screen — the tour never competes with it.
export function shouldRunTour({ screen, seen, profileCreatedAt, now = Date.now(), suppressed = false } = {}) {
  if (suppressed) return false
  if (!TOURS[screen]) return false
  if (isTourSeen(seen, screen)) return false
  if (normalizeSeen(seen).replay === true) return true
  const age = accountAgeDays(profileCreatedAt, now)
  if (age == null) return false
  return age <= TOUR_NEW_ACCOUNT_DAYS
}

// ── Step filtering ───────────────────────────────────────────────────────────

// Steps whose anchor actually exists (hasAnchor is injected — in the app it's
// a DOM query, in tests a predicate). A missing anchor is silently dropped:
// a coach mark pointing at nothing is worse than one step fewer.
export function visibleSteps(steps, hasAnchor) {
  return (steps || []).filter(step => {
    try { return Boolean(hasAnchor(step)) } catch { return false }
  })
}

// The next step at or after `from` whose anchor still exists, or -1 when the
// tour is over. Used mid-tour, because an anchor present at the start can
// unmount before the tour reaches it.
export function nextStepIndex(steps, from, hasAnchor) {
  const list = steps || []
  for (let i = Math.max(0, from); i < list.length; i += 1) {
    let ok
    try { ok = Boolean(hasAnchor(list[i])) } catch { /* treat as missing */ }
    if (ok) return i
  }
  return -1
}

// ── Coach-mark card placement (pure geometry, tested) ────────────────────────
// Given the highlighted rect and the viewport, decide where the card sits:
// below the anchor when there's room, above when not, beside a full-height
// anchor (the desktop sidebar), and pinned to the bottom as the last resort.
// Every branch clamps to the viewport so the card can never overflow a 360px
// phone screen.
export function cardPlacement({ rect, viewport, preferred = 'auto', cardWidth = 340, margin = 12, estimate = 230 }) {
  const vw = viewport.width
  const vh = viewport.height
  const width = Math.min(cardWidth, vw - margin * 2)
  const anchorBottom = rect.top + rect.height
  const below = vh - anchorBottom - margin * 2
  const above = rect.top - margin * 2
  const left = Math.min(Math.max(rect.left, margin), Math.max(vw - width - margin, margin))
  const fitsBelow = below >= estimate
  const fitsAbove = above >= estimate
  if (fitsBelow && (preferred !== 'above' || !fitsAbove)) {
    const top = anchorBottom + margin
    return { width, left, top, maxHeight: vh - top - margin }
  }
  if (fitsAbove) {
    const bottom = vh - rect.top + margin
    return { width, left, bottom, maxHeight: vh - bottom - margin }
  }
  // The anchor fills the column (e.g. the full-height sidebar): sit beside it
  // when there's room…
  const sideSpace = vw - (rect.left + rect.width)
  if (sideSpace >= width + margin * 2) {
    return {
      width,
      left: rect.left + rect.width + margin,
      top: Math.max(margin, Math.round(vh / 2 - estimate / 2)),
      maxHeight: vh - margin * 2,
    }
  }
  // …otherwise pin to the bottom centre, over the dimmed ground.
  return { width, left: Math.max(margin, Math.round((vw - width) / 2)), bottom: margin, maxHeight: vh - margin * 2 }
}

// ── Thin IO over the prefs store ─────────────────────────────────────────────
// Everything above is pure; these four are the only lines that touch storage,
// and they degrade like every offline.js helper (no IndexedDB → tour simply
// shows again next visit, which is harmless).

export function loadTourSeen() {
  return prefsGet(TOUR_SEEN_KEY).then(normalizeSeen)
}

// Resolves to the screen's steps when its tour should start now, else null.
export function maybeStartTour({ screen, profileCreatedAt, now, suppressed } = {}) {
  return loadTourSeen().then(seen => (
    shouldRunTour({ screen, seen, profileCreatedAt, now, suppressed }) ? TOURS[screen] : null
  ))
}

export function markTourSeen(screen, outcome) {
  return prefsMerge(TOUR_SEEN_KEY, seenPatch(screen, outcome))
}

export function resetTourSeen() {
  return prefsMerge(TOUR_SEEN_KEY, replayPatch())
}
