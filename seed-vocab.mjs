import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// Seed a level's vocabulary from a JSON word list. This is the reusable content
// on-ramp: give it a frequency-ordered list of words and it inserts vocabulary
// rows with the project's conventions (sort_order = list order, derived
// reading_plain, audio_path = <lang>/<system>/level_<n>/<NNN>_<reading>.mp3,
// is_active = true). Audio/examples/stories/comprehension are then filled by the
// existing generate-*.mjs scripts + the one-click Action.
//
// Input JSON: an array of { word, reading, meaning, reading_plain? }.
//   - word     : the hanzi / target-language word
//   - reading  : pinyin with tone marks (Chinese) or hiragana (Japanese)
//   - meaning  : short English gloss (clean-meanings.mjs can tidy later)
//   - reading_plain (optional): pinyin without tones; derived from reading if absent
//
// Run with:
//   node --env-file=.env.script seed-vocab.mjs --file data/hsk2.json --language chinese --system hsk_3 --level 2
//   node --env-file=.env.script seed-vocab.mjs --file data/hsk2.json --language chinese --system hsk_3 --level 2 --apply
//
// Dry-run by default (prints what it would insert). Idempotent: skips words that
// already exist at that language/system/level, so re-running never duplicates.
// Never deletes or overwrites existing rows.

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env vars. Run with: node --env-file=.env.script seed-vocab.mjs ...')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const args = process.argv.slice(2)
function arg(name, def) {
  const i = args.indexOf('--' + name)
  return i !== -1 && args[i + 1] ? args[i + 1] : def
}
const apply = args.includes('--apply')
const file = arg('file', null)
const language = arg('language', null)
const system = arg('system', null)
const level = parseInt(arg('level', ''), 10)

if (!file || !language || !system || Number.isNaN(level)) {
  console.error('Required: --file <path> --language <chinese|japanese> --system <hsk_3|jlpt> --level <n>')
  process.exit(1)
}

const TONE_MAP = {
  'ā': 'a', 'á': 'a', 'ǎ': 'a', 'à': 'a',
  'ē': 'e', 'é': 'e', 'ě': 'e', 'è': 'e',
  'ī': 'i', 'í': 'i', 'ǐ': 'i', 'ì': 'i',
  'ō': 'o', 'ó': 'o', 'ǒ': 'o', 'ò': 'o',
  'ū': 'u', 'ú': 'u', 'ǔ': 'u', 'ù': 'u',
  'ǖ': 'u', 'ǘ': 'u', 'ǚ': 'u', 'ǜ': 'u', 'ü': 'u',
}
function stripTones(reading) {
  let out = ''
  for (const ch of (reading || '')) out += (TONE_MAP[ch] || ch)
  return out.toLowerCase().split(' ').join('')
}
function pad3(n) { return String(n).padStart(3, '0') }
// ASCII-safe slug for the audio filename (falls back to the sort_order alone).
function slug(readingPlain) {
  let s = ''
  for (const ch of (readingPlain || '')) {
    if ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9')) s += ch
  }
  return s
}

async function main() {
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  if (!Array.isArray(raw) || raw.length === 0) { console.error('Input must be a non-empty JSON array.'); process.exit(1) }

  console.log(`=== Seed ${language}/${system}/level ${level} from ${file} (${raw.length} words)${apply ? '' : ' — DRY RUN'} ===`)

  // Existing words at this level, so re-runs never duplicate.
  const { data: existing, error } = await supabase
    .from('vocabulary')
    .select('word')
    .eq('language', language).eq('system', system).eq('level', level)
  if (error) { console.error('Fetch error:', error.message); process.exit(1) }
  const have = new Set((existing || []).map(v => v.word))

  const rows = []
  let skipped = 0
  raw.forEach((entry, i) => {
    const word = (entry.word || '').trim()
    const reading = (entry.reading || '').trim()
    const meaning = (entry.meaning || '').trim()
    if (!word || !reading || !meaning) { console.log(`  ! skipping malformed entry #${i + 1}`); return }
    if (have.has(word)) { skipped += 1; return }
    const sort_order = i + 1
    const reading_plain = (entry.reading_plain || '').trim() || stripTones(reading)
    const namePart = slug(reading_plain)
    const audio_path = language + '/' + system + '/level_' + level + '/' + pad3(sort_order) + (namePart ? '_' + namePart : '') + '.mp3'
    rows.push({ language, system, level, sort_order, word, reading, reading_plain, meaning, audio_path, is_active: true })
  })

  console.log(`  ${rows.length} new, ${skipped} already present.`)
  rows.slice(0, 12).forEach(r => console.log(`    ${r.sort_order}. ${r.word} · ${r.reading} — ${r.meaning}  (${r.audio_path})`))
  if (rows.length > 12) console.log(`    … and ${rows.length - 12} more`)

  if (apply && rows.length > 0) {
    // Insert in batches of 100.
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100)
      const { error: insErr } = await supabase.from('vocabulary').insert(batch)
      if (insErr) { console.error('Insert error:', insErr.message); process.exit(1) }
      console.log(`  inserted ${Math.min(i + 100, rows.length)}/${rows.length}`)
    }
  }

  console.log(`\n${apply ? 'Inserted' : 'Would insert'} ${rows.length} words.${apply ? ' Next: run generate-audio / examples / stories / comprehension.' : ' Re-run with --apply to write.'}`)
}

main().catch(err => { console.error(err); process.exit(1) })
