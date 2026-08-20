// Corpus calibration runner — the fetch-and-print wrapper around
// storyCorpusCalibration.mjs (pure). Measurement only, changes nothing.
//
//   node --env-file=.env.script calibrate-story-defaults.mjs             # live DB
//   node calibrate-story-defaults.mjs --input reports/story-corpus-dump.json
//   ... --out <path>   full per-story JSON (default reports/story-calibration.json)
//
// The COMPACT summary (per-level distributions, similarity distribution,
// proposed provisional defaults) is committed to
// docs/audits/story-defaults-calibration.json — it is the evidence behind the
// manifest defaults in storyManifestPlanner.mjs, refreshed only deliberately.
//
// `--input` takes the same { stories, vocab } shape as audit-story-coverage.mjs.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { calibrateCorpus, proposeDefaults } from './storyCorpusCalibration.mjs'
import { publishedChineseStories } from './storyCoverage.mjs'

const arg = (name) => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : null
}
const inputPath = arg('--input')
const outPath = arg('--out') || 'reports/story-calibration.json'
const SUMMARY_PATH = 'docs/audits/story-defaults-calibration.json'

async function fetchLive() {
  const { createClient } = await import('@supabase/supabase-js')
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    console.error('Missing env vars. Run with: node --env-file=.env.script calibrate-story-defaults.mjs (or pass --input <dump.json>)')
    process.exit(1)
  }
  const supabase = createClient(url, key)
  const pages = async (build, label) => {
    const rows = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await build().range(from, from + 999)
      if (error) { console.error(label + ' query failed:', error.message); process.exit(1) }
      rows.push(...(data || []))
      if (!data || data.length < 1000) return rows
    }
  }
  const stories = await pages(() => supabase
    .from('stories')
    .select('id, title, level, language, is_published, presentation, content')
    .eq('language', 'chinese').eq('is_published', true)
    .order('level').order('story_number'), 'Stories')
  const vocab = await pages(() => supabase
    .from('vocabulary')
    .select('id, word, level, sort_order')
    .eq('language', 'chinese').eq('system', 'hsk_3').eq('is_active', true)
    .order('level').order('sort_order'), 'Vocabulary')
  return { stories, vocab }
}

const raw = inputPath
  ? JSON.parse(readFileSync(inputPath, 'utf8'))
  : await fetchLive()

const stories = publishedChineseStories(raw.stories)
const calibration = calibrateCorpus({ stories, vocab: raw.vocab })
const defaults = proposeDefaults(calibration)
const generatedAt = new Date().toISOString()
const engine = {
  matcher: 'src/storyReading.js — calculateStoryReadability for counts, segmentLine for unknown runs; same engine as reader, FAB-5 audit and FAB-10 validator',
  node: process.version,
  zhSegmenter: typeof Intl !== 'undefined' && Boolean(Intl.Segmenter),
}

const write = (path, content) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
  console.log('wrote ' + path)
}

write(outPath, JSON.stringify({ generatedAt, engine, defaults, ...calibration }, null, 2))

const { perStory, ...summary } = calibration
write(SUMMARY_PATH, JSON.stringify({
  purpose: 'Per-level distributions of the published Chinese story corpus, measured with the canonical matcher, plus the PROVISIONAL manifest defaults derived from them (FAB-9/FAB-10). Regenerate with: node calibrate-story-defaults.mjs --input <dump>. Refresh only deliberately — storyManifestPlanner.mjs defaults are justified by this file.',
  generatedAt,
  engine,
  defaults,
  ...summary,
}, null, 2) + '\n')

// ── Terminal summary ─────────────────────────────────────────────────────────
console.log('\nCalibration over ' + stories.length + ' published Chinese stories (paced/chat calibrated; scene/manhua excluded from distributions):')
const W = [6, 5, 12, 11, 11, 12, 12, 11, 11]
const row = (cols) => cols.map((c, i) => String(c).padStart(W[i])).join(' ')
console.log(row(['level', 'n', 'lines p25-75', 'sameLvl med', 'perWord p90', 'outLvl p75', 'out% p75', 'unk p75', 'unk% p75']))
for (const l of calibration.byLevel) {
  console.log(row([
    'HSK ' + l.level, l.calibratedOn,
    Math.round(l.lines.p25) + '-' + Math.round(l.lines.p75),
    l.sameLevelDistinct.median,
    l.sameLevelWordOccurrences.p90,
    l.outOfLevelDistinct.p75,
    (l.outOfLevelCharShare.p75 * 100).toFixed(1) + '%',
    l.unknownDistinct.p75,
    (l.unknownCharShare.p75 * 100).toFixed(1) + '%',
  ]))
}
const sim = calibration.similarity
console.log('\nPairwise similarity (char-trigram jaccard, non-manhua): p50 ' + sim.p50 + ' · p90 ' + sim.p90 + ' · p99 ' + sim.p99 + ' · max ' + sim.max)
for (const p of sim.topPairs.slice(0, 5)) {
  console.log('  ' + p.jaccard + ' (cont ' + p.containment + ')  ' + p.a + '  ~  ' + p.b)
}
const nd = defaults.nearDuplicate
console.log('Near-duplicate thresholds (provisional): warn ' + nd.warn.jaccard + '/' + nd.warn.containment
  + ' · fail ' + nd.fail.jaccard + '/' + nd.fail.containment)
console.log('\nProposed provisional defaults:')
for (const [level, d] of Object.entries(defaults.byLevel)) {
  console.log('  HSK ' + level + ': targets ' + d.targetsPerStory + ' · occ ' + d.occurrences.min + '-' + d.occurrences.max
    + ' · lines ' + d.lines[0] + '-' + d.lines[1]
    + ' · out-of-level ≤' + d.maxOutOfLevelDistinct + ' words / ' + (d.maxOutOfLevelCharShare * 100).toFixed(1) + '%'
    + ' · unknown ≤' + d.maxUnknownDistinct + ' / ' + (d.maxUnknownCharShare * 100).toFixed(1) + '%')
}
