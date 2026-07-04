import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// Attach illustrated cover art to stories (product request: make the library
// feel alive and show what each story is about). Because image generation runs
// through the interactive Higgsfield MCP (which the agent calls, not this
// script) while uploads need Supabase + open network, the flow is split:
//
//   1. --list   → print published stories as JSON so covers can be authored
//                 with scene-accurate prompts. (Run in CI, read from the log.)
//   2. generate images with Higgsfield, collect each result's webp URL.
//   3. write data/story-covers.json — a manifest keyed by the story's natural
//      key (language/system/level/story_number) → image URL — and commit it.
//   4. --apply data/story-covers.json → download each URL, upload to the public
//      `audio` bucket at stories/<id>/cover.webp, and set stories.image_path.
//
// Keying the manifest by natural key (not UUID) means covers can be authored
// without ever fetching the row ids first.
//
// Run with:
//   node --env-file=.env.script generate-story-images.mjs --list --language japanese --system jlpt --level 1
//   node --env-file=.env.script generate-story-images.mjs --apply data/story-covers.json

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const args = process.argv.slice(2)
function arg(name, def) { const i = args.indexOf('--' + name); return i !== -1 && args[i + 1] ? args[i + 1] : def }
const hasFlag = (name) => args.indexOf('--' + name) !== -1

const language = arg('language', null)
const system = arg('system', null)
const levelArg = arg('level', null)
const level = levelArg == null ? null : parseInt(levelArg, 10)

async function listStories() {
  let query = supabase
    .from('stories')
    .select('id, language, system, level, tier, story_number, title, english_summary, image_path')
    .eq('is_published', true)
    .order('language', { ascending: true })
    .order('system', { ascending: true })
    .order('level', { ascending: true })
    .order('tier', { ascending: true })
    .order('story_number', { ascending: true })
  if (language) query = query.eq('language', language)
  if (system) query = query.eq('system', system)
  if (level != null) query = query.eq('level', level)

  const { data, error } = await query
  if (error) { console.error('Fetch error:', error.message); process.exit(1) }

  // Wrapped in markers so the JSON is easy to lift out of the CI log.
  console.log('---STORY-LIST-JSON-START---')
  console.log(JSON.stringify(data || [], null, 2))
  console.log('---STORY-LIST-JSON-END---')
  console.log(`\n${(data || []).length} published stories (${(data || []).filter(s => s.image_path).length} already have a cover).`)
}

async function applyManifest(file) {
  let manifest
  try {
    manifest = JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    console.error('Could not read manifest ' + file + ': ' + err.message)
    process.exit(1)
  }
  if (!Array.isArray(manifest)) { console.error('Manifest must be a JSON array.'); process.exit(1) }

  console.log(`Applying ${manifest.length} cover(s)...\n`)
  let ok = 0, failed = 0
  for (const entry of manifest) {
    const { language: l, system: s, level: lv, story_number: n, url } = entry
    const label = `${l}/${s}/${lv}/#${n}`
    if (!l || !s || lv == null || n == null || !url) {
      console.log(`✗ ${label}: incomplete entry (need language, system, level, story_number, url)`)
      failed += 1
      continue
    }
    try {
      const { data: rows, error: findErr } = await supabase
        .from('stories').select('id')
        .eq('language', l).eq('system', s).eq('level', lv).eq('story_number', n).limit(1)
      if (findErr) throw new Error(findErr.message)
      if (!rows || rows.length === 0) throw new Error('no matching story row')
      const storyId = rows[0].id

      const res = await fetch(url)
      if (!res.ok) throw new Error('download ' + res.status)
      const buf = Buffer.from(await res.arrayBuffer())

      const path = `stories/${storyId}/cover.webp`
      const { error: upErr } = await supabase.storage
        .from('audio')
        .upload(path, buf, { contentType: 'image/webp', upsert: true })
      if (upErr) throw new Error(upErr.message)

      const { error: setErr } = await supabase.from('stories').update({ image_path: path }).eq('id', storyId)
      if (setErr) throw new Error(setErr.message)

      console.log(`✓ ${label} → ${path} (${Math.round(buf.length / 1024)} KB)`)
      ok += 1
    } catch (err) {
      console.log(`✗ ${label}: ${err.message}`)
      failed += 1
    }
  }
  console.log(`\n--- Done --- ✓ ${ok}  ✗ ${failed}`)
}

async function main() {
  if (hasFlag('list')) return listStories()
  const applyFile = arg('apply', null)
  if (applyFile) return applyManifest(applyFile)
  console.error('Specify a mode: --list [--language --system --level]  OR  --apply <manifest.json>')
  process.exit(1)
}

main().catch(err => { console.error(err); process.exit(1) })
