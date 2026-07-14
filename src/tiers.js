// Proficiency tiers for onboarding — pure and testable.
//
// Instead of asking a brand-new user to pick a numbered level (HSK 4? N3?),
// onboarding offers three human tiers — Beginner, Intermediate, Professional —
// and maps each to a real starting level. Choosing a higher tier means claiming
// you already know the earlier levels, so those tiers require passing a short
// placement test to prove it before you skip ahead.
//
// The tiers are derived from the levels that actually have seeded vocabulary, so
// there's never a tier that drops you into an empty deck:
//   - Beginner    → the lowest available level. No test — you're starting fresh.
//   - Professional → the highest available level. Placement test required.
//   - Intermediate → an available level in between, when one exists. Test required.
//
// With only two levels available you get Beginner + Professional; with one, just
// Beginner; as more levels are seeded, the middle tier fills in automatically.

export const TIER_META = {
  beginner: {
    key: 'beginner',
    label: 'Beginner',
    blurb: 'New to the language — start from the very first words.',
  },
  intermediate: {
    key: 'intermediate',
    label: 'Intermediate',
    blurb: 'You know the basics already — prove it and skip ahead.',
  },
  professional: {
    key: 'professional',
    label: 'Professional',
    blurb: 'You’re well advanced — test out of the earlier levels.',
  },
}

// resolveTiers(availableLevels) → [{ key, level, test }] in Beginner→Professional
// order. `availableLevels` is the list of level numbers with seeded content.
export function resolveTiers(availableLevels) {
  const levels = [...(availableLevels || [])]
    .filter(l => l != null)
    .sort((a, b) => a - b)
  if (levels.length === 0) return []

  const lowest = levels[0]
  const highest = levels[levels.length - 1]

  const tiers = [{ key: 'beginner', level: lowest, test: false }]

  if (highest > lowest) {
    const mids = levels.filter(l => l > lowest && l < highest)
    if (mids.length) {
      // The middle-most seeded level (lower of the two when it's even).
      const mid = mids[Math.floor((mids.length - 1) / 2)]
      tiers.push({ key: 'intermediate', level: mid, test: true })
    }
    tiers.push({ key: 'professional', level: highest, test: true })
  }

  return tiers
}

// How the placement test is scored. Short enough to be quick, strict enough to
// mean something: you must show real command of the level to skip to it.
export const PLACEMENT_QUESTION_COUNT = 12
export const PLACEMENT_PASS_RATIO = 0.75   // e.g. 9 of 12 correct
