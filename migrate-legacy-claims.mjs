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
import { buildMigrationPlan, actionableCards, actionableBreakdown, assertCorroborationSafe, CorroborationError } from './src/migration/legacyClaimMigration.js'
import { CARD_COLUMNS, REVIEW_LOG_COLUMNS, columnList, loadWorld as loadWorldWith } from './src/migration/reviewLogContract.js'
import { replayCard, describeReplay } from './src/migration/legacyClaimReplay.js'
import { buildSnapshot } from './src/migration/snapshotContract.js'
import { buildManifest, checkEntry, casPredicate, ACTION, ENTRY_STATUS, MANIFEST_VERSION } from './src/migration/legacyClaimManifest.js'
import fs from 'node:fs'
import { createHash } from 'node:crypto'

const argv = process.argv.slice(2)
const APPLY = argv.includes('--apply')
const SNAPSHOT = argv.includes('--snapshot')
// --redact: replace account and card identifiers in CONSOLE OUTPUT with stable
// per-run labels. The manifest and snapshot files are unaffected — they still
// carry real ids, because the apply path needs them.
//
// This exists because Hanzi-dojo is a PUBLIC repository: GitHub Actions job
// logs are readable by anyone on the internet, and an unredacted dry run prints
// every affected account's UUID. Always pass --redact in CI.
const REDACT = argv.includes('--redact')
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

// The network half. The column lists and the grouping/epoch logic live in
// src/migration/reviewLogContract.js so a test can drive that exact code path
// through a fake that projects columns the way PostgREST does — which is the
// only way the missing-`previous_state` bug could have been caught.
async function loadWorld() {
  return loadWorldWith({
    fetchTable: (table, columns) => fetchAll(table, columns),
    cardColumns: CARD_COLUMNS,
    logColumns: REVIEW_LOG_COLUMNS,
  })
}

// Corroboration is a VETO, not a warning. Run 33014914945 printed "STOP and
// account for them" and still produced an Apply-compatible artifact. Every
// production path that could emit one calls this first.
function haltIfUncorroborated(plan) {
  try {
    assertCorroborationSafe(plan)
  } catch (err) {
    console.error('')
    console.error(line())
    console.error('REFUSING TO CONTINUE')
    console.error(line())
    console.error('')
    console.error('  ' + err.message)
    if (err instanceof CorroborationError) {
      console.error('')
      console.error('  demonstrated cohorts  ' + err.corroboration.demonstrated.length)
      console.error('  outlier cohorts       ' + err.corroboration.outliers.length)
      console.error('  unexplained rows      ' + err.corroboration.outlierCards)
    }
    console.error('')
    console.error('  No snapshot, manifest or artifact has been produced.')
    console.error('')
    process.exit(1)
  }
}

// A cohort is identified by a production created_at — a timestamp describing
// when one learner's rows were written. Under --redact it becomes a positional
// label, so a reviewer still sees the shape without learning the timing.
//
// Note there is deliberately no card#N or account#N helper any more: under
// --redact NOTHING row-level is printed, not even pseudonymised.
const cohortRef = (createdAt, i) => (REDACT ? 'cohort#' + (i + 1) : String(createdAt))

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
  // Veto FIRST: a snapshot taken from a malfunctioning classification is not a
  // useful backup, and producing it invites the run to continue.
  haltIfUncorroborated(buildMigrationPlan({ cards, logsByCardId, loggingEpoch }))

  // Everything else — coverage, canonical form, digest and the field contract —
  // lives in src/migration/snapshotContract.js so the rollback guarantee can be
  // tested without production credentials. It throws rather than writing a file
  // that could not roll back what it protects.
  const generated_at = new Date().toISOString()
  let snapshot
  try {
    snapshot = buildSnapshot({ cards, logsByCardId, loggingEpoch, generatedAt: generated_at })
  } catch (err) {
    console.error('')
    console.error(line())
    console.error('REFUSING TO WRITE A SNAPSHOT')
    console.error(line())
    console.error('')
    console.error('  ' + err.message)
    console.error('')
    process.exit(1)
  }

  const stamp = generated_at.replace(/[-:]/g, '').replace(/\..+$/, 'Z')
  const file = 'legacy-claim-snapshot-' + stamp + '.json'
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2), { mode: 0o600 })

  console.log('\n' + line())
  console.log('PRE-APPLY SNAPSHOT')
  console.log(line())
  console.log('\n  file          ' + file)
  console.log('  convert rows  ' + pad(snapshot.convert_count, 6))
  console.log('  replay rows   ' + pad(snapshot.replay_count, 6))
  console.log('  ' + '-'.repeat(30))
  console.log('  total rows    ' + pad(snapshot.row_count, 6)
    + (snapshot.row_count === snapshot.convert_count + snapshot.replay_count
      ? '' : '   !! disagrees with the breakdown'))
  console.log('  restore cols  ' + pad(snapshot.restore_fields.length, 6))
  console.log('  sha256        ' + snapshot.sha256)
  console.log('  logging epoch ' + loggingEpoch)
  console.log('  generated     ' + generated_at)
  console.log('  mode          0600 (owner read/write only)')
  console.log('\n  Coverage is the SAME provenance classification the manifest uses,')
  console.log('  so every row that can enter the manifest is backed up here. The')
  console.log('  captured columns are DERIVED from conversionPatch() and')
  console.log('  replayCard(), so every value Apply can overwrite is preserved:')
  console.log('  ' + snapshot.restore_fields.join(', '))
  console.log('\nThis file holds the original value of every column this migration can')
  console.log('write, and is the ONLY sanctioned restore source. Keep it off the repo')
  console.log('— .gitignore covers it — and delete it once the migration is accepted.\n')
}

// ── Dry run ─────────────────────────────────────────────────────────────────
async function dryRun() {
  console.log('\n' + line())
  console.log('LEGACY CLAIM MIGRATION — FRESH DRY RUN (nothing is written)')
  console.log(line())

  const { cards, logs, logsByCardId, loggingEpoch } = await loadWorld()
  console.log('\nRead ' + cards.length + ' cards and ' + logs.length + ' review logs at ' + new Date().toISOString())

  const plan = buildMigrationPlan({ cards, logsByCardId, loggingEpoch })

  console.log('\n  logging epoch (oldest review_log): ' + loggingEpoch)
  console.log('  Provenance rule: a genuine card\'s history opens with a `new ->`')
  console.log('  transition. A fabricated seed has none, and no later grade can')
  console.log('  create one — so classification survives legitimate grading.')

  console.log('\nCLASSIFICATION')
  console.log('  convert_legacy_claim   ' + pad(plan.counts.conversions, 6))
  console.log('  replay_reviewed_seed   ' + pad(plan.counts.replays, 6))
  console.log('  excluded_ambiguous     ' + pad(plan.counts.ambiguous, 6) + '   (never actionable)')
  console.log('  excluded_foreign       ' + pad(plan.counts.foreign_written, 6) + '   (reps no grade wrote — import/restore)')
  console.log('  excluded_pre_logging   ' + pad(plan.counts.pre_logging, 6) + '   (born before complete history)')
  console.log('  excluded_b2_claims     ' + pad(plan.counts.claims, 6) + '   (already modelled)')
  console.log('  untouched_genuine      ' + pad(plan.counts.genuine, 6))
  console.log('  untouched_unstarted    ' + pad(plan.counts.unstarted, 6))
  const partition = plan.counts.conversions + plan.counts.replays + plan.counts.ambiguous
    + plan.counts.foreign_written + plan.counts.pre_logging + plan.counts.claims
    + plan.counts.genuine + plan.counts.unstarted
  console.log('  ' + '-'.repeat(40))
  console.log('  partition total        ' + pad(partition, 6)
    + (partition === cards.length ? '   == cards table (' + cards.length + ')'
                                  : '   !! MISMATCH, cards table has ' + cards.length))
  console.log('  actionable entries     ' + pad(plan.counts.conversions + plan.counts.replays, 6))

  // Independent corroboration: the fabricated rows were bulk INSERTs, so they
  // share an exact created_at. This is a CHECK on the provenance rule, never an
  // input to it. Anything actionable outside a demonstrated cohort is a stop.
  //
  // A cohort's created_at is a production timestamp describing when specific
  // learners' rows were written, so under --redact it becomes cohort#N. The
  // COUNTS are what a reviewer actually needs.
  console.log('\nBATCH CORROBORATION (independent check, not a classifier input)')
  plan.corroboration.demonstrated.forEach((b, i) => {
    console.log('  ' + cohortRef(b.created_at, i) + '  untouched ' + pad(b.untouched, 5) + '  reviewed ' + pad(b.reviewed, 5))
  })
  console.log('  demonstrated cohorts   ' + pad(plan.corroboration.demonstrated.length, 6))
  console.log('  outlier cohorts        ' + pad(plan.corroboration.outliers.length, 6))
  console.log('  unexplained rows       ' + pad(plan.corroboration.outlierCards, 6))
  if (plan.corroboration.outlierCards === 0) {
    console.log('  every actionable row sits inside a demonstrated bulk cohort')
  }

  // Nothing Apply could consume is built until corroboration passes. This
  // EXITS on failure — it is a veto, not a warning.
  haltIfUncorroborated(plan)

  const manifest = buildManifest({ cards, logsByCardId, replayFor: (h) => replayCard(h), loggingEpoch })

  // Aggregate only. A per-account breakdown — even pseudonymised as account#N —
  // publishes how many rows each individual learner has and how they cluster,
  // which is row-level activity metadata about a person. The count is the part
  // a reviewer needs; the shape is not.
  const affectedAccounts = new Set(manifest.entries.map(e => e.user_id)).size
  console.log('\nAFFECTED ACCOUNTS      ' + pad(affectedAccounts, 6))
  console.log('AMBIGUOUS (untouched)  ' + pad(plan.ambiguous.length, 6))

  if (!REDACT) {
    // Runner-local diagnostics only. Never reachable from a --redact run, which
    // is the only mode CI uses, so this cannot reach a public log.
    const byUser = {}
    for (const e of manifest.entries) {
      const u = (byUser[e.user_id] || (byUser[e.user_id] = { convert: 0, replay: 0 }))
      if (e.action === ACTION.CONVERT) u.convert += 1; else u.replay += 1
    }
    console.log('\nPER-ACCOUNT (local diagnostics)')
    for (const [u, v] of Object.entries(byUser)) {
      console.log('  ' + u + '   convert ' + pad(v.convert, 4) + '   replay ' + pad(v.replay, 3))
    }
    const replays = manifest.entries.filter(e => e.action === ACTION.REPLAY)
    if (replays.length) {
      console.log('\nREPLAY PREVIEW (first 5 of ' + replays.length + ')')
      for (const e of replays.slice(0, 5)) {
        const before = cards.find(c => c.id === e.card_id)
        console.log('  ' + e.card_id + '  ' + describeReplay(before, replayCard(e.review_log_input)))
      }
    }
    if (plan.ambiguous.length) {
      console.log('\nAMBIGUOUS — excluded from the manifest, never touched')
      for (const a of plan.ambiguous) console.log('  ' + a.id + '\n      ' + a.reason)
    }
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
    // Aggregate always: a per-row list is row-level production activity.
    const byStatus = {}
    for (const s2 of report.stale) byStatus[s2.status] = (byStatus[s2.status] || 0) + 1
    for (const [st, n] of Object.entries(byStatus)) console.log('  ' + st + '  ' + n)
    console.log('  per-row drift detail is runner-local only')
    if (!REDACT) {
      for (const s2 of report.stale) {
        console.log('  ' + s2.id + '  ' + s2.status + '  (' + s2.action + ')')
        console.log('      ' + s2.reason)
      }
    }
  }

  if (report.failed.length) {
    console.log('\nFAILED')
    console.log('  ' + report.failed.length + ' failure(s); details are runner-local only')
    if (!REDACT) {
      for (const f of report.failed) console.log('  ' + f.id + '  ' + f.error)
    }
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
