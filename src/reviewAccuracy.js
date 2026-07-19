// Screen-reader summary for the Profile "Review accuracy" panel's 30-day bar
// chart. The bars carry per-bar title tooltips (a date + count) but no overall
// text alternative; this turns the shape into a sentence. Pure + unit-tested.
export function last30A11yLabel(counts) {
  const arr = Array.isArray(counts) ? counts : []
  const total = arr.reduce((a, b) => a + (b || 0), 0)
  const peak = arr.reduce((m, b) => Math.max(m, b || 0), 0)
  const active = arr.filter(c => (c || 0) > 0).length
  if (total === 0) return 'No reviews in the last 30 days.'
  return `Reviews over the last 30 days: ${total} total, busiest day ${peak}, ${active} active days.`
}
