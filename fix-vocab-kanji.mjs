import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// Correct JLPT N5 vocabulary rows whose `word` (hanzi) field was seeded in kana
// but has a standard kanji form (e.g. きょねん → 去年). Reading is unchanged (it
// already holds the kana), so audio_path (derived from reading) is unaffected and
// furigana renders the reading over the new kanji automatically.
//
// For each correction it: (1) updates `word`, and (2) patches `example_sentence`
// to use the kanji where the exact kana form appears (so the sentence's word
// highlight still matches). Homophones (same kana, different kanji) are resolved
// by keyword-matching each row's `meaning`; if no rule matches, the row is SKIPPED
// and logged — the script never guesses.
//
// Source of truth for the corrections: data/jlpt-n5-kanji-corrections.json
//
// Run with:
//   node --env-file=.env.script fix-vocab-kanji.mjs                 # dry-run (prints every change)
//   node --env-file=.env.script fix-vocab-kanji.mjs --apply         # write to Supabase
//
// Dry-run by default. Idempotent: a row whose `word` is already the kanji is
// skipped. Only touches language='japanese', system='jlpt' rows.

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env vars. Run with: node --env-file=.env.script fix-vocab-kanji.mjs')
  process.exit(1)
}
const apply = process.argv.slice(2).includes('--apply')
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const corrections = JSON.parse(readFileSync(new URL('./data/jlpt-n5-kanji-corrections.json', import.meta.url), 'utf8'))

// Build a kana -> resolver map. A resolver takes the row's meaning and returns
// the kanji to use, or null to skip.
const resolvers = new Map()
for (const c of corrections.apply) {
  resolvers.set(c.kana, () => c.kanji)
}
for (const h of corrections.homophones) {
  resolvers.set(h.kana, (meaning) => {
    const m = (meaning || '').toLowerCase()
    // Resolve ONLY when exactly one reading's keywords match. A row whose
    // meaning matches several readings (e.g. かぜ = "wind, cold" hits both 風 and
    // 風邪) is genuinely ambiguous — skip it rather than guess a wrong kanji.
    const matched = [...new Set(h.rules.filter(r => r.meaningIncludes.some(k => m.includes(k))).map(r => r.kanji))]
    return matched.length === 1 ? matched[0] : null
  })
}

function hasKanji(s) { return /[㐀-鿿]/.test(s || '') }

async function main() {
  const kanaWords = [...resolvers.keys()]
  const { data: rows, error } = await supabase
    .from('vocabulary')
    .select('id, word, reading, meaning, example_sentence')
    .eq('language', 'japanese')
    .eq('system', 'jlpt')
    .in('word', kanaWords)
  if (error) { console.error('Query failed:', error.message); process.exit(1) }

  console.log(`Matched ${rows.length} vocabulary row(s) with a kana word in the correction set.\n`)

  let willFix = 0, skipped = 0, sentencePatched = 0
  const updates = []
  for (const row of rows) {
    if (hasKanji(row.word)) { continue } // already corrected — idempotent
    const kanji = resolvers.get(row.word)(row.meaning)
    if (!kanji) {
      skipped += 1
      console.log(`  SKIP  ${row.word} [id=${row.id}] — meaning "${row.meaning}" · example: ${row.example_sentence || '(none)'}`)
      continue
    }
    const patch = { word: kanji }
    let sentenceNote = ''
    if (row.example_sentence && row.example_sentence.includes(row.word)) {
      patch.example_sentence = row.example_sentence.split(row.word).join(kanji)
      sentenceNote = '  + example patched'
      sentencePatched += 1
    } else if (row.example_sentence) {
      sentenceNote = `  (example unchanged — "${row.word}" not found verbatim; review: ${row.example_sentence})`
    }
    willFix += 1
    updates.push({ id: row.id, patch })
    console.log(`  FIX   ${row.word} → ${kanji}  (${row.meaning})${sentenceNote}`)
  }

  console.log(`\n${willFix} to fix · ${sentencePatched} example sentences patched · ${skipped} skipped (manual).`)
  const missing = kanaWords.filter(k => !rows.some(r => r.word === k))
  if (missing.length) console.log(`Not found in DB as kana (already fixed or absent): ${missing.join(' ')}`)

  if (!apply) { console.log('\nDry-run. Re-run with --apply to write.'); return }
  for (const u of updates) {
    const { error: e } = await supabase.from('vocabulary').update(u.patch).eq('id', u.id)
    if (e) console.error(`  ! failed to update ${u.id}: ${e.message}`)
  }
  console.log(`\nApplied ${updates.length} update(s).`)
}

main()
