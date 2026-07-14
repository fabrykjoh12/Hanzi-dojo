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
const tier = val('--tier') ? parseInt(val('--tier'), 10) : null
const apply = args.includes('--apply')
const fixCollisions = args.includes('--fix-collisions')
if (!language || !system || !Number.isFinite(level)) {
  console.error('Required: --language <l> --system <s> --level <n>  [--tier <t>] [--apply] [--fix-collisions]')
  process.exit(1)
}

// --fix-collisions: two writers can race the same story_number (a serial run
// reads its counter once at start; an authored insert mid-run grabs the same
// range). Held duplicates are invisible, so they get renumbered past the
// level's max — published rows always keep their numbers.
if (fixCollisions) {
  const { data: all, error: qErr } = await supabase
    .from('stories')
    .select('id, story_number, is_published, title')
    .eq('language', language).eq('system', system).eq('level', level)
    .order('story_number', { ascending: true })
  if (qErr) { console.error('Query error: ' + qErr.message); process.exit(1) }
  const byNum = new Map()
  let maxNum = 0
  for (const s of all || []) {
    maxNum = Math.max(maxNum, s.story_number)
    const list = byNum.get(s.story_number) || []
    list.push(s)
    byNum.set(s.story_number, list)
  }
  const toMove = []
  for (const [, list] of byNum) {
    if (list.length < 2) continue
    // Keep one row on the number — a published one if any — move the rest.
    const keepIdx = Math.max(0, list.findIndex(s => s.is_published))
    list.forEach((s, i) => { if (i !== keepIdx) toMove.push(s) })
  }
  if (toMove.length === 0) { console.log('No story_number collisions.'); process.exit(0) }
  const stillPublished = toMove.filter(s => s.is_published)
  if (stillPublished.length > 0) {
    console.error('Refusing: colliding PUBLISHED rows need a human decision: '
      + stillPublished.map(s => '#' + s.story_number + ' ' + s.title).join(' | '))
    process.exit(1)
  }
  console.log(toMove.length + ' held duplicate(s) to renumber (level max ' + maxNum + '):')
  let next = maxNum + 1
  for (const s of toMove) {
    console.log('  #' + s.story_number + ' "' + s.title + '" → #' + next)
    if (apply) {
      const { error: upErr } = await supabase.from('stories')
        .update({ story_number: next }).eq('id', s.id)
      if (upErr) { console.error('Update error: ' + upErr.message); process.exit(1) }
    }
    next += 1
  }
  console.log(apply ? '\nRenumbered.' : '\nDry run — pass --apply to renumber.')
  process.exit(0)
}

let heldQuery = supabase
  .from('stories')
  .select('id, tier, story_number, title')
  .eq('language', language).eq('system', system).eq('level', level)
  .eq('is_published', false)
  .order('story_number', { ascending: true })
if (tier != null) heldQuery = heldQuery.eq('tier', tier)
const { data: held, error } = await heldQuery
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

let pubQuery = supabase
  .from('stories')
  .update({ is_published: true })
  .eq('language', language).eq('system', system).eq('level', level)
  .eq('is_published', false)
if (tier != null) pubQuery = pubQuery.eq('tier', tier)
const { error: upErr } = await pubQuery
if (upErr) { console.error('Update error: ' + upErr.message); process.exit(1) }
console.log('\nPublished all ' + held.length + '.')
