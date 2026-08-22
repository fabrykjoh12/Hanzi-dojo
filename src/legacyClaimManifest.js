// The migration manifest — an approved, machine-readable plan, and the staleness
// checks that make applying it safe long after it was generated.
//
// WHY. A dry run is a photograph. Between taking it and acting on it, a learner
// can grade one of the very rows it describes: an "untouched legacy claim"
// becomes a reviewed card, and applying the photographed action would wipe a
// real review. Counts decay the same way — every calibration answered moves a
// row from the convert class into the replay class.
//
// So apply never re-derives what to do. It reads the approved manifest, and for
// every row it RE-READS the live record first and refuses to act unless the row
// still looks exactly as it did when the plan was approved.
//
// Three outcomes, and none of them guess:
//   STALE_ROW            the card no longer matches its recorded precondition
//   STALE_REPLAY_INPUT   the review history behind a replay has changed
//   ALREADY_APPLIED      the row already holds the expected post state (resume)
//
// A stale row is skipped and REPORTED — never folded into a success count, and
// never "fixed up" with a fresher guess. A later fresh dry run reclassifies it.
//
// Ambiguous rows never become manifest entries. Only their count is carried, so
// post-apply verification can confirm the same number is still untouched.

import { CLASS, classifyCard, conversionPatch, orderedHistory, isReplayable } from './legacyClaimMigration.js'

export const MANIFEST_VERSION = 1

export const ACTION = {
  CONVERT: 'convert_legacy_claim',
  REPLAY: 'replay_reviewed_seed',
}

export const ENTRY_STATUS = {
  OK: 'ok',
  STALE_ROW: 'STALE_ROW',
  STALE_REPLAY_INPUT: 'STALE_REPLAY_INPUT',
  ALREADY_APPLIED: 'ALREADY_APPLIED',
  MISSING: 'MISSING_ROW',
}

// The exact fields a row must still hold for its recorded action to be valid.
// Everything the classifier reads, plus created_at (which becomes the claim
// date) — so a change to any input of the decision invalidates the decision.
export function preconditionOf(card) {
  return {
    state: card.state,
    reps: card.reps || 0,
    lapses: card.lapses || 0,
    stability: numOrNull(card.stability),
    difficulty: numOrNull(card.difficulty),
    elapsed_days: card.elapsed_days || 0,
    learned: card.learned === true,
    is_easy: card.is_easy === true,
    prior_known_at: isoOrNull(card.prior_known_at),
    verified_at: isoOrNull(card.verified_at),
    created_at: isoOrNull(card.created_at),
  }
}

export function matchesPrecondition(card, precondition) {
  if (!card || !precondition) return false
  const now = preconditionOf(card)
  for (const key of Object.keys(precondition)) {
    if (!sameValue(now[key], precondition[key])) return false
  }
  return true
}

// A deterministic digest of exactly what the replay consumes: the ordered
// (grade, reviewed_at) pairs and nothing else. Pure JS so this module stays
// bundler-safe and dependency-free; the hash only needs to change when the
// input changes, not to be cryptographic.
export function replayInputHash(logs) {
  const ordered = orderedHistory(logs)
  const canonical = ordered.map(l => Number(l.grade) + '@' + new Date(l.reviewed_at).toISOString()).join('|')
  // FNV-1a, 32-bit, rendered as 8 hex chars alongside the length for extra
  // separation between histories that differ only in order.
  let h = 0x811c9dc5
  for (let i = 0; i < canonical.length; i += 1) {
    h ^= canonical.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return ordered.length + ':' + h.toString(16).padStart(8, '0')
}

// What the row should look like once its action has been applied. Used both to
// recognise an already-applied row on resume and to verify the result.
function expectedPostFor(action, card, replayUpdates) {
  if (action === ACTION.CONVERT) {
    const patch = conversionPatch(card)
    return {
      state: 'new',
      reps: 0,
      stability: null,
      difficulty: null,
      last_review: null,
      prior_known_at: isoOrNull(patch.prior_known_at),
      prior_source: patch.prior_source,
      verified_at: null,
    }
  }
  return {
    state: replayUpdates.state,
    reps: replayUpdates.reps,
    stability: numOrNull(replayUpdates.stability),
    prior_known_at: isoOrNull(card.created_at),
    prior_source: 'legacy_claim',
    verified_at: isoOrNull(replayUpdates.verified_at),
  }
}

// Does the row already hold its expected post state? Compared loosely on
// floats, because a real column round-trips through `real` precision.
export function matchesExpectedPost(card, expected) {
  if (!card || !expected) return false
  for (const key of Object.keys(expected)) {
    const want = expected[key]
    const got = key.endsWith('_at') || key === 'last_review' ? isoOrNull(card[key])
      : key === 'stability' || key === 'difficulty' ? numOrNull(card[key])
        : card[key]
    if (key === 'stability' && want != null && got != null) {
      if (Math.abs(Number(want) - Number(got)) > 0.001) return false
      continue
    }
    if (!sameValue(got, want)) return false
  }
  return true
}

// buildManifest({ cards, logsByCardId, replayFor, generatedAt })
//
// `replayFor(history)` returns the replay result for a history — injected so
// this module needs no scheduler and stays pure. Entries are emitted ONLY for
// rows the classifier calls actionable; ambiguous rows contribute a count.
export function buildManifest({ cards, logsByCardId, replayFor, generatedAt, source = 'production' } = {}) {
  const logs = logsByCardId || {}
  const entries = []
  let ambiguousCount = 0
  let genuineCount = 0

  for (const card of cards || []) {
    const history = logs[card.id] || []
    const klass = classifyCard(card, history)

    if (klass === CLASS.UNTOUCHED_CLAIM) {
      entries.push({
        card_id: card.id,
        user_id: card.user_id,
        vocab_id: card.vocab_id,
        action: ACTION.CONVERT,
        precondition: preconditionOf(card),
        review_log_count: 0,
        replay_input_hash: replayInputHash([]),
        expected_post: expectedPostFor(ACTION.CONVERT, card),
      })
    } else if (klass === CLASS.REVIEWED_SEED && isReplayable(history)) {
      const ordered = orderedHistory(history)
      const result = replayFor ? replayFor(ordered) : null
      if (!result) { ambiguousCount += 1; continue }
      entries.push({
        card_id: card.id,
        user_id: card.user_id,
        vocab_id: card.vocab_id,
        action: ACTION.REPLAY,
        precondition: preconditionOf(card),
        review_log_count: ordered.length,
        // The replay input, recorded twice: readable, and as a digest the apply
        // path can compare in one comparison.
        review_log_input: ordered.map(l => ({ grade: Number(l.grade), reviewed_at: new Date(l.reviewed_at).toISOString() })),
        replay_input_hash: replayInputHash(ordered),
        expected_post: expectedPostFor(ACTION.REPLAY, card, result.updates),
      })
    } else if (klass === CLASS.GENUINE) {
      genuineCount += 1
    } else {
      ambiguousCount += 1
    }
  }

  const convert = entries.filter(e => e.action === ACTION.CONVERT).length
  const replay = entries.filter(e => e.action === ACTION.REPLAY).length

  return {
    version: MANIFEST_VERSION,
    generated_at: generatedAt || new Date().toISOString(),
    source,
    counts: {
      actionable: entries.length,
      convert_legacy_claim: convert,
      replay_reviewed_seed: replay,
      // Carried as a NUMBER only. Ambiguous rows are never actionable entries;
      // this exists so post-apply verification can confirm the same number of
      // them is still sitting there untouched.
      excluded_ambiguous: ambiguousCount,
      untouched_genuine: genuineCount,
    },
    entries,
  }
}

// The gate every row passes through at apply time. `card` is the FRESH read.
export function checkEntry(entry, card, logs) {
  if (!card) return { status: ENTRY_STATUS.MISSING, reason: 'row no longer exists' }

  // Resume: already in its expected post state, so this is a no-op, not a
  // conflict. Checked BEFORE the precondition, because a converted row of
  // course no longer matches the precondition it was converted from.
  if (matchesExpectedPost(card, entry.expected_post)) {
    return { status: ENTRY_STATUS.ALREADY_APPLIED }
  }

  if (!matchesPrecondition(card, entry.precondition)) {
    return {
      status: ENTRY_STATUS.STALE_ROW,
      reason: describeDrift(card, entry.precondition),
    }
  }

  if (entry.action === ACTION.REPLAY) {
    const freshHash = replayInputHash(logs || [])
    if (freshHash !== entry.replay_input_hash) {
      return {
        status: ENTRY_STATUS.STALE_REPLAY_INPUT,
        reason: 'review history changed: manifest ' + entry.replay_input_hash + ', live ' + freshHash,
      }
    }
  }

  return { status: ENTRY_STATUS.OK }
}

// Which field moved — so a skipped row is reported with a reason, not a shrug.
function describeDrift(card, precondition) {
  const now = preconditionOf(card)
  const moved = Object.keys(precondition)
    .filter(k => !sameValue(now[k], precondition[k]))
    .map(k => k + ': ' + fmt(precondition[k]) + ' -> ' + fmt(now[k]))
  return moved.join(', ') || 'unknown drift'
}

function fmt(v) { return v === null || v === undefined ? 'null' : String(v) }
function numOrNull(v) { return v === null || v === undefined ? null : Number(v) }
function isoOrNull(v) { return v === null || v === undefined ? null : new Date(v).toISOString() }
function sameValue(a, b) {
  if (a === null || a === undefined) return b === null || b === undefined
  if (b === null || b === undefined) return false
  return a === b
}
