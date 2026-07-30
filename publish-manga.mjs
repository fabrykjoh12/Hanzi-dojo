// Publish a Hanzi Dojo Stories manga episode.
//
// The episode's canonical source is its JSON in data/manga/. This upserts it
// into `stories` on the (language, system, level, title) natural key, so
// re-running after a text or layout edit UPDATES the episode rather than
// appending a second copy of it — the manga episodes are a small hand-authored
// set that gets revised, unlike the generated seasons authored-stories.mjs
// appends.
//
// It does NOT touch the artwork: panel art is committed to public/ by the
// `manga-art-fetch` task in .github/workflows/content-utils.yml (see
// fetch-manga-art.mjs for why).
//
// WHICH IS EXACTLY WHY IT PREFLIGHTS THE ART. The database is shared by every
// deployment; the art is a file in a build. Publishing an episode whose panels
// are not yet ON the live build points production at 404s, and the reader draws
// an empty plate where the drawing should be. That is not hypothetical — it
// happened: this script was run against an episode whose five new panels were
// still sitting on a feature branch, and production showed blank panels until
// the branch merged. So the ordering (deploy the art, THEN publish) is enforced
// here rather than written down and forgotten.
//
// Run with:
//   node --env-file=.env.script publish-manga.mjs data/manga/inkbound-hsk1-ep01.json           (dry run)
//   node --env-file=.env.script publish-manga.mjs data/manga/inkbound-hsk1-ep01.json --apply

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const args = process.argv.slice(2)
const file = args.find(a => !a.startsWith('--'))
const apply = args.includes('--apply')
// Escape hatch for a first publish where the episode is intentionally going out
// ahead of its art (a text-only draft, say). It has to be typed on purpose.
const skipArtCheck = args.includes('--skip-art-check')
// Where "live" is. Overridable so a staging host can be checked instead.
const SITE_URL = (process.env.SITE_URL || 'https://hanzi-dojo.com').replace(/\/+$/, '')
if (!file) {
  console.error('Usage: node publish-manga.mjs <episode.json> [--apply] [--skip-art-check]')
  process.exit(1)
}

let ep
try { ep = JSON.parse(readFileSync(file, 'utf8')) } catch (err) {
  console.error('Cannot read ' + file + ': ' + err.message)
  process.exit(1)
}

const lines = (ep.content || '').split('\n').filter(Boolean)
const english = (ep.english_content || '').split('\n').filter(Boolean)
if (lines.length === 0) { console.error('Episode has no content.'); process.exit(1) }
if (english.length && english.length !== lines.length) {
  console.error('english_content must be line-parallel: ' + english.length + ' English vs ' + lines.length + ' Chinese.')
  process.exit(1)
}

const key = { language: ep.language, system: ep.system, level: ep.level, title: ep.title }
console.log('Episode: ' + ep.title)
console.log('  ' + lines.length + ' beats · ' + ((ep.panels && ep.panels.panels) || []).length + ' panels · '
  + ep.language + '/' + ep.system + '/level ' + ep.level)

const { data: existing, error: findErr } = await supabase
  .from('stories').select('id, story_number')
  .eq('language', key.language).eq('system', key.system).eq('level', key.level).eq('title', key.title)
  .maybeSingle()
if (findErr) { console.error('Lookup failed: ' + findErr.message); process.exit(1) }

// ── Preflight: is every panel's art actually on the live site? ──────────────
const panelMeta = (ep.panels && ep.panels.meta) || {}
const artBase = typeof panelMeta.art_base === 'string' ? panelMeta.art_base : ''
const artFiles = ((ep.panels && ep.panels.panels) || [])
  .map(p => p && p.art)
  .filter(a => typeof a === 'string' && a)

if (artFiles.length && !skipArtCheck) {
  console.log('\nChecking ' + artFiles.length + ' panel files against ' + SITE_URL + ' …')
  const missing = []
  for (const art of artFiles) {
    // An absolute path or URL is somebody else's problem to host.
    const url = art.indexOf('http') === 0
      ? art
      : SITE_URL + (artBase.charAt(artBase.length - 1) === '/' ? artBase : artBase + '/') + art
    try {
      const res = await fetch(url, { method: 'HEAD' })
      if (!res.ok) missing.push(art + '  (HTTP ' + res.status + ')')
    } catch (err) {
      missing.push(art + '  (' + err.message + ')')
    }
  }
  if (missing.length) {
    console.error('\n✗ ' + missing.length + ' of ' + artFiles.length + ' panel files are NOT on ' + SITE_URL + ':')
    for (const m of missing) console.error('    ' + m)
    console.error('\nRefusing to publish. The database is shared by every deployment, so')
    console.error('this would point production at missing images and the reader would draw')
    console.error('empty plates where the artwork should be.')
    console.error('\nMerge the art to the default branch first, let the deploy finish, then')
    console.error('re-run. (--skip-art-check overrides this, deliberately.)')
    process.exit(1)
  }
  console.log('  ✓ all ' + artFiles.length + ' present')
}

if (!apply) {
  console.log(existing ? '\nDRY RUN — would UPDATE story ' + existing.id : '\nDRY RUN — would INSERT a new story')
  console.log('Re-run with --apply to write.')
  process.exit(0)
}

const row = {
  language: key.language,
  system: key.system,
  level: key.level,
  title: key.title,
  content: ep.content,
  english_content: ep.english_content || null,
  english_summary: ep.english_summary || null,
  tier: ep.tier == null ? 1 : ep.tier,
  tier_min_words: ep.tier_min_words == null ? 0 : ep.tier_min_words,
  presentation: 'manga',
  panels: ep.panels || null,
  is_published: ep.is_published !== false,
}

if (existing) {
  const { error } = await supabase.from('stories').update(row).eq('id', existing.id)
  if (error) { console.error('Update failed: ' + error.message); process.exit(1) }
  console.log('Updated ' + existing.id)
} else {
  // story_number appends after whatever already exists at this level, the same
  // rule authored-stories.mjs uses, so numbering never collides.
  const { data: last } = await supabase
    .from('stories').select('story_number')
    .eq('language', key.language).eq('system', key.system).eq('level', key.level)
    .order('story_number', { ascending: false }).limit(1).maybeSingle()
  row.story_number = ((last && last.story_number) || 0) + 1
  const { data: inserted, error } = await supabase.from('stories').insert(row).select('id').single()
  if (error) { console.error('Insert failed: ' + error.message); process.exit(1) }
  console.log('Inserted ' + inserted.id + ' as story_number ' + row.story_number)
}
