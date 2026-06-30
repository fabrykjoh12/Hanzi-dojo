// A single, honest "fluency score" built from real vocabulary command across
// ALL levels — not time spent. Mastered words (FSRS stability ≥ 21 days, i.e.
// durable recall) count most; words learned but not yet mastered count partially.
// The number only climbs as you genuinely know more words.

export function fluencyScore({ lifetimeLearned = 0, lifetimeMastered = 0 }) {
  const partial = Math.max(0, lifetimeLearned - lifetimeMastered)
  return lifetimeMastered * 5 + partial * 2
}

const RANKS = [
  { min: 0,    name: 'Getting started' },
  { min: 1,    name: 'Beginner' },
  { min: 150,  name: 'Elementary' },
  { min: 400,  name: 'Intermediate' },
  { min: 800,  name: 'Advanced' },
  { min: 1500, name: 'Fluent' },
]

// fluencyRank(score) → { name, current, next, pct }
//   name : current rank label
//   next : next rank object (or null at the top)
//   pct  : 0–100 progress from the current rank toward the next
export function fluencyRank(score) {
  let current = RANKS[0]
  let next = null
  for (let i = 0; i < RANKS.length; i += 1) {
    if (score >= RANKS[i].min) { current = RANKS[i]; next = RANKS[i + 1] || null }
  }
  let pct = 100
  if (next) {
    const span = next.min - current.min
    pct = span > 0 ? Math.round(((score - current.min) / span) * 100) : 0
  }
  return { name: current.name, current, next, pct }
}
