// Build per-level HSK 3.0 curriculum word lists (data/hsk<N>.json) from the
// complete-hsk-vocabulary dataset, ready for seed-vocab.mjs. Frequency-ordered,
// capped, and de-duplicated against words already in the deck so no word lands
// at two levels. Writes the JSON files; it never touches the DB except a single
// read to learn which words already exist.
//
//   # 1. download the dataset once (MIT-licensed):
//   #    https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/master/complete.json
//   node --env-file=.env.script build-hsk-vocab.mjs --source complete.json
//   node --env-file=.env.script build-hsk-vocab.mjs --source complete.json --cap 500 --levels 3-6
//
// Then seed each level with the existing pipeline:
//   node --env-file=.env.script seed-vocab.mjs --file data/hsk3.json --language chinese --system hsk_3 --level 3 --apply
//   ...and 4, 5, 6.
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { buildLevelRows } from './src/hskBuild.js'

const args = process.argv.slice(2)
function arg(name, def) {
  const i = args.indexOf('--' + name)
  return i !== -1 && args[i + 1] ? args[i + 1] : def
}
const source = arg('source', null)
const cap = parseInt(arg('cap', '500'), 10)
const outDir = arg('out', 'data')
const [loStr, hiStr] = arg('levels', '3-6').split('-')
const lo = parseInt(loStr, 10)
const hi = parseInt(hiStr || loStr, 10)
if (!source) {
  console.error('Required: --source <complete.json>  (see header for the download URL)')
  process.exit(1)
}

// Words already in the deck (any level) — so we never seed a duplicate at a new
// level. Optional: without Supabase env we still build, just without dedup.
async function existingWords() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    console.warn('No SUPABASE env — building WITHOUT dedup against existing words.')
    return new Set()
  }
  const supabase = createClient(url, key)
  const { data, error } = await supabase
    .from('vocabulary').select('word').eq('language', 'chinese').eq('system', 'hsk_3')
  if (error) { console.error('Fetch error:', error.message); process.exit(1) }
  return new Set((data || []).map(r => r.word))
}

async function main() {
  const dataset = JSON.parse(readFileSync(source, 'utf8'))
  console.log(`Loaded ${dataset.length} HSK entries from ${source}. Cap ${cap}/level, levels ${lo}-${hi}.`)
  const exclude = await existingWords()
  console.log(`Excluding ${exclude.size} words already in the deck.`)
  for (let level = lo; level <= hi; level += 1) {
    const rows = buildLevelRows(dataset, level, { cap, exclude })
    // Accumulate so a word can't reappear at a higher level within this run.
    for (const r of rows) exclude.add(r.word)
    const path = `${outDir}/hsk${level}.json`
    writeFileSync(path, JSON.stringify(rows, null, 2) + '\n')
    console.log(`  ${path}: ${rows.length} words (e.g. ${rows.slice(0, 3).map(r => r.word).join(' ')}…)`)
  }
  console.log('Done. Review the files, then run seed-vocab.mjs per level (see header).')
}

main()
