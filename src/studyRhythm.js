// "Study rhythm, not a chain" — a calm, guilt-free look at the last N days:
// which days you studied, shown as a row of dots. Unlike a streak, nothing here
// can be protected or lost; it's just an honest reflection of your recent
// rhythm, so a missed day is information, never a punishment.
//
// Pure and side-effect-free (an injectable `now`) so it's easy to test.

// Local YYYY-MM-DD for a Date — matches how daily_activity.activity_date reads
// back from Postgres, so set membership lines up without timezone surprises.
export function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Given the set of local dates you studied (YYYY-MM-DD strings), return the last
// `days` days ending today — oldest first — each flagged whether you studied.
export function studyRhythm(studiedDates, now = new Date(), days = 7) {
  const set = studiedDates instanceof Set ? studiedDates : new Set(studiedDates || [])
  const n = Math.max(0, days | 0)
  const out = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = dateKey(d)
    out.push({ date: key, studied: set.has(key), isToday: i === 0 })
  }
  return out
}

// How many of the window's days had study — the headline number ("N of 7").
export function rhythmSummary(rhythm) {
  const arr = rhythm || []
  return { studiedDays: arr.filter(x => x.studied).length, days: arr.length }
}

// Single-letter weekday for a YYYY-MM-DD key, for labelling the rhythm strip.
//
// Anchored at NOON deliberately. `new Date('2026-07-25')` is parsed as UTC
// midnight, which renders as the previous day for anyone west of UTC — the
// strip would be labelled a day off for every learner in the Americas. Noon
// local is far from either boundary. (Profile.jsx uses the same trick.)
export function weekdayInitial(dateKey) {
  const d = new Date(String(dateKey) + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return ''
  return ['S', 'M', 'T', 'W', 'T', 'F', 'S'][d.getDay()]
}
