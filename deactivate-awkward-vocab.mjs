import { createClient } from '@supabase/supabase-js'

// Deactivate awkward vocabulary that pollutes the study modes:
//   1) Counter/suffix entries (Japanese words that start with the wave dash,
//      e.g. ～さい / ～グラム / ～たち) — they are grammar fragments, not words,
//      and produce nonsense in Fill-in-the-blank / Sentence builder / Tones.
//   2) Duplicate-reading kanji that create identical-looking options across
//      Test / Listening / Fill-in-the-blank (何 なん vs なに, 私 わたし vs わたくし):
//      keep the primary reading, deactivate the secondary one — but ONLY if the
//      word still has another active row, so a word is never fully removed.
//
// Safe & reversible: it only sets is_active=false (never deletes rows), and is a
// dry-run by default. It respects the CLAUDE.md rule "never delete vocabulary".
//
// Run with:
//   node --env-file=.env.script deactivate-awkward-vocab.mjs            # DRY RUN
//   node --env-file=.env.script deactivate-awkward-vocab.mjs --apply    # write
//
// To re-activate later: set is_active=true for the same rows in the SQL editor.

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env vars. Run with: node --env-file=.env.script deactivate-awkward-vocab.mjs')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
const apply = process.argv.slice(2).includes('--apply')

// The two wave-dash characters that mark a suffix/counter entry.
const WAVE_DASH = ['～', '〜'] // ～ (fullwidth tilde), 〜 (wave dash)
function isSuffixEntry(word) {
  const w = word || ''
  return w.length > 0 && WAVE_DASH.indexOf(w[0]) !== -1
}

// Secondary readings to deactivate (kept only if another active row survives).
const DUPLICATE_READINGS = [
  { word: '何', reading: 'なん' },
  { word: '私', reading: 'わたくし' },
]

async function main() {
  console.log(`=== Deactivate awkward vocab${apply ? '' : ' — DRY RUN'} ===`)

  const { data: vocab, error } = await supabase
    .from('vocabulary')
    .select('id, language, word, reading, meaning, is_active')
    .eq('language', 'japanese')
    .eq('is_active', true)

  if (error) { console.error('Fetch error:', error.message); process.exit(1) }

  // Count active rows per word so we never deactivate a word's only entry.
  const activeCountByWord = {}
  ;(vocab || []).forEach(v => { activeCountByWord[v.word] = (activeCountByWord[v.word] || 0) + 1 })

  const toDeactivate = []

  for (const v of vocab || []) {
    if (isSuffixEntry(v.word)) {
      toDeactivate.push({ v, why: 'counter/suffix' })
      continue
    }
    const dup = DUPLICATE_READINGS.find(d => d.word === v.word && d.reading === v.reading)
    if (dup) {
      if ((activeCountByWord[v.word] || 0) > 1) toDeactivate.push({ v, why: 'duplicate reading' })
      else console.log(`  skip ${v.word} (${v.reading}) — it is the only active entry, keeping it`)
    }
  }

  if (toDeactivate.length === 0) {
    console.log('Nothing to deactivate. (Already clean.)')
    return
  }

  for (const { v, why } of toDeactivate) {
    console.log(`  ${v.word} · ${v.reading} — ${why}  [${v.meaning}]`)
    if (apply) {
      const { error: upErr } = await supabase.from('vocabulary').update({ is_active: false }).eq('id', v.id)
      if (upErr) console.log(`    ✗ ${upErr.message}`)
    }
  }

  console.log(`\n${apply ? 'Deactivated' : 'Would deactivate'} ${toDeactivate.length} row(s).${apply ? '' : ' Re-run with --apply to write.'}`)
}

main().catch(err => { console.error(err); process.exit(1) })
