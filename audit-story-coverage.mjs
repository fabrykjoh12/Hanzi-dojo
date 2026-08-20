// Story corpus vocabulary coverage audit — the fetch-and-print wrapper around
// storyCoverage.mjs (pure) — measurement only, changes nothing.
//
//   node --env-file=.env.script audit-story-coverage.mjs                # live DB
//   node audit-story-coverage.mjs --input dump.json                    # pre-fetched rows
//   ... --baseline      also refresh docs/audits/story-coverage-baseline.json
//   ... --csv <path>    also write a flat per-word CSV
//   ... --out <path>    full JSON location (default reports/story-coverage.json)
//
// The full per-word report lands in reports/ (gitignored — regenerate, don't
// commit). The COMPACT baseline is committed on purpose via --baseline: it is
// the before-picture later story-generation work (FAB-8/FAB-9) gets measured
// against, so only refresh it when you mean to move the baseline.
//
// `--input` expects { stories: [...], vocab: [...] } with the same columns the
// live queries select. It exists so a run is reproducible from a saved dump
// and so sandboxes without .env.script can still execute the audit.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  publishedChineseStories,
  buildCoverageReport,
} from './storyCoverage.mjs'

const arg = (name) => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : null
}
const has = (name) => process.argv.includes(name)

const inputPath = arg('--input')
const outPath = arg('--out') || 'reports/story-coverage.json'
const csvPath = arg('--csv')
const writeBaseline = has('--baseline')
const BASELINE_PATH = 'docs/audits/story-coverage-baseline.json'

async function fetchLive() {
  const { createClient } = await import('@supabase/supabase-js')
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    console.error('Missing env vars. Run with: node --env-file=.env.script audit-story-coverage.mjs (or pass --input <dump.json>)')
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
    .select('id, title, level, language, is_published, content')
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
const report = buildCoverageReport({ stories, vocab: raw.vocab })
const generatedAt = new Date().toISOString()
const engine = {
  matcher: 'src/storyReading.js calculateStoryReadability — greedy longest-match, zh atomic spans, speaker labels stripped, proper names excluded',
  node: process.version,
  zhSegmenter: typeof Intl !== 'undefined' && Boolean(Intl.Segmenter),
  classification: 'availableByLevel unique-story buckets: zero=0, single=1, weak=2–4, well=5+',
}

const write = (path, content) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
  console.log('wrote ' + path)
}

write(outPath, JSON.stringify({ generatedAt, engine, ...report }, null, 2))

if (csvPath) {
  const esc = (s) => '"' + String(s).replaceAll('"', '""') + '"'
  const lines = ['id,word,level,same_level_stories,same_level_occurrences,available_stories,available_occurrences,all_stories,all_occurrences,classification,level_dist']
  for (const w of report.words) {
    lines.push([
      w.id, esc(w.word), w.level,
      w.sameLevel.stories, w.sameLevel.occurrences,
      w.availableByLevel.stories, w.availableByLevel.occurrences,
      w.all.stories, w.all.occurrences,
      w.classification, esc(JSON.stringify(w.levelDist)),
    ].join(','))
  }
  write(csvPath, lines.join('\n') + '\n')
}

if (writeBaseline) {
  const { words, ...compact } = report
  write(BASELINE_PATH, JSON.stringify({
    purpose: 'Story corpus vocabulary coverage BASELINE, taken before any deliberate coverage work (FAB-8/FAB-9). Regenerate with: npm run audit:stories -- --baseline',
    generatedAt,
    engine,
    ...compact,
  }, null, 2) + '\n')
}

// ── Terminal summary ─────────────────────────────────────────────────────────
const fmtRow = (cols, widths) => cols.map((c, i) => String(c).padStart(widths[i])).join('  ')
const W = [6, 6, 8, 6, 6, 6, 6, 7, 7, 7]

console.log('\nStory corpus coverage — ' + report.corpus.publishedStories + ' published Chinese stories, '
  + report.corpus.vocabItems + ' active vocabulary items')
if (report.corpus.duplicateWords.length) {
  console.log('⚠ duplicate vocabulary words: ' + report.corpus.duplicateWords.join(' '))
}
console.log('\nAvailable-by-level exposure (unique stories with level <= word level):')
console.log(fmtRow(['level', 'words', 'stories', '0', '1', '2–4', '5+', '%0', 'mean', 'median'], W))
for (const l of report.byVocabLevel) {
  const a = l.availableByLevel
  console.log(fmtRow([
    'HSK ' + l.vocabLevel, l.totalItems, l.storiesAvailable,
    a.zero, a.single, a.weak, a.well, a.pctZero + '%', a.mean, a.median,
  ], W))
}
for (const key of ['hsk1to6', 'hsk7to9']) {
  const b = report.bands[key]
  const a = b.availableByLevel
  console.log(fmtRow([
    b.name, b.totalItems, '', a.zero, a.single, a.weak, a.well, a.pctZero + '%', a.mean, a.median,
  ], W) + (b.noStoryCorpus ? '   (no story corpus at these levels yet)' : ''))
}
const c6 = report.bands.hsk1to6
console.log('\nHSK 1–6 headline: ' + c6.availableByLevel.pctZero + '% of words have ZERO available-by-level story exposure, '
  + c6.availableByLevel.pctSingle + '% exactly one story.')
console.log('Corpus-wide (any level) for the same words: ' + c6.all.pctZero + '% zero, ' + c6.all.pctSingle + '% one story.')
