import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

// Seed clearly-synthetic analytics_events so the admin dashboard can be built
// and demoed before real traffic exists. Every row is tagged app_version='seed'
// so --purge removes exactly these and nothing real.
//
// Run:
//   node --env-file=.env.script seed-analytics.mjs            # dry-run (prints a summary)
//   node --env-file=.env.script seed-analytics.mjs --apply    # insert
//   node --env-file=.env.script seed-analytics.mjs --purge --apply   # delete synthetic rows
//
// Dry-run by default. Never touches non-'seed' rows.

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env vars. Run with: node --env-file=.env.script seed-analytics.mjs ...')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const purge = args.includes('--purge')
const SEED_TAG = 'seed'
const DAYS = 30
const USERS_PER_DAY = 8
const LANGS = ['chinese', 'japanese', 'russian']

function iso(daysAgo, hour = 12) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - daysAgo)
  d.setUTCHours(hour, 0, 0, 0)
  return d.toISOString()
}
function chance(p) { return Math.random() < p }

function buildRows() {
  const rows = []
  for (let day = DAYS; day >= 0; day--) {
    for (let u = 0; u < USERS_PER_DAY; u++) {
      const session = 'seed-' + randomUUID()
      const language = LANGS[Math.floor(Math.random() * LANGS.length)]
      const base = { session_id: session, language, level: 1, app_version: SEED_TAG }
      const push = (name, userId, extra = {}) =>
        rows.push({ ...base, name, user_id: userId, props: extra, created_at: iso(day, 9 + u) })

      push('landing_viewed', null)
      if (!chance(0.45)) continue
      const userId = randomUUID()
      push('signup_completed', userId)
      push('session_started', userId)
      push('session_ended', userId, { duration_ms: 60000 + Math.floor(Math.random() * 600000) })
      if (chance(0.8)) push('onboarding_completed', userId)
      if (chance(0.6)) push('first_mission_completed', userId)
      if (chance(0.4)) { push('story_opened', userId); if (chance(0.6)) push('first_story_completed', userId) }
      // Some users return the next day.
      if (day > 0 && chance(0.35)) {
        rows.push({ ...base, name: 'story_opened', user_id: userId, props: {}, created_at: iso(day - 1, 10) })
        if (chance(0.5)) rows.push({ ...base, name: 'story_completed', user_id: userId, props: {}, created_at: iso(day - 1, 10) })
      }
    }
  }
  return rows
}

async function main() {
  if (purge) {
    console.log(apply ? 'Purging synthetic rows...' : 'DRY RUN — would purge synthetic rows (app_version=seed).')
    if (apply) {
      const { error, count } = await supabase
        .from('analytics_events')
        .delete({ count: 'exact' })
        .eq('app_version', SEED_TAG)
      if (error) { console.error(error.message); process.exit(1) }
      console.log('Deleted', count, 'rows.')
    }
    return
  }

  const rows = buildRows()
  const byName = {}
  for (const r of rows) byName[r.name] = (byName[r.name] || 0) + 1
  console.log('Synthetic events:', rows.length)
  console.table(byName)

  if (!apply) { console.log('DRY RUN — pass --apply to insert.'); return }

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('analytics_events').insert(rows.slice(i, i + 500))
    if (error) { console.error(error.message); process.exit(1) }
  }
  console.log('Inserted', rows.length, 'synthetic rows (app_version=seed).')
}

main()
