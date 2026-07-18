// A calm, honest look at what's coming: bucket scheduled reviews into per-day
// counts for the next N days. Pure and side-effect-free so it's easy to test.
//
// Only 'review'-state cards carry a meaningful future due date. Cards still in
// 'learning'/'relearning' churn intraday (their next step can be minutes away
// and depends on how you grade them), so they can't be honestly forecast and
// are excluded — which is exactly why the UI says "~N", an approximation, and
// never a promise.

// Returns an array of `days` integers. Index 0 = today (includes anything
// overdue, since those are due now), index 1 = tomorrow, … index days-1 = the
// last day of the window. Day boundaries are LOCAL midnight, matching how the
// rest of the app treats a review as due for the whole calendar day.
export function reviewForecast(cards, now = new Date(), days = 7) {
  const n = Math.max(0, days | 0)
  const buckets = new Array(n).fill(0)
  if (n === 0) return buckets

  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const startMs = start.getTime()

  for (const c of cards || []) {
    if (!c || c.state !== 'review' || !c.due_at) continue
    const due = new Date(c.due_at)
    if (Number.isNaN(due.getTime())) continue
    const dueDay = new Date(due)
    dueDay.setHours(0, 0, 0, 0)
    // Rounding absorbs 23h/25h DST days: both ends are at local midnight.
    let idx = Math.round((dueDay.getTime() - startMs) / 86400000)
    if (idx < 0) idx = 0          // overdue reviews are due today
    if (idx >= n) continue        // beyond the window — not shown
    buckets[idx] += 1
  }
  return buckets
}

// Small summary used by the widget: total across the window, the busiest single
// day, and a flat "~N a day" average (rounded, min 1 when there's anything).
export function forecastSummary(buckets) {
  const arr = buckets || []
  const total = arr.reduce((a, b) => a + b, 0)
  const peak = arr.reduce((m, b) => Math.max(m, b), 0)
  const perDay = total > 0 ? Math.max(1, Math.round(total / arr.length)) : 0
  return { total, peak, perDay }
}
