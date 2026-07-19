// Month-in-review — a calm recap of the current month's study, derived purely
// from the `daily_activity` map the Profile screen already loads. No new data,
// no schema: just a friendlier read of what's there. The Profile panel used to
// compute active-days / reviews inline; this module makes that logic pure and
// unit-tested, and adds a "best day" highlight and an active-of-elapsed-days
// framing (calm context, never a streak to protect).

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function pad2(n) { return String(n).padStart(2, '0') }

// activity: { 'YYYY-MM-DD': studiedCards }. Returns a recap of the month that
// `now` falls in. Counts are exact where present; a day with 0 cards is treated
// as not studied (matches how the map is built on the Profile screen).
export function monthReview(activity, now = new Date()) {
  const y = now.getFullYear()
  const m = now.getMonth()               // 0-based
  const ym = y + '-' + pad2(m + 1)
  const monthName = MONTH_NAMES[m]

  const map = activity && typeof activity === 'object' ? activity : {}
  const days = Object.keys(map).filter(d => d.indexOf(ym + '-') === 0 && (map[d] || 0) > 0)

  const activeDays = days.length
  const reviews = days.reduce((sum, d) => sum + (map[d] || 0), 0)

  let bestDay = null
  for (const d of days) {
    const count = map[d] || 0
    if (!bestDay || count > bestDay.count) bestDay = { date: d, count }
  }

  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const dayOfMonth = now.getDate()
  const avgPerActiveDay = activeDays ? Math.round(reviews / activeDays) : 0

  return { ym, monthName, activeDays, reviews, bestDay, daysInMonth, dayOfMonth, avgPerActiveDay }
}

// A warm, non-pressuring headline for the panel. Reflects effort without ever
// implying a broken chain — a quiet month is just a quiet month.
export function monthHeadline(r) {
  if (!r || r.activeDays === 0) {
    return `A fresh start to ${r ? r.monthName : 'the month'} — your next review begins the story.`
  }
  const dayWord = r.activeDays === 1 ? 'day' : 'days'
  return `You've shown up ${r.activeDays} of ${r.dayOfMonth} ${dayWord} so far this ${r.monthName}.`
}

// The shareable one-liner (BRAND_URL passed in so this stays pure/testable).
export function monthShareText(r, { languageName, mastered = 0, brandUrl = '' } = {}) {
  const lang = languageName || 'a new language'
  const dayWord = r.activeDays === 1 ? 'day' : 'days'
  const base = `My ${r.monthName} on Hanzi Dojo: ${r.activeDays} active ${dayWord}, `
    + `${r.reviews} reviews, ${mastered} words mastered learning ${lang}.`
  return brandUrl ? base + ' ' + brandUrl : base
}
