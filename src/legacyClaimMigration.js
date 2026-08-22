// Classifying and repairing the fabricated prior-knowledge rows already in
// production — pure, so the decision can be tested before it is ever applied.
//
// Until this phase, a claim was written as a finished FSRS review card:
// state 'review', stability exactly MASTERY_STABILITY_DAYS, difficulty 5,
// learned true, reps 0. Production holds 594 such rows across 2 accounts.
//
// Nothing here talks to the network and nothing here writes. The migration
// script builds a plan from these functions, prints it, and only then — after a
// human has read the dry run — applies it.

import { MASTERY_STABILITY_DAYS } from './knowledgeState.js'

export const CLASS = {
  // A claim that was never reviewed. Convert in place to an inert claim.
  UNTOUCHED_CLAIM: 'untouched_claim',
  // Seeded, then genuinely reviewed. Its stability was INHERITED from the
  // fabrication rather than earned, so it still reads as mastered on the
  // strength of one same-day answer. Rebuild it from its real review log.
  REVIEWED_SEED: 'reviewed_seed',
  // Looks seeded, but its review history is missing, so nothing can be
  // reconstructed safely. Never guessed at — reported for a human.
  AMBIGUOUS: 'ambiguous',
  // Not claim-derived. Untouched.
  GENUINE: 'genuine',
}

// The FULL fingerprint, deliberately not a loose `stability = 21`.
//
// Two collisions it rules out. A pre-FSRS card (the SM-2 era, before the
// 20260606 migration added these columns with DEFAULT 0) would read reps 0 in
// review state — but it would carry stability 0, not 21. And a genuinely
// reviewed card CAN land on stability exactly 21: reviewing at ~100%
// retrievability leaves stability unchanged, which is precisely how the
// reviewed-seed class came to exist. `reps` separates them.
export function matchesSeedFingerprint(card) {
  if (!card) return false
  return card.state === 'review'
    && (card.reps || 0) === 0
    && card.stability === MASTERY_STABILITY_DAYS
    && card.difficulty === 5
    && (card.elapsed_days || 0) === 0
    && card.learned === true
    && card.is_easy === false
}

// A card whose stability was inherited from the seed rather than earned: it
// sits exactly on the threshold, but a real review has since touched it.
export function looksLikeInheritedStability(card) {
  if (!card) return false
  return card.stability === MASTERY_STABILITY_DAYS && (card.reps || 0) >= 1
}

// classifyCard(card, logs) → one of CLASS.
// `logs` is that card's review_logs rows (may be empty or undefined).
export function classifyCard(card, logs) {
  if (!card) return CLASS.GENUINE
  const history = logs || []

  if (matchesSeedFingerprint(card)) {
    // A row carrying the untouched fingerprint but WITH review history is a
    // contradiction — reps says never reviewed, the log says otherwise. Never
    // guess; hand it to a human.
    return history.length === 0 ? CLASS.UNTOUCHED_CLAIM : CLASS.AMBIGUOUS
  }

  if (looksLikeInheritedStability(card)) {
    // Replay needs real grades and timestamps. Without them the honest answer
    // is "cannot be reconstructed safely", not a fabricated repair.
    return history.length > 0 ? CLASS.REVIEWED_SEED : CLASS.AMBIGUOUS
  }

  return CLASS.GENUINE
}

// The provenance to record when converting. The original source was never
// persisted — it only ever reached an analytics event — so it can be
// reconstructed only where the account's history makes it unambiguous.
//
// `knownSources` maps user_id → source for accounts whose claims we can
// attribute (e.g. an account whose only claim was the onboarding placement).
// Anything else gets 'legacy_claim', which is honest about not knowing.
export function provenanceFor(card, knownSources) {
  const mapped = knownSources && card && knownSources[card.user_id]
  return mapped || 'legacy_claim'
}

// The row patch that converts an untouched fabricated card into an inert claim.
// Strips every fabricated FSRS field; keeps the identity and the created_at.
export function conversionPatch(card, knownSources) {
  return {
    state: 'new',
    learned: false,
    is_easy: false,
    stability: null,
    difficulty: null,
    last_review: null,
    reps: 0,
    lapses: 0,
    scheduled_days: 0,
    elapsed_days: 0,
    interval_days: 0,
    learning_step: 0,
    // The claim was made when the row was created.
    prior_known_at: (card && card.created_at) || null,
    prior_source: provenanceFor(card, knownSources),
    verified_at: null,
  }
}

// Order a card's review history oldest-first. Replay is only honest if it
// happens in the order the learner actually answered.
export function orderedHistory(logs) {
  return [...(logs || [])]
    .filter(l => l && l.reviewed_at != null && l.grade != null)
    .sort((a, b) => new Date(a.reviewed_at) - new Date(b.reviewed_at))
}

// Can this card's history be replayed at all? Every entry needs a usable grade
// and a usable timestamp; a gap means we would be inventing one.
export function isReplayable(logs) {
  const history = orderedHistory(logs)
  if (history.length === 0) return false
  return history.every(l =>
    Number.isFinite(Number(l.grade))
    && Number(l.grade) >= 0 && Number(l.grade) <= 3
    && !Number.isNaN(new Date(l.reviewed_at).getTime()))
}

// Build the whole plan. Pure: hand it cards and a card_id → logs map.
//
// Returns { counts, conversions, replays, ambiguous, genuine } where
// `conversions` and `replays` carry everything the writer needs and nothing it
// has to re-derive.
export function buildMigrationPlan({ cards, logsByCardId, knownSources } = {}) {
  const logs = logsByCardId || {}
  const conversions = []
  const replays = []
  const ambiguous = []
  let genuine = 0

  for (const card of cards || []) {
    const history = logs[card.id] || []
    const klass = classifyCard(card, history)

    if (klass === CLASS.UNTOUCHED_CLAIM) {
      conversions.push({ id: card.id, user_id: card.user_id, vocab_id: card.vocab_id, patch: conversionPatch(card, knownSources) })
    } else if (klass === CLASS.REVIEWED_SEED) {
      if (isReplayable(history)) {
        replays.push({ id: card.id, user_id: card.user_id, vocab_id: card.vocab_id, history: orderedHistory(history), before: card })
      } else {
        ambiguous.push({ id: card.id, user_id: card.user_id, reason: 'reviewed seed whose history cannot be replayed safely' })
      }
    } else if (klass === CLASS.AMBIGUOUS) {
      ambiguous.push({
        id: card.id,
        user_id: card.user_id,
        reason: matchesSeedFingerprint(card)
          ? 'carries the untouched seed fingerprint but has review history'
          : 'stability sits exactly on the mastery threshold with no review history to explain it',
      })
    } else {
      genuine += 1
    }
  }

  return {
    counts: {
      total: (cards || []).length,
      conversions: conversions.length,
      replays: replays.length,
      ambiguous: ambiguous.length,
      genuine,
    },
    conversions,
    replays,
    ambiguous,
  }
}
