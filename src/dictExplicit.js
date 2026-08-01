// Explicit-content handling for the reference dictionary. CC-CEDICT marks
// vulgar/offensive senses inline — "(vulgar)", "(coarse)", "(offensive)" — so
// entries carrying those markers can be detected without any extra data. The
// Dictionary screen hides them by default behind a deliberate reveal; they stay
// searchable, they just never surprise a learner (or a classroom screen) who
// searched an innocent word. Pure module, no React, no Supabase.

const MARKERS = ['(vulgar)', '(coarse)', '(offensive)']

// True when any definition of the entry carries an explicit-content marker.
export function isExplicitEntry(entry) {
  const defs = Array.isArray(entry && entry.definitions) ? entry.definitions : []
  for (const d of defs) {
    const s = String(d).toLowerCase()
    for (const m of MARKERS) {
      if (s.indexOf(m) !== -1) return true
    }
  }
  return false
}

// Partition rows into { shown, hidden }, preserving order within each group.
export function splitExplicit(rows) {
  const shown = []
  const hidden = []
  for (const r of rows || []) {
    if (isExplicitEntry(r)) hidden.push(r)
    else shown.push(r)
  }
  return { shown, hidden }
}

// The reveal-control label, pluralized properly ("1 explicit result hidden" /
// "3 explicit results hidden").
export function hiddenLabel(count) {
  if (!(count > 0)) return ''
  return count === 1 ? '1 explicit result hidden' : count + ' explicit results hidden'
}
