// Classify — and, only when told to, repair — the fabricated prior-knowledge
// rows already in production.
//
//   node --env-file=.env.script migrate-legacy-claims.mjs            # dry run
//   node --env-file=.env.script migrate-legacy-claims.mjs --apply    # writes
//
// DRY RUN IS THE DEFAULT AND WRITES NOTHING. It prints the full classification,
// the replay result for every seeded-then-reviewed card, and any row that
// cannot be classified safely. Read that output before ever passing --apply.
//
// Background: until B2, a prior-knowledge claim was written as a finished FSRS
// review card — state 'review', stability exactly 21, difficulty 5, learned
// true, reps 0. That asserted three weeks of proven recall on one tap. This
// script converts those rows into inert claims, and rebuilds the ones that were
// genuinely reviewed afterwards from their real review_logs.
//
// All decision logic lives in src/legacyClaimMigration.js and
// src/legacyClaimReplay.js, which are unit-tested against a production-shaped
// fixture. This file only fetches, prints and (with --apply) writes.

import { createClient } from '@supabase/supabase-js'
import { buildMigrationPlan, CLASS, classifyCard } from './src/legacyClaimMigration.js'
import { replayCard, describeReplay } from './src/legacyClaimReplay.js'

const APPLY = process.argv.includes('--apply')
const PAGE = 1000

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY — run with --env-file=.env.script')
  process.exit(1)
}
const supabase = createClient(url, key, { auth: { persistSession: false } })

// Page everything: the cards table is well past PostgREST's 1000-row cap, and a
// migration that silently sees a prefix is worse than one that does not run.
async function fetchAll(table, columns, tweak) {
  const out = []
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(columns).order('id', { ascending: true }).range(from, from + PAGE - 1)
    if (tweak) q = tweak(q)
    const { data, error } = await q
    if (error) throw new Error(table + ': ' + error.message)
    out.push(...(data || []))
    if (!data || data.length < PAGE) return out
  }
}

function pct(n, total) {
  return total ? ' (' + Math.round((n / total) * 1000) / 10 + '%)' : ''
}

async function main() {
  console.log('\n' + '='.repeat(72))
  console.log(APPLY ? 'LEGACY CLAIM MIGRATION — APPLYING' : 'LEGACY CLAIM MIGRATION — DRY RUN (nothing will be written)')
  console.log('='.repeat(72) + '\n')

  console.log('Fetching cards and review history…')
  const cards = await fetchAll('cards',
    'id, user_id, vocab_id, state, reps, lapses, stability, difficulty, learned, is_easy, elapsed_days, scheduled_days, interval_days, last_review, due_at, created_at, prior_known_at, prior_source, verified_at')
  const logs = await fetchAll('review_logs', 'id, card_id, grade, reviewed_at')

  const logsByCardId = {}
  for (const l of logs) {
    if (!l.card_id) continue
    ;(logsByCardId[l.card_id] || (logsByCardId[l.card_id] = [])).push(l)
  }
  console.log('  ' + cards.length + ' cards, ' + logs.length + ' review logs\n')

  const plan = buildMigrationPlan({ cards, logsByCardId })
  const t = plan.counts.total

  console.log('CLASSIFICATION')
  console.log('  untouched claims  → convert to inert   ' + String(plan.counts.conversions).padStart(6) + pct(plan.counts.conversions, t))
  console.log('  reviewed seeds    → replay from logs   ' + String(plan.counts.replays).padStart(6) + pct(plan.counts.replays, t))
  console.log('  ambiguous         → REPORT ONLY        ' + String(plan.counts.ambiguous).padStart(6) + pct(plan.counts.ambiguous, t))
  console.log('  genuine           → untouched          ' + String(plan.counts.genuine).padStart(6) + pct(plan.counts.genuine, t))
  console.log('  ' + '-'.repeat(50))
  console.log('  total                                  ' + String(t).padStart(6) + '\n')

  // Per-account, so a reviewer can see who is affected and how much.
  const byUser = {}
  for (const c of plan.conversions) (byUser[c.user_id] || (byUser[c.user_id] = { convert: 0, replay: 0 })).convert += 1
  for (const r of plan.replays) (byUser[r.user_id] || (byUser[r.user_id] = { convert: 0, replay: 0 })).replay += 1
  const users = Object.keys(byUser)
  if (users.length) {
    console.log('AFFECTED ACCOUNTS (' + users.length + ')')
    for (const u of users) {
      console.log('  ' + u + '  convert ' + String(byUser[u].convert).padStart(4) + '  replay ' + String(byUser[u].replay).padStart(3))
    }
    console.log('')
  }

  // Replays are the part a human most needs to see: the fabricated 21-day
  // stability leaving, and what the learner's real answers actually earned.
  const replayResults = []
  if (plan.replays.length) {
    console.log('REPLAY RESULTS (rebuilt from real review_logs)')
    for (const r of plan.replays) {
      const result = replayCard(r.history)
      if (!result) {
        plan.ambiguous.push({ id: r.id, user_id: r.user_id, reason: 'replay returned no result' })
        continue
      }
      replayResults.push({ ...r, result })
      console.log('  ' + r.vocab_id + '  ' + describeReplay(r.before, result))
    }
    const stillMastered = replayResults.filter(r => (r.result.updates.stability || 0) >= 21).length
    console.log('  ' + '-'.repeat(50))
    console.log('  ' + replayResults.length + ' replayed · ' + stillMastered + ' still qualify as mastered on their real history\n')
  }

  if (plan.ambiguous.length) {
    console.log('AMBIGUOUS — NOT TOUCHED, needs a human decision')
    for (const a of plan.ambiguous) console.log('  ' + a.id + '  user ' + a.user_id + '\n      ' + a.reason)
    console.log('')
  }

  if (!APPLY) {
    console.log('Dry run complete. Nothing was written.')
    console.log('Review the above, then re-run with --apply.\n')
    return
  }

  // ── Writes ────────────────────────────────────────────────────────────────
  console.log('APPLYING…\n')
  let converted = 0
  for (const c of plan.conversions) {
    const { error } = await supabase.from('cards').update(c.patch).eq('id', c.id)
    if (error) throw new Error('convert ' + c.id + ': ' + error.message)
    converted += 1
    if (converted % 100 === 0) console.log('  converted ' + converted + '/' + plan.conversions.length)
  }
  console.log('  converted ' + converted + '/' + plan.conversions.length)

  let replayed = 0
  for (const r of replayResults) {
    const { error } = await supabase.from('cards').update({
      ...r.result.updates,
      prior_known_at: r.before.created_at,
      prior_source: 'legacy_claim',
    }).eq('id', r.id)
    if (error) throw new Error('replay ' + r.id + ': ' + error.message)
    replayed += 1
  }
  console.log('  replayed  ' + replayed + '/' + replayResults.length)

  // Re-classify from a fresh read: the migration must be a no-op second time.
  console.log('\nVerifying…')
  const after = await fetchAll('cards', 'id, user_id, state, reps, stability, difficulty, learned, is_easy, elapsed_days, prior_known_at, verified_at')
  const leftover = after.filter(c => classifyCard(c, logsByCardId[c.id] || []) !== CLASS.GENUINE).length
  console.log('  rows still classified as claim-derived: ' + leftover + (leftover === 0 ? '  ✓' : '  ← re-run the dry run'))
  console.log('\nDone.\n')
}

main().catch(e => { console.error('\nFAILED: ' + e.message + '\n'); process.exit(1) })
