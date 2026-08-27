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
import { collectDebt, compareToBaseline, formatDebtComparison, repairMatrix } from './storyContentDebt.mjs'

const args = process.argv.slice(2)
const update = args.includes('--update-baseline')
const json = args.includes('--json')
const BASELINE = 'data/content-integrity-baseline.json'

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

const vocab = await fetchAll('vocabulary', 'word, level, meaning, reading',
  q => q.eq('language', 'chinese').eq('is_active', true).not('level', 'is', null))
const stories = await fetchAll('stories', 'id, title, level, content, language, is_published',
  q => q.eq('language', 'chinese').eq('is_published', true))

const vocabMap = {}
for (const v of vocab) if (v && v.word && !vocabMap[v.word]) vocabMap[v.word] = v

// The curriculum authority: every word the committed build artifacts list. It
// is what separates "the database lost a row the course teaches" from "the
// course never taught this word", and without it that distinction cannot be
// made at all.
const curriculum = new Set()
for (const f of ['data/hsk3.json', 'data/hsk4.json', 'data/hsk5.json', 'data/hsk6.json']) {
  if (!existsSync(f)) continue
  for (const r of JSON.parse(readFileSync(f, 'utf8'))) curriculum.add(r.word)
}
for (const f of ['data/hsk1-vocab-snapshot.json', 'data/hsk2-vocab-snapshot.json', 'data/hsk3-vocab-snapshot.json']) {
  if (!existsSync(f)) continue
  for (const r of JSON.parse(readFileSync(f, 'utf8'))) curriculum.add(Array.isArray(r) ? r[0] : r.word)
}

const current = collectDebt({ stories, vocabMap, curriculum })
console.log('corpus: ' + stories.length + ' published Chinese stories, '
  + Object.keys(vocabMap).length + ' learner-facing vocabulary rows, '
  + curriculum.size + ' words in the committed curriculum artifacts')
console.log('debt:   ' + current.occurrences + ' occurrences of ' + current.forms
  + ' distinct forms across ' + current.storiesWithDebt + ' stories\n')

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
const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'))
const cmp = compareToBaseline(current, baseline)
console.log('')
console.log(formatDebtComparison(cmp))
if (json) console.log(JSON.stringify({ current, comparison: cmp }, null, 1))
process.exit(cmp.ok ? 0 : 1)
