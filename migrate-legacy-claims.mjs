// Classify, plan, and — only against an approved manifest — repair the
// fabricated prior-knowledge rows already in production.
//
//   node --env-file=.env.script migrate-legacy-claims.mjs
//       Fresh read-only dry run. Writes nothing, emits nothing.
//
//   node --env-file=.env.script migrate-legacy-claims.mjs --manifest out.json
//       Fresh dry run that ALSO writes a machine-readable manifest.
//
//   node --env-file=.env.script migrate-legacy-claims.mjs --apply --manifest out.json
//       Applies THAT manifest. Never re-derives what to do.
//
//   node --env-file=.env.script migrate-legacy-claims.mjs --snapshot
//       Writes a local pre-apply backup FILE (never a public table).
//       Do this before --apply.
//
// WHY A MANIFEST. A dry run is a photograph, and rows move between taking it and
// acting on it: a learner grades a claimed word, and a row classified as an
// "untouched legacy claim" becomes a genuinely reviewed card. Applying the
// photographed action would then erase a real review. So apply re-reads every
// row first and refuses to act unless it still matches the plan exactly.
//
// Stale rows are SKIPPED and REPORTED. They are never folded into the success
// count, and never re-classified on the fly — a later fresh dry run does that.
//
// Ambiguous rows never enter the manifest at all, so this script cannot touch
// them even in principle.

import { createClient } from '@supabase/supabase-js'
import { buildMigrationPlan, actionableCards, actionableBreakdown } from './src/migration/legacyClaimMigration.js'
import { replayCard, describeReplay } from './src/migration/legacyClaimReplay.js'
import { buildManifest, checkEntry, casPredicate, ACTION, ENTRY_STATUS, MANIFEST_VERSION } from './src/migration/legacyClaimManifest.js'
import fs from 'node:fs'
import { createHash } from 'node:crypto'

const argv = process.argv.slice(2)
const APPLY = argv.includes('--apply')
const SNAPSHOT = argv.includes('--snapshot')
const MANIFEST_PATH = (() => {
  const i = argv.indexOf('--manifest')
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null
})()
const PAGE = 1000


const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY — run with --env-file=.env.script')
  process.exit(1)
}
if (APPLY && !MANIFEST_PATH) {
  console.error('--apply requires --manifest <path>. Generate one with a fresh dry run first.')
  process.exit(1)
}
const supabase = createClient(url, key, { auth: { persistSession: false } })

const CARD_COLUMNS = 'id, user_id, vocab_id, state, reps, lapses, stability, difficulty, learned, is_easy, ' +
  'elapsed_days, scheduled_days, interval_days, last_review, due_at, created_at, ' +
  'prior_known_at, prior_source, verified_at'

async function fetchAll(table, columns) {
  const out = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(columns)
      .order('id', { ascending: true }).range(from, from + PAGE - 1)
    if (error) throw new Error(table + ': ' + error.message)
    out.push(...(data || []))
    if (!data || data.length < PAGE) return out
  }
}

async function loadWorld() {
  const cards = await fetchAll('cards', CARD_COLUMNS)
  const logs = await fetchAll('review_logs', 'id, card_id, grade, reviewed_at')
  const logsByCardId = {}
  for (const l of logs) {
    if (!l.card_id) continue
    ;(logsByCardId[l.card_id] || (logsByCardId[l.card_id] = [])).push(l)
  }
  // The oldest review_log in the database. Provenance is only provable for
  // cards born after it — derived, never hardcoded.
  let loggingEpoch = null
  for (const l of logs) {
    if (!l.reviewed_at) continue
    if (loggingEpoch === null || new Date(l.reviewed_at) < new Date(loggingEpoch)) loggingEpoch = l.reviewed_at
  }
  return { cards, logs, logsByCardId, loggingEpoch }
}

const line = (n = 70) => '='.repeat(n)
const pad = (v, n) => String(v).padStart(n)

// ── Snapshot ────────────────────────────────────────────────────────────────
// A LOCAL file, deliberately not a table in `public`.
//
// An earlier draft printed DDL for `create table public.cards_prekb_backup_… as
// select * from public.cards …`. That would put a full copy of user card rows
// in a PostgREST-exposed schema, where its access depends entirely on nobody
// forgetting to add RLS — a copy of user data is exactly the thing that should
// not be one missing policy away from being readable. A file on the operator's
// machine has no such surface.
//
// review_logs are NOT copied. They are the evidence the replay derives from,
// they are never mutated by this migration, and duplicating them would be
// another copy of user data for no restorative benefit.
async function makeSnapshot() {
  const { cards, logsByCardId, loggingEpoch } = await loadWorld()
  // THE SAME provenance classification the manifest uses — not a second
  // predicate. Snapshot coverage and manifest coverage cannot drift apart
  // because they are literally the same function.
  const rows = actionableCards({ cards, logsByCardId, loggingEpoch })
  const breakdown = actionableBreakdown({ cards, logsByCardId, loggingEpoch })
  const generated_at = new Date().toISOString()

  // Canonical form: rows sorted by id, keys sorted, so the digest is
  // reproducible and any later tampering is detectable.
  const canonicalRows = rows
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(sortKeys)
  const body = JSON.stringify(canonicalRows)
  const sha256 = createHash('sha256').update(body, 'utf8').digest('hex')

  const snapshot = {
    kind: 'hanzi-dojo/legacy-claim-presnapshot',
    version: 1,
    generated_at,
    row_count: rows.length,
    convert_count: breakdown.convert,
    replay_count: breakdown.replay,
    logging_epoch: loggingEpoch,
    sha256,
    note: 'Complete original card rows that the legacy-claim migration could modify. '
      + 'Restoration must use these exact rows — never a reconstruction. '
      + 'review_logs are deliberately not included and are never mutated.',
    rows: canonicalRows,
  }

  const stamp = generated_at.replace(/[-:]/g, '').replace(/\..+$/, 'Z')
  const file = 'legacy-claim-snapshot-' + stamp + '.json'
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2), { mode: 0o600 })

  console.log('\n' + line())
  console.log('PRE-APPLY SNAPSHOT')
  console.log(line())
  console.log('\n  file          ' + file)
  console.log('  convert rows  ' + pad(breakdown.convert, 6))
  console.log('  replay rows   ' + pad(breakdown.replay, 6))
  console.log('  ' + '-'.repeat(30))
  console.log('  total rows    ' + pad(rows.length, 6)
    + (rows.length === breakdown.total ? '' : '   !! disagrees with the breakdown'))
  console.log('  sha256        ' + sha256)
  console.log('  logging epoch ' + loggingEpoch)
  console.log('  generated     ' + generated_at)
  console.log('  mode          0600 (owner read/write only)')
  console.log('\n  Coverage is the SAME provenance classification the manifest uses,')
  console.log('  so every row that can enter the manifest is backed up here.')
  console.log('\nThis file contains complete original rows and is the ONLY sanctioned')
  console.log('restore source. Keep it off the repo — .gitignore covers it — and delete')
  console.log('it once the migration has been accepted.\n')
}

function sortKeys(o) {
  const out = {}
  for (const k of Object.keys(o).sort()) out[k] = o[k]
  return out
}

// ── Dry run ─────────────────────────────────────────────────────────────────
async function dryRun() {
  console.log('\n' + line())
  console.log('LEGACY CLAIM MIGRATION — FRESH DRY RUN (nothing is written)')
  console.log(line())

  const { cards, logs, logsByCardId, loggingEpoch } = await loadWorld()
  console.log('\nRead ' + cards.length + ' cards and ' + logs.length + ' review logs at ' + new Date().toISOString())

  const plan = buildMigrationPlan({ cards, logsByCardId, loggingEpoch })
  const manifest = buildManifest({ cards, logsByCardId, replayFor: (h) => replayCard(h), loggingEpoch })

  console.log('\n  logging epoch (oldest review_log): ' + loggingEpoch)
  console.log('  Provenance rule: a genuine card\'s history opens with a `new ->`')
  console.log('  transition. A fabricated seed has none, and no later grade can')
  console.log('  create one — so classification survives legitimate grading.')

  console.log('\nCLASSIFICATION')
  console.log('  convert_legacy_claim   ' + pad(manifest.counts.convert_legacy_claim, 6))
  console.log('  replay_reviewed_seed   ' + pad(manifest.counts.replay_reviewed_seed, 6))
  console.log('  excluded_ambiguous     ' + pad(manifest.counts.excluded_ambiguous, 6) + '   (never actionable)')
  console.log('  excluded_foreign       ' + pad(manifest.counts.excluded_foreign_written, 6) + '   (reps no grade wrote — import/restore)')
  console.log('  excluded_pre_logging   ' + pad(manifest.counts.excluded_pre_logging, 6) + '   (born before complete history)')
  console.log('  excluded_b2_claims     ' + pad(manifest.counts.excluded_prior_known_claims, 6) + '   (already modelled)')
  console.log('  untouched_genuine      ' + pad(manifest.counts.untouched_genuine, 6))
  console.log('  untouched_unstarted    ' + pad(manifest.counts.untouched_unstarted, 6))
  const partition = manifest.counts.convert_legacy_claim + manifest.counts.replay_reviewed_seed
    + manifest.counts.excluded_ambiguous + manifest.counts.excluded_foreign_written
    + manifest.counts.excluded_pre_logging + manifest.counts.excluded_prior_known_claims
    + manifest.counts.untouched_genuine + manifest.counts.untouched_unstarted
  console.log('  ' + '-'.repeat(40))
  console.log('  partition total        ' + pad(partition, 6)
    + (partition === cards.length ? '   == cards table (' + cards.length + ')'
                                  : '   !! MISMATCH, cards table has ' + cards.length))

  // Independent corroboration: the fabricated rows were bulk INSERTs, so they
  // share an exact created_at. This is a CHECK on the provenance rule, never an
  // input to it. Anything actionable outside a demonstrated cohort is a stop.
  console.log('\nBATCH CORROBORATION (independent check, not a classifier input)')
  for (const b of plan.corroboration.demonstrated) {
    console.log('  ' + b.created_at + '  untouched ' + pad(b.untouched, 5) + '  reviewed ' + pad(b.reviewed, 5))
  }
  if (plan.corroboration.outlierCards > 0) {
    console.log('\n  !! ' + plan.corroboration.outlierCards + ' actionable row(s) fall OUTSIDE any demonstrated bulk cohort:')
    for (const b of plan.corroboration.outliers) {
      console.log('     ' + b.created_at + '  untouched ' + b.untouched + '  reviewed ' + b.reviewed)
    }
    console.log('  These are unexplained. STOP and account for them before applying.')
  } else {
    console.log('  every actionable row sits inside a demonstrated bulk cohort')
  }
  console.log('  ' + '-'.repeat(40))
  console.log('  actionable entries     ' + pad(manifest.counts.actionable, 6))

  const byUser = {}
  for (const e of manifest.entries) {
    const u = (byUser[e.user_id] || (byUser[e.user_id] = { convert: 0, replay: 0 }))
    if (e.action === ACTION.CONVERT) u.convert += 1; else u.replay += 1
  }
  console.log('\nAFFECTED ACCOUNTS (' + Object.keys(byUser).length + ')')
  for (const [u, v] of Object.entries(byUser)) {
    console.log('  ' + u + '   convert ' + pad(v.convert, 4) + '   replay ' + pad(v.replay, 3))
  }

  const replays = manifest.entries.filter(e => e.action === ACTION.REPLAY)
  if (replays.length) {
    console.log('\nREPLAY PREVIEW (first 5 of ' + replays.length + ')')
    for (const e of replays.slice(0, 5)) {
      const before = cards.find(c => c.id === e.card_id)
      console.log('  ' + e.card_id.slice(0, 8) + '…  ' + describeReplay(before, replayCard(e.review_log_input)))
    }
  }

  if (plan.ambiguous.length) {
    console.log('\nAMBIGUOUS — excluded from the manifest, never touched')
    for (const a of plan.ambiguous) console.log('  ' + a.id + '\n      ' + a.reason)
  }

  if (MANIFEST_PATH) {
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2))
    console.log('\nManifest written → ' + MANIFEST_PATH)
    console.log('  version ' + manifest.version + ', generated ' + manifest.generated_at)
    console.log('  Review it, then apply with:')
    console.log('    node --env-file=.env.script migrate-legacy-claims.mjs --apply --manifest ' + MANIFEST_PATH)
  } else {
    console.log('\n(no --manifest given, so no artifact was written)')
  }
  console.log('\nNothing was written to the database.\n')
}

// ── Apply ───────────────────────────────────────────────────────────────────
async function apply() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
  if (manifest.version !== MANIFEST_VERSION) {
    throw new Error('manifest version ' + manifest.version + ' != expected ' + MANIFEST_VERSION)
  }

  console.log('\n' + line())
  console.log('LEGACY CLAIM MIGRATION — APPLYING A MANIFEST')
  console.log(line())
  console.log('\nManifest: ' + MANIFEST_PATH)
  console.log('  generated ' + manifest.generated_at + ', ' + manifest.counts.actionable + ' actionable entries')
  const ageMin = Math.round((Date.now() - new Date(manifest.generated_at).getTime()) / 60000)
  console.log('  age: ' + ageMin + ' minutes')
  if (ageMin > 60) {
    console.log('  ⚠ older than an hour — expect stale rows; a fresher manifest is safer.')
  }

  const { cards, logsByCardId, loggingEpoch } = await loadWorld()
  const byId = new Map(cards.map(c => [c.id, c]))

  const report = {
    planned: manifest.counts.actionable,
    applied: 0,
    already: 0,
    stale: [],
    failed: [],
  }

  for (const entry of manifest.entries) {
    // A cheap pre-check first, purely so the REPORT can name what drifted.
    // It is not what makes the write safe — the conditional UPDATE below is.
    const live = byId.get(entry.card_id) || null
    const pre = checkEntry(entry, live, logsByCardId[entry.card_id] || [])
    if (pre.status === ENTRY_STATUS.ALREADY_APPLIED) { report.already += 1; continue }
    if (pre.status !== ENTRY_STATUS.OK) {
      report.stale.push({ id: entry.card_id, action: entry.action, status: pre.status, reason: pre.reason })
      continue
    }

    const patch = entry.action === ACTION.CONVERT
      ? convertPatchFromEntry(entry)
      : replayPatchFromEntry(entry)

    // COMPARE-AND-SWAP. The precondition rides in the UPDATE's own WHERE, so
    // inspection and write are ONE statement and nothing can change in between.
    // A separate SELECT-then-UPDATE would still leave a window in which a
    // learner's grade lands and is then overwritten.
    const cas = casPredicate(entry)
    let q = supabase.from('cards').update(patch).eq('id', entry.card_id)
    for (const [col, val] of Object.entries(cas.eq)) q = q.eq(col, val)
    for (const col of cas.isNull) q = q.is(col, null)
    for (const col of cas.notNull) q = q.not(col, 'is', null)

    const { data, error } = await q.select('id')
    if (error) {
      report.failed.push({ id: entry.card_id, action: entry.action, error: error.message })
      continue
    }
    if (!data || data.length === 0) {
      // The row moved between the read and this statement. Not a failure, and
      // certainly not an application — the learner's change stands untouched.
      report.stale.push({
        id: entry.card_id, action: entry.action, status: ENTRY_STATUS.STALE_ROW,
        reason: 'conditional UPDATE matched 0 rows — the row changed between read and write',
      })
      continue
    }
    report.applied += 1
    if (report.applied % 100 === 0) console.log('  applied ' + report.applied + '…')
  }

  await printPostApply(report, manifest)
}

function convertPatchFromEntry(entry) {
  const p = entry.expected_post
  return {
    state: 'new', learned: false, is_easy: false,
    stability: null, difficulty: null, last_review: null,
    reps: 0, lapses: 0, scheduled_days: 0, elapsed_days: 0, interval_days: 0, learning_step: 0,
    // The UNTRUNCATED original, so the claim keeps its microsecond precision.
    prior_known_at: entry.created_at_raw || p.prior_known_at,
    prior_source: p.prior_source,
    verified_at: null,
  }
}

function replayPatchFromEntry(entry) {
  // Recomputed from the manifest's own recorded input, which the staleness gate
  // has just confirmed still matches the live review history.
  const result = replayCard(entry.review_log_input)
  if (!result) throw new Error('replay produced nothing for ' + entry.card_id)
  return {
    ...result.updates,
    prior_known_at: entry.created_at_raw || entry.expected_post.prior_known_at,
    prior_source: entry.expected_post.prior_source,
  }
}

// ── Post-apply report + invariant verification ──────────────────────────────
async function printPostApply(report, manifest) {
  console.log('\n' + line())
  console.log('POST-APPLY REPORT')
  console.log(line())
  console.log('  planned                 ' + pad(report.planned, 6))
  console.log('  applied                 ' + pad(report.applied, 6))
  console.log('  already applied (no-op) ' + pad(report.already, 6))
  console.log('  stale / skipped         ' + pad(report.stale.length, 6) + (report.stale.length ? '   ← listed below' : ''))
  console.log('  failed                  ' + pad(report.failed.length, 6))
  console.log('  ambiguous untouched     ' + pad(manifest.counts.excluded_ambiguous, 6) + '   (never in the manifest)')

  if (report.stale.length) {
    console.log('\nSTALE — SKIPPED, NOT APPLIED. Re-run a fresh dry run to reclassify these.')
    for (const s of report.stale) {
      console.log('  ' + s.id + '  ' + s.status + '  (' + s.action + ')')
      console.log('      ' + s.reason)
    }
  }
  if (report.failed.length) {
    console.log('\nFAILED')
    for (const f of report.failed) console.log('  ' + f.id + '  ' + f.error)
  }

  console.log('\n' + line())
  console.log('INVARIANT VERIFICATION (fresh read)')
  console.log(line())
  const { cards, logsByCardId, loggingEpoch } = await loadWorld()

  const remaining = buildMigrationPlan({ cards, logsByCardId, loggingEpoch })
  const stillActionable = remaining.counts.conversions + remaining.counts.replays
  // Rows deliberately skipped as stale are legitimately still actionable, so
  // they are subtracted before this is called a problem.
  const unexpected = Math.max(0, stillActionable - report.stale.length)
  check('no actionable legacy rows unexpectedly remain', unexpected === 0,
    stillActionable + ' actionable, ' + report.stale.length + ' explained by stale skips')

  const badInert = cards.filter(c => c.prior_known_at && !c.verified_at && (
    c.state !== 'new' || (c.reps || 0) !== 0 || c.stability != null || c.difficulty != null ||
    c.last_review != null || c.learned === true || c.is_easy === true))
  check('no inert claim carries fabricated scheduler state', badInert.length === 0, badInert.length + ' violations')

  const badVerified = cards.filter(c => c.verified_at && (!c.prior_known_at || (c.reps || 0) < 1
    || new Date(c.verified_at) < new Date(c.prior_known_at)))
  check('no verified card violates the knowledge invariants', badVerified.length === 0, badVerified.length + ' violations')

  const fabricated = cards.filter(c => c.state === 'review' && (c.reps || 0) === 0)
  check('no card is in review state with zero reps', fabricated.length === 0, fabricated.length + ' remain')

  const ambiguousNow = remaining.ambiguous.length
  check('ambiguous rows are still present and untouched',
    ambiguousNow === manifest.counts.excluded_ambiguous,
    'expected ' + manifest.counts.excluded_ambiguous + ', found ' + ambiguousNow)

  console.log('\nRestoration, if needed, comes ONLY from the pre-apply snapshot table.')
  console.log('Nothing here reconstructs state heuristically.\n')
}

function check(label, ok, detail) {
  console.log('  [' + (ok ? 'PASS' : 'FAIL') + '] ' + label + (ok ? '' : '  — ' + detail))
}

const main = SNAPSHOT ? makeSnapshot : (APPLY ? apply : dryRun)
main().catch(e => { console.error('\nFAILED: ' + e.message + '\n'); process.exit(1) })
