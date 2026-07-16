// Pure transforms from admin RPC row shapes into chart-ready data. No Supabase,
// no DOM — unit-tested. Keeps Dashboard.jsx to rendering.

// Integer percent; 0 when the denominator is not positive.
export function pct(numerator, denominator) {
  if (!(denominator > 0)) return 0
  return Math.round((numerator / denominator) * 100)
}

// Add conversion vs. the top stage and vs. the previous stage.
// stages: [{ stage, count }] ordered top -> bottom.
export function withConversion(stages) {
  const top = stages.length ? stages[0].count : 0
  return stages.map((s, i) => {
    const prev = i === 0 ? top : stages[i - 1].count
    return {
      stage: s.stage,
      count: s.count,
      pctOfTop: i === 0 ? (top > 0 ? 100 : 0) : pct(s.count, top),
      pctOfPrev: i === 0 ? (top > 0 ? 100 : 0) : pct(s.count, prev),
    }
  })
}

// Continuous daily series with 0-filled gaps, [fromISO, toISO). Days are
// 'YYYY-MM-DD' strings; iteration is UTC-safe by stepping calendar dates.
export function fillDailySeries(rows, fromISO, toISO) {
  const byDay = new Map((rows || []).map(r => [r.day, Number(r.dau) || 0]))
  const out = []
  const cursor = new Date(fromISO + 'T00:00:00Z')
  const end = new Date(toISO + 'T00:00:00Z')
  while (cursor < end) {
    const key = cursor.toISOString().slice(0, 10)
    out.push({ day: key, dau: byDay.get(key) || 0 })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return out
}

// Story open/complete rows, optionally scoped to one language. Passing a null /
// falsy language keeps every row (the "All languages" view).
export function filterStoryRows(rows, language) {
  if (!language) return rows || []
  return (rows || []).filter(r => r.language === language)
}

export function storyCompletionRate(rows) {
  let opened = 0, completed = 0
  for (const r of rows || []) {
    opened += Number(r.opened) || 0
    completed += Number(r.completed) || 0
  }
  return pct(completed, opened)
}

// Per-language story rows with a completion percentage, sorted by volume, so the
// dashboard can show a real breakdown instead of a bare "completed/opened" line.
export function storyLanguageBreakdown(rows) {
  return (rows || [])
    .map(r => {
      const opened = Number(r.opened) || 0
      const completed = Number(r.completed) || 0
      return { language: r.language, opened, completed, rate: pct(completed, opened) }
    })
    .sort((a, b) => b.opened - a.opened)
}

// Retention rows (one per signup-day cohort) → display cells for D1 / D7 / D30.
// A cohort's dN only becomes meaningful once N days have actually elapsed since
// the cohort day; before that the cell is `matured: false` (rendered as "—") so a
// too-recent cohort never reads as 0% retention. `todayISO` is 'YYYY-MM-DD'.
export function retentionSummary(rows, todayISO) {
  const today = new Date(todayISO + 'T00:00:00Z')
  return (rows || []).map(r => {
    const size = Number(r.cohort_size) || 0
    const cohortDay = new Date(r.cohort_day + 'T00:00:00Z')
    const daysElapsed = Math.floor((today - cohortDay) / 86400000)
    const cell = (n, count) =>
      daysElapsed < n
        ? { matured: false, pct: null, count: null }
        : { matured: true, pct: pct(Number(count) || 0, size), count: Number(count) || 0 }
    return {
      day: r.cohort_day,
      size,
      d1: cell(1, r.d1),
      d7: cell(7, r.d7),
      d30: cell(30, r.d30),
    }
  })
}

// Blended retention across every cohort that has matured for each bucket, so the
// dashboard can show one headline D1/D7/D30 number. Immature cohorts are excluded
// from a bucket's denominator (not counted as churned). Returns null per bucket
// when no cohort has matured that far yet.
export function retentionAverages(rows, todayISO) {
  const summary = retentionSummary(rows, todayISO)
  const bucket = (key) => {
    let size = 0, retained = 0, any = false
    for (const r of summary) {
      if (!r[key].matured) continue
      any = true
      size += r.size
      retained += r[key].count
    }
    return any ? pct(retained, size) : null
  }
  return { d1: bucket('d1'), d7: bucket('d7'), d30: bucket('d30') }
}
