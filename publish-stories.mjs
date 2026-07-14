// Publish held (is_published=false) stories for one language/system/level.
//
// The serial pipeline (generate-serial-stories.mjs) holds chapters that miss
// its publish gate — usually the tier's line-count minimum, not language
// quality (held chapters have scored 7-8/10). A serialized season with a held
// middle chapter reads broken (1, 2, …5), so this flips the held rows live
// once a human decides completeness wins. Coverage was already validated at
// generation time, so held chapters are still fully tappable in the reader.
//
// Usage:
//   node --env-file=.env.script publish-stories.mjs --language japanese --system jlpt --level 1          (dry run: list held)
//   node --env-file=.env.script publish-stories.mjs --language japanese --system jlpt --level 1 --apply  (publish them)

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env vars. Run with: node --env-file=.env.script publish-stories.mjs --language <l> --system <s> --level <n> [--apply]')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const args = process.argv.slice(2)
const val = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null }
const language = val('--language')
const system = val('--system')
const level = parseInt(val('--level') || '', 10)
const apply = args.includes('--apply')
if (!language || !system || !Number.isFinite(level)) {
  console.error('Required: --language <l> --system <s> --level <n>')
  process.exit(1)
}

const { data: held, error } = await supabase
  .from('stories')
  .select('id, tier, story_number, title')
  .eq('language', language).eq('system', system).eq('level', level)
  .eq('is_published', false)
  .order('story_number', { ascending: true })
if (error) { console.error('Query error: ' + error.message); process.exit(1) }

if (!held || held.length === 0) {
  console.log('No held stories for ' + language + '/' + system + '/level ' + level + '.')
  process.exit(0)
}

console.log(held.length + ' held stor' + (held.length === 1 ? 'y' : 'ies') + ':')
for (const s of held) console.log('  tier ' + s.tier + ' · #' + s.story_number + ' · ' + s.title)

if (!apply) {
  console.log('\nDry run — pass --apply to publish these.')
  process.exit(0)
}

const { error: upErr } = await supabase
  .from('stories')
  .update({ is_published: true })
  .eq('language', language).eq('system', system).eq('level', level)
  .eq('is_published', false)
if (upErr) { console.error('Update error: ' + upErr.message); process.exit(1) }
console.log('\nPublished all ' + held.length + '.')
