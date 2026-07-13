// First-run session logic — the gentle "learn your first words → unlock your
// first story" onboarding experience. Pure and testable; the network count and
// navigation live in Study.jsx / App.jsx.
//
// A session is a first run only for a brand-new learner: no cards anywhere on
// the account yet, on a normal review session. This is derived from data (the
// account-wide card count), so it survives reloads and — crucially — excludes
// users switching to a new language track, who already have cards elsewhere and
// keep their normal daily goal. Weak / other modes are never a first run.

// The gentle first-session new-card target: enough to feel real and unlock a
// first story, small enough not to overwhelm a brand-new user.
export const FIRST_RUN_NEW_CARDS = 5

export function isFirstRunSession({ mode = 'review', accountCardCount } = {}) {
  if (mode !== 'review') return false
  return accountCardCount === 0
}

// New-card target for a session: capped small on the first run, otherwise the
// user's normal remaining daily goal. Never exceeds what's actually remaining,
// and never negative.
export function firstRunNewTarget(firstRun, remainingNew) {
  const remaining = Math.max(0, remainingNew || 0)
  return firstRun ? Math.min(remaining, FIRST_RUN_NEW_CARDS) : remaining
}
