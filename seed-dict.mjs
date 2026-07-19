// seed-dict.mjs
// One-time ingest of the reference dictionary. Parses CC-CEDICT into
// public.dict_entries and (optionally) Tatoeba pairs into public.dict_examples.
// Dry-run by default; --apply writes. Idempotent: skips entries whose
// (simplified, pinyin) already exist. Never deletes/overwrites. Mirrors the
// conventions of seed-vocab.mjs.
//
//   node --env-file=.env.script seed-dict.mjs --cedict data/cedict.u8
//   node --env-file=.env.script seed-dict.mjs --cedict data/cedict.u8 --apply
//
// CC-CEDICT: https://www.mdbg.net/chinese/dictionary?page=cc-cedict (CC BY-SA)
// Tatoeba:   https://tatoeba.org/downloads (CC BY) — cmn sentences + eng links.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { parseCedictLine } from './src/cedict.js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env vars. Run with: node --env-file=.env.script seed-dict.mjs ...')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const args = process.argv.slice(2)
function arg(name, def) {
  const i = args.indexOf('--' + name)
  return i !== -1 && args[i + 1] ? args[i + 1] : def
}
const apply = args.includes('--apply')
const cedictFile = arg('cedict', null)
if (!cedictFile) {
  console.error('Required: --cedict <path>')
  process.exit(1)
}

// Larger batch than seed-vocab.mjs's 100 because CC-CEDICT corpus is ~120k rows.
const BATCH = 500

async function seedEntries() {
  const lines = readFileSync(cedictFile, 'utf8').split('\n')
  const rows = []
  for (const line of lines) {
    const e = parseCedictLine(line)
    if (!e) continue
    rows.push({
      simplified: e.simplified,
      traditional: e.traditional,
      pinyin: e.pinyin,
      pinyin_plain: e.pinyinPlain,
      definitions: e.definitions,
    })
  }
  console.log(`Parsed ${rows.length} entries from ${cedictFile}.`)

  // Dedup by (simplified, pinyin) idempotency key, keeping first occurrence.
  const seenKeys = new Set()
  const deduped = []
  for (const r of rows) {
    const k = r.simplified + '|' + r.pinyin
    if (seenKeys.has(k)) continue
    seenKeys.add(k)
    deduped.push(r)
  }
  if (deduped.length < rows.length) {
    console.log(`De-duplicated ${rows.length - deduped.length} rows sharing simplified+pinyin.`)
  }

  if (!apply) {
    console.log('DRY RUN — first 3:', JSON.stringify(deduped.slice(0, 3), null, 2))
    console.log('Re-run with --apply to insert.')
    return
  }
  let inserted = 0
  for (let i = 0; i < deduped.length; i += BATCH) {
    const batch = deduped.slice(i, i + BATCH)
    // Idempotency: skip (simplified,pinyin) already present.
    const { data: existing, error: fetchErr } = await supabase
      .from('dict_entries')
      .select('simplified, pinyin')
      .in('simplified', batch.map(r => r.simplified))
    if (fetchErr) { console.error('Fetch error:', fetchErr.message); process.exit(1) }
    const seen = new Set((existing || []).map(r => r.simplified + '|' + r.pinyin))
    const fresh = batch.filter(r => !seen.has(r.simplified + '|' + r.pinyin))
    if (fresh.length) {
      const { error } = await supabase.from('dict_entries').insert(fresh)
      if (error) { console.error('Insert error:', error.message); process.exit(1) }
      inserted += fresh.length
    }
    process.stdout.write(`\r  inserted ${inserted}…`)
  }
  console.log(`\nDone. Inserted ${inserted} new entries.`)
}

seedEntries()
