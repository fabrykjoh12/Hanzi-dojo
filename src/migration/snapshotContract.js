// The pre-apply SNAPSHOT/RESTORE contract: what a Gate 3 backup must contain
// for a rollback to be exact.
//
// ── WHY THIS MODULE EXISTS ──────────────────────────────────────────────────
//
// The snapshot is the whole rollback guarantee. If Apply damages rows, the only
// sanctioned repair is to write these exact values back — never a
// reconstruction, because a reconstruction is the same kind of invention the
// migration exists to undo.
//
// A guarantee like that is only as good as its field coverage, and the first
// version did not have it. `CARD_COLUMNS` was written for the CLASSIFIER, and
// the snapshot happened to be built from the rows that list loaded. It omitted
// `learning_step` — a column nothing classifies on, and one that BOTH mutators
// write:
//
//     conversionPatch()      learning_step: 0
//     replayCard().updates   learning_step: <whatever the replay produced>
//
// So a card sitting mid-way through the FSRS learning steps would have been
// reset by Apply with no record anywhere of where it had been. The file still
// called itself "complete original card rows".
//
// The fix is not `+ 'learning_step'`. A second hand-written list is exactly the
// failure mode that produced the incident this whole gate is repairing: two
// descriptions of the same truth, maintained by hand, drifting apart silently.
// So the required set is DERIVED — by calling the real mutators and reading the
// keys they actually produce — and asserted against the loaded column list. Add
// a field to either mutator and this contract notices without anyone
// remembering to update it.
//
// The snapshot stays deliberately minimal. It is not a copy of the cards table:
// it holds every value needed to reverse a Gate 3 mutation and the identity
// needed to put it back on the right row, and nothing else. review_logs are not
// captured at all — this migration never mutates them, and a second copy of
// user data with no restorative purpose is a liability, not a backup.

import { createHash } from 'node:crypto'
import { conversionPatch, actionableCards, actionableBreakdown } from './legacyClaimMigration.js'
import { replayCard } from './legacyClaimReplay.js'
import { CARD_COLUMNS } from './reviewLogContract.js'

// Not mutated by Gate 3, but a snapshot row without them cannot be matched back
// to the row it restores, nor checked for having drifted before restoring it.
// `created_at` earns its place twice over: `conversionPatch` reads it to derive
// `prior_known_at`, and it is what identifies a bulk-insert cohort.
export const SNAPSHOT_IDENTITY_FIELDS = ['id', 'user_id', 'vocab_id', 'created_at']

// Probe inputs for the derivation below. Deliberately minimal and synthetic:
// their VALUES never matter, only the shape of what each mutator returns.
const PROBE_CARD = {
  id: 'probe-card', user_id: 'probe-user', vocab_id: 'probe-vocab',
  created_at: '2026-01-01T00:00:00.000Z',
}
const PROBE_HISTORY = [
  {
    id: 'probe-log', card_id: 'probe-card', grade: 2,
    reviewed_at: '2026-01-02T00:00:00.000Z', previous_state: 'new',
  },
]

// Every card column Gate 3 can write, derived by CALLING the two mutators.
//
// The mutators are injectable for the same reason `loadWorld` takes a
// `fetchTable`: it lets a test prove the set is genuinely computed from them
// rather than transcribed from them once and left to rot.
export function gate3MutableFields({ conversion = conversionPatch, replay = replayCard } = {}) {
  const fields = new Set()
  for (const k of Object.keys(conversion(PROBE_CARD) || {})) fields.add(k)
  const replayed = replay(PROBE_HISTORY)
  for (const k of Object.keys((replayed && replayed.updates) || {})) fields.add(k)
  return [...fields].sort()
}

// Everything a snapshot row must carry: what Apply can change, plus what is
// needed to put it back.
export function snapshotRestoreFields(opts) {
  return [...new Set([...SNAPSHOT_IDENTITY_FIELDS, ...gate3MutableFields(opts)])].sort()
}

// snapshotFieldContract(columns) → { required, missing, extra }
//
// `missing` is the dangerous direction: a field Apply writes that the snapshot
// would not preserve — a silent hole in the rollback guarantee.
// `extra` is the minimality direction: a column captured for no restorative
// reason. Not dangerous, but the snapshot is a file full of user data and
// "we might as well keep it" is not a justification.
export function snapshotFieldContract(columns = CARD_COLUMNS, opts) {
  const required = snapshotRestoreFields(opts)
  const have = new Set(columns || [])
  const wanted = new Set(required)
  return {
    required,
    missing: required.filter(f => !have.has(f)),
    extra: [...new Set(columns || [])].filter(f => !wanted.has(f)),
  }
}

export function assertSnapshotCoversMutations(columns = CARD_COLUMNS, opts) {
  const { missing } = snapshotFieldContract(columns, opts)
  if (missing.length > 0) {
    throw new Error(
      'snapshot/restore contract violated: the migration can write '
      + missing.join(', ') + ', but the snapshot would not capture '
      + (missing.length === 1 ? 'that column' : 'those columns') + '. '
      + 'The pre-apply snapshot is the only sanctioned restore source, so a row '
      + 'could be modified with no record of its original value. Refusing to '
      + 'produce a backup that cannot roll back what it protects.')
  }
  return true
}

export const SNAPSHOT_KIND = 'hanzi-dojo/legacy-claim-presnapshot'
export const SNAPSHOT_VERSION = 2

// The claim this file makes about itself. Precise on purpose: the previous
// wording ("Complete original card rows") was not true, and an inaccurate
// backup note is how a restore quietly leaves damage behind.
export const SNAPSHOT_NOTE =
  'Original production values for every column this migration can write — '
  + 'derived by calling conversionPatch() and replayCard(), enumerated in '
  + 'restore_fields — plus the identity and created_at needed to match each row '
  + 'back to production. Restoration must write these exact values, never a '
  + 'reconstruction. Columns outside restore_fields are NOT captured. '
  + 'review_logs are deliberately excluded: this migration never mutates them.'

// buildSnapshot({ cards, logsByCardId, loggingEpoch, generatedAt }) → snapshot
//
// Pure, so the rollback guarantee is testable without production credentials.
// The script's job is only to load the world and write the returned object.
//
// Coverage is `actionableCards` — the SAME provenance classification the
// manifest uses, not a second predicate. A snapshot narrower than the manifest
// is a hole in the guarantee; that has happened once already.
export function buildSnapshot({ cards, logsByCardId, loggingEpoch, generatedAt } = {}) {
  // Fail closed before reading a single row: if the contract is violated there
  // is no backup worth taking.
  assertSnapshotCoversMutations()
  const restore_fields = snapshotRestoreFields()

  const rows = actionableCards({ cards, logsByCardId, loggingEpoch })
  const breakdown = actionableBreakdown({ cards, logsByCardId, loggingEpoch })

  // Canonical form: rows sorted by id, keys sorted, so the digest is
  // reproducible and any later tampering is detectable.
  const canonicalRows = rows
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(sortKeys)

  // The contract above checks the DECLARED column list. This checks what
  // actually arrived: PostgREST returns exactly what was selected, so a row
  // missing a restore field means the load did not match its declaration.
  const absent = new Set()
  for (const row of canonicalRows) {
    for (const f of restore_fields) if (!(f in row)) absent.add(f)
  }
  if (absent.size > 0) {
    throw new Error(
      'snapshot rows do not carry ' + [...absent].sort().join(', ')
      + '. The rows were loaded without a column the restore contract requires, '
      + 'so this file could not roll back an Apply. Refusing to write it.')
  }

  const body = JSON.stringify(canonicalRows)
  const sha256 = createHash('sha256').update(body, 'utf8').digest('hex')

  return {
    kind: SNAPSHOT_KIND,
    version: SNAPSHOT_VERSION,
    generated_at: generatedAt,
    row_count: canonicalRows.length,
    convert_count: breakdown.convert,
    replay_count: breakdown.replay,
    logging_epoch: loggingEpoch == null ? null : loggingEpoch,
    restore_fields,
    sha256,
    note: SNAPSHOT_NOTE,
    rows: canonicalRows,
  }
}

function sortKeys(o) {
  const out = {}
  for (const k of Object.keys(o).sort()) out[k] = o[k]
  return out
}
