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

import { createHash } from 'node:crypto'
import { CLASS, classifyCard, conversionPatch, orderedHistory, isReplayable } from './legacyClaimMigration.js'

// NOTE ON node:crypto. This module lives in src/migration/, which is a
// SERVER-ONLY tree like src/tts/: it is imported only by
// migrate-legacy-claims.mjs and by tests, never by application code.
// src/tts/serverOnly.test.js enforces that boundary for both trees, so a node
// builtin here can never reach the browser bundle.

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
// (grade, reviewed_at) pairs and nothing else.
//
// SHA-256, not a 32-bit non-cryptographic hash. This is migration integrity —
// it decides whether a row's history is unchanged enough to rewrite that row's
// scheduler state — and a full digest costs nothing here. The count is kept as
// a prefix so a mismatch is legible at a glance in the report.
export function replayInputHash(logs) {
  const ordered = orderedHistory(logs)
  const canonical = ordered
    .map(l => Number(l.grade) + '@' + new Date(l.reviewed_at).toISOString())
    .join('|')
  return ordered.length + ':' + createHash('sha256').update(canonical, 'utf8').digest('hex')
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
export function buildManifest({ cards, logsByCardId, replayFor, generatedAt, loggingEpoch, source = 'production' } = {}) {
  const logs = logsByCardId || {}
  const entries = []
  let ambiguousCount = 0
  let genuineCount = 0
  const excluded = { pre_logging: 0, foreign_written: 0, claims: 0, unstarted: 0 }

  for (const card of cards || []) {
    const history = logs[card.id] || []
    const klass = classifyCard(card, history, { loggingEpoch })

    if (klass === CLASS.UNTOUCHED_CLAIM) {
      entries.push({
        card_id: card.id,
        user_id: card.user_id,
        vocab_id: card.vocab_id,
        action: ACTION.CONVERT,
        classification: klass,
        classification_reason: 'no `new ->` transition; created after the logging epoch; '
          + 'zero review logs; matches the fabricated insert shape exactly',
        precondition: preconditionOf(card),
        // The UNTRUNCATED created_at, used verbatim when writing
        // prior_known_at so the claim keeps its microsecond precision. The
        // normalised copy in `precondition` is for comparison only.
        created_at_raw: card.created_at,
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
        classification: klass,
        classification_reason: 'no `new ->` transition; created after the logging epoch; '
          + 'reps === review_log_count >= 1, so the sequence is complete and replayable',
        precondition: preconditionOf(card),
        created_at_raw: card.created_at,
        review_log_count: ordered.length,
        // The replay input, recorded twice: readable, and as a digest the apply
        // path can compare in one comparison.
        review_log_input: ordered.map(l => ({ grade: Number(l.grade), reviewed_at: new Date(l.reviewed_at).toISOString() })),
        replay_input_hash: replayInputHash(ordered),
        expected_post: expectedPostFor(ACTION.REPLAY, card, result.updates),
      })
    } else if (klass === CLASS.GENUINE) {
      genuineCount += 1
    } else if (klass === CLASS.PRE_LOGGING) {
      excluded.pre_logging += 1
    } else if (klass === CLASS.FOREIGN_WRITTEN) {
      excluded.foreign_written += 1
    } else if (klass === CLASS.CLAIM) {
      excluded.claims += 1
    } else if (klass === CLASS.UNSTARTED) {
      excluded.unstarted += 1
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
      // Each excluded on a proven boundary, not a guess. Recorded so post-apply
      // verification can confirm every one of them is still untouched.
      excluded_pre_logging: excluded.pre_logging,
      excluded_foreign_written: excluded.foreign_written,
      excluded_prior_known_claims: excluded.claims,
      untouched_unstarted: excluded.unstarted,
    },
    logging_epoch: loggingEpoch || null,
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

// ── The compare-and-swap predicate ──────────────────────────────────────────
//
// The columns the UPDATE itself must match on, so that the write is conditional
// in ONE statement and nothing can change between inspection and write. A
// separate SELECT-then-UPDATE would still race.
//
// Deliberately EXCLUDES stability, difficulty, created_at and last_review, all
// of which are lossy between Postgres and JSON and would make the CAS fail
// spuriously. Measured on this database:
//   * extra_float_digits = 0, so a real column round-trips through JSON badly —
//     `difficulty = 6.666::real` matches ZERO of the 53 rows whose difficulty
//     PostgREST reports as exactly 6.666.
//   * every created_at carries microsecond precision (…10.003419+00) which an
//     ISO-8601 millisecond normalisation truncates.
//
// What remains is exact in both systems — text, integers, booleans and NULL
// checks — and it is sufficient, because `reps` is the canary: every genuine
// grade goes through grade_card, which always increments reps and rewrites
// state in the same transaction as the review log. A concurrent review
// therefore cannot slip past this predicate, whatever it does to the floats.
// checkBundleBinding({ meta, approvedSha, prepareRunId, manifestSha256 })
//
// The three-way binding Apply must satisfy before it writes anything: the
// bundle has to come from the named Prepare run, carry the digest the operator
// approved, and have been produced by the SAME migration commit Apply is
// pinned to.
//
// That last one is what makes a superseded bundle structurally unusable. When
// a defect forces a new pin, every manifest produced under the old pin is
// refused automatically — it does not depend on anyone remembering which run
// was poisoned. Gate 3 run 33014914945 was built by d0dcc51 with a broken
// review-log query; once the pin moves past that commit, its bundle can never
// be applied.
//
// Extracted from the workflow YAML so it can be tested. Returns
// { ok, failures[] } rather than throwing, so a caller can report every
// mismatch at once.
export function checkBundleBinding({ meta, approvedSha, prepareRunId, manifestSha256 } = {}) {
  const failures = []
  if (!meta || typeof meta !== 'object') {
    return { ok: false, failures: ['bundle metadata is missing or unreadable'] }
  }
  const expect = (field, want) => {
    const got = meta[field]
    if (String(got) !== String(want)) {
      failures.push(field + ': bundle ' + JSON.stringify(got) + ' vs required ' + JSON.stringify(want))
    }
  }
  expect('migration_commit', approvedSha)
  expect('prepare_run_id', prepareRunId)
  expect('manifest_sha256', manifestSha256)
  return { ok: failures.length === 0, failures }
}

export function casPredicate(entry) {
  const p = entry.precondition
  return {
    eq: {
      state: p.state,
      reps: p.reps,
      lapses: p.lapses,
      elapsed_days: p.elapsed_days,
      learned: p.learned,
      is_easy: p.is_easy,
    },
    // Null-valued columns are matched with IS NULL rather than equality.
    isNull: ['prior_known_at', 'verified_at'].filter(k => p[k] === null),
    // A claim that somehow already carries one of these is not our row.
    notNull: ['prior_known_at', 'verified_at'].filter(k => p[k] !== null),
  }
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
