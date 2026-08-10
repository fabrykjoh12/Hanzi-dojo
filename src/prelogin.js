// State a visitor carries from before they have an account to after they have
// one. Two things, now — and it used to be nine.
//
// The nine were the pre-signup wizard's answers: experience, purposes, style,
// minutes per day, a start level, a placement flag, the words they had tasted,
// which step they were on. Four of them were never read by anything, which is
// how a learner ended up being asked their level twice and their daily
// commitment twice in two different units. The wizard is gone (see Tutorial.jsx
// and the onboarding audit); so are its keys.
//
// What survives:
//
//   language, level   written by the public reading test
//                     (HowMuchCanYouRead.jsx) and read by Onboarding as a
//                     starting-level prefill. A genuinely separate web feature
//                     with a live producer and a live consumer.
//   tutorial          where the signed-out tutorial had got to, and whether it
//                     finished. See tutorialScript.serializeTutorial.
//
// Storage degrades quietly, as everywhere else: a blocked localStorage costs a
// prefill and a resume, never the app.

// Which screen a signed-out visitor lands on.
//
// The web gets the marketing page: someone arriving at hanzi-dojo.com has not
// decided anything yet and needs to be told what this is. Someone who has
// already installed the app from a store has read that pitch — the store
// listing *is* the landing page — so repeating it wastes their first screen
// and makes the app feel like a bookmarked website. They get a proper app
// welcome instead, straight into the two things they might want: start, or
// sign in.
export function initialLandingMode(native) {
  return native ? 'welcome' : 'landing'
}

// Where a signed-out visitor's session actually starts, which is not always the
// same thing.
//
// Someone who finished the tutorial and then closed the app before creating an
// account gets the account form, not the introduction: they have already spent
// ninety seconds on it, and being shown the welcome again would read as the app
// having forgotten. The tutorial marks itself done at the moment it hands over,
// rather than at signup, precisely so this can be true when signup is what
// failed.
//
// Note there is no 'tutorial' entry here: a fresh visitor still lands on the
// welcome (or the marketing page) and chooses to start. This decides where a
// RETURNING signed-out visitor resumes, not whether the tutorial exists.
export function landingEntry({ native, tutorialDone, authNotice } = {}) {
  if (authNotice) return 'auth'
  if (tutorialDone) return 'auth'
  return initialLandingMode(native)
}

// The three states the stored tutorial progress can be in. Derived, not a
// fourth thing to keep in sync:
//
//   'not-started'  nothing stored
//   'in-progress'  a position, no completion
//   'complete'     finished; from here on the account is what is missing
export function tutorialStage() {
  const t = readTutorialProgress()
  if (!t) return 'not-started'
  if (t.done === true) return 'complete'
  return t.state ? 'in-progress' : 'not-started'
}

const KEY = 'prelogin:prefs'

export function savePreloginPrefs(prefs) {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)) } catch { /* ignore */ }
}
export function readPreloginPrefs() {
  try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null } catch { return null }
}
export function clearPreloginPrefs() {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}

// Merge, never replace — the reading test's level and the tutorial's position
// are written by different screens at different times and must not overwrite
// each other.
export function mergePreloginPrefs(patch) {
  savePreloginPrefs({ ...(readPreloginPrefs() || {}), ...patch })
}

// ── The tutorial's position ──────────────────────────────────────────────────
// `{ state, done }`. `state` is what tutorialScript.serializeTutorial produced;
// `done` is set once, when the learner asks for an account, and is what stops a
// finished tutorial replaying on the next launch.

export function readTutorialProgress() {
  const saved = readPreloginPrefs()
  const t = saved && saved.tutorial
  return t && typeof t === 'object' ? t : null
}

export function saveTutorialPosition(state) {
  const prior = readTutorialProgress() || {}
  mergePreloginPrefs({ tutorial: { ...prior, state } })
}

export function markTutorialDone() {
  const prior = readTutorialProgress() || {}
  mergePreloginPrefs({ tutorial: { ...prior, done: true } })
}

export function isTutorialDone() {
  const t = readTutorialProgress()
  return Boolean(t && t.done)
}
