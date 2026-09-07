// "We couldn't add your earlier words" — the one-shot notice, and where it lives.
//
// Choosing a level above 1 at onboarding IS a prior-knowledge claim, and the
// seed that writes it is best-effort: it must never block onboarding. Best
// effort is not the same as silent, and it was — the learner started at their
// level with none of the earlier words claimed, was never told, and had no way
// to know a retry exists. One does: "Words you already know" claims exactly the
// same set by hand.
//
// TWO THINGS MADE THIS HARDER THAN IT LOOKS, and both are why this module
// exists instead of a toast() call in the catch:
//
//   1. <Toasts /> is mounted inside the app shell, which App returns only once
//      profile and track have loaded. During onboarding that shell does not
//      exist, and Toasts keeps no queue — a toast fired there is dispatched
//      into nothing. Mounting a second one in the onboarding branch does not
//      help either: it unmounts a moment later when the tree swaps.
//   2. Passing the failure back through onComplete reaches the shell, but only
//      for that one render. A reload, a backgrounded WKWebView, or closing the
//      app on the welcome screen loses it — and the network flakiness that
//      makes the seed fail is the same flakiness that makes a mobile session
//      unstable, so the correlated case is the likely one, not the rare one.
//
// So the flag is written to device prefs and read once a toast stack is
// actually listening. "The shell is up" is NOT the same test and the first
// version of this module used it: profile and track are both loaded on the
// trust pages, the public reading assessment, a public story link and the
// password-recovery screen, and every one of those returns from App before
// <Toasts /> is mounted. A cold load onto /support would have read the flag,
// cleared it, dispatched into nothing and lost the notice for good — the exact
// outcome this module exists to prevent. toastsAreListening() (src/toast.js) is
// maintained by <Toasts />'s own listener effect, so it reports the thing that
// matters rather than a proxy for it.
//
// The flag is also CLEARED AFTER the toast is dispatched, not before. Reading
// and clearing in one step is tidier and loses the notice if the dispatch then
// goes nowhere.
//
// Storage is guarded (offline.js resolves rather than throwing), so a browser
// with no IndexedDB loses the notice — which is the same outcome as before this
// existed, and never blocks onboarding either way.

import { prefsGet, prefsSet } from './offline'

export const PRIOR_SEED_NOTICE_KEY = 'priorSeedFailed'

// Should the notice be shown right now?
//
// Pure, because it is a decision and CLAUDE.md §1 keeps decisions out of bare
// JSX conditionals. Two inputs, and the second is the one that was wrong:
// `listening` is whether a <Toasts /> stack would receive the event, which the
// caller reads from toastsAreListening(). It deliberately does NOT take
// `profile`, `track` or `justOnboarded` any more — those approximate "is the
// shell rendered", and the approximation is false on four signed-in routes.
export function shouldAnnouncePriorSeedFailure({ flagged, listening } = {}) {
  return Boolean(flagged) && Boolean(listening)
}

export function priorSeedNoticeToast() {
  return {
    kind: 'warn',
    title: 'We couldn’t add your earlier words',
    body: 'Add them any time from Practice → “Words you already know”.',
  }
}

// Best-effort both ways: a failure to record the failure must not become a
// second failure.
export async function recordPriorSeedFailure() {
  try { await prefsSet(PRIOR_SEED_NOTICE_KEY, true) } catch { /* no storage; notice lost */ }
}

// Read without consuming. Split from the clear on purpose: a single take()
// clears the flag whether or not the notice then reaches anybody, so any caller
// that peeks at the wrong moment destroys the notice silently. Peek, announce,
// then clear.
export async function peekPriorSeedFailure() {
  try {
    return Boolean(await prefsGet(PRIOR_SEED_NOTICE_KEY))
  } catch {
    return false
  }
}

export async function clearPriorSeedFailure() {
  try { await prefsSet(PRIOR_SEED_NOTICE_KEY, false) } catch { /* it will be re-announced */ }
}
