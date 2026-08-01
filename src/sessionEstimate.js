// An honest, queue-derived session-length estimate for Home — computed from
// the ACTUAL queue composition, never a fixed marketing number. Pure module.
//
// Per-card costs are rough empirical averages, deliberately conservative:
//   - a due review is one quick recall (~10s)
//   - a learning/relearning card is mid-drill and may repeat once (~15s)
//   - a new word costs the most (~40s: first exposure plus its learning steps
//     re-entering the same session)
// The UI presents the result as "~N min" — an estimate, never a promise.

export const SECONDS_PER = { new: 40, learning: 15, due: 10 }

export function sessionEstimateMinutes({ newCount = 0, learnCount = 0, dueCount = 0 } = {}) {
  const total =
    (newCount > 0 ? newCount : 0) * SECONDS_PER.new +
    (learnCount > 0 ? learnCount : 0) * SECONDS_PER.learning +
    (dueCount > 0 ? dueCount : 0) * SECONDS_PER.due
  if (total <= 0) return 0
  return Math.max(1, Math.round(total / 60))
}

// "~N min", or '' for an empty queue (the UI hides it then).
export function sessionEstimateLabel(counts) {
  const m = sessionEstimateMinutes(counts)
  return m > 0 ? '~' + m + ' min' : ''
}
