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
//   tutorial          where the signed-out tutorial had got to. See
//                     tutorialScript.serializeTutorial.
//
// Whether the tutorial FINISHED is deliberately not in here — it is a durable
// device-scoped teaching record under its own key (see isTutorialDone below),
// because everything in prelogin:prefs is cleared once setup completes and the
// teaching record has to outlive that.
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
  if (isTutorialDone()) return 'complete'
  const t = readTutorialProgress()
  return t && t.state ? 'in-progress' : 'not-started'
}

// ── Which tab the account screen opens on ────────────────────────────────────
// The decision, pure, because it was previously inferred from the presence of a
// prop the deleted pre-signup wizard used to pass — which meant "Create
// account" opened the LOG IN form for every learner (P12 audit §3.1).
//
//   notice        an auth link that could not be completed. They came to fix a
//                 password, so the login side — Auth opens its reset form.
//   fromTutorial  the tutorial's hand-off. Its last button says "Create
//                 account", and the form it opens has to be the one that does.
//
// Default is login: an unexplained arrival at the auth screen is far more
// often a returning learner than a new one.
export function authEntryTab({ fromTutorial = false, notice = null } = {}) {
  if (notice) return 'login'
  return fromTutorial ? 'signup' : 'login'
}

// ── What Android's hardware Back does before login ───────────────────────────
// The whole pre-login flow lives at `/`, so the bridge's path-based fallback
// sees one root screen and exits the app from the middle of a flashcard
// (P12 audit §3.3). This is the real answer, consulted through the same
// backHandler registry the authenticated shell uses — Landing registers it
// while it is mounted, exactly as the shell lends its own answer.
//
//   'exit'      this is the genuine first screen; Back leaves the app
//   'retreat'   step the tutorial one state backwards (tutorialScript.retreat)
//   otherwise   the mode to switch to
//
// `authArrival` is how the auth screen was reached:
//   'entry'     it was the launch screen (a finished tutorial, an auth notice)
//   'tutorial'  the tutorial's hand-off — Back returns to the tutorial
//   'screen'    a tap from the welcome/landing screen — Back returns there
export function preloginBackAction({ mode, native = false, authArrival = 'screen' } = {}) {
  if (mode === 'auth') {
    if (authArrival === 'entry') return 'exit'
    if (authArrival === 'tutorial') return 'tutorial'
    return initialLandingMode(native)
  }
  if (mode === 'tutorial') return 'retreat'
  // 'welcome' and 'landing' are the genuine first screens.
  return 'exit'
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
// `{ state }` — what tutorialScript.serializeTutorial produced. Transitional by
// nature: it exists so a learner who closes the app mid-tutorial resumes, and
// once an account exists it has done its job, so it lives (and dies) with the
// rest of the prelogin handoff state.

export function readTutorialProgress() {
  const saved = readPreloginPrefs()
  const t = saved && saved.tutorial
  return t && typeof t === 'object' ? t : null
}

export function saveTutorialPosition(state) {
  const prior = readTutorialProgress() || {}
  mergePreloginPrefs({ tutorial: { ...prior, state } })
}

// ── Whether this device has already been taught ──────────────────────────────
// Its own key, deliberately NOT inside `prelogin:prefs`. The done flag used to
// live there, and `clearPreloginPrefs()` — which Onboarding rightly calls once
// the handoff has happened — erased it, so the Home tour's "the tutorial
// already taught this" suppression could never fire (P12 audit §3.2). The
// clearing was correct; the mistake was a device-scoped teaching record
// sharing a key with a transitional handoff blob. Now they have separate
// lifetimes: the blob dies at setup, the teaching record dies with the device.

const TUTORIAL_DONE_KEY = 'hd:tutorial-done'

export function markTutorialDone() {
  try { localStorage.setItem(TUTORIAL_DONE_KEY, '1') } catch { /* ignore */ }
}

export function isTutorialDone() {
  try {
    if (localStorage.getItem(TUTORIAL_DONE_KEY) === '1') return true
  } catch { return false }
  // The old shape — `tutorial.done` inside prelogin:prefs — from a learner who
  // finished the tutorial on an earlier build. Honour it, and migrate it to
  // the durable key so it survives the setup screen clearing the old one.
  const t = readTutorialProgress()
  if (t && t.done === true) {
    try { localStorage.setItem(TUTORIAL_DONE_KEY, '1') } catch { /* ignore */ }
    return true
  }
  return false
}
