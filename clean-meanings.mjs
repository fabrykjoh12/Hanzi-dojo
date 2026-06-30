import { createClient } from '@supabase/supabase-js'
import { cleanMeaning } from './src/cleanMeaning.js'

// Deterministic, no-AI tidy of the vocabulary `meaning` column. Applies the same
// cleanMeaning() normalisation the app uses for display (collapse separators to
// commas, strip stray trailing periods, dedupe senses, cap to 4) directly to the
// stored data — so flashcards, the test, writing, and stories all read clean
// glosses, not just the reader/flashcard back.
//
// This is FREE and SAFE: it only reformats existing text and cannot invent or
// change a meaning's actual sense. (For semantically WRONG glosses, regenerate
// with generate-meanings.mjs instead.)
//
// Run with:
//   node --env-file=.env.script clean-meanings.mjs                 # DRY RUN, both languages
//   node --env-file=.env.script clean-meanings.mjs --japanese      # DRY RUN, Japanese only
//   node --env-file=.env.script clean-meanings.mjs --apply         # write the changes
//   node --env-file=.env.script clean-meanings.mjs --chinese --apply
//
// Default is a dry run that prints every before→after so you can review first;
// pass --apply to actually write. Only rows whose cleaned value differs are touched.

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env vars. Run with: node --env-file=.env.script clean-meanings.mjs')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const args = process.argv.slice(2)
const onlyChinese = args.includes('--chinese')
const onlyJapanese = args.includes('--japanese')
const apply = args.includes('--apply')

async function processLanguage(language, system) {
  console.log(`\n=== ${language.toUpperCase()} (${system})${apply ? '' : ' — DRY RUN'} ===`)

  const { data: vocab, error } = await supabase
    .from('vocabulary')
    .select('id, word, meaning, sort_order')
    .eq('language', language)
    .eq('system', system)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) { console.error('Fetch error:', error.message); return }
  console.log(`Found ${vocab.length} active words.`)
  if (vocab.length === 0) return

  let changed = 0
  let unchanged = 0
  let failed = 0

  for (const w of vocab) {
    const original = w.meaning || ''
    const cleaned = cleanMeaning(original)

    // Never blank out a non-empty meaning, and skip no-ops.
    if (!cleaned || cleaned === original) { unchanged += 1; continue }

    changed += 1
    console.log(`  ${w.word}: "${original}" → "${cleaned}"`)

    if (apply) {
      const { error: upErr } = await supabase
        .from('vocabulary')
        .update({ meaning: cleaned })
        .eq('id', w.id)
      if (upErr) { failed += 1; console.log(`    ✗ ${upErr.message}`) }
    }
  }

  console.log(`\n${language}: ${changed} ${apply ? 'updated' : 'would change'}, ${unchanged} already clean${failed ? `, ${failed} failed` : ''}`)
}

async function main() {
  if (!onlyJapanese) await processLanguage('chinese', 'hsk_3')
  if (!onlyChinese) await processLanguage('japanese', 'jlpt')
  console.log(`\nAll done.${apply ? '' : ' (dry run — nothing written; re-run with --apply to save)'}`)
}

main().catch(err => { console.error(err); process.exit(1) })
