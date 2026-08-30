// Content-integrity gate (FAB-9, 2026-08-27).
//
// Every learner-facing Mandarin token in a published story must resolve through
// the SAME segmentation and vocabulary lookup the Reader uses, or be a
// character name the Reader's own name path recognises. Nothing else.
//
// The published corpus does not meet that today — 142 of 204 stories carry at
// least one token that does not resolve — so the check is DIRECTIONAL against a
// committed baseline: existing debt may shrink freely, new debt fails. A story
// that gets repaired passes without anyone editing the baseline.
//
//   node --env-file=.env.script check-content-integrity.mjs
//   node --env-file=.env.script check-content-integrity.mjs --update-baseline
//
// --update-baseline is the explicit, reviewed action that accepts new debt. CI
// never passes it: a check that rewrites its own expectations checks nothing.
//
// Read-only against the database. Nothing is staged, published or mutated.

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { collectDebt, compareToBaseline, formatDebtComparison, repairMatrix, reconcileInventory, BaselineVersionError } from './storyContentDebt.mjs'
import { curriculumWords, CurriculumAuthorityError, MIN_BAND } from './storyCurriculumAuthority.mjs'

const args = process.argv.slice(2)
const update = args.includes('--update-baseline')
const json = args.includes('--json')
const BASELINE = 'data/content-integrity-baseline.json'
const CURRICULUM = 'data/hsk-curriculum-bands.json'
// The bands the app actually teaches. A band-7 word is outside the course, not
// a lost row.
const MAX_LEVEL = 6

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required (use --env-file=.env.script).')
  process.exit(2)
}
const supabase = createClient(url, key, { auth: { persistSession: false } })

async function fetchAll(table, select, apply) {
  const out = []
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select(select).range(from, from + 999)
    if (apply) q = apply(q)
    const { data, error } = await q
    if (error) { console.error(table + ': ' + error.message); process.exit(2) }
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

// Bounded to the course bands the report claims to measure. The old query took
// every non-null level, so the header said "level 1-6" while the data behind it
// was "any level" — correct today only because production happens to hold no
// active Chinese 7-9 rows. Seeding one would have silently widened inventory A,
// the reconciliation and the story classification all at once.
const vocab = await fetchAll('vocabulary', 'word, level, meaning, reading',
  q => q.eq('language', 'chinese').eq('is_active', true)
    .gte('level', MIN_BAND).lte('level', MAX_LEVEL))
const stories = await fetchAll('stories', 'id, title, level, content, language, is_published',
  q => q.eq('language', 'chinese').eq('is_published', true))

const vocabMap = {}
for (const v of vocab) if (v && v.word && !vocabMap[v.word]) vocabMap[v.word] = v

// The curriculum authority. NOT the committed data/hsk<N>.json build
// artifacts: those are the OUTPUT of the build, so asking them whether a word
// should exist is circular — they cannot reveal what the build dropped, and
// hskEntryToRow drops a word entirely whenever its forms[0] is a surname or a
// "variant of" cross-reference. 船, 纸, 怕 and 关 are HSK 3 words that vanished
// exactly that way. data/hsk-curriculum-bands.json is derived from the upstream
// word list itself and is the only thing that can tell "the database lost a row
// the course teaches" from "the course never taught this word".
//
// Loaded fail-closed. `JSON.parse(...).bands || {}` degraded a malformed file
// to an empty curriculum, and an empty curriculum reclassifies every lost row
// as ordinary story debt without moving a single count — a green run asserting
// the opposite of the truth.
let curriculum
try {
  if (!existsSync(CURRICULUM)) {
    throw new CurriculumAuthorityError(CURRICULUM + ' is missing')
  }
  let doc
  try {
    doc = JSON.parse(readFileSync(CURRICULUM, 'utf8'))
  } catch (err) {
    throw new CurriculumAuthorityError(CURRICULUM + ' is not valid JSON: ' + err.message)
  }
  curriculum = curriculumWords(doc, { maxLevel: MAX_LEVEL, source: CURRICULUM })
} catch (err) {
  console.error('\nCURRICULUM AUTHORITY UNUSABLE — ' + err.message)
  console.error('Without it there is no way to tell a row the course teaches and the database lost')
  console.error('from a word the course never taught. Refusing to classify anything.')
  process.exit(2)
}

// The three inventories, named precisely and reconciled before anything is
// concluded from them.
const inv = reconcileInventory({ vocabMap, curriculum })
console.log('INVENTORY')
console.log('  learner-facing DB rows (chinese, active, level 1-' + MAX_LEVEL + ')   ' + String(inv.learnerFacingRows).padStart(6))
console.log('  intended upstream curriculum (HSK 3.0 bands 1-' + MAX_LEVEL + ')     ' + String(inv.intendedCurriculum).padStart(6))
console.log('  intended AND present                                  ' + String(inv.intendedAndPresent).padStart(6))
console.log('  MISSING curriculum rows                               ' + String(inv.missingCurriculumRows).padStart(6))
console.log('  present but not in the intended bands                 ' + String(inv.presentButNotIntended).padStart(6))
console.log('  reconciles (B=C+D and A=C+E): ' + (inv.reconciles ? 'yes' : 'NO — one inventory is miscounted'))
if (!inv.reconciles) process.exit(2)

const current = collectDebt({ stories, vocabMap, curriculum })
current.inventory = inv
console.log('\nDEBT: ' + current.occurrences + ' occurrences of ' + current.forms
  + ' distinct forms across ' + current.storiesWithDebt + ' of ' + stories.length + ' published stories\n')

console.log('class                     forms  occurrences  stories  repair')
for (const r of repairMatrix(current)) {
  console.log('  ' + r.defect.padEnd(24) + String(r.forms).padStart(5)
    + String(r.occurrences).padStart(13) + String(r.stories).padStart(9) + '   ' + r.repairability)
}

if (update) {
  writeFileSync(BASELINE, JSON.stringify(current, null, 1) + '\n')
  console.log('\nwrote ' + BASELINE + ' — this ACCEPTS the debt above. Say why in the commit message.')
  process.exit(0)
}

if (!existsSync(BASELINE)) {
  console.error('\nNo baseline at ' + BASELINE + '. Create it once with --update-baseline.')
  process.exit(2)
}
// The baseline is read fail-closed too. It is data written by another run of
// this checker, so its declared version is a schema handshake: a future
// fab9-content-debt@2 comparing itself against an @1 file would compute a
// confident verdict from two different contracts. Unparseable or of any other
// version stops the run rather than being guessed compatible.
let baseline
try {
  baseline = JSON.parse(readFileSync(BASELINE, 'utf8'))
} catch (err) {
  console.error('\nBASELINE UNUSABLE — ' + BASELINE + ' is not valid JSON: ' + err.message)
  console.error('Regenerate it deliberately with --update-baseline and review the diff.')
  process.exit(2)
}

let cmp
try {
  cmp = compareToBaseline(current, baseline, { source: BASELINE })
} catch (err) {
  if (!(err instanceof BaselineVersionError)) throw err
  console.error('\nBASELINE VERSION MISMATCH — ' + err.message)
  console.error('Refusing to compare: the entries would be read under semantics that did not write them.')
  process.exit(2)
}
console.log('')
console.log(formatDebtComparison(cmp))
if (json) console.log(JSON.stringify({ current, comparison: cmp }, null, 1))
process.exit(cmp.ok ? 0 : 1)
