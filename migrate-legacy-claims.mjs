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
//       Creates the pre-apply backup table. Do this before --apply.
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
import { buildMigrationPlan } from './src/legacyClaimMigration.js'
import { replayCard, describeReplay } from './src/legacyClaimReplay.js'
import { buildManifest, checkEntry, ACTION, ENTRY_STATUS, MANIFEST_VERSION } from './src/legacyClaimManifest.js'
import fs from 'node:fs'

const argv = process.argv.slice(2)
const APPLY = argv.includes('--apply')
const SNAPSHOT = argv.includes('--snapshot')
const MANIFEST_PATH = (() => {
  const i = argv.indexOf('--manifest')
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null
})()
const PAGE = 1000
const SNAPSHOT_TABLE = 'cards_prekb_backup'

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
  return { cards, logs, logsByCardId }
}

const line = (n = 70) => '='.repeat(n)
const pad = (v, n) => String(v).padStart(n)

// ── Snapshot ────────────────────────────────────────────────────────────────
// The only real safety net: this repo has no down migrations and no pg_dump.
// A plain copy of every candidate row, inside the same database, is enough to
// restore any single card by hand. Review logs are NEVER copied or mutated —
// they are the evidence the replay is derived from and must stay pristine.
async function makeSnapshot() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const table = SNAPSHOT_TABLE + '_' + stamp
  console.log('\nPre-apply snapshot → public.' + table)
  console.log('Run this in the Supabase SQL editor (the JS client cannot run DDL):\n')
  console.log('  create table if not exists public.' + table + ' as')
  console.log('  select * from public.cards')
  console.log("   where (state='review' and coalesce(reps,0)=0)")
  console.log('      or (stability = 21 and coalesce(reps,0) >= 1);')
  console.log('  select count(*) from public.' + table + ';\n')
  const { cards } = await loadWorld()
  const candidates = cards.filter(c =>
    (c.state === 'review' && (c.reps || 0) === 0) || (c.stability === 21 && (c.reps || 0) >= 1))
  console.log('Expected row count right now: ' + candidates.length)
  console.log('(Verify the table matches before applying.)\n')
}

// ── Dry run ─────────────────────────────────────────────────────────────────
async function dryRun() {
  console.log('\n' + line())
  console.log('LEGACY CLAIM MIGRATION — FRESH DRY RUN (nothing is written)')
  console.log(line())

  const { cards, logs, logsByCardId } = await loadWorld()
  console.log('\nRead ' + cards.length + ' cards and ' + logs.length + ' review logs at ' + new Date().toISOString())

  const plan = buildMigrationPlan({ cards, logsByCardId })
  const manifest = buildManifest({ cards, logsByCardId, replayFor: (h) => replayCard(h) })

  console.log('\nCLASSIFICATION')
  console.log('  convert_legacy_claim   ' + pad(manifest.counts.convert_legacy_claim, 6))
  console.log('  replay_reviewed_seed   ' + pad(manifest.counts.replay_reviewed_seed, 6))
  console.log('  excluded_ambiguous     ' + pad(manifest.counts.excluded_ambiguous, 6) + '   (never actionable)')
  console.log('  untouched_genuine      ' + pad(manifest.counts.untouched_genuine, 6))
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

  const { cards, logsByCardId } = await loadWorld()
  const byId = new Map(cards.map(c => [c.id, c]))

  const report = {
    planned: manifest.counts.actionable,
    applied: 0,
    already: 0,
    stale: [],
    failed: [],
  }

  for (const entry of manifest.entries) {
    // Re-read from the fresh snapshot of the world, then gate.
    const live = byId.get(entry.card_id) || null
    const check = checkEntry(entry, live, logsByCardId[entry.card_id] || [])

    if (check.status === ENTRY_STATUS.ALREADY_APPLIED) { report.already += 1; continue }
    if (check.status !== ENTRY_STATUS.OK) {
      report.stale.push({ id: entry.card_id, action: entry.action, status: check.status, reason: check.reason })
      continue
    }

    const patch = entry.action === ACTION.CONVERT
      ? convertPatchFromEntry(entry)
      : replayPatchFromEntry(entry)

    const { error } = await supabase.from('cards').update(patch).eq('id', entry.card_id)
    if (error) {
      report.failed.push({ id: entry.card_id, action: entry.action, error: error.message })
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
    prior_known_at: p.prior_known_at, prior_source: p.prior_source, verified_at: null,
  }
}

function replayPatchFromEntry(entry) {
  // Recomputed from the manifest's own recorded input, which the staleness gate
  // has just confirmed still matches the live review history.
  const result = replayCard(entry.review_log_input)
  if (!result) throw new Error('replay produced nothing for ' + entry.card_id)
  return {
    ...result.updates,
    prior_known_at: entry.expected_post.prior_known_at,
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
  const { cards, logsByCardId } = await loadWorld()

  const remaining = buildMigrationPlan({ cards, logsByCardId })
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
