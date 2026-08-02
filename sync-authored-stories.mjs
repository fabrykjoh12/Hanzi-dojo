import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// Update existing production rows from the cumulative authored manifest.
// Natural key: language + system + level + title. Dry-run by default.
//
//   node --env-file=.env.script sync-authored-stories.mjs data/authored-stories.json
//   node --env-file=.env.script sync-authored-stories.mjs data/authored-stories.json --apply

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const file = process.argv[2]
const apply = process.argv.includes('--apply')
if (!file || file.startsWith('--')) {
  console.error('Usage: sync-authored-stories.mjs <manifest.json> [--apply]')
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(file, 'utf8'))
if (!Array.isArray(manifest)) throw new Error('Manifest must be an array')
const supabase = createClient(url, key)

const fields = ['tier', 'tier_min_words', 'presentation', 'english_summary', 'content', 'english_content', 'interactions']
const naturalKey = row => [row.language, row.system, row.level, row.title].join('|')
const normalized = (field, value) => {
  if (field === 'presentation') return value || 'paced'
  if (field === 'interactions') return value || null
  if (field === 'english_content') return value || null
  return value
}

const { data: rows, error } = await supabase
  .from('stories')
  .select('id, language, system, level, title, tier, tier_min_words, presentation, english_summary, content, english_content, interactions, has_audio')
if (error) throw new Error(error.message)

const existing = new Map((rows || []).map(row => [naturalKey(row), row]))
let changed = 0
let missing = 0
let failed = 0

for (const authored of manifest) {
  const row = existing.get(naturalKey(authored))
  if (!row) { missing += 1; continue }
  const patch = {}
  for (const field of fields) {
    const next = normalized(field, authored[field])
    const prev = normalized(field, row[field])
    if (JSON.stringify(next) !== JSON.stringify(prev)) patch[field] = next
  }
  // Legacy line audio is keyed by line index. Edited content must never keep a
  // flag that promises those old clips are still accurate.
  if (patch.content && row.has_audio) patch.has_audio = false
  if (Object.keys(patch).length === 0) continue
  changed += 1
  console.log((apply ? 'Updating ' : 'Would update ') + authored.title + ': ' + Object.keys(patch).join(', '))
  if (!apply) continue
  const { error: updateError } = await supabase.from('stories').update(patch).eq('id', row.id)
  if (updateError) { failed += 1; console.error('  failed: ' + updateError.message) }
}

console.log(`\n${apply ? 'Updated' : 'Found'} ${changed} changed row(s); ${missing} manifest row(s) not present; ${failed} failed.`)
if (!apply) console.log('Dry run - pass --apply to write these updates.')
if (failed) process.exit(1)
