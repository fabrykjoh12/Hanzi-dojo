// Backfill vocabulary example sentences for HSK 3-6 from the Tatoeba example
// bank we already loaded (public.dict_examples), for free — no LLM. For each
// word with no example yet, we take the SHORTEST Tatoeba sentence that contains
// it (shortest ≈ simplest) via the dict_examples_for RPC, and fill
// example_sentence / example_reading / example_translation. These power the
// flashcard display, fill-in-the-blank, and the sentence-builder.
//
// Dry-run by default (reports match rate + a preview); --apply writes.
//   node --env-file=.env.script backfill-examples.mjs                 # dry-run, levels 3-6
//   node --env-file=.env.script backfill-examples.mjs --apply
//   node --env-file=.env.script backfill-examples.mjs --levels 3-4 --apply
//
// Only fills rows where example_sentence IS NULL, so it never overwrites an
// existing (e.g. LLM-authored) example. Words with no Tatoeba match are left
// untouched. Idempotent: re-running only touches still-empty rows.
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env vars. Run with: node --env-file=.env.script backfill-examples.mjs ...')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const args = process.argv.slice(2)
function arg(name, def) {
  const i = args.indexOf('--' + name)
  return i !== -1 && args[i + 1] ? args[i + 1] : def
}
const apply = args.includes('--apply')
const [loStr, hiStr] = arg('levels', '3-6').split('-')
const lo = parseInt(loStr, 10)
const hi = parseInt(hiStr || loStr, 10)
const limit = parseInt(arg('limit', ''), 10)

// PostgREST caps a single response (default 1000 rows), so page through the
// full set — otherwise a level band of >1000 missing words silently truncates.
async function allWordsNeedingExamples() {
  const PAGE = 1000
  const out = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('vocabulary')
      .select('id, word')
      .eq('language', 'chinese').eq('system', 'hsk_3')
      .gte('level', lo).lte('level', hi)
      .is('example_sentence', null)
      .order('level', { ascending: true }).order('sort_order', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) { console.error('Fetch error:', error.message); process.exit(1) }
    out.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return out
}

async function main() {
  const words = await allWordsNeedingExamples()
  const targets = Number.isInteger(limit) && limit > 0 ? words.slice(0, limit) : words
  console.log(`${targets.length} HSK ${lo}-${hi} words need an example.`)

  let found = 0, updated = 0, missing = 0
  const preview = []
  for (const w of targets) {
    const { data: ex, error: rerr } = await supabase.rpc('dict_examples_for', { p_word: w.word, p_limit: 1 })
    if (rerr) { console.error('\nRPC error:', rerr.message); process.exit(1) }
    const s = (ex || [])[0]
    if (!s) { missing += 1; continue }
    found += 1
    if (preview.length < 3) preview.push({ word: w.word, example: s.hanzi, english: s.english })
    if (apply) {
      const { error: uerr } = await supabase
        .from('vocabulary')
        .update({ example_sentence: s.hanzi, example_reading: s.pinyin, example_translation: s.english })
        .eq('id', w.id)
      if (uerr) { console.error('\nUpdate error:', uerr.message); process.exit(1) }
      updated += 1
      if (updated % 100 === 0) process.stdout.write(`\r  updated ${updated}…`)
    }
  }
  console.log(`\nMatched a Tatoeba sentence for ${found}/${targets.length} words (no match: ${missing}).`)
  console.log('Preview:', JSON.stringify(preview, null, 2))
  if (!apply) console.log('DRY RUN — re-run with --apply to write.')
  else console.log(`Done. Filled ${updated} words with an example sentence.`)
}

main()
