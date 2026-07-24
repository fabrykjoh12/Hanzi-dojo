// Normalize Chinese vocabulary.reading to the joined (space-free) pinyin style,
// so TTS pronunciation pinning actually happens.
//
// THE BUG: generate-audio.mjs pins a Chinese word's pronunciation with
// chinesePhonemeSsml(word, reading) → readingToPhonemes(reading). That parser
// returns null for ANY reading containing a space, and chinesePhonemeSsml then
// silently falls back to bare hanzi with no phoneme hint at all — exactly where
// polyphones (长 cháng/zhǎng, 行 xíng/háng, 觉 jué/jiào …) go wrong. HSK 1-2 was
// seeded with joined readings ("xièxie", "yíxià") so it pins; HSK 3-6 was bulk
// generated with SPACE-SEPARATED readings ("jiù shì", "bù bì"), so pinning is
// off for most of that band. Nothing errors — the voice just guesses.
//
// THE FIX: strip the spaces between the syllables (tone marks, ü and any
// apostrophe are preserved exactly), and — before writing anything — prove the
// joined form is actually usable: readingToPhonemes must parse it AND produce
// one syllable per Han character in the word. A row that fails is SKIPPED and
// reported, never written.
//
// Dry-run by default; --apply writes.
//   node --env-file=.env.script normalize-readings.mjs                          # dry run, chinese/hsk_3 levels 3-6
//   node --env-file=.env.script normalize-readings.mjs --apply
//   node --env-file=.env.script normalize-readings.mjs --levels 3-4 --apply
//   node --env-file=.env.script normalize-readings.mjs --language chinese --system hsk_3 --levels 3-6
//
// Idempotent: a row whose reading has no spaces is already correct and is left
// alone, so re-running is a no-op.
import { pathToFileURL } from 'node:url'
import { readingToPhonemes } from './src/pinyin.js'

// --- pure helpers (unit-tested in src/normalizeReadings.test.js) -------------

// Whitespace this joiner removes. Kept as an explicit list (no regex) so a
// non-breaking space pasted in from a source sheet is handled too.
const WHITESPACE = [' ', '\t', '\n', '\r', '\u00a0', '\u3000']

// Join a space-separated pinyin reading into the single-token form
// readingToPhonemes can parse ("jiù shì" → "jiùshì"). Everything that is not
// whitespace survives untouched — tone marks, ü, and the syllable-boundary
// apostrophe of "xī'ān". Returns '' for non-string input.
export function joinReading(reading) {
  if (!reading || typeof reading !== 'string') return ''
  let out = ''
  for (const ch of reading) {
    if (WHITESPACE.includes(ch)) continue
    out += ch
  }
  return out
}

// Han (CJK ideograph) code-point ranges — the characters that each get exactly
// one pinyin syllable. Latin letters, digits and punctuation in a `word` are
// deliberately NOT counted.
const HAN_RANGES = [
  [0x3400, 0x4dbf],   // Ext A
  [0x4e00, 0x9fff],   // URO
  [0xf900, 0xfaff],   // Compatibility ideographs
  [0x20000, 0x2a6df], // Ext B
  [0x2a700, 0x2ebef], // Ext C-F
]

// How many Han characters `word` contains (surrogate-pair safe).
export function hanCount(word) {
  if (!word || typeof word !== 'string') return 0
  let n = 0
  for (const ch of word) {
    const cp = ch.codePointAt(0)
    if (HAN_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi)) n += 1
  }
  return n
}

// Prove a proposed joined reading is safe to store: it must convert to phonemes
// at all, and produce exactly one syllable per Han character of the word (which
// catches a mis-segmented join, a dropped syllable, or a reading that belongs to
// a different word). Returns { ok, reason, phonemes, syllables, hanzi }.
export function validateJoined(word, joined) {
  const phonemes = readingToPhonemes(joined)
  if (!phonemes) {
    return { ok: false, reason: 'unparseable pinyin', phonemes: null, syllables: 0, hanzi: hanCount(word) }
  }
  const syllables = phonemes.split(' ').length
  const hanzi = hanCount(word)
  if (hanzi === 0) {
    return { ok: false, reason: 'no Han characters in word', phonemes, syllables, hanzi }
  }
  if (syllables !== hanzi) {
    return { ok: false, reason: `${syllables} syllable(s) for ${hanzi} character(s)`, phonemes, syllables, hanzi }
  }
  return { ok: true, reason: null, phonemes, syllables, hanzi }
}

// Classify one vocabulary row: 'already-joined' | 'change' | 'invalid'.
export function planRow(row) {
  const reading = row.reading || ''
  const joined = joinReading(reading)
  if (!joined) return { action: 'invalid', joined, reason: 'empty reading' }
  if (joined === reading) return { action: 'already-joined', joined, reason: null }
  const check = validateJoined(row.word, joined)
  if (!check.ok) return { action: 'invalid', joined, reason: check.reason }
  return { action: 'change', joined, reason: null, phonemes: check.phonemes }
}

// --- CLI (runs only when this file is executed directly) --------------------

async function main() {
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing env vars. Run with: node --env-file=.env.script normalize-readings.mjs [--apply]')
    process.exit(1)
  }

  const args = process.argv.slice(2)
  function arg(name, def) {
    const i = args.indexOf('--' + name)
    return i !== -1 && args[i + 1] ? args[i + 1] : def
  }
  const apply = args.includes('--apply')
  const language = arg('language', 'chinese')
  const system = arg('system', 'hsk_3')
  const [loStr, hiStr] = arg('levels', '3-6').split('-')
  const lo = parseInt(loStr, 10)
  const hi = parseInt(hiStr || loStr, 10)
  if (!Number.isInteger(lo) || !Number.isInteger(hi)) {
    console.error('Bad --levels (expected e.g. "3-6" or "4")')
    process.exit(1)
  }

  // Imported here, not at module scope, so the pure helpers above can be unit
  // tested without pulling in the Supabase client.
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // PostgREST caps a single response (default 1000 rows), so page through the
  // whole band — HSK 3-6 alone is well over that.
  const PAGE = 1000
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('vocabulary')
      .select('id, word, reading, level')
      .eq('language', language).eq('system', system)
      .eq('is_active', true)
      .gte('level', lo).lte('level', hi)
      .order('level', { ascending: true }).order('sort_order', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) { console.error('Fetch error:', error.message); process.exit(1) }
    rows.push(...(data || []))
    if (!data || data.length < PAGE) break
  }

  console.log(`\n=== ${language}/${system} levels ${lo}-${hi}${apply ? '' : ' — DRY RUN'} ===`)
  console.log(`Scanned ${rows.length} active rows.\n`)

  const changes = []
  const invalid = []
  let alreadyJoined = 0
  for (const row of rows) {
    const plan = planRow(row)
    if (plan.action === 'already-joined') { alreadyJoined += 1; continue }
    if (plan.action === 'invalid') { invalid.push({ row, reason: plan.reason }); continue }
    changes.push({ row, joined: plan.joined, phonemes: plan.phonemes })
  }

  for (const c of changes) {
    console.log(`  L${c.row.level} ${c.row.word}: "${c.row.reading}" → "${c.joined}"  [${c.phonemes}]`)
  }

  let written = 0
  let failed = 0
  if (apply) {
    console.log('')
    for (const c of changes) {
      const { error } = await supabase
        .from('vocabulary')
        .update({ reading: c.joined })
        .eq('id', c.row.id)
      if (error) { failed += 1; console.log(`  ✗ ${c.row.word}: ${error.message}`) }
      else written += 1
    }
  }

  console.log('\n--- Summary ---')
  console.log(`  scanned:                    ${rows.length}`)
  console.log(`  ${apply ? 'changed:                   ' : 'would change:              '} ${changes.length}`)
  console.log(`  skipped (already joined):   ${alreadyJoined}`)
  console.log(`  skipped (failed validation):${invalid.length}`)
  if (apply) {
    console.log(`  rows written:               ${written}`)
    if (failed) console.log(`  write failures:             ${failed}`)
  }
  if (invalid.length > 0) {
    console.log('\nSkipped — NOT written (reading left exactly as-is):')
    for (const s of invalid) {
      console.log(`  L${s.row.level} ${s.row.word} ("${s.row.reading}"): ${s.reason}`)
    }
  }
  console.log(apply ? '\nDone.' : '\nDry run — nothing written; re-run with --apply to save.')
}

// Only run the CLI when executed directly (`node normalize-readings.mjs`), so
// importing the pure helpers in a test has no side effects.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  main().catch(err => { console.error(err); process.exit(1) })
}
