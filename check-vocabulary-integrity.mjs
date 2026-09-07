// Vocabulary-integrity gate (FAB-36, 2026-09-07).
//
// FAB-36 asks for "automated dataset checks [that] catch empty fields,
// duplicate identity collisions and broken references". This is that gate. The
// audit behind it found a corpus that is clean at HSK 1–2 and broken above it,
// so the checks come in two tiers and the tier is a statement of fact, not
// taste:
//
//   HARD        — zero violations in production today. One is a regression.
//   DIRECTIONAL — real debt today, counted and committed to a baseline.
//                 Shrinking is free; growing fails.
//
// Same shape as check-content-integrity.mjs, for the same reason: a gate nobody
// can pass gets switched off, and a gate that rewrites its own expectations
// checks nothing.
//
//   node --env-file=.env.script check-vocabulary-integrity.mjs
//   node --env-file=.env.script check-vocabulary-integrity.mjs --update-baseline
//
// --update-baseline is the explicit, reviewed action that accepts new debt. CI
// never passes it.
//
// Read-only against the database and storage. Nothing is written, staged or
// repaired — the repairs are migrations and generation runs of their own.

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { runChecks, emptyInputs, baselineWriteRefusal, baselineFrom, compareToBaseline, formatComparison, BaselineContractError } from './vocabularyIntegrity.mjs'

const args = process.argv.slice(2)
const update = args.includes('--update-baseline')
const json = args.includes('--json')
const BASELINE = 'data/vocabulary-integrity-baseline.json'

// The learner-facing corpus. Chinese hsk_3 is the product (CLAUDE.md §1); the
// frozen tracks are not measured here and are not this gate's business.
const LANGUAGE = 'chinese'
const SYSTEM = 'hsk_3'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required (use --env-file=.env.script).')
  process.exit(2)
}
const supabase = createClient(url, key, { auth: { persistSession: false } })

// Ordered, deliberately. PostgREST gives no stable ordering for an unordered
// .range() scan, so pages can overlap or skip — and both failure modes are
// silent here: an overlap feeds duplicate rows into the duplicate-word HARD
// check and fails the run for everybody, a skip shrinks a directional count and
// passes. `id` is the primary key, so the order is total.
async function fetchAll(table, select, apply) {
  const out = []
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select(select).order('id', { ascending: true }).range(from, from + 999)
    if (apply) q = apply(q)
    const { data, error } = await q
    if (error) { console.error(table + ': ' + error.message); process.exit(2) }
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

// THE CORPUS IS THE CURRICULUM, and the split below is the reason.
//
// `vocabulary` is not a curated table. dict_add_to_deck (20260719130000)
// inserts a row for any dictionary word a learner saves — `level null,
// sort_order 0`, no audio_path, a meaning that falls back to the headword when
// CC-CEDICT has no definition — and three shipped screens call it (Dictionary,
// the story reader, the reader core). Measured 2026-09-07: all three level-null
// rows in this corpus are that shape.
//
// Measuring those rows as curriculum debt would make the gate wrong in both
// tiers. A learner saving one word would GROW `no-audio` and red the run, with
// the documented remedy being to accept a new baseline — a gate that goes red
// on ordinary use is a gate that gets switched off. And a CC-CEDICT entry with
// no definition would fire the HARD `placeholder-meaning` check with no defect
// anywhere for anyone to fix.
//
// So every content check measures rows WITH a level, and the level-null rows
// get one check of their own: that they are the shape a dictionary save has.
// That is what keeps a curriculum row which lost its level from silently
// dropping out of the corpus instead of being reported.
const allActive = await fetchAll('vocabulary', 'id, word, reading, reading_plain, meaning, level, sort_order, audio_path',
  q => q.eq('language', LANGUAGE).eq('system', SYSTEM).eq('is_active', true))
const vocabulary = allActive.filter(row => row.level != null)
const learnerAdded = allActive.filter(row => row.level == null)

// A checker that fetched nothing would report every check clean. That is the
// exact failure these checks exist to catch, so it is a hard stop rather than a
// green run. Checked here as well as through emptyInputs below, because the
// three fetches after this one are pointless without a corpus.
if (vocabulary.length === 0) {
  console.error('No ' + LANGUAGE + '/' + SYSTEM + ' curriculum vocabulary came back. Refusing to report on an empty corpus.')
  process.exit(2)
}

const cards = await fetchAll('cards', 'id, vocab_id')
// EVERY vocabulary id, not just this corpus's: a card belongs to whichever
// language its learner is on, and only a card pointing at no row at all is an
// orphan. Deactivated rows count as existing — §7.1 deactivates instead of
// deleting so that the cards pointing at them keep working.
const vocabularyIds = new Set((await fetchAll('vocabulary', 'id')).map(row => row.id))
const ttsAudio = await fetchAll('tts_audio', 'id, source_type, source_id, status, storage_path',
  q => q.eq('source_type', 'vocabulary'))

// Which clips actually EXIST. audio_path is filled in at seed time for every
// row, so a non-null path proves an intention, not a file — the whole point of
// the no-audio count is the gap between those two. Listing is bounded to the
// prefixes the corpus itself uses.
async function listAudioObjects(rows) {
  const prefixes = new Set()
  for (const row of rows) {
    const path = String(row.audio_path || '')
    const cut = path.lastIndexOf('/')
    if (cut > 0) prefixes.add(path.slice(0, cut))
  }
  const found = new Set()
  for (const prefix of prefixes) {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.storage.from('audio')
        .list(prefix, { limit: 1000, offset })
      if (error) { console.error('storage ' + prefix + ': ' + error.message); process.exit(2) }
      for (const obj of data || []) found.add(prefix + '/' + obj.name)
      if (!data || data.length < 1000) break
    }
  }
  return found
}
const audioObjects = await listAudioObjects(vocabulary)

// Every check whose input is missing returns no violations rather than
// pretending to have looked — which is right for the module and wrong for a
// run, because a fetch that came back empty for the wrong reason would report
// those checks clean. emptyInputs is a pure function so a spec can drive it
// rather than grep this file for the words below.
const empty = emptyInputs({ vocabulary, vocabularyIds, cards, ttsAudio, audioObjects })
if (empty.length) {
  console.error('No ' + empty.join(', no ') + ' came back. Refusing to report on a partial fetch —'
    + ' the checks that read it would report clean without having looked.')
  process.exit(2)
}

const result = runChecks({ vocabulary, learnerAdded, vocabularyIds, cards, ttsAudio, audioObjects })

console.log('CORPUS   ' + vocabulary.length + ' curriculum ' + LANGUAGE + '/' + SYSTEM + ' rows ('
  + learnerAdded.length + ' more saved from the dictionary, measured separately) of '
  + vocabularyIds.size + ' vocabulary rows in all · ' + cards.length + ' cards · ' + ttsAudio.length
  + ' vocabulary tts_audio rows · ' + audioObjects.size + ' stored clips\n')

if (update) {
  // The decision is baselineWriteRefusal's, so a spec can drive it rather than
  // grep this file. Refusing keeps the committed baseline meaningful: its
  // existence says the hard tier was clean when it was generated.
  const refusal = baselineWriteRefusal(result)
  if (refusal) {
    console.error(formatComparison({ hardFailures: refusal.hardFailures, rows: [] }))
    console.error('\nRefusing to write ' + BASELINE + ' — ' + refusal.reason)
    process.exit(1)
  }
  writeFileSync(BASELINE, JSON.stringify(baselineFrom(result), null, 1) + '\n')
  console.log('wrote ' + BASELINE + ' — this ACCEPTS the counts above. Say why in the commit message.')
  process.exit(0)
}

if (!existsSync(BASELINE)) {
  console.error('No baseline at ' + BASELINE + '. Create it once with --update-baseline.')
  process.exit(2)
}
// Fail closed on an unusable baseline. It is data written by another run of
// this checker, so its contract string is a schema handshake: comparing @2
// counts against an @1 file would produce a confident verdict from two
// different definitions of the same check name.
let baseline
try {
  baseline = JSON.parse(readFileSync(BASELINE, 'utf8'))
} catch (err) {
  console.error('BASELINE UNUSABLE — ' + BASELINE + ' is not valid JSON: ' + err.message)
  process.exit(2)
}

let cmp
try {
  cmp = compareToBaseline(result, baseline)
} catch (err) {
  if (!(err instanceof BaselineContractError)) throw err
  console.error('BASELINE CONTRACT MISMATCH — ' + err.message)
  console.error('Refusing to compare: the counts would be read under semantics that did not write them.')
  process.exit(2)
}

console.log(formatComparison(cmp))
if (json) console.log(JSON.stringify({ result, comparison: cmp }, null, 1))
console.log('\n' + (cmp.ok ? 'vocabulary integrity: clean against the baseline.'
  : 'vocabulary integrity: FAILED — see above.'))
process.exit(cmp.ok ? 0 : 1)
