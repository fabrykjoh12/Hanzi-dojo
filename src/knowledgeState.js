// What the learner knows about one word — the single source of truth.
//
// Four states, and only one of them can be claimed rather than earned:
//
//   unknown       no card row at all
//   prior_known   the learner says they knew it before Hanzi Dojo, and we have
//                 never observed it. No scheduler state whatsoever.
//   verified      observed at least once through a real graded review
//   mastered      verified AND held long enough for the scheduler to trust it
//
// Why this module exists: the app grew four different answers to "does the
// learner know this word?" — mastery.isLearned read `learned`/`state`,
// storyReading.wordStatus read `is_easy`/`state`, dictionaryFilters.cardStatus
// read `state`/`stability`, knownWordMap had its own. They agreed only because
// the old prior-knowledge seed set every one of those signals at once. Take the
// fabrication away and they diverge, so they now all route through here.
//
// The load-bearing invariant:
//
//   reps >= 1 means a human graded this word inside Hanzi Dojo.
//
// ts-fsrs increments `reps` on every repeat() and there is no path into review
// state without one, so a claim cannot fabricate it — provided nothing writes
// `reps` outside srs.schedule(). That is a repo rule now, alongside the
// existing "never write is_easy = true" and "never write ease_factor" rules.

// A word is "mastered" when FSRS stability reaches this many days.
// Stability = predicted days until recall drops to ~90%.
export const MASTERY_STABILITY_DAYS = 21

// The level test unlocks when this fraction of the level's active words are
// mastered — genuinely, which prior knowledge alone can never satisfy.
export const TEST_UNLOCK_MASTERY_PCT = 0.9

export const KNOWLEDGE = {
  UNKNOWN: 'unknown',
  PRIOR_KNOWN: 'prior_known',
  VERIFIED: 'verified',
  MASTERED: 'mastered',
}

// The provenance values a claim may carry, mirroring the DB CHECK constraint.
export const PRIOR_SOURCES = ['placement', 'assumed_prerequisite', 'paste', 'checklist', 'legacy_claim']

// ── The structural facts ────────────────────────────────────────────────────

// Has this word ever actually been graded? The one thing a claim cannot fake.
export function hasGenuineObservation(card) {
  if (!card) return false
  return (card.reps || 0) >= 1
}

// Did the learner ever claim this word as already-known?
export function hasPriorClaim(card) {
  return Boolean(card && card.prior_known_at)
}

// ── The four states ─────────────────────────────────────────────────────────

// Claimed, and still unproven. This is the only state that counts for reading
// without counting for progress.
export function isPriorKnown(card) {
  return hasPriorClaim(card) && !hasGenuineObservation(card)
}

// Observed at least once inside Hanzi Dojo — whether or not it was ever claimed.
export function isVerified(card) {
  return hasGenuineObservation(card)
}

// Mastery takes BOTH: real evidence that the word was recalled, and the
// scheduler's own stability bar. The `reps` half is what a seeded stability of
// exactly 21 used to walk straight past.
export function isMastered(card) {
  if (!card) return false
  if (!hasGenuineObservation(card)) return false
  return (card.stability || 0) >= MASTERY_STABILITY_DAYS
}

// Graduated out of the initial learning phase at least once. Kept under its
// historical name because a dozen call sites and docs/METRICS.md use it, but it
// now also requires a genuine observation, so a claim can never satisfy it.
export function isLearned(card) {
  if (!card) return false
  if (!hasGenuineObservation(card)) return false
  return Boolean(card.learned) || card.state === 'review' || card.state === 'relearning'
}

// Does this card carry live scheduler state — i.e. is it in the FSRS machine at
// all? A prior-known claim is deliberately outside it.
export function isScheduledForLearning(card) {
  if (!card) return false
  return card.state === 'learning' || card.state === 'relearning' || card.state === 'review'
}

// ── What each question counts ───────────────────────────────────────────────

// Reading is the product's deliberately low bar — comprehensible input beats
// certainty, so a claim is evidence enough to render a word as known.
export function countsForReading(card) {
  if (!card) return false
  return isPriorKnown(card) || isLearned(card)
}

// Progress and the level test are the high bar: genuine evidence only.
export function countsForMastery(card) {
  return isMastered(card)
}

// A claim waiting for its first real observation.
export function needsCalibration(card) {
  return isPriorKnown(card)
}

// The one status any UI should switch on.
export function knowledgeOf(card) {
  if (!card) return KNOWLEDGE.UNKNOWN
  if (isMastered(card)) return KNOWLEDGE.MASTERED
  if (hasGenuineObservation(card)) return KNOWLEDGE.VERIFIED
  if (hasPriorClaim(card)) return KNOWLEDGE.PRIOR_KNOWN
  return KNOWLEDGE.UNKNOWN
}

// ── Aggregates ──────────────────────────────────────────────────────────────

// Given card rows scoped to a level and the level's active word count.
// `learnedCount` and `masteredCount` are claims ABOUT HANZI DOJO'S TEACHING, so
// they count genuine evidence only; `priorKnownCount` is reported alongside so a
// caller can show "and N you told us you already knew" without conflating them.
export function countMastery(cards, totalActiveWords) {
  const rows = cards || []
  const learnedCount = rows.filter(isLearned).length
  const masteredCount = rows.filter(isMastered).length
  const priorKnownCount = rows.filter(isPriorKnown).length
  const total = totalActiveWords
  const masteredPct = total > 0 ? masteredCount / total : 0
  return { learnedCount, masteredCount, priorKnownCount, total, masteredPct }
}

// How much of a level the learner can READ — genuine plus claimed. This is the
// aggregate the level-test fast path is gated on: it decides who may sit the
// test, never who has passed it.
export function readingCoveragePct(cards, totalActiveWords) {
  if (!totalActiveWords) return 0
  const covered = (cards || []).filter(countsForReading).length
  return covered / totalActiveWords
}

// ── The inert claim row ─────────────────────────────────────────────────────

// The exact shape a claim is written in. Every FSRS field is absent rather than
// zero-with-meaning, which is what keeps a claim out of every queue:
//
//   dueReviewCards   requires state === 'review'          → excluded
//   dueLearningCards requires state === 'learning'/'relearning' → excluded
//   isCardDue        returns false for 'new' whatever due_at holds → never due
//   weakCards        requires lapses >= 2                 → excluded
//   newItems/newCount exclude any vocab that HAS a card row → never re-taught
//
// due_at is NOT NULL in the schema so it must hold something; state 'new' makes
// its value irrelevant. The DB's cards_unverified_claim_is_inert CHECK enforces
// this shape server-side, so no client can write a claim with scheduler state.
export function priorKnownCardRow(userId, vocabId, source, now = Date.now()) {
  const stamp = new Date(now).toISOString()
  return {
    user_id: userId,
    vocab_id: vocabId,
    state: 'new',
    learned: false,
    is_easy: false,
    stability: null,
    difficulty: null,
    reps: 0,
    lapses: 0,
    last_review: null,
    scheduled_days: 0,
    elapsed_days: 0,
    interval_days: 0,
    learning_step: 0,
    due_at: stamp,
    prior_known_at: stamp,
    prior_source: source,
    verified_at: null,
  }
}
