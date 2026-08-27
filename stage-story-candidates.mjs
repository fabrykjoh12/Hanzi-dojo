// Stage accepted story candidates into Supabase as HELD rows (FAB-10).
//
// This is the ONLY tool that moves a generated candidate into the stories
// table, and it is deliberately separate from generation
// (generate-targeted-stories.mjs has no Supabase capability at all). The gate,
// belt and suspenders:
//
//   1. storyStaging.stageableCandidates refuses anything whose stored status
//      is not 'accepted' or whose stored deterministic verdict is not PASS,
//      anything already staged, and title collisions.
//   2. Every stageable candidate is RE-validated here, live, with the current
//      validator against the current vocabulary pool and corpus — a candidate
//      file edited by hand, or one generated before a validator fix, has to
//      pass TODAY's gate, not the gate it remembers passing.
//   3. Rows insert with is_published=false, hardcoded (buildStoryRow). The
//      publication step stays the existing human flow (dashboard /
//      publish-stories.mjs), after summaries/art/questions/audio.
//
// Dry run by default; --apply inserts.
//
//   node --env-file=.env.script stage-story-candidates.mjs --batch data/story-candidates/<id> [--apply]

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { stageableCandidates, buildStoryRow, fileId, CANDIDATE_FILE_SCHEMA } from './storyStaging.mjs'
import { validateCandidate, formatValidation } from './storyCandidateValidation.mjs'
import { publishable } from './storyVocabAudit.mjs'
import { existsSync } from 'node:fs'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env vars. Run with: node --env-file=.env.script stage-story-candidates.mjs --batch <dir> [--apply]')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const args = process.argv.slice(2)
const arg = (name) => { const i = args.indexOf('--' + name); return i !== -1 ? args[i + 1] : null }
const apply = args.includes('--apply')
const batchDir = arg('batch')
if (!batchDir) { console.error('Required: --batch <data/story-candidates/dir> [--apply]'); process.exit(1) }

async function fetchAllPages(build, label) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999)
    if (error) { console.error(label + ' query failed:', error.message); process.exit(1) }
    rows.push(...(data || []))
    if (!data || data.length < 1000) return rows
  }
}

// ── Load the batch ───────────────────────────────────────────────────────────
const files = []
for (const name of readdirSync(batchDir).sort()) {
  if (!name.endsWith('.json') || name === 'batch-report.json' || name === 'manifests.json') continue
  const path = join(batchDir, name)
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'))
    if (data && data.schema === CANDIDATE_FILE_SCHEMA) files.push({ path, data })
  } catch (err) {
    console.error('Skipping unreadable ' + path + ': ' + err.message)
  }
}
if (files.length === 0) { console.error('No candidate files in ' + batchDir); process.exit(1) }
console.log(files.length + ' candidate file(s) in ' + batchDir)

// ── Current world: titles, vocabulary, corpus (for re-validation) ────────────
const existingRows = await fetchAllPages(() => supabase
  .from('stories').select('language, level, title, content, is_published')
  .eq('language', 'chinese'), 'Stories')
const existingTitles = new Set(existingRows.map(r => [r.language, r.level, r.title].join('|')))
const corpus = existingRows.filter(r => r.is_published && String(r.content || '').trim())

const vocabRows = await fetchAllPages(() => supabase
  .from('vocabulary').select('word, level')
  .eq('language', 'chinese').eq('system', 'hsk_3').eq('is_active', true), 'Vocabulary')
// The curriculum authority — the upstream word list, not the build artifacts,
// which are the build's own output and cannot reveal what it dropped. Used only
// to explain WHY a token is unresolved; it never widens what resolves.
const curriculum = new Set()
if (existsSync('data/hsk-curriculum-bands.json')) {
  const bands = JSON.parse(readFileSync('data/hsk-curriculum-bands.json', 'utf8')).bands || {}
  for (const [word, band] of Object.entries(bands)) if (band <= 6) curriculum.add(word)
}

const vocabMap = {}
for (const v of vocabRows) if (v.word && !vocabMap[v.word]) vocabMap[v.word] = v

// ── Gate 1: stored status/verdict ────────────────────────────────────────────
const { stageable, refused } = stageableCandidates(files.map(f => f.data), { existingTitles })
for (const r of refused) console.log('REFUSED  ' + r.id + ' — ' + r.reason)

// ── Gate 2: live re-validation with the current validator ────────────────────
const ready = []
for (const data of stageable) {
  const revalidation = validateCandidate(
    { title: data.candidate.title, content: data.candidate.content, englishContent: data.candidate.englishContent },
    { manifest: data.manifest, vocabMap, corpus },
  )
  if (revalidation.verdict !== 'PASS') {
    console.log('REFUSED  ' + fileId(data) + ' — fails RE-validation with the current validator:')
    console.log(formatValidation(revalidation).split('\n').map(l => '         ' + l).join('\n'))
    continue
  }
  for (const w of revalidation.warnings) console.log('warning  ' + fileId(data) + ' — ' + w.message)
  // FAIL CLOSED on learner-facing tap integrity. Every Mandarin token in the
  // story must resolve through the SAME segmentation and vocabulary lookup the
  // Reader uses, or be a character name the Reader's own name path recognises.
  // Not the compound it sits inside, not a substring of a name, not a semantic
  // alias — the actual lookup, or nothing.
  //
  // The already-published corpus does not meet this (142 of 204 stories carry
  // at least one unresolved token) and that legacy debt is tracked separately
  // by check-content-integrity.mjs against a baseline. NEW material has no
  // legacy, so it is held to zero here, at the only door into the database.
  const tap = publishable({ title: data.candidate.title, content: data.candidate.content },
    { vocabMap, curriculum })
  if (!tap.ok) {
    console.log('refused  ' + fileId(data) + ' — ' + tap.occurrences
      + ' occurrence(s) of text the reader cannot explain: '
      + tap.offenders.map(o => o.run + ' x' + o.occurrences + ' [' + o.defect + ']').join(', '))
    refused.push({ id: fileId(data), reason: 'untappable-text' })
    continue
  }
  ready.push(data)
}

if (ready.length === 0) {
  console.log('\nNothing stageable.')
  process.exit(refused.length || stageable.length ? 1 : 0)
}

console.log('\n' + ready.length + ' candidate(s) ready to stage as is_published=false:')
for (const data of ready) console.log('  ' + fileId(data) + ' · L' + data.manifest.level + ' · "' + data.candidate.title + '"')

if (!apply) {
  console.log('\nDry run — pass --apply to stage these (held, NOT published).')
  process.exit(0)
}

// ── Insert, serialized, numbering from the level's current max ───────────────
const nextNumCache = {}
async function nextStoryNumber(language, system, level) {
  const key = language + '|' + system + '|' + level
  if (nextNumCache[key] == null) {
    const { data, error } = await supabase.from('stories').select('story_number')
      .eq('language', language).eq('system', system).eq('level', level)
      .order('story_number', { ascending: false }).limit(1)
    if (error) throw new Error(error.message)
    nextNumCache[key] = (data && data.length > 0 ? data[0].story_number : 0) + 1
  }
  const n = nextNumCache[key]
  nextNumCache[key] += 1
  return n
}

let staged = 0
for (const data of ready) {
  const m = data.manifest
  try {
    const storyNumber = await nextStoryNumber(m.language, m.system, m.level)
    const row = buildStoryRow(data, { storyNumber, stagedAt: new Date().toISOString() })
    const { data: inserted, error } = await supabase.from('stories').insert(row).select('id').single()
    if (error) throw new Error(error.message)
    staged += 1
    console.log('STAGED   ' + fileId(data) + ' → #' + storyNumber + ' (' + inserted.id + '), held')
    // Record the staging back into the candidate file so a re-run refuses it.
    const holder = files.find(f => f.data === data)
    if (holder) {
      holder.data.staged = { storyId: inserted.id, storyNumber, stagedAt: row.generation_meta.stagedAt }
      writeFileSync(holder.path, JSON.stringify(holder.data, null, 2) + '\n')
    }
  } catch (err) {
    console.log('FAILED   ' + fileId(data) + ' — ' + err.message)
  }
}

console.log('\nStaged ' + staged + '/' + ready.length + ' as held rows. Publication stays a human step (summaries, cover art, questions, audio first — then publish-stories.mjs / the dashboard).')
