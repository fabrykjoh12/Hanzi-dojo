// Coverage planner — the "which vocabulary needs reinforcement" half of
// targeted story generation (FAB-9). Deliberately separate from manifest
// composition (storyManifestPlanner.mjs): this module decides WHO gets
// reinforced and tracks projected exposure as a batch progresses; the manifest
// planner decides how chosen targets are grouped into individual stories.
//
// Input is the FAB-5 coverage report's per-word rows (buildCoverageReport in
// storyCoverage.mjs → report.words): each row carries word, level,
// availableByLevel.stories and a classification (zero/single/weak/well). The
// rows arrive in frequency order (the audit fetches vocabulary ordered by
// sort_order), and this module preserves that order inside each priority band —
// most useful words first, per the product's frequency-first principle.
//
// Exposure model: a story at level N credits availableByLevel exposure to every
// word of level >= N it contains (story.level <= word.level). A level-N
// manifest therefore targets words whose level EQUALS N — words below N gain
// nothing from a level-N story, and words above N are incidental.
//
// Pure and immutable: every operation returns a new plan. No I/O, no clock.

export const EXPOSURE_GOAL_DEFAULT = 2       // availableByLevel unique stories per word
export const PER_WORD_BATCH_CAP_DEFAULT = 2  // max manifests one word may be scheduled into per batch

// Priority bands, most starved first. `weak` (2-4 stories) is included so a
// goal above 4 can keep planning past the zeros; with the default goal of 2
// weak words are already satisfied and simply drop out via `current >= goal`.
const BAND_ORDER = { zero: 0, single: 1, weak: 2 }

export function buildCoveragePlan({ words, level, goal = EXPOSURE_GOAL_DEFAULT, batchCap = PER_WORD_BATCH_CAP_DEFAULT } = {}) {
  const targets = []
  ;(words || []).forEach((w, index) => {
    if (!w || w.level !== level) return
    const band = BAND_ORDER[w.classification]
    if (band == null) return                              // 'well' needs nothing
    const current = (w.availableByLevel && w.availableByLevel.stories) || 0
    if (current >= goal) return
    targets.push({
      word: w.word,
      frequencyRank: index,                               // input order = frequency order
      band,
      current,
      planned: current,                                   // projected exposure incl. accepted candidates
      batchUses: 0,                                       // manifests this word was scheduled into this batch
    })
  })
  targets.sort((a, b) => (a.band - b.band) || (a.frequencyRank - b.frequencyRank))
  return { level, goal, batchCap, targets }
}

// Words still worth scheduling: below goal and under the per-batch cap.
// Round-robin ordering: fewest schedulings first (everyone gets into ONE
// manifest before anyone gets a second — a word does need `goal` different
// stories eventually, but not before the rest of the band has had its first),
// then priority band, then frequency.
export function pendingTargets(plan) {
  return plan.targets
    .filter(t => t.planned < plan.goal && t.batchUses < plan.batchCap)
    .sort((a, b) => (a.batchUses - b.batchUses) || (a.band - b.band) || (a.frequencyRank - b.frequencyRank))
}

// Take the next `count` targets in priority order and mark them scheduled.
// Returns { plan, selected } — selection itself consumes a batch use, so a
// word chosen for a manifest that later FAILS does not get rescheduled forever
// (the cap bounds retries at the planning level; the pipeline's own repair
// loop bounds them at the candidate level). `exclude` skips words already
// placed in the manifest under composition.
export function selectTargets(plan, count, exclude = null) {
  const chosen = pendingTargets(plan)
    .filter(t => !exclude || !exclude.has(t.word))
    .slice(0, count)
  const chosenWords = new Set(chosen.map(t => t.word))
  const next = {
    ...plan,
    targets: plan.targets.map(t => chosenWords.has(t.word) ? { ...t, batchUses: t.batchUses + 1 } : t),
  }
  return { plan: next, selected: chosen.map(t => t.word) }
}

// An accepted candidate updates projected exposure so the batch stops
// targeting words whose goal is already met. Every plan-level word that
// actually appears in the accepted story with at least `minOccurrences`
// occurrences counts — scheduled targets and incidental ones alike, because
// availableByLevel exposure does not care why the word is there.
// `counts` is the canonical word → occurrences map from the validator.
export function recordAcceptedCandidate(plan, { counts, minOccurrences = 1 } = {}) {
  if (!counts) return plan
  const get = typeof counts.get === 'function' ? (w) => counts.get(w) : (w) => counts[w]
  return {
    ...plan,
    targets: plan.targets.map(t => {
      const n = get(t.word) || 0
      return n >= minOccurrences ? { ...t, planned: t.planned + 1 } : t
    }),
  }
}

export function planSummary(plan) {
  let satisfied = 0, pending = 0, capped = 0
  for (const t of plan.targets) {
    if (t.planned >= plan.goal) satisfied += 1
    else if (t.batchUses >= plan.batchCap) capped += 1
    else pending += 1
  }
  return { level: plan.level, totalTargets: plan.targets.length, satisfied, pending, cappedThisBatch: capped }
}
