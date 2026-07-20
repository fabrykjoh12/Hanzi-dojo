// One-time ingest of Tatoeba example sentences into public.dict_examples.
// Populates the "Examples" tab of the reference dictionary. Dry-run by default;
// --apply writes. Insert-only bulk load (rows are de-duplicated within the file);
// to reload, TRUNCATE public.dict_examples first, else rows are duplicated.
//
//   node --env-file=.env.script seed-examples.mjs --pairs cmn-eng-pairs.tsv
//   node --env-file=.env.script seed-examples.mjs --pairs cmn-eng-pairs.tsv --apply
//   node --env-file=.env.script seed-examples.mjs --pairs cmn-eng-pairs.tsv --limit 20000 --apply
//
// Input: the Tatoeba "Sentence pairs" export, Mandarin Chinese -> English
// (https://tatoeba.org/en/downloads). Tab-separated: <id> <cmn> <id> <eng>.
// Every sentence is converted to simplified characters on ingest (opencc-js).
// Tatoeba data is CC BY 2.0 FR — attribution is shown in the app.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import * as OpenCC from 'opencc-js'
import { parseTatoebaPairLine } from './src/tatoeba.js'

// Tatoeba's Mandarin set mixes simplified and traditional characters. The app is
// simplified-first (headwords are simplified), so we normalise every sentence to
// simplified on the way in — this makes examples display in simplified AND match
// the simplified headword lookup. Already-simplified text passes through unchanged.
const toSimplified = OpenCC.Converter({ from: 't', to: 'cn' })

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
    const hanzi = toSimplified(p.hanzi)   // normalise traditional → simplified
    const k = hanzi + '|' + p.english
    if (seenKeys.has(k)) continue          // dedup AFTER conversion so trad/simp variants collapse
    seenKeys.add(k)
    rows.push({ language: 'chinese', hanzi, english: p.english, pinyin: null })
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

  // Insert-only bulk load. We deliberately do NOT pre-check for existing rows:
  // example `hanzi` are full sentences, and a wide `.in()` of them builds a URL
  // too long for the gateway (an opaque "fetch failed"). Rows are already
  // de-duplicated within this file, so a run never inserts the same pair twice.
  // To reload cleanly, TRUNCATE the table first (see the --apply note below);
  // re-running without truncating will duplicate rows.
  let inserted = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    // Retry a few times so a transient network blip doesn't abort a long load.
    let attempt = 0
    for (;;) {
      const { error } = await supabase.from('dict_examples').insert(batch)
      if (!error) break
      attempt += 1
      if (attempt >= 4) { console.error('\nInsert error:', error.message); process.exit(1) }
      await new Promise(r => setTimeout(r, 1000 * attempt))
    }
    inserted += batch.length
    process.stdout.write(`\r  inserted ${inserted}…`)
  }
  console.log(`\nDone. Inserted ${inserted} example sentences.`)
}

seedExamples()
