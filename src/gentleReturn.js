// "Gentle return" — coming back after a break should feel like a warm welcome,
// not a punishment. When someone has been away for a few days, their overdue
// reviews pile up; showing the whole backlog at once is the "300-card wall" that
// makes people bounce. Instead we cap the review queue to a right-sized handful
// and let the rest resurface over the next sessions.
//
// This is safe: FSRS schedules each card from the ACTUAL elapsed time when it's
// reviewed, and a deferred card stays due (its due_at is unchanged), so it simply
// reappears next time. Nothing is lost by reviewing part of the backlog today.
//
// Pure and side-effect-free (mirrors firstRun.js); the date signal and the queue
// wiring live in the callers.

import { daysBetween, todayStr } from './streak'

// Away this many days (or more) counts as "returning from a break". One or two
// days off is normal rhythm, not a break — don't nag or cap for that.
export const RETURN_BREAK_DAYS = 3

// A calm ceiling on how many overdue reviews to surface in one welcome-back
// session. Big enough to make real progress, small enough to never feel like a
// wall.
export const GENTLE_REVIEW_CAP = 20

// Has the learner been away long enough that we should ease them back in?
// Needs a prior study day on record; a brand-new user is not "returning".
export function isReturningFromBreak(profile, { threshold = RETURN_BREAK_DAYS, today = todayStr() } = {}) {
  if (!profile || !profile.last_studied_on) return false
  return daysBetween(profile.last_studied_on, today) >= threshold
}

// How many overdue reviews to actually queue this session. Only capped when the
// user is returning from a break AND the backlog exceeds the cap; otherwise the
// full due set is returned unchanged (never more than what's due, never < 0).
export function gentleReviewTarget({ returning, dueReviewCount, cap = GENTLE_REVIEW_CAP }) {
  const total = Math.max(0, dueReviewCount || 0)
  if (!returning) return total
  return Math.min(total, Math.max(0, cap))
}

// Copy for the welcome-back banner. `nReady` is the capped count actually queued.
export function gentleReturnMessage(nReady) {
  const n = Math.max(0, nReady || 0)
  if (n === 0) return 'Welcome back — you’re all caught up.'
  return `Welcome back — ${n} word${n === 1 ? '' : 's'} ready. We’ll ease the rest back in over the next days.`
}
