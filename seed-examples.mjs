// One-time ingest of Tatoeba example sentences into public.dict_examples.
// Populates the "Examples" tab of the reference dictionary. Dry-run by default;
// --apply writes. Idempotent: skips (hanzi, english) pairs already present.
// Never deletes/overwrites. Mirrors seed-dict.mjs.
//
//   node --env-file=.env.script seed-examples.mjs --pairs cmn-eng-pairs.tsv
//   node --env-file=.env.script seed-examples.mjs --pairs cmn-eng-pairs.tsv --apply
//   node --env-file=.env.script seed-examples.mjs --pairs cmn-eng-pairs.tsv --limit 20000 --apply
//
// Input: the Tatoeba "Sentence pairs" export, Mandarin Chinese -> English
// (https://tatoeba.org/en/downloads). Tab-separated: <id> <cmn> <id> <eng>.
// Tatoeba data is CC BY 2.0 FR — attribution is shown in the app.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { parseTatoebaPairLine } from './src/tatoeba.js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env vars. Run with: node --env-file=.env.script seed-examples.mjs ...')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const args = process.argv.slice(2)
function arg(name, def) {
  const i = args.indexOf('--' + name)
  return i !== -1 && args[i + 1] ? args[i + 1] : def
}
const apply = args.includes('--apply')
const pairsFile = arg('pairs', null)
const limit = parseInt(arg('limit', ''), 10) // optional cap on total rows
if (!pairsFile) {
  console.error('Required: --pairs <path>')
  process.exit(1)
}

const BATCH = 500          // insert batch (POST body — no URL-length concern)
const CHECK_CHUNK = 60     // existence-check chunk: keeps the .in() URL short

async function seedExamples() {
  const lines = readFileSync(pairsFile, 'utf8').split('\n')
  const parsed = []
  for (const line of lines) {
    const p = parseTatoebaPairLine(line)
    if (p) parsed.push(p)
  }
  // In-file dedup on (hanzi, english) so one batch never inserts a pair twice.
  const seenKeys = new Set()
  let rows = []
  for (const p of parsed) {
    const k = p.hanzi + '|' + p.english
    if (seenKeys.has(k)) continue
    seenKeys.add(k)
    rows.push({ language: 'chinese', hanzi: p.hanzi, english: p.english, pinyin: null })
  }
  if (Number.isInteger(limit) && limit > 0 && rows.length > limit) {
    rows = rows.slice(0, limit)
  }
  console.log(`Parsed ${parsed.length} pairs (${rows.length} unique${Number.isInteger(limit) ? `, capped at ${limit}` : ''}) from ${pairsFile}.`)

  if (!apply) {
    console.log('DRY RUN — first 3:', JSON.stringify(rows.slice(0, 3), null, 2))
    console.log('Re-run with --apply to insert.')
    return
  }

  let inserted = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    // Idempotency: skip (hanzi, english) already present. Query the existing
    // rows in small chunks — a wide .in() of many multibyte sentences builds a
    // URL too long for the gateway (surfaces in Node as an opaque "fetch failed").
    const seen = new Set()
    for (let j = 0; j < batch.length; j += CHECK_CHUNK) {
      const slice = batch.slice(j, j + CHECK_CHUNK)
      const { data: existing, error: fetchErr } = await supabase
        .from('dict_examples')
        .select('hanzi, english')
        .in('hanzi', slice.map(r => r.hanzi))
      if (fetchErr) { console.error('Fetch error:', fetchErr.message); process.exit(1) }
      for (const r of (existing || [])) seen.add(r.hanzi + '|' + r.english)
    }
    const fresh = batch.filter(r => !seen.has(r.hanzi + '|' + r.english))
    if (fresh.length) {
      const { error } = await supabase.from('dict_examples').insert(fresh)
      if (error) { console.error('Insert error:', error.message); process.exit(1) }
      inserted += fresh.length
    }
    process.stdout.write(`\r  inserted ${inserted}…`)
  }
  console.log(`\nDone. Inserted ${inserted} new example sentences.`)
}

seedExamples()
