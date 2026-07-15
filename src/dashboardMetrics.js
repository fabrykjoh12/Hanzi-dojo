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

export function median(nums) {
  if (!nums || nums.length === 0) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
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

export function storyCompletionRate(rows) {
  let opened = 0, completed = 0
  for (const r of rows || []) {
    opened += Number(r.opened) || 0
    completed += Number(r.completed) || 0
  }
  return pct(completed, opened)
}
