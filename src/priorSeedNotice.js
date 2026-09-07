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
// So the flag is written to device prefs and read once the shell is up. Storage
// is guarded (offline.js resolves rather than throwing), so a browser with no
// IndexedDB loses the notice — which is the same outcome as before this
// existed, and never blocks onboarding either way.

import { prefsGet, prefsSet } from './offline'

export const PRIOR_SEED_NOTICE_KEY = 'priorSeedFailed'

// Should the notice be shown right now?
//
// Pure, because it is a decision and CLAUDE.md §1 keeps decisions out of bare
// JSX conditionals. `justOnboarded` is the welcome screen, which renders before
// the shell — announcing there would put the toast where nothing draws it.
export function shouldAnnouncePriorSeedFailure({ flagged, justOnboarded, profile, track } = {}) {
  return Boolean(flagged) && !justOnboarded && Boolean(profile) && Boolean(track)
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

export async function takePriorSeedFailure() {
  try {
    const flagged = await prefsGet(PRIOR_SEED_NOTICE_KEY)
    if (flagged) await prefsSet(PRIOR_SEED_NOTICE_KEY, false)
    return Boolean(flagged)
  } catch {
    return false
  }
}
