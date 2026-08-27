// The contract between what the migration LOADS and what the classifier READS.
//
// ── WHY THIS MODULE EXISTS ──────────────────────────────────────────────────
//
// Gate 3 Prepare run 33014914945 classified 982 cards as reviewed seeds across
// 30 accounts. The truth was 207 across 2. Applying it would have replayed
// ~775 genuine cards belonging to uninvolved learners, destroying real FSRS
// state.
//
// The cause was one missing column. The loader asked PostgREST for:
//
//     id, card_id, grade, reviewed_at
//
// while the provenance rule reads `previous_state`:
//
//     hasNewTransition(logs) => logs.some(l => l.previous_state === 'new')
//
// PostgREST returns exactly the columns you ask for, so `previous_state` was
// `undefined` on every row, `hasNewTransition` returned false for every card,
// and the whole provenance rule silently collapsed — every genuine card with
// reps === logs fell through to REVIEWED_SEED.
//
// Nothing caught it. Every classifier unit test passed, because fixtures supply
// `previous_state` directly; the query and the classifier were never exercised
// together. A silent field is the worst kind of failure: it does not throw, it
// just quietly answers the wrong question.
//
// So the column list is no longer a string literal at a call site. It lives
// here, next to an explicit declaration of what the classifier needs, and
// `assertLogColumnsSatisfyClassifier` makes a mismatch a loud startup failure
// rather than a wrong answer.

// Every field the classifier, the replay and the manifest read from a card —
// AND every field the migration can write, because the pre-apply snapshot is
// built from exactly these rows and is the only sanctioned restore source.
//
// `learning_step` is here for the second reason only: nothing classifies on it,
// but `conversionPatch` sets it to 0 and `replayCard` rewrites it, so a snapshot
// without it could not restore the row exactly. src/migration/snapshotContract.js
// derives that requirement by CALLING those two functions and asserts it against
// this list, so the two cannot drift apart by hand.
export const CARD_COLUMNS = [
  'id', 'user_id', 'vocab_id', 'state', 'reps', 'lapses', 'stability', 'difficulty',
  'learned', 'is_easy', 'elapsed_days', 'scheduled_days', 'interval_days',
  'learning_step', 'last_review', 'due_at', 'created_at',
  'prior_known_at', 'prior_source', 'verified_at',
]

// Every field the classifier and the replay read from a review log.
//
// `previous_state` is the one that matters most and is the easiest to drop: it
// is used by exactly one predicate, and its absence is invisible.
export const REVIEW_LOG_COLUMNS = [
  'id', 'card_id', 'grade', 'reviewed_at', 'previous_state',
]

// What classification CANNOT be performed without. Stated separately from the
// column list on purpose: the list is what we ask for, this is what we depend
// on, and the assertion below is what keeps them honest.
export const CLASSIFIER_REQUIRED_LOG_FIELDS = [
  'card_id',        // group logs onto their card
  'grade',          // replay, and the replayability check
  'reviewed_at',    // ordering, the epoch, and the replay clock
  'previous_state', // the provenance rule: does this history open at `new`?
]

export const CLASSIFIER_REQUIRED_CARD_FIELDS = [
  'id', 'user_id', 'state', 'reps', 'lapses', 'stability', 'difficulty',
  'learned', 'is_easy', 'elapsed_days', 'created_at',
  'prior_known_at', 'verified_at',
]

export function columnList(columns) {
  return (columns || []).join(', ')
}

function assertSatisfies(columns, required, what) {
  const have = new Set(columns || [])
  const missing = required.filter(f => !have.has(f))
  if (missing.length > 0) {
    throw new Error(
      'review-log/card column contract violated: the ' + what + ' query omits '
      + missing.join(', ') + '. Classification reads those fields, and PostgREST '
      + 'returns only what is selected, so they would be undefined and the '
      + 'classifier would answer wrongly rather than fail. Refusing to load.')
  }
  return true
}

export function assertLogColumnsSatisfyClassifier(columns = REVIEW_LOG_COLUMNS) {
  return assertSatisfies(columns, CLASSIFIER_REQUIRED_LOG_FIELDS, 'review_logs')
}

export function assertCardColumnsSatisfyClassifier(columns = CARD_COLUMNS) {
  return assertSatisfies(columns, CLASSIFIER_REQUIRED_CARD_FIELDS, 'cards')
}

// loadWorld({ fetchTable }) → { cards, logs, logsByCardId, loggingEpoch }
//
// `fetchTable(table, columnListString)` does the actual paged network read and
// returns rows. Injecting it is what lets a test drive this exact code path
// through a fake that projects columns the way PostgREST does — which is the
// only way the missing-column bug could have been caught.
//
// The column assertions run BEFORE any query, so a bad contract fails at
// startup rather than producing a confidently wrong plan.
export async function loadWorld({
  fetchTable,
  cardColumns = CARD_COLUMNS,
  logColumns = REVIEW_LOG_COLUMNS,
} = {}) {
  if (typeof fetchTable !== 'function') throw new Error('loadWorld needs a fetchTable(table, columns)')
  assertCardColumnsSatisfyClassifier(cardColumns)
  assertLogColumnsSatisfyClassifier(logColumns)

  const cards = await fetchTable('cards', columnList(cardColumns))
  const logs = await fetchTable('review_logs', columnList(logColumns))

  const logsByCardId = {}
  for (const l of logs) {
    if (!l || !l.card_id) continue
    ;(logsByCardId[l.card_id] || (logsByCardId[l.card_id] = [])).push(l)
  }

  // The oldest review_log in the database: provenance is only provable for
  // cards born after it. Derived from the data, never hardcoded.
  let loggingEpoch = null
  for (const l of logs) {
    if (!l || !l.reviewed_at) continue
    if (loggingEpoch === null || new Date(l.reviewed_at) < new Date(loggingEpoch)) {
      loggingEpoch = l.reviewed_at
    }
  }

  return { cards, logs, logsByCardId, loggingEpoch }
}
