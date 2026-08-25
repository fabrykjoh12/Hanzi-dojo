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

import { MASTERY_STABILITY_DAYS } from '../knowledgeState.js'

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
  // Never studied and never claimed. Untouched.
  UNSTARTED: 'genuine_unstarted',
  // Born before review_logs existed, so its history cannot be proven either
  // way. Excluded on principle, never guessed at.
  PRE_LOGGING: 'ambiguous_pre_logging',
  // Carries `reps` that no grade in this database ever wrote — an import or
  // restore put FSRS state there directly. Real scheduling we must not touch.
  FOREIGN_WRITTEN: 'excluded_foreign_written',
  // Already modelled by B2: an inert claim, a verified claim, or a row this
  // migration already converted. Out of scope by construction.
  CLAIM: 'prior_known_claim',
}

// ── THE PROVENANCE INVARIANT ────────────────────────────────────────────────
//
// Every GENUINE card's history begins with a `new -> …` transition. A card can
// only leave state 'new' by being graded, and grade_card writes exactly one
// review_logs row per grade. A fabricated seed was INSERTed straight into
// state 'review', so it has NO `new ->` log — and never will, however many
// legitimate grades it later receives.
//
// That is what makes this classifier monotonic where the old one was not. The
// old fingerprint keyed on `state='review' AND reps=0` (and a second one on
// `stability=21 AND reps>=1`); a single honest grade moved a seed out of BOTH,
// leaving it corrupted and unreachable. Production proved it: 6 rows escaped in
// one 35-second session, and a census found 152 more that had escaped earlier
// and were silently invisible to the migration.
//
// THIS IS A ONE-TIME HISTORICAL CLASSIFIER, not a general rule that "no `new ->`
// means legacy". It is only sound because of boundaries that hold for THIS
// database at THIS moment, every one of which is checked explicitly below:
//
//   * the card lives entirely inside the era where review_logs are complete
//     (anything older cannot be proven and is excluded);
//   * no `new ->` transition exists anywhere in its history;
//   * its `reps` were written by grading, not by an import (`reps <= logs`);
//   * an untouched seed still carries the exact fabricated insert shape;
//   * a reviewed seed has a coherent real sequence (`reps === logs >= 1`).
//
// Outside those boundaries the answer is "cannot prove it", which is reported,
// never applied.

// Does this history contain a genuine start? One `new ->` anywhere is enough,
// and it is permanent — no later grade can remove it.
export function hasNewTransition(logs) {
  return (logs || []).some(l => l && l.previous_state === 'new')
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
  // A row that already carries claim metadata is NOT an untouched legacy row —
  // it has been through this migration, or was written by the new model. (Such
  // a row cannot legally hold review-state scheduler data anyway;
  // cards_unverified_claim_is_inert forbids it. This is belt and braces so the
  // classifier never proposes re-converting something already converted.)
  if (card.prior_known_at != null || card.verified_at != null) return false
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

// classifyCard(card, logs, { loggingEpoch }) → one of CLASS.
//
// `logs` is that card's review_logs rows (may be empty or undefined).
// `loggingEpoch` is the timestamp of the OLDEST review_log in the database —
// derived from the data, never hardcoded. Before it, history is incomplete and
// no positive legacy classification is possible. It is REQUIRED: without it
// this function refuses to classify anything as legacy, because the "no `new ->`
// transition" evidence is only meaningful inside the complete-history era.
//
// Rules are ordered, first match wins. Note that NOTHING here reads the card's
// current stability or difficulty to decide legacy status — that is exactly the
// mutable evidence a legitimate grade destroys.
export function classifyCard(card, logs, { loggingEpoch } = {}) {
  if (!card) return CLASS.GENUINE
  const history = orderedHistory(logs)
  const logCount = history.length
  const reps = card.reps || 0

  // 0. Already modelled by B2 — an inert claim, a verified claim, or a row a
  //    previous run of this migration converted. Never legacy, never re-touched.
  if (card.prior_known_at != null || card.verified_at != null) return CLASS.CLAIM

  // 1. A genuine start, recorded. Permanent, and decisive regardless of what
  //    the card's FSRS state looks like today.
  if (hasNewTransition(history)) return CLASS.GENUINE

  // 2. Never started and never claimed.
  if (card.state === 'new' && reps === 0 && logCount === 0) return CLASS.UNSTARTED

  // 3. Outside the complete-history era — or no era supplied. Cannot prove
  //    provenance, so refuse rather than guess.
  if (!loggingEpoch) return CLASS.AMBIGUOUS
  if (!card.created_at) return CLASS.AMBIGUOUS
  if (new Date(card.created_at) <= new Date(loggingEpoch)) return CLASS.PRE_LOGGING

  // 4. `reps` that no grade in this database wrote. An import or restore put
  //    that state there; it is real scheduling and must not be rebuilt.
  if (reps > logCount) return CLASS.FOREIGN_WRITTEN

  // 5. Untouched fabricated seed — must still carry the exact insert shape.
  if (logCount === 0 && reps === 0) {
    return matchesSeedFingerprint(card) ? CLASS.UNTOUCHED_CLAIM : CLASS.AMBIGUOUS
  }

  // 6. Seeded, then genuinely reviewed. The sequence must be coherent: one log
  //    per rep, every entry replayable. Current stability is irrelevant — it may
  //    be 21, or anything a real grade moved it to.
  if (logCount === reps && reps >= 1 && isReplayable(history)) return CLASS.REVIEWED_SEED

  return CLASS.AMBIGUOUS
}

// ── CORROBORATION (reporting only, never a classifier input) ────────────────
//
// The fabricated rows were written by bulk INSERTs, so they share an exact
// created_at to the microsecond. Grouping the classified legacy rows by that
// timestamp gives an independent check on the provenance rule: if the rule is
// sound, every legacy card should fall inside a handful of demonstrated
// cohorts. A legacy card OUTSIDE them is not automatically wrong — but it is
// unexplained, and the dry run must stop and surface it rather than apply.
export function corroborateBatches(classified) {
  const batches = new Map()
  for (const row of classified || []) {
    if (row.klass !== CLASS.UNTOUCHED_CLAIM && row.klass !== CLASS.REVIEWED_SEED) continue
    const key = row.created_at ? new Date(row.created_at).toISOString() : 'unknown'
    if (!batches.has(key)) batches.set(key, { created_at: key, untouched: 0, reviewed: 0, total: 0 })
    const b = batches.get(key)
    if (row.klass === CLASS.UNTOUCHED_CLAIM) b.untouched += 1
    else b.reviewed += 1
    b.total += 1
  }
  const list = [...batches.values()].sort((a, b) => b.total - a.total)
  // A demonstrated seed cohort is a bulk write: many rows sharing one instant.
  // Singletons are exactly what an unexplained capture would look like.
  const demonstrated = list.filter(b => b.total >= MIN_BULK_BATCH)
  const outliers = list.filter(b => b.total < MIN_BULK_BATCH)
  return {
    batches: list,
    demonstrated,
    outliers,
    outlierCards: outliers.reduce((n, b) => n + b.total, 0),
  }
}

// A bulk INSERT writes many rows in one instant. Below this, a shared
// created_at is coincidence rather than evidence of a batch.
export const MIN_BULK_BATCH = 10

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
export function buildMigrationPlan({ cards, logsByCardId, knownSources, loggingEpoch } = {}) {
  const logs = logsByCardId || {}
  const conversions = []
  const replays = []
  const ambiguous = []
  const classified = []
  const counts = {
    total: (cards || []).length,
    conversions: 0,
    replays: 0,
    ambiguous: 0,
    genuine: 0,
    unstarted: 0,
    pre_logging: 0,
    foreign_written: 0,
    claims: 0,
  }

  for (const card of cards || []) {
    const history = logs[card.id] || []
    const klass = classifyCard(card, history, { loggingEpoch })
    classified.push({ id: card.id, klass, created_at: card.created_at })

    if (klass === CLASS.UNTOUCHED_CLAIM) {
      counts.conversions += 1
      conversions.push({
        id: card.id, user_id: card.user_id, vocab_id: card.vocab_id,
        reason: 'no `new ->` transition, born inside the complete-history era, '
          + 'zero review logs, and still carries the exact fabricated insert shape',
        patch: conversionPatch(card, knownSources),
      })
    } else if (klass === CLASS.REVIEWED_SEED) {
      counts.replays += 1
      replays.push({
        id: card.id, user_id: card.user_id, vocab_id: card.vocab_id,
        reason: 'no `new ->` transition, born inside the complete-history era, and '
          + (history.length) + ' real review log(s) matching reps — replayed from a neutral card',
        history: orderedHistory(history),
        before: card,
      })
    } else if (klass === CLASS.PRE_LOGGING) {
      counts.pre_logging += 1
    } else if (klass === CLASS.FOREIGN_WRITTEN) {
      counts.foreign_written += 1
    } else if (klass === CLASS.CLAIM) {
      counts.claims += 1
    } else if (klass === CLASS.UNSTARTED) {
      counts.unstarted += 1
    } else if (klass === CLASS.AMBIGUOUS) {
      counts.ambiguous += 1
      ambiguous.push({ id: card.id, user_id: card.user_id, reason: ambiguityReason(card, history, loggingEpoch) })
    } else {
      counts.genuine += 1
    }
  }

  return { counts, conversions, replays, ambiguous, corroboration: corroborateBatches(classified) }
}

// Why a row could not be proven either way — specific enough to act on.
function ambiguityReason(card, history, loggingEpoch) {
  if (!loggingEpoch) return 'no logging epoch supplied, so provenance cannot be established'
  if (!card.created_at) return 'no created_at, so the complete-history era cannot be checked'
  const reps = card.reps || 0
  const logCount = orderedHistory(history).length
  if (logCount === 0 && reps === 0) {
    return 'entered a scheduler state with no history, but does not match the fabricated insert shape'
  }
  if (logCount !== reps) {
    return 'reps (' + reps + ') and review logs (' + logCount + ') disagree, so the sequence is incomplete'
  }
  return 'review history is present but not safely replayable (a grade or timestamp is unusable)'
}
